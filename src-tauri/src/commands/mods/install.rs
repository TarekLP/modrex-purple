use std::fs;
use std::path::Path;
use chrono::Utc;
use super::engine::{ModEngineConfig, ModUnit};
use super::naming::apply_priority_prefix;
use super::paths::{active_mod_path, disabled_base, disabled_mod_path, mods_base};
use super::state::{get_folder_path, read_state, save_state};
use super::types::{InstalledMod, ModsState};

pub fn install_mod_from_path(
    game_path: &str,
    state_path: &Path,
    mod_data: InstalledMod,
    source: &Path,
    folder_id: Option<String>,
    cfg: &ModEngineConfig,
) -> Result<(), String> {
    let state = read_state(state_path);
    let folder_rel = get_folder_path(&state.folders, folder_id.as_deref());

    let dest_dir = match &folder_rel {
        Some(rel) => mods_base(game_path, cfg).join(rel),
        None => mods_base(game_path, cfg),
    };
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let existing = state.mods.iter().find(|m| m.uid == mod_data.uid).cloned();

    let max_mod = state
        .mods
        .iter()
        .filter(|m| m.folder_id == folder_id)
        .filter_map(|m| m.priority)
        .max()
        .unwrap_or(0);
    let max_folder = state
        .folders
        .iter()
        .filter(|f| f.parent_id == folder_id)
        .map(|f| f.priority)
        .max()
        .unwrap_or(0);
    let priority = existing.as_ref().and_then(|e| e.priority).unwrap_or(max_mod.max(max_folder) + 1);
    let priority_prefix_enabled = match &cfg.unit {
        ModUnit::File { priority_prefix, .. } | ModUnit::Directory { priority_prefix, .. } => *priority_prefix,
    };
    let filename = if priority_prefix_enabled {
        apply_priority_prefix(&mod_data.filename, priority)
    } else {
        mod_data.filename.clone()
    };

    let dest = active_mod_path(game_path, &filename, folder_rel.as_deref(), cfg);
    match &cfg.unit {
        ModUnit::File { .. } => {
            fs::copy(source, &dest).map_err(|e| e.to_string())?;
        }
        ModUnit::Directory { .. } => {
            copy_dir_all(source, &dest)?;
        }
    }

    if let Some(ref ex) = existing {
        let ex_rel = get_folder_path(&state.folders, ex.folder_id.as_deref());
        let old = if ex.enabled {
            active_mod_path(game_path, &ex.filename, ex_rel.as_deref(), cfg)
        } else {
            disabled_mod_path(game_path, &ex.filename, ex_rel.as_deref(), cfg)
        };
        let new_active = active_mod_path(game_path, &filename, folder_rel.as_deref(), cfg);
        if old != new_active && old.exists() {
            match &cfg.unit {
                ModUnit::File { .. } => {
                    if let Err(e) = fs::remove_file(&old) {
                        log::warn!("install: remove old pak {old:?}: {e}");
                    }
                }
                ModUnit::Directory { .. } => {
                    if let Err(e) = fs::remove_dir_all(&old) {
                        log::warn!("install: remove old mod dir {old:?}: {e}");
                    }
                }
            }
        }
    }

    let mut new_mods: Vec<InstalledMod> = state
        .mods
        .into_iter()
        .filter(|m| {
            m.uid != mod_data.uid
                && existing.as_ref().map(|e| m.uid != e.uid).unwrap_or(true)
        })
        .collect();

    new_mods.push(InstalledMod {
        filename,
        priority: Some(priority),
        folder_id,
        enabled: true,
        installed_at: Utc::now().to_rfc3339(),
        ..mod_data
    });

    let json = serde_json::to_string_pretty(&ModsState { folders: state.folders, mods: new_mods })
        .map_err(|e| e.to_string())?;
    std::fs::write(state_path, &json).map_err(|e| format!("failed to write state: {}", e))?;
    Ok(())
}

pub fn uninstall_mod_op(game_path: &str, state_path: &Path, uid: &str, cfg: &ModEngineConfig) {
    let mut state = read_state(state_path);
    let Some(m) = state.mods.iter().find(|m| m.uid == uid).cloned() else { return };
    let folder_id = m.folder_id.clone();
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    let path = if m.enabled {
        active_mod_path(game_path, &m.filename, rel.as_deref(), cfg)
    } else {
        disabled_mod_path(game_path, &m.filename, rel.as_deref(), cfg)
    };
    if path.exists() {
        match &cfg.unit {
            ModUnit::File { .. } => {
                if let Err(e) = fs::remove_file(&path) {
                    log::warn!("uninstall: remove {path:?}: {e}");
                }
            }
            ModUnit::Directory { .. } => {
                if let Err(e) = fs::remove_dir_all(&path) {
                    log::warn!("uninstall: remove dir {path:?}: {e}");
                }
            }
        }
    }
    state.mods.retain(|m| m.uid != uid);
    prune_empty_folders(game_path, &mut state, folder_id, cfg);
    save_state(state_path, &state);
}

fn prune_empty_folders(
    game_path: &str,
    state: &mut ModsState,
    folder_id: Option<String>,
    cfg: &ModEngineConfig,
) {
    let Some(fid) = folder_id else { return };
    let has_mods = state.mods.iter().any(|m| m.folder_id.as_deref() == Some(fid.as_str()));
    let has_children = state.folders.iter().any(|f| f.parent_id.as_deref() == Some(fid.as_str()));
    if has_mods || has_children {
        return;
    }
    let rel = get_folder_path(&state.folders, Some(fid.as_str()));
    let parent_id = state.folders.iter().find(|f| f.id == fid).and_then(|f| f.parent_id.clone());
    state.folders.retain(|f| f.id != fid);
    if let Some(rel_path) = rel {
        let _ = fs::remove_dir(mods_base(game_path, cfg).join(rel_path));
    }
    prune_empty_folders(game_path, state, parent_id, cfg);
}

pub fn enable_mod_op(game_path: &str, state_path: &Path, uid: &str, cfg: &ModEngineConfig) {
    let mut state = read_state(state_path);
    let Some(m) = state.mods.iter().find(|m| m.uid == uid && !m.enabled).cloned() else { return };
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    if let Some(r) = &rel {
        if let Err(e) = fs::create_dir_all(mods_base(game_path, cfg).join(r)) {
            log::warn!("enable_mod: create_dir_all: {e}");
        }
    }
    let from = disabled_mod_path(game_path, &m.filename, rel.as_deref(), cfg);
    let to = active_mod_path(game_path, &m.filename, rel.as_deref(), cfg);
    if from.exists() {
        if let Err(e) = fs::rename(&from, &to) {
            log::warn!("enable_mod: rename {from:?} -> {to:?}: {e}");
        }
    }
    for m in state.mods.iter_mut() {
        if m.uid == uid {
            m.enabled = true;
        }
    }
    save_state(state_path, &state);
}

pub fn disable_mod_op(game_path: &str, state_path: &Path, uid: &str, cfg: &ModEngineConfig) {
    let mut state = read_state(state_path);
    let Some(m) = state.mods.iter().find(|m| m.uid == uid && m.enabled).cloned() else { return };
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    let dis_dir = match &rel {
        Some(r) => disabled_base(game_path, cfg).join(r),
        None => disabled_base(game_path, cfg),
    };
    if let Err(e) = fs::create_dir_all(&dis_dir) {
        log::warn!("disable_mod: create_dir_all {dis_dir:?}: {e}");
    }
    let from = active_mod_path(game_path, &m.filename, rel.as_deref(), cfg);
    let to = disabled_mod_path(game_path, &m.filename, rel.as_deref(), cfg);
    if from.exists() {
        if let Err(e) = fs::rename(&from, &to) {
            log::warn!("disable_mod: rename {from:?} -> {to:?}: {e}");
        }
    }
    for m in state.mods.iter_mut() {
        if m.uid == uid {
            m.enabled = false;
        }
    }
    save_state(state_path, &state);
}

fn copy_dir_all(src: &Path, dst: &Path) -> Result<(), String> {
    fs::create_dir_all(dst).map_err(|e| e.to_string())?;
    for entry in fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let dest = dst.join(entry.file_name());
        if entry.file_type().map_err(|e| e.to_string())?.is_dir() {
            copy_dir_all(&entry.path(), &dest)?;
        } else {
            fs::copy(&entry.path(), &dest).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

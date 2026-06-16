use super::engine::{ModEngineConfig, ModUnit, ScanTarget};
use super::host_mods::{host_target_by_id, parse_host_location};
use super::naming::apply_priority_prefix;
use super::paths::{
    active_mod_path, disabled_base, disabled_mod_path, host_pack_dir, mods_base,
    resolve_host_mod_dir,
};
use super::state::{get_folder_path, read_state, save_state};
use super::types::{InstalledMod, ModsState};
use super::zip::extract_dir_entry;
use chrono::Utc;
use std::fs;
use std::path::Path;

/// Installs a host-mod content pack (e.g. a Menu Backgrounds set) into the host mod's folder
/// (`<host dir>/<subpath>/<set name>/`) and records it in state so it can be managed. Returns a
/// `HOST_MOD_MISSING:` error when the host mod isn't installed.
pub fn install_host_pack_op(
    game_path: &str,
    state_path: &Path,
    zip: &Path,
    entry_name: &str,
    mod_data: InstalledMod,
    cfg: &ModEngineConfig,
) -> Result<(), String> {
    let (host_id, host_subpath) = mod_data
        .location
        .as_deref()
        .and_then(parse_host_location)
        .ok_or("install_host_pack: mod_data.location is not a host location")?;
    let mut state = read_state(state_path);
    let host_dir = resolve_host_mod_dir(game_path, cfg, &state.mods, &state.folders, host_id)
        .ok_or_else(|| {
            let name = host_target_by_id(host_id)
                .map(|h| h.host_name)
                .unwrap_or("");
            format!(
                "HOST_MOD_MISSING:{}",
                serde_json::json!({ "hostModId": host_id, "hostName": name })
            )
        })?;

    let set_name = Path::new(entry_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or("set")
        .to_string();
    let mut dest = host_dir;
    for seg in host_subpath.split('/').filter(|s| !s.is_empty()) {
        dest = dest.join(seg);
    }
    let dest = dest.join(&set_name);
    if dest.exists() {
        let _ = fs::remove_dir_all(&dest); // clean reinstall
    }
    fs::create_dir_all(&dest).map_err(|e| e.to_string())?;
    extract_dir_entry(zip, entry_name, &dest)?;

    let uid = format!("{}_{}", mod_data.file_id.unwrap_or(0), set_name);
    state.mods.retain(|x| x.uid != uid);
    state.mods.push(InstalledMod {
        uid,
        filename: set_name,
        enabled: true,
        folder_id: None,
        installed_at: Utc::now().to_rfc3339(),
        ..mod_data
    });
    save_state(
        state_path,
        &ModsState {
            folders: state.folders,
            mods: state.mods,
        },
    );
    Ok(())
}

pub fn install_mod_from_path(
    game_path: &str,
    state_path: &Path,
    mod_data: InstalledMod,
    source: &Path,
    folder_id: Option<String>,
    cfg: &ModEngineConfig,
    target: &ScanTarget,
) -> Result<(), String> {
    // BeardLib (mod_overrides) scans one level deep — nested dirs are never loaded.
    let folder_id = if std::ptr::eq(target, cfg.primary()) {
        folder_id
    } else {
        None
    };
    let state = read_state(state_path);
    let folder_rel = get_folder_path(&state.folders, folder_id.as_deref());

    let dest_dir = match &folder_rel {
        Some(rel) => mods_base(game_path, target).join(rel),
        None => mods_base(game_path, target),
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
    let priority = existing
        .as_ref()
        .and_then(|e| e.priority)
        .unwrap_or(max_mod.max(max_folder) + 1);
    let priority_prefix_enabled = match &target.unit {
        ModUnit::File {
            priority_prefix, ..
        }
        | ModUnit::Directory {
            priority_prefix, ..
        } => *priority_prefix,
    };
    let filename = if priority_prefix_enabled {
        apply_priority_prefix(&mod_data.filename, priority)
    } else {
        mod_data.filename.clone()
    };

    let dest = active_mod_path(game_path, &filename, folder_rel.as_deref(), target);
    match &target.unit {
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
            active_mod_path(game_path, &ex.filename, ex_rel.as_deref(), target)
        } else {
            disabled_mod_path(game_path, &ex.filename, ex_rel.as_deref(), target)
        };
        let new_active = active_mod_path(game_path, &filename, folder_rel.as_deref(), target);
        if old != new_active && old.exists() {
            match &target.unit {
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
            m.uid != mod_data.uid && existing.as_ref().map(|e| m.uid != e.uid).unwrap_or(true)
        })
        .collect();

    let location = if std::ptr::eq(target, cfg.primary()) {
        None
    } else {
        Some(target.tag.to_string())
    };
    new_mods.push(InstalledMod {
        filename,
        priority: Some(priority),
        folder_id,
        enabled: true,
        location,
        installed_at: Utc::now().to_rfc3339(),
        ..mod_data
    });

    save_state(
        state_path,
        &ModsState {
            folders: state.folders,
            mods: new_mods,
        },
    );
    Ok(())
}

pub fn uninstall_mod_op(game_path: &str, state_path: &Path, uid: &str, cfg: &ModEngineConfig) {
    let mut state = read_state(state_path);
    let Some(m) = state.mods.iter().find(|m| m.uid == uid).cloned() else {
        return;
    };
    // Host packs live inside another mod's folder; remove the pack dir directly.
    if m.location
        .as_deref()
        .is_some_and(|l| l.starts_with("host:"))
    {
        if let Some(p) = host_pack_dir(game_path, cfg, &state.mods, &state.folders, &m) {
            if p.exists() {
                if let Err(e) = fs::remove_dir_all(&p) {
                    log::warn!("uninstall host pack: remove {p:?}: {e}");
                }
            }
        }
        state.mods.retain(|x| x.uid != uid);
        save_state(state_path, &state);
        return;
    }
    let target = cfg.target_for(m.location.as_deref());
    let folder_id = m.folder_id.clone();
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    let path = if m.enabled {
        active_mod_path(game_path, &m.filename, rel.as_deref(), target)
    } else {
        disabled_mod_path(game_path, &m.filename, rel.as_deref(), target)
    };
    if path.exists() {
        match &target.unit {
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
    let has_mods = state
        .mods
        .iter()
        .any(|m| m.folder_id.as_deref() == Some(fid.as_str()));
    let has_children = state
        .folders
        .iter()
        .any(|f| f.parent_id.as_deref() == Some(fid.as_str()));
    if has_mods || has_children {
        return;
    }
    let rel = get_folder_path(&state.folders, Some(fid.as_str()));
    let parent_id = state
        .folders
        .iter()
        .find(|f| f.id == fid)
        .and_then(|f| f.parent_id.clone());
    state.folders.retain(|f| f.id != fid);
    if let Some(rel_path) = rel {
        let _ = fs::remove_dir(mods_base(game_path, cfg.primary()).join(rel_path));
    }
    prune_empty_folders(game_path, state, parent_id, cfg);
}

pub fn enable_mod_op(game_path: &str, state_path: &Path, uid: &str, cfg: &ModEngineConfig) {
    let mut state = read_state(state_path);
    let Some(m) = state
        .mods
        .iter()
        .find(|m| m.uid == uid && !m.enabled)
        .cloned()
    else {
        return;
    };
    let target = cfg.target_for(m.location.as_deref());
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    if let Some(r) = &rel {
        if let Err(e) = fs::create_dir_all(mods_base(game_path, target).join(r)) {
            log::warn!("enable_mod: create_dir_all: {e}");
        }
    }
    let from = disabled_mod_path(game_path, &m.filename, rel.as_deref(), target);
    let to = active_mod_path(game_path, &m.filename, rel.as_deref(), target);
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
    let Some(m) = state
        .mods
        .iter()
        .find(|m| m.uid == uid && m.enabled)
        .cloned()
    else {
        return;
    };
    let target = cfg.target_for(m.location.as_deref());
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    let dis_dir = match &rel {
        Some(r) => disabled_base(game_path, target).join(r),
        None => disabled_base(game_path, target),
    };
    if let Err(e) = fs::create_dir_all(&dis_dir) {
        log::warn!("disable_mod: create_dir_all {dis_dir:?}: {e}");
    }
    let from = active_mod_path(game_path, &m.filename, rel.as_deref(), target);
    let to = disabled_mod_path(game_path, &m.filename, rel.as_deref(), target);
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

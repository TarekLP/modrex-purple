use std::fs;
use std::path::Path;
use chrono::Utc;
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
) -> Result<(), String> {
    let state = read_state(state_path);
    let folder_rel = get_folder_path(&state.folders, folder_id.as_deref());

    let dest_dir = match &folder_rel {
        Some(rel) => mods_base(game_path).join(rel),
        None => mods_base(game_path),
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
    let filename = apply_priority_prefix(&mod_data.filename, priority);

    fs::copy(source, active_mod_path(game_path, &filename, folder_rel.as_deref()))
        .map_err(|e| e.to_string())?;

    if let Some(ref ex) = existing {
        let ex_rel = get_folder_path(&state.folders, ex.folder_id.as_deref());
        let old = if ex.enabled {
            active_mod_path(game_path, &ex.filename, ex_rel.as_deref())
        } else {
            disabled_mod_path(game_path, &ex.filename, ex_rel.as_deref())
        };
        let new_active = active_mod_path(game_path, &filename, folder_rel.as_deref());
        if old != new_active && old.exists() {
            if let Err(e) = fs::remove_file(&old) {
                log::warn!("install: remove old pak {old:?}: {e}");
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

pub fn uninstall_mod_op(game_path: &str, state_path: &Path, uid: &str) {
    let mut state = read_state(state_path);
    let Some(m) = state.mods.iter().find(|m| m.uid == uid).cloned() else { return };
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    let path = if m.enabled {
        active_mod_path(game_path, &m.filename, rel.as_deref())
    } else {
        disabled_mod_path(game_path, &m.filename, rel.as_deref())
    };
    if path.exists() {
        if let Err(e) = fs::remove_file(&path) {
            log::warn!("uninstall: remove {path:?}: {e}");
        }
    }
    state.mods.retain(|m| m.uid != uid);
    save_state(state_path, &state);
}

pub fn enable_mod_op(game_path: &str, state_path: &Path, uid: &str) {
    let mut state = read_state(state_path);
    let Some(m) = state.mods.iter().find(|m| m.uid == uid && !m.enabled).cloned() else { return };
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    if let Some(r) = &rel {
        if let Err(e) = fs::create_dir_all(mods_base(game_path).join(r)) {
            log::warn!("enable_mod: create_dir_all: {e}");
        }
    }
    let from = disabled_mod_path(game_path, &m.filename, rel.as_deref());
    let to = active_mod_path(game_path, &m.filename, rel.as_deref());
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

pub fn disable_mod_op(game_path: &str, state_path: &Path, uid: &str) {
    let mut state = read_state(state_path);
    let Some(m) = state.mods.iter().find(|m| m.uid == uid && m.enabled).cloned() else { return };
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    let dis_dir = match &rel {
        Some(r) => disabled_base(game_path).join(r),
        None => disabled_base(game_path),
    };
    if let Err(e) = fs::create_dir_all(&dis_dir) {
        log::warn!("disable_mod: create_dir_all {dis_dir:?}: {e}");
    }
    let from = active_mod_path(game_path, &m.filename, rel.as_deref());
    let to = disabled_mod_path(game_path, &m.filename, rel.as_deref());
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

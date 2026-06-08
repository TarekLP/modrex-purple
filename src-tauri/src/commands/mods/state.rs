use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;
use super::engine::{backup_dir, ModEngineConfig};
use super::naming::make_uid;
use super::paths::{active_mod_path, disabled_base, disabled_mod_path, mods_base};
use super::types::{InstalledMod, ModFolder, ModsState};

pub fn get_folder_path(folders: &[ModFolder], folder_id: Option<&str>) -> Option<String> {
    let folder_id = folder_id?;
    let folder = folders.iter().find(|f| f.id == folder_id)?;
    let parent = get_folder_path(folders, folder.parent_id.as_deref());
    Some(match parent {
        Some(p) => format!("{}/{}", p, folder.disk_name),
        None => folder.disk_name.clone(),
    })
}

pub fn read_state(state_path: &Path) -> ModsState {
    if !state_path.exists() {
        return ModsState::default();
    }
    let content = fs::read_to_string(state_path).unwrap_or_default();
    let parsed: serde_json::Value = match serde_json::from_str(&content) {
        Ok(v) => v,
        Err(_) => return ModsState::default(),
    };

    let folders = parsed["folders"]
        .as_array()
        .map(|arr| arr.iter().filter_map(|v| serde_json::from_value(v.clone()).ok()).collect())
        .unwrap_or_default();

    let mods = parsed["mods"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    let mut m: InstalledMod = serde_json::from_value(v.clone()).ok()?;
                    if m.uid.is_empty() {
                        m.uid = make_uid(m.file_id, &m.filename);
                    }
                    Some(m)
                })
                .collect()
        })
        .unwrap_or_default();

    ModsState { folders, mods }
}

pub fn save_state(state_path: &Path, state: &ModsState) {
    if let Some(parent) = state_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            log::warn!("save_state: create_dir_all {parent:?}: {e}");
        }
    }
    if let Err(e) = fs::write(state_path, serde_json::to_string_pretty(state).unwrap_or_default()) {
        log::warn!("save_state: write {state_path:?}: {e}");
    }
}

pub fn reconcile_state(game_path: &str, state_path: &Path, cfg: &ModEngineConfig) -> ModsState {
    let bak = backup_dir(game_path, cfg);
    if bak.exists() {
        return read_state(&bak.join(cfg.state_filename));
    }

    // Migrate legacy state file name from .pd3mm.json to .modrex.json.
    let legacy = state_path.with_file_name(".pd3mm.json");
    if legacy.exists() && !state_path.exists() {
        let _ = fs::rename(&legacy, state_path);
    }

    let state = read_state(state_path);

    // Migrate legacy disabled paths: disabled/foo.pak becomes disabled/foo.pak.disabled
    let dis_dir = disabled_base(game_path, cfg);
    let disabled_mods: Vec<InstalledMod> = state.mods.iter().filter(|m| !m.enabled).cloned().collect();
    for m in &disabled_mods {
        let folder_rel = get_folder_path(&state.folders, m.folder_id.as_deref());
        let new_path = disabled_mod_path(game_path, &m.filename, folder_rel.as_deref(), cfg);
        let legacy = dis_dir.join(&m.filename);
        if !new_path.exists() && legacy.exists() {
            if let Some(rel) = &folder_rel {
                if let Err(e) = fs::create_dir_all(dis_dir.join(rel)) {
                    log::warn!("migrate legacy path: create_dir_all: {e}");
                }
            }
            if let Err(e) = fs::rename(&legacy, &new_path) {
                log::warn!("migrate legacy path {legacy:?} -> {new_path:?}: {e}");
            }
        }
    }

    let checks: Vec<bool> = state
        .mods
        .iter()
        .map(|m| {
            let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
            active_mod_path(game_path, &m.filename, rel.as_deref(), cfg).exists()
                || disabled_mod_path(game_path, &m.filename, rel.as_deref(), cfg).exists()
        })
        .collect();

    let reconciled: Vec<InstalledMod> = state
        .mods
        .iter()
        .zip(checks.iter())
        .map(|(m, &found)| {
            let mut m = m.clone();
            m.missing = if found { None } else { Some(true) };
            m
        })
        .collect();

    let state_changed = reconciled
        .iter()
        .zip(state.mods.iter())
        .any(|(r, o)| r.missing != o.missing);
    if state_changed {
        save_state(
            state_path,
            &ModsState { folders: state.folders.clone(), mods: reconciled.clone() },
        );
    }

    let mods_base_path = mods_base(game_path, cfg);
    let phantom_ids: HashSet<String> = state
        .folders
        .iter()
        .filter(|f| {
            get_folder_path(&state.folders, Some(&f.id))
                .map(|rel| {
                    !mods_base_path.join(&rel).exists()
                        && !mods_base_path.join("disabled").join(&rel).exists()
                })
                .unwrap_or(false)
        })
        .map(|f| f.id.clone())
        .collect();

    let cleaned_folders: Vec<ModFolder> = if phantom_ids.is_empty() {
        state.folders.clone()
    } else {
        state.folders.iter().filter(|f| !phantom_ids.contains(&f.id)).cloned().collect()
    };

    if !phantom_ids.is_empty() {
        save_state(
            state_path,
            &ModsState { folders: cleaned_folders.clone(), mods: reconciled.clone() },
        );
    }

    if reconciled.iter().any(|m| m.priority.is_none()) {
        let mut max_by_folder: HashMap<Option<String>, i64> = HashMap::new();
        for m in &reconciled {
            if let Some(p) = m.priority {
                let key = m.folder_id.clone();
                let entry = max_by_folder.entry(key).or_insert(0);
                *entry = (*entry).max(p);
            }
        }
        let migrated: Vec<InstalledMod> = reconciled
            .iter()
            .map(|m| {
                if m.priority.is_some() {
                    return m.clone();
                }
                let key = m.folder_id.clone();
                let entry = max_by_folder.entry(key).or_insert(0);
                *entry += 1;
                let mut m = m.clone();
                m.priority = Some(*entry);
                m
            })
            .collect();
        save_state(
            state_path,
            &ModsState { folders: cleaned_folders.clone(), mods: migrated.clone() },
        );
        return ModsState { folders: cleaned_folders, mods: migrated };
    }

    ModsState { folders: cleaned_folders, mods: reconciled }
}

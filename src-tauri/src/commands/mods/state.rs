use super::engine::{backup_dir, ModEngineConfig};
use super::naming::{apply_priority_prefix, make_uid, strip_priority_prefix};
use super::paths::{active_mod_path, disabled_base, disabled_mod_path, mods_base};
use super::types::{InstalledMod, ModFolder, ModsState};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::Path;

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
        .map(|arr| {
            arr.iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect()
        })
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
    if let Err(e) = fs::write(
        state_path,
        serde_json::to_string_pretty(state).unwrap_or_default(),
    ) {
        log::warn!("save_state: write {state_path:?}: {e}");
    }
}

fn compact_folder_priorities(
    folders: &[ModFolder],
    mods_base: &Path,
    dis_base: &Path,
) -> (Vec<ModFolder>, bool) {
    let mut compacted = folders.to_vec();
    let mut any_changed = false;

    let parent_ids: std::collections::BTreeSet<Option<String>> = {
        let mut ids = std::collections::BTreeSet::new();
        ids.insert(None);
        for f in folders {
            ids.insert(f.parent_id.clone());
        }
        ids
    };

    for parent_id in parent_ids {
        let mut siblings: Vec<(usize, i64)> = compacted
            .iter()
            .enumerate()
            .filter(|(_, f)| f.parent_id == parent_id)
            .map(|(i, f)| (i, f.priority))
            .collect();
        siblings.sort_by_key(|&(_, p)| p);

        for (rank, &(idx, _)) in siblings.iter().enumerate() {
            let new_priority = (rank + 1) as i64;
            let f = &compacted[idx];
            if f.priority == new_priority {
                continue;
            }

            let old_disk_name = f.disk_name.clone();
            let new_disk_name =
                apply_priority_prefix(strip_priority_prefix(&old_disk_name), new_priority);
            let parent_rel = get_folder_path(&compacted, parent_id.as_deref());

            let (old_active, new_active) = match &parent_rel {
                Some(r) => (
                    mods_base.join(r).join(&old_disk_name),
                    mods_base.join(r).join(&new_disk_name),
                ),
                None => (
                    mods_base.join(&old_disk_name),
                    mods_base.join(&new_disk_name),
                ),
            };

            if old_active.exists() {
                if let Err(e) = fs::rename(&old_active, &new_active) {
                    log::warn!("compact_folder_priorities: rename {old_active:?}: {e}");
                    continue;
                }
            }

            let (old_dis, new_dis) = match &parent_rel {
                Some(r) => (
                    dis_base.join(r).join(&old_disk_name),
                    dis_base.join(r).join(&new_disk_name),
                ),
                None => (dis_base.join(&old_disk_name), dis_base.join(&new_disk_name)),
            };
            if old_dis.exists() {
                if let Err(e) = fs::rename(&old_dis, &new_dis) {
                    log::warn!("compact_folder_priorities: rename disabled {old_dis:?}: {e}");
                }
            }

            compacted[idx].priority = new_priority;
            compacted[idx].disk_name = new_disk_name;
            any_changed = true;
        }
    }

    (compacted, any_changed)
}

pub fn reconcile_state(game_path: &str, state_path: &Path, cfg: &ModEngineConfig) -> ModsState {
    let bak = backup_dir(game_path, cfg.primary());
    if bak.exists() {
        if cfg.primary().is_directory_unit() {
            // BLT: state file stays in mods/ because only user mod dirs were moved to backup.
            return read_state(state_path);
        }
        // PD3: the entire mods folder was renamed, so the state file is inside the backup.
        return read_state(&bak.join(cfg.state_filename));
    }

    // Migrate legacy state file name from .pd3mm.json to .modrex.json.
    let legacy = state_path.with_file_name(".pd3mm.json");
    if legacy.exists() && !state_path.exists() {
        let _ = fs::rename(&legacy, state_path);
    }

    let state = read_state(state_path);

    // Migrate legacy disabled paths: disabled/foo.pak becomes disabled/foo.pak.disabled
    let dis_dir = disabled_base(game_path, cfg.primary());
    let disabled_mods: Vec<InstalledMod> =
        state.mods.iter().filter(|m| !m.enabled).cloned().collect();
    for m in &disabled_mods {
        let folder_rel = get_folder_path(&state.folders, m.folder_id.as_deref());
        let new_path = disabled_mod_path(
            game_path,
            &m.filename,
            folder_rel.as_deref(),
            cfg.target_for(m.location.as_deref()),
        );
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
            let target = cfg.target_for(m.location.as_deref());
            active_mod_path(game_path, &m.filename, rel.as_deref(), target).exists()
                || disabled_mod_path(game_path, &m.filename, rel.as_deref(), target).exists()
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

    let mods_base_path = mods_base(game_path, cfg.primary());
    // Phantom: no mods, no child folders, and active directory absent.
    // Ignores the disabled directory so an empty leftover disabled/ subdir doesn't prevent cleanup.
    let phantom_ids: HashSet<String> = state
        .folders
        .iter()
        .filter(|f| {
            let has_mods = state
                .mods
                .iter()
                .any(|m| m.folder_id.as_deref() == Some(f.id.as_str()));
            let has_children = state
                .folders
                .iter()
                .any(|cf| cf.parent_id.as_deref() == Some(f.id.as_str()));
            if has_mods || has_children {
                return false;
            }
            get_folder_path(&state.folders, Some(f.id.as_str()))
                .map(|rel| !mods_base_path.join(&rel).exists())
                .unwrap_or(true)
        })
        .map(|f| f.id.clone())
        .collect();

    let cleaned_folders: Vec<ModFolder> = if phantom_ids.is_empty() {
        state.folders.clone()
    } else {
        for f in state.folders.iter().filter(|f| phantom_ids.contains(&f.id)) {
            if let Some(rel) = get_folder_path(&state.folders, Some(f.id.as_str())) {
                // remove_dir succeeds only if the directory is empty — safe to call unconditionally
                let _ = fs::remove_dir(dis_dir.join(&rel));
            }
        }
        state
            .folders
            .iter()
            .filter(|f| !phantom_ids.contains(&f.id))
            .cloned()
            .collect()
    };

    // Compact folder priorities to sequential (1, 2, 3, ...) — repairs gaps caused by prior bugs
    let (final_folders, any_compacted) =
        compact_folder_priorities(&cleaned_folders, &mods_base_path, &dis_dir);

    if state_changed || !phantom_ids.is_empty() || any_compacted {
        save_state(
            state_path,
            &ModsState {
                folders: final_folders.clone(),
                mods: reconciled.clone(),
            },
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
            &ModsState {
                folders: final_folders.clone(),
                mods: migrated.clone(),
            },
        );
        return ModsState {
            folders: final_folders,
            mods: migrated,
        };
    }

    ModsState {
        folders: final_folders,
        mods: reconciled,
    }
}

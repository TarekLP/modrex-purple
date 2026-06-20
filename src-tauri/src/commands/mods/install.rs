use super::engine::{ModEngineConfig, ModUnit, ScanTarget};
use super::host_mods::{host_target_by_id, parse_host_location};
use super::naming::{apply_priority_prefix, sidecar_path, PAK_SIDECAR_EXTENSIONS};
use super::paths::{
    active_mod_path, disabled_base, disabled_mod_path, host_pack_dir, host_pack_disabled_dir,
    mods_base, resolve_host_mod_dir,
};
use super::state::{get_folder_path, read_state, save_state};
use super::types::{InstalledMod, ModsState};
use super::zip::extract_dir_entry;
use chrono::Utc;
use std::fs;
use std::path::Path;

fn is_host_pack(m: &InstalledMod) -> bool {
    m.location
        .as_deref()
        .is_some_and(|l| l.starts_with("host:"))
}

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
        ModUnit::File { extension, .. } => {
            copy_file_with_sidecars(source, &dest, extension)?;
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
                ModUnit::File { extension, .. } => {
                    if let Err(e) = remove_file_with_sidecars(&old, extension) {
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
    // Host packs live inside another mod's folder (or our disabled area); remove either.
    if is_host_pack(&m) {
        for p in [
            host_pack_dir(game_path, cfg, &state.mods, &state.folders, &m),
            host_pack_disabled_dir(game_path, cfg, &m),
        ]
        .into_iter()
        .flatten()
        {
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
    let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
    let path = if m.enabled {
        active_mod_path(game_path, &m.filename, rel.as_deref(), target)
    } else {
        disabled_mod_path(game_path, &m.filename, rel.as_deref(), target)
    };
    if path.exists() {
        match &target.unit {
            ModUnit::File { extension, .. } => {
                if let Err(e) = remove_file_with_sidecars(&path, extension) {
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
    save_state(state_path, &state);
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
    // Host packs move back from our disabled area into the host mod's folder.
    if is_host_pack(&m) {
        move_host_pack(game_path, state_path, &mut state, &m, uid, cfg, true);
        return;
    }
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
        let renamed = match &target.unit {
            ModUnit::File { extension, .. } => rename_with_sidecars(&from, &to, extension),
            ModUnit::Directory { .. } => fs::rename(&from, &to),
        };
        if let Err(e) = renamed {
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

/// Moves a host pack between the host mod's folder and Modrex's disabled area, then flips its
/// `enabled` flag and persists. `enable = true` restores it into the host; `false` disables it.
fn move_host_pack(
    game_path: &str,
    state_path: &Path,
    state: &mut ModsState,
    m: &InstalledMod,
    uid: &str,
    cfg: &ModEngineConfig,
    enable: bool,
) {
    let active = host_pack_dir(game_path, cfg, &state.mods, &state.folders, m);
    let disabled = host_pack_disabled_dir(game_path, cfg, m);
    if let (Some(active), Some(disabled)) = (active, disabled) {
        let (from, to) = if enable {
            (disabled, active)
        } else {
            (active, disabled)
        };
        if from.exists() {
            if let Some(parent) = to.parent() {
                let _ = fs::create_dir_all(parent);
            }
            if let Err(e) = fs::rename(&from, &to) {
                log::warn!("move host pack {from:?} -> {to:?}: {e}");
            }
        }
    }
    for x in state.mods.iter_mut() {
        if x.uid == uid {
            x.enabled = enable;
        }
    }
    save_state(state_path, state);
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
    // Host packs move out of the host mod's folder into our disabled area.
    if is_host_pack(&m) {
        move_host_pack(game_path, state_path, &mut state, &m, uid, cfg, false);
        return;
    }
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
        let renamed = match &target.unit {
            ModUnit::File { extension, .. } => rename_with_sidecars(&from, &to, extension),
            ModUnit::Directory { .. } => fs::rename(&from, &to),
        };
        if let Err(e) = renamed {
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

/// Copies `src` to `dest`, plus any `.ucas`/`.utoc` siblings of `src` (same stem) to the
/// matching siblings of `dest`. A missing sidecar is not an error.
fn copy_file_with_sidecars(src: &Path, dest: &Path, main_ext: &str) -> Result<(), String> {
    fs::copy(src, dest).map_err(|e| e.to_string())?;
    for ext in PAK_SIDECAR_EXTENSIONS {
        let Some(sidecar) = sidecar_path(src, main_ext, ext) else {
            continue;
        };
        if sidecar.exists() {
            if let Some(dest_sidecar) = sidecar_path(dest, main_ext, ext) {
                let _ = fs::copy(&sidecar, dest_sidecar);
            }
        }
    }
    Ok(())
}

/// Renames `from` to `to`, plus any `.ucas`/`.utoc` siblings of `from` to the matching siblings
/// of `to`. Used for enable/disable, which move a mod between active and disabled directories.
fn rename_with_sidecars(from: &Path, to: &Path, main_ext: &str) -> std::io::Result<()> {
    fs::rename(from, to)?;
    for ext in PAK_SIDECAR_EXTENSIONS {
        let Some(sidecar) = sidecar_path(from, main_ext, ext) else {
            continue;
        };
        if sidecar.exists() {
            if let Some(to_sidecar) = sidecar_path(to, main_ext, ext) {
                let _ = fs::rename(&sidecar, to_sidecar);
            }
        }
    }
    Ok(())
}

/// Removes `path`, plus any `.ucas`/`.utoc` siblings of `path` (same stem).
fn remove_file_with_sidecars(path: &Path, main_ext: &str) -> std::io::Result<()> {
    fs::remove_file(path)?;
    for ext in PAK_SIDECAR_EXTENSIONS {
        let Some(sidecar) = sidecar_path(path, main_ext, ext) else {
            continue;
        };
        if sidecar.exists() {
            let _ = fs::remove_file(&sidecar);
        }
    }
    Ok(())
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

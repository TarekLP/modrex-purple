use crate::commands::api::api_get;
use crate::commands::download::download_file;
use crate::commands::mod_index;
use crate::commands::settings::read_settings;
use chrono::Utc;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::{HashMap, HashSet};
use std::fs::{self, File};
use std::io::Read;
use std::path::{Path, PathBuf};
use tauri::AppHandle;
use uuid::Uuid;

// ── Types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModFolder {
    pub id: String,
    pub disk_name: String,
    pub display_name: String,
    pub priority: i64,
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type")]
pub enum TopLevelItem {
    #[serde(rename = "folder")]
    Folder { id: String },
    #[serde(rename = "mod")]
    Mod { id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct InstalledMod {
    #[serde(default)]
    pub uid: String,
    pub id: i64,
    pub name: String,
    pub version: String,
    pub filename: String,
    pub enabled: bool,
    pub installed_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub file_type: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub missing: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub folder_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub zip_archive: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct ModsState {
    pub folders: Vec<ModFolder>,
    pub mods: Vec<InstalledMod>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledResponse {
    pub mods: Vec<InstalledMod>,
    pub folders: Vec<ModFolder>,
    pub mods_hidden: bool,
}

// ── Path helpers ──────────────────────────────────────────────────────────────

pub fn mods_base(game_path: &str) -> PathBuf {
    PathBuf::from(game_path)
        .join("PAYDAY3")
        .join("Content")
        .join("Paks")
        .join("~mods")
}

fn disabled_base(game_path: &str) -> PathBuf {
    mods_base(game_path).join("disabled")
}

pub fn get_state_path(game_path: &str) -> PathBuf {
    mods_base(game_path).join(".pd3mm.json")
}

pub fn active_mod_path(game_path: &str, filename: &str, folder_rel: Option<&str>) -> PathBuf {
    match folder_rel {
        Some(rel) => mods_base(game_path).join(rel).join(filename),
        None => mods_base(game_path).join(filename),
    }
}

pub fn disabled_mod_path(game_path: &str, filename: &str, folder_rel: Option<&str>) -> PathBuf {
    let base = match folder_rel {
        Some(rel) => disabled_base(game_path).join(rel),
        None => disabled_base(game_path),
    };
    base.join(format!("{}.disabled", filename))
}

// ── String helpers ────────────────────────────────────────────────────────────

pub fn strip_priority_prefix(filename: &str) -> &str {
    let bytes = filename.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i > 0 && i < bytes.len() && bytes[i] == b'_' {
        &filename[i + 1..]
    } else {
        filename
    }
}

pub fn apply_priority_prefix(filename: &str, priority: i64) -> String {
    format!("{:03}_{}", priority, strip_priority_prefix(filename))
}

fn pak_filename(mod_name: &str) -> String {
    let trimmed = mod_name.trim();
    let mut result = String::new();
    let mut last_sep = false;
    for c in trimmed.chars() {
        if c.is_alphanumeric() || c == '_' || c == '.' || c == '-' {
            result.push(c);
            last_sep = false;
        } else if !last_sep {
            result.push('_');
            last_sep = true;
        }
    }
    let result = result.trim_matches('_');
    format!("{}.pak", result)
}

fn hash_filename(filename: &str) -> i64 {
    let mut h: i32 = 0;
    for c in filename.chars() {
        h = 31i32.wrapping_mul(h).wrapping_add(c as u32 as i32);
    }
    if h == 0 { -1 } else { -(h.unsigned_abs() as i64) }
}

pub fn make_uid(file_id: Option<i64>, filename: &str) -> String {
    match file_id {
        Some(id) => id.to_string(),
        None => strip_priority_prefix(filename).to_string(),
    }
}

// ── State I/O ─────────────────────────────────────────────────────────────────

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

fn save_state(state_path: &Path, state: &ModsState) {
    if let Some(parent) = state_path.parent() {
        if let Err(e) = fs::create_dir_all(parent) {
            log::warn!("save_state: create_dir_all {parent:?}: {e}");
        }
    }
    if let Err(e) = fs::write(state_path, serde_json::to_string_pretty(state).unwrap_or_default()) {
        log::warn!("save_state: write {state_path:?}: {e}");
    }
}

// ── Folder path ───────────────────────────────────────────────────────────────

pub fn get_folder_path(folders: &[ModFolder], folder_id: Option<&str>) -> Option<String> {
    let folder_id = folder_id?;
    let folder = folders.iter().find(|f| f.id == folder_id)?;
    let parent = get_folder_path(folders, folder.parent_id.as_deref());
    Some(match parent {
        Some(p) => format!("{}/{}", p, folder.disk_name),
        None => folder.disk_name.clone(),
    })
}

// ── SHA-256 ───────────────────────────────────────────────────────────────────

pub async fn compute_sha256(path: &Path) -> Result<String, String> {
    let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

// ── ZIP detection ─────────────────────────────────────────────────────────────

fn is_zip(path: &Path) -> bool {
    let mut buf = [0u8; 4];
    File::open(path)
        .and_then(|mut f| f.read_exact(&mut buf))
        .is_ok()
        && buf == [0x50, 0x4B, 0x03, 0x04]
}

fn list_pak_entries_in_zip(path: &Path) -> Result<Vec<String>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        if !entry.is_dir() && entry.name().ends_with(".pak") {
            entries.push(entry.name().to_string());
        }
    }
    Ok(entries)
}

fn extract_zip_entry(zip_path: &Path, entry_name: &str, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entry = archive
        .by_name(entry_name)
        .map_err(|_| format!("entry '{}' not found in archive", entry_name))?;
    let mut dest_file = File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut entry, &mut dest_file).map_err(|e| e.to_string())?;
    Ok(())
}

// ── Directory scanning ────────────────────────────────────────────────────────

async fn scan_active(dir: &Path, prefix: &str, known: &HashSet<String>, out: &mut Vec<(String, bool)>) {
    let mut rd = match tokio::fs::read_dir(dir).await {
        Ok(r) => r,
        Err(_) => return,
    };
    let mut subdirs = Vec::new();
    while let Ok(Some(entry)) = rd.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        if prefix.is_empty() && name == "disabled" {
            continue;
        }
        let ft = match entry.file_type().await {
            Ok(t) => t,
            Err(_) => continue,
        };
        let rel = if prefix.is_empty() { name.clone() } else { format!("{}/{}", prefix, name) };
        if ft.is_dir() {
            subdirs.push((entry.path(), rel));
        } else if name.ends_with(".pak") && !known.contains(&rel) {
            out.push((rel, true));
        }
    }
    for (path, sub) in subdirs {
        Box::pin(scan_active(&path, &sub, known, out)).await;
    }
}

async fn scan_disabled(dir: &Path, prefix: &str, known: &HashSet<String>, out: &mut Vec<(String, bool)>) {
    let mut rd = match tokio::fs::read_dir(dir).await {
        Ok(r) => r,
        Err(_) => return,
    };
    let mut subdirs = Vec::new();
    while let Ok(Some(entry)) = rd.next_entry().await {
        let name = entry.file_name().to_string_lossy().into_owned();
        let ft = match entry.file_type().await {
            Ok(t) => t,
            Err(_) => continue,
        };
        let sub = if prefix.is_empty() { name.clone() } else { format!("{}/{}", prefix, name) };
        if ft.is_dir() {
            subdirs.push((entry.path(), sub));
        } else if name.ends_with(".pak.disabled") {
            let pak = name.trim_end_matches(".disabled").to_string();
            let rel = if prefix.is_empty() { pak.clone() } else { format!("{}/{}", prefix, pak) };
            if !known.contains(&rel) {
                out.push((rel, false));
            }
        }
    }
    for (path, sub) in subdirs {
        Box::pin(scan_disabled(&path, &sub, known, out)).await;
    }
}

pub async fn find_untracked_paks(game_path: &str, known: &HashSet<String>) -> Vec<(String, bool)> {
    let bak = PathBuf::from(game_path).join("PAYDAY3").join("Content").join("~mods.bak");
    if bak.exists() {
        return vec![];
    }
    let mut out = Vec::new();
    scan_active(&mods_base(game_path), "", known, &mut out).await;
    scan_disabled(&disabled_base(game_path), "", known, &mut out).await;
    out
}

// ── Reconcile ─────────────────────────────────────────────────────────────────

pub fn reconcile_state(game_path: &str, state_path: &Path) -> ModsState {
    let bak = PathBuf::from(game_path).join("PAYDAY3").join("Content").join("~mods.bak");
    if bak.exists() {
        return read_state(&bak.join(".pd3mm.json"));
    }

    let state = read_state(state_path);

    // Migrate legacy disabled paths: disabled/foo.pak → disabled/foo.pak.disabled
    let dis_dir = disabled_base(game_path);
    let disabled_mods: Vec<InstalledMod> = state.mods.iter().filter(|m| !m.enabled).cloned().collect();
    for m in &disabled_mods {
        let folder_rel = get_folder_path(&state.folders, m.folder_id.as_deref());
        let new_path = disabled_mod_path(game_path, &m.filename, folder_rel.as_deref());
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

    // Check which mods exist on disk
    let checks: Vec<bool> = state
        .mods
        .iter()
        .map(|m| {
            let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
            active_mod_path(game_path, &m.filename, rel.as_deref()).exists()
                || disabled_mod_path(game_path, &m.filename, rel.as_deref()).exists()
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

    // Drop phantom folder entries (directories that no longer exist on disk)
    let mods_base_path = mods_base(game_path);
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

    // Assign priorities to any mods that don't have one yet
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

// ── Mod operations ────────────────────────────────────────────────────────────

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
        if ex.filename != filename {
            let ex_rel = get_folder_path(&state.folders, ex.folder_id.as_deref());
            let old = if ex.enabled {
                active_mod_path(game_path, &ex.filename, ex_rel.as_deref())
            } else {
                disabled_mod_path(game_path, &ex.filename, ex_rel.as_deref())
            };
            if old.exists() {
                if let Err(e) = fs::remove_file(&old) {
                    log::warn!("install: remove old pak {old:?}: {e}");
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

fn uninstall_mod_op(game_path: &str, state_path: &Path, uid: &str) {
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

fn enable_mod_op(game_path: &str, state_path: &Path, uid: &str) {
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

fn disable_mod_op(game_path: &str, state_path: &Path, uid: &str) {
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

fn reorder_mods_in_folder_op(
    game_path: &str,
    state_path: &Path,
    folder_id: Option<&str>,
    ordered_uids: &[String],
) {
    let mut state = read_state(state_path);
    let folder_rel = get_folder_path(&state.folders, folder_id);
    let total = ordered_uids.len() as i64;

    for m in state.mods.iter_mut() {
        if m.folder_id.as_deref() != folder_id {
            continue;
        }
        let Some(pos) = ordered_uids.iter().position(|u| u == &m.uid) else { continue };
        let priority = total - pos as i64;
        let new_filename = apply_priority_prefix(&m.filename, priority);
        if new_filename != m.filename {
            let old = if m.enabled {
                active_mod_path(game_path, &m.filename, folder_rel.as_deref())
            } else {
                disabled_mod_path(game_path, &m.filename, folder_rel.as_deref())
            };
            let new = if m.enabled {
                active_mod_path(game_path, &new_filename, folder_rel.as_deref())
            } else {
                disabled_mod_path(game_path, &new_filename, folder_rel.as_deref())
            };
            if old.exists() {
                if let Err(e) = fs::rename(&old, &new) {
                    log::warn!("reorder: rename {old:?} -> {new:?}: {e}");
                }
            }
            m.filename = new_filename;
        }
        m.priority = Some(priority);
    }

    save_state(state_path, &state);
}

fn move_mod_to_folder_op(
    game_path: &str,
    state_path: &Path,
    uid: &str,
    target_folder_id: Option<String>,
    target_position: usize,
) {
    let mut state = read_state(state_path);
    let Some(moving) = state.mods.iter().find(|m| m.uid == uid).cloned() else { return };

    let src_rel = get_folder_path(&state.folders, moving.folder_id.as_deref());
    let tgt_rel = get_folder_path(&state.folders, target_folder_id.as_deref());

    // Build ordered target list with the moved mod inserted at position
    let mut target_mods: Vec<InstalledMod> = state
        .mods
        .iter()
        .filter(|m| m.folder_id == target_folder_id && m.uid != uid)
        .cloned()
        .collect();
    target_mods.sort_by(|a, b| b.priority.unwrap_or(0).cmp(&a.priority.unwrap_or(0)));
    let pos = target_position.min(target_mods.len());
    target_mods.insert(pos, moving.clone());
    let total = target_mods.len() as i64;

    // Ensure target directories exist
    if let Some(r) = &tgt_rel {
        if let Err(e) = fs::create_dir_all(mods_base(game_path).join(r)) {
            log::warn!("move_to_folder: create_dir_all active: {e}");
        }
    }
    if !moving.enabled {
        let dis = match &tgt_rel {
            Some(r) => disabled_base(game_path).join(r),
            None => disabled_base(game_path),
        };
        if let Err(e) = fs::create_dir_all(&dis) {
            log::warn!("move_to_folder: create_dir_all disabled: {e}");
        }
    }

    for m in state.mods.iter_mut() {
        let Some(p) = target_mods.iter().position(|tm| tm.uid == m.uid) else { continue };
        let priority = total - p as i64;
        let new_filename = apply_priority_prefix(&m.filename, priority);
        let cur_rel = if m.uid == uid { src_rel.clone() } else { tgt_rel.clone() };

        if new_filename != m.filename || (m.uid == uid && src_rel != tgt_rel) {
            let old = if m.enabled {
                active_mod_path(game_path, &m.filename, cur_rel.as_deref())
            } else {
                disabled_mod_path(game_path, &m.filename, cur_rel.as_deref())
            };
            let new = if m.enabled {
                active_mod_path(game_path, &new_filename, tgt_rel.as_deref())
            } else {
                disabled_mod_path(game_path, &new_filename, tgt_rel.as_deref())
            };
            if old.exists() {
                if let Err(e) = fs::rename(&old, &new) {
                    log::warn!("move_to_folder: rename {old:?} -> {new:?}: {e}");
                }
            }
        }

        m.filename = new_filename;
        m.priority = Some(priority);
        m.folder_id = target_folder_id.clone();
    }

    save_state(state_path, &state);
}

fn reorder_children_op(
    game_path: &str,
    state_path: &Path,
    parent_id: Option<&str>,
    items: &[TopLevelItem],
) {
    let mut state = read_state(state_path);
    let parent_rel = get_folder_path(&state.folders, parent_id);
    let mods_dir = match &parent_rel {
        Some(r) => mods_base(game_path).join(r),
        None => mods_base(game_path),
    };
    let dis_dir = match &parent_rel {
        Some(r) => disabled_base(game_path).join(r),
        None => disabled_base(game_path),
    };
    let total = items.len() as i64;

    // Collect folder renames using original state
    struct FolderRename { id: String, old: String, new: String }
    let folder_renames: Vec<FolderRename> = items
        .iter()
        .enumerate()
        .filter_map(|(pos, item)| {
            let TopLevelItem::Folder { id } = item else { return None };
            let f = state.folders.iter().find(|f| &f.id == id)?;
            let priority = total - pos as i64;
            let new = apply_priority_prefix(strip_priority_prefix(&f.disk_name), priority);
            if new != f.disk_name {
                Some(FolderRename { id: id.clone(), old: f.disk_name.clone(), new })
            } else {
                None
            }
        })
        .collect();

    // Collect mod renames using original state (folder path stable for direct children of parent)
    struct ModRename { _uid: String, old: String, new: String, rel: Option<String>, enabled: bool }
    let mod_renames: Vec<ModRename> = items
        .iter()
        .enumerate()
        .filter_map(|(pos, item)| {
            let TopLevelItem::Mod { id } = item else { return None };
            let m = state.mods.iter().find(|m| &m.uid == id)?;
            let priority = total - pos as i64;
            let new = apply_priority_prefix(&m.filename, priority);
            if new == m.filename {
                return None;
            }
            let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
            Some(ModRename { _uid: id.clone(), old: m.filename.clone(), new, rel, enabled: m.enabled })
        })
        .collect();

    // Two-phase folder disk rename
    for r in &folder_renames {
        let tmp = format!("__modrex_tmp_{}", r.id);
        let a = mods_dir.join(&r.old);
        if a.exists() {
            if let Err(e) = fs::rename(&a, mods_dir.join(&tmp)) {
                log::warn!("reorder_children: tmp rename active {a:?}: {e}");
            }
        }
        let d = dis_dir.join(&r.old);
        if d.exists() {
            if let Err(e) = fs::rename(&d, dis_dir.join(&tmp)) {
                log::warn!("reorder_children: tmp rename disabled {d:?}: {e}");
            }
        }
    }
    for r in &folder_renames {
        let tmp = format!("__modrex_tmp_{}", r.id);
        let a = mods_dir.join(&tmp);
        if a.exists() {
            if let Err(e) = fs::rename(&a, mods_dir.join(&r.new)) {
                log::warn!("reorder_children: final rename active {a:?}: {e}");
            }
        }
        let d = dis_dir.join(&tmp);
        if d.exists() {
            if let Err(e) = fs::rename(&d, dis_dir.join(&r.new)) {
                log::warn!("reorder_children: final rename disabled {d:?}: {e}");
            }
        }
    }

    // Mod disk renames
    for r in &mod_renames {
        let old_path = if r.enabled {
            active_mod_path(game_path, &r.old, r.rel.as_deref())
        } else {
            disabled_mod_path(game_path, &r.old, r.rel.as_deref())
        };
        let new_path = if r.enabled {
            active_mod_path(game_path, &r.new, r.rel.as_deref())
        } else {
            disabled_mod_path(game_path, &r.new, r.rel.as_deref())
        };
        if old_path.exists() {
            if let Err(e) = fs::rename(&old_path, &new_path) {
                log::warn!("reorder_children: mod rename {old_path:?} -> {new_path:?}: {e}");
            }
        }
    }

    // Update state
    for (pos, item) in items.iter().enumerate() {
        let priority = total - pos as i64;
        match item {
            TopLevelItem::Folder { id } => {
                if let Some(f) = state.folders.iter_mut().find(|f| &f.id == id) {
                    f.disk_name = apply_priority_prefix(strip_priority_prefix(&f.disk_name), priority);
                    f.priority = priority;
                }
            }
            TopLevelItem::Mod { id } => {
                if let Some(m) = state.mods.iter_mut().find(|m| &m.uid == id) {
                    m.filename = apply_priority_prefix(&m.filename, priority);
                    m.priority = Some(priority);
                }
            }
        }
    }

    save_state(state_path, &state);
}

fn create_folder_op(
    game_path: &str,
    state_path: &Path,
    display_name: &str,
    parent_id: Option<String>,
) -> Result<ModFolder, String> {
    let mut state = read_state(state_path);

    let slug: String = display_name
        .trim()
        .chars()
        .filter(|&c| !"\\/:*?\"<>|".contains(c))
        .collect();
    let slug = if slug.is_empty() { "folder".to_string() } else { slug };

    let max_folders = state.folders.iter().filter(|f| f.parent_id == parent_id).map(|f| f.priority).max().unwrap_or(0);
    let max_mods = state.mods.iter().filter(|m| m.folder_id == parent_id).filter_map(|m| m.priority).max().unwrap_or(0);
    let priority = max_folders.max(max_mods) + 1;
    let disk_name = apply_priority_prefix(&slug, priority);
    let id = Uuid::new_v4().to_string();

    let parent_rel = get_folder_path(&state.folders, parent_id.as_deref());
    let dir = match &parent_rel {
        Some(r) => mods_base(game_path).join(r).join(&disk_name),
        None => mods_base(game_path).join(&disk_name),
    };
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let folder = ModFolder { id, disk_name, display_name: display_name.to_string(), priority, parent_id };
    state.folders.push(folder.clone());
    save_state(state_path, &state);
    Ok(folder)
}

fn move_folder_op(
    game_path: &str,
    state_path: &Path,
    folder_id: &str,
    target_parent_id: Option<String>,
) {
    let mut state = read_state(state_path);
    let Some(folder) = state.folders.iter().find(|f| f.id == folder_id).cloned() else { return };
    if folder.parent_id == target_parent_id { return; }

    // Cycle detection
    let mut cur = target_parent_id.clone();
    while let Some(ref cid) = cur {
        if cid == folder_id { return; }
        cur = state.folders.iter().find(|f| &f.id == cid).and_then(|f| f.parent_id.clone());
    }

    let mods_b = mods_base(game_path);
    let dis_b = disabled_base(game_path);
    let old_rel = get_folder_path(&state.folders, Some(folder_id)).unwrap_or_default();

    let max_f = state.folders.iter().filter(|f| f.parent_id == target_parent_id).map(|f| f.priority).max().unwrap_or(0);
    let max_m = state.mods.iter().filter(|m| m.folder_id == target_parent_id).filter_map(|m| m.priority).max().unwrap_or(0);
    let new_priority = max_f.max(max_m) + 1;
    let new_disk_name = apply_priority_prefix(strip_priority_prefix(&folder.disk_name), new_priority);

    for f in state.folders.iter_mut() {
        if f.id == folder_id {
            f.parent_id = target_parent_id.clone();
            f.disk_name = new_disk_name.clone();
            f.priority = new_priority;
        }
    }
    let new_rel = get_folder_path(&state.folders, Some(folder_id)).unwrap_or_default();

    let tgt_parent_rel = get_folder_path(&state.folders, target_parent_id.as_deref());
    let active_tgt_parent = match &tgt_parent_rel {
        Some(r) => mods_b.join(r),
        None => mods_b.clone(),
    };
    let dis_tgt_parent = match &tgt_parent_rel {
        Some(r) => dis_b.join(r),
        None => dis_b.clone(),
    };

    let old_a = mods_b.join(&old_rel);
    if old_a.exists() {
        if let Err(e) = fs::create_dir_all(&active_tgt_parent) {
            log::warn!("move_folder: create_dir_all active: {e}");
        }
        if let Err(e) = fs::rename(&old_a, mods_b.join(&new_rel)) {
            log::warn!("move_folder: rename active {old_a:?}: {e}");
        }
    }
    let old_d = dis_b.join(&old_rel);
    if old_d.exists() {
        if let Err(e) = fs::create_dir_all(&dis_tgt_parent) {
            log::warn!("move_folder: create_dir_all disabled: {e}");
        }
        if let Err(e) = fs::rename(&old_d, dis_b.join(&new_rel)) {
            log::warn!("move_folder: rename disabled {old_d:?}: {e}");
        }
    }

    save_state(state_path, &state);
}

fn rename_folder_op(
    game_path: &str,
    state_path: &Path,
    folder_id: &str,
    display_name: &str,
) {
    let mut state = read_state(state_path);
    let Some(folder) = state.folders.iter().find(|f| f.id == folder_id).cloned() else { return };

    let slug: String = display_name.trim().chars().filter(|&c| !"\\/:*?\"<>|".contains(c)).collect();
    let slug = if slug.is_empty() { "folder".to_string() } else { slug };
    let new_disk_name = apply_priority_prefix(&slug, folder.priority);

    if new_disk_name != folder.disk_name {
        let parent_rel = get_folder_path(&state.folders, folder.parent_id.as_deref());
        let mods_b = mods_base(game_path);
        let dis_b = disabled_base(game_path);

        let (old_a, new_a) = match &parent_rel {
            Some(r) => (mods_b.join(r).join(&folder.disk_name), mods_b.join(r).join(&new_disk_name)),
            None => (mods_b.join(&folder.disk_name), mods_b.join(&new_disk_name)),
        };
        if old_a.exists() {
            if let Err(e) = fs::rename(&old_a, &new_a) {
                log::warn!("rename_folder: rename active {old_a:?} -> {new_a:?}: {e}");
            }
        }

        let (old_d, new_d) = match &parent_rel {
            Some(r) => (dis_b.join(r).join(&folder.disk_name), dis_b.join(r).join(&new_disk_name)),
            None => (dis_b.join(&folder.disk_name), dis_b.join(&new_disk_name)),
        };
        if old_d.exists() {
            if let Err(e) = fs::rename(&old_d, &new_d) {
                log::warn!("rename_folder: rename disabled {old_d:?} -> {new_d:?}: {e}");
            }
        }
    }

    for f in state.folders.iter_mut() {
        if f.id == folder_id {
            f.display_name = display_name.to_string();
            f.disk_name = new_disk_name.clone();
        }
    }
    save_state(state_path, &state);
}

fn delete_folder_op(game_path: &str, state_path: &Path, folder_id: &str) {
    let mut state = read_state(state_path);
    let Some(folder) = state.folders.iter().find(|f| f.id == folder_id).cloned() else { return };

    let target_parent_id = folder.parent_id.clone();
    let folder_rel = get_folder_path(&state.folders, Some(folder_id)).unwrap_or_default();
    let target_parent_rel = get_folder_path(&state.folders, target_parent_id.as_deref());

    let mods_b = mods_base(game_path);
    let dis_b = disabled_base(game_path);

    if let Some(r) = &target_parent_rel {
        if let Err(e) = fs::create_dir_all(mods_b.join(r)) {
            log::warn!("delete_folder: create_dir_all target: {e}");
        }
    }

    let mut max_p = {
        let f = state.folders.iter().filter(|f| f.parent_id == target_parent_id && f.id != folder_id).map(|f| f.priority).max().unwrap_or(0);
        let m = state.mods.iter().filter(|m| m.folder_id == target_parent_id).filter_map(|m| m.priority).max().unwrap_or(0);
        f.max(m)
    };

    // Move direct child mods to target parent
    for m in state.mods.iter_mut() {
        if m.folder_id.as_deref() != Some(folder_id) { continue; }
        max_p += 1;
        let new_filename = apply_priority_prefix(&m.filename, max_p);
        let old = if m.enabled {
            active_mod_path(game_path, &m.filename, Some(&folder_rel))
        } else {
            disabled_mod_path(game_path, &m.filename, Some(&folder_rel))
        };
        let new = if m.enabled {
            active_mod_path(game_path, &new_filename, target_parent_rel.as_deref())
        } else {
            disabled_mod_path(game_path, &new_filename, target_parent_rel.as_deref())
        };
        if old.exists() {
            if let Err(e) = fs::rename(&old, &new) {
                log::warn!("delete_folder: move mod {old:?}: {e}");
            }
        }
        m.filename = new_filename;
        m.priority = Some(max_p);
        m.folder_id = target_parent_id.clone();
    }

    // Move direct child folders to target parent
    let child_ids: Vec<String> = state
        .folders
        .iter()
        .filter(|f| f.parent_id.as_deref() == Some(folder_id))
        .map(|f| f.id.clone())
        .collect();

    for cf_id in &child_ids {
        let cf = state.folders.iter().find(|f| &f.id == cf_id).cloned().unwrap();
        max_p += 1;
        let new_disk = apply_priority_prefix(strip_priority_prefix(&cf.disk_name), max_p);
        let old_rel = get_folder_path(&state.folders, Some(cf_id)).unwrap_or_default();

        let old_a = mods_b.join(&old_rel);
        let new_a = match &target_parent_rel {
            Some(r) => mods_b.join(r).join(&new_disk),
            None => mods_b.join(&new_disk),
        };
        if old_a.exists() {
            if let Err(e) = fs::rename(&old_a, &new_a) {
                log::warn!("delete_folder: move subfolder active {old_a:?}: {e}");
            }
        }

        let old_d = dis_b.join(&old_rel);
        let new_d = match &target_parent_rel {
            Some(r) => dis_b.join(r).join(&new_disk),
            None => dis_b.join(&new_disk),
        };
        if old_d.exists() {
            if let Err(e) = fs::rename(&old_d, &new_d) {
                log::warn!("delete_folder: move subfolder disabled {old_d:?}: {e}");
            }
        }

        for f in state.folders.iter_mut() {
            if &f.id == cf_id {
                f.parent_id = target_parent_id.clone();
                f.disk_name = new_disk.clone();
                f.priority = max_p;
            }
        }
    }

    let active_dir = mods_b.join(&folder_rel);
    if active_dir.exists() {
        if let Err(e) = fs::remove_dir_all(&active_dir) {
            log::warn!("delete_folder: remove_dir_all active {folder_rel:?}: {e}");
        }
    }
    let dis_dir = dis_b.join(&folder_rel);
    if dis_dir.exists() {
        if let Err(e) = fs::remove_dir_all(&dis_dir) {
            log::warn!("delete_folder: remove_dir_all disabled {folder_rel:?}: {e}");
        }
    }

    state.folders.retain(|f| f.id != folder_id);
    save_state(state_path, &state);
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_installed(app: AppHandle) -> Result<InstalledResponse, String> {
    let settings = read_settings(&app);
    let Some(game_path) = settings.game_path else {
        return Ok(InstalledResponse { mods: vec![], folders: vec![], mods_hidden: false });
    };

    let state_path = get_state_path(&game_path);
    let bak = PathBuf::from(&game_path).join("PAYDAY3").join("Content").join("~mods.bak");
    let mods_hidden = bak.exists();

    let mut state = reconcile_state(&game_path, &state_path);

    // Re-identify synthetic negative-id entries whose name ends in " <number>" (a file id
    // suffix appended during fallback identification). If the base name matches a
    // positively-identified tracked mod, assign that mod's id so all pak files from the
    // same mod are grouped together in the UI.
    {
        let name_to_id: std::collections::HashMap<String, i64> = state
            .mods
            .iter()
            .filter(|m| m.id > 0)
            .map(|m| (m.name.to_lowercase(), m.id))
            .collect();
        for m in &mut state.mods {
            if m.id >= 0 { continue; }
            if let Some(pos) = m.name.rfind(' ') {
                let suffix = &m.name[pos + 1..];
                if !suffix.is_empty() && suffix.chars().all(|c| c.is_ascii_digit()) {
                    let base = m.name[..pos].to_lowercase();
                    if let Some(&matched_id) = name_to_id.get(&base) {
                        m.id = matched_id;
                    }
                }
            }
        }
    }

    if mods_hidden {
        return Ok(InstalledResponse { mods: state.mods, folders: state.folders, mods_hidden: true });
    }

    let known: HashSet<String> = state
        .mods
        .iter()
        .map(|m| {
            let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
            match rel {
                Some(r) => format!("{}/{}", r, m.filename),
                None => m.filename.clone(),
            }
        })
        .collect();

    let untracked = find_untracked_paks(&game_path, &known).await;
    if untracked.is_empty() {
        return Ok(InstalledResponse { mods: state.mods, folders: state.folders, mods_hidden: false });
    }

    // Auto-create folder entries for nested untracked paks
    {
        let mut folder_by_path: HashMap<String, String> = state
            .folders
            .iter()
            .filter_map(|f| get_folder_path(&state.folders, Some(&f.id)).map(|p| (p, f.id.clone())))
            .collect();

        let mut max_p = state.folders.iter().map(|f| f.priority).max().unwrap_or(0)
            .max(state.mods.iter().filter(|m| m.folder_id.is_none()).filter_map(|m| m.priority).max().unwrap_or(0));

        for (rel_path, _) in &untracked {
            let parts: Vec<&str> = rel_path.split('/').collect();
            if parts.len() <= 1 { continue; }
            let segs = &parts[..parts.len() - 1];
            let mut prefix = String::new();
            for (i, &seg) in segs.iter().enumerate() {
                prefix = if i == 0 { seg.to_string() } else { format!("{}/{}", prefix, seg) };
                if folder_by_path.contains_key(&prefix) { continue; }
                let parent_path = if i == 0 { None } else { Some(segs[..i].join("/")) };
                let parent_id = parent_path.as_deref().and_then(|p| folder_by_path.get(p)).cloned();
                max_p += 1;
                let new_folder = ModFolder {
                    id: Uuid::new_v4().to_string(),
                    display_name: strip_priority_prefix(seg).replace('_', " ").trim().to_string(),
                    disk_name: seg.to_string(),
                    priority: max_p,
                    parent_id,
                };
                folder_by_path.insert(prefix.clone(), new_folder.id.clone());
                state.folders.push(new_folder);
            }
        }
    }

    // Build folder path → id map for lookups (computed once; used in both phases below)
    let folder_path_to_id: HashMap<String, String> = state
        .folders
        .iter()
        .filter_map(|f| get_folder_path(&state.folders, Some(&f.id)).map(|p| (p, f.id.clone())))
        .collect();

    // Compute SHA256 for all untracked paks in parallel
    let sha_futures: Vec<_> = untracked
        .iter()
        .map(|(rel_path, enabled)| {
            let game_path = game_path.clone();
            let rel_path = rel_path.clone();
            let enabled = *enabled;
            async move {
                let path = if enabled {
                    mods_base(&game_path).join(&rel_path)
                } else {
                    disabled_base(&game_path).join(format!("{}.disabled", rel_path))
                };
                compute_sha256(&path).await.ok()
            }
        })
        .collect();
    let sha256s: Vec<Option<String>> = futures::future::join_all(sha_futures).await;

    // Phase 1 — reconcile untracked files against already-tracked mods by SHA256.
    // If a newly-found file's hash matches a tracked mod, update its filename/enabled
    // rather than creating a duplicate entry.
    let sha256_to_uid: HashMap<String, String> = state
        .mods
        .iter()
        .filter_map(|m| m.sha256.as_ref().map(|h| (h.clone(), m.uid.clone())))
        .collect();

    let mut reconciled_uids: HashSet<String> = HashSet::new();
    let mut reconcile_ops: Vec<(String, String, bool, Option<String>)> = Vec::new();

    for ((rel_path, enabled), sha256) in untracked.iter().zip(sha256s.iter()) {
        let Some(sha) = sha256 else { continue };
        let Some(uid) = sha256_to_uid.get(sha.as_str()) else { continue };
        let parts: Vec<&str> = rel_path.split('/').collect();
        let filename = parts.last().unwrap().to_string();
        let folder_path = if parts.len() > 1 { Some(parts[..parts.len() - 1].join("/")) } else { None };
        let folder_id = folder_path.as_deref().and_then(|fp| folder_path_to_id.get(fp).cloned());
        reconcile_ops.push((uid.clone(), filename, *enabled, folder_id));
        reconciled_uids.insert(uid.clone());
    }

    for (uid, filename, enabled, folder_id) in reconcile_ops {
        if let Some(m) = state.mods.iter_mut().find(|m| m.uid == uid) {
            m.filename = filename;
            m.enabled = enabled;
            m.folder_id = folder_id;
            m.missing = None;
        }
    }

    // Phase 2 — identify remaining untracked files via mod-index, then fallback.
    let now = Utc::now().to_rfc3339();
    let mut new_mods: Vec<InstalledMod> = Vec::new();

    for ((rel_path, enabled), sha256) in untracked.iter().zip(sha256s.iter()) {
        // Already reconciled to an existing tracked entry above
        if sha256.as_deref().is_some_and(|s| sha256_to_uid.contains_key(s)) {
            continue;
        }

        let parts: Vec<&str> = rel_path.split('/').collect();
        let filename = parts.last().unwrap().to_string();
        let folder_path = if parts.len() > 1 { Some(parts[..parts.len() - 1].join("/")) } else { None };
        let folder_id = folder_path.as_deref().and_then(|fp| folder_path_to_id.get(fp).cloned());

        let stem = filename
            .strip_suffix(".pak")
            .or_else(|| filename.strip_suffix(".pak.disabled"))
            .unwrap_or(&filename);
        let stripped = strip_priority_prefix(stem);

        // Try identification in priority order: SHA256 → name → bare-number filename → synthetic
        let stripped_name = stripped.replace('_', " ");
        let stripped_base = stripped
            .rfind('_')
            .filter(|&p| stripped[p + 1..].chars().all(|c| c.is_ascii_digit()))
            .map(|p| stripped[..p].replace('_', " "));

        let (id, name, file_id, version) = if let Some(sha) = sha256 {
            if let Some(hit) = mod_index::lookup_sha256(&app, sha) {
                (hit.mod_remote_id, hit.mod_name, Some(hit.file_remote_id), hit.version)
            } else if let Some(remote_id) = mod_index::lookup_by_name(&app, &stripped_name) {
                (remote_id, stripped_name.trim().to_string(), None, "unknown".to_string())
            } else if let Some(remote_id) = stripped_base.as_deref().and_then(|b| mod_index::lookup_by_name(&app, b)) {
                (remote_id, stripped_name.trim().to_string(), None, "unknown".to_string())
            } else if let Ok(num_id) = stripped.parse::<i64>() {
                (num_id, stripped.to_string(), None, "unknown".to_string())
            } else {
                (hash_filename(&filename), stripped_name.trim().to_string(), None, "unknown".to_string())
            }
        } else {
            if let Some(remote_id) = mod_index::lookup_by_name(&app, &stripped_name) {
                (remote_id, stripped_name.trim().to_string(), None, "unknown".to_string())
            } else if let Some(remote_id) = stripped_base.as_deref().and_then(|b| mod_index::lookup_by_name(&app, b)) {
                (remote_id, stripped_name.trim().to_string(), None, "unknown".to_string())
            } else if let Ok(num_id) = stripped.parse::<i64>() {
                (num_id, stripped.to_string(), None, "unknown".to_string())
            } else {
                (hash_filename(&filename), stripped_name.trim().to_string(), None, "unknown".to_string())
            }
        };

        let uid = match file_id {
            Some(fid) => fid.to_string(),
            None => strip_priority_prefix(&filename).to_string(),
        };

        new_mods.push(InstalledMod {
            uid,
            id,
            name,
            version,
            filename: filename.clone(),
            enabled: *enabled,
            installed_at: now.clone(),
            file_id,
            sha256: sha256.clone(),
            folder_id,
            ..InstalledMod::default()
        });
    }

    let tracked_ids: HashSet<i64> = state.mods.iter().filter(|m| m.id > 0).map(|m| m.id).collect();
    let mut by_uid: HashMap<String, InstalledMod> =
        state.mods.iter().map(|m| (m.uid.clone(), m.clone())).collect();
    for m in new_mods {
        if m.id > 0 && tracked_ids.contains(&m.id) {
            continue;
        }
        by_uid.insert(m.uid.clone(), m);
    }
    let final_mods: Vec<InstalledMod> = by_uid.into_values().collect();

    save_state(&state_path, &ModsState { folders: state.folders.clone(), mods: final_mods.clone() });
    Ok(InstalledResponse { mods: final_mods, folders: state.folders, mods_hidden: false })
}

#[tauri::command]
pub async fn install_mod(
    app: AppHandle,
    mod_id: u32,
    game_path: String,
    folder_id: Option<String>,
) -> Result<(), String> {
    let mod_val = api_get(&app, &format!("/mods/{}", mod_id), vec![]).await?;

    let mod_name = mod_val["name"].as_str().unwrap_or("").to_string();
    let mod_version = mod_val["version"].as_str().unwrap_or("").to_string();
    let remote_id = mod_val["id"].as_i64().unwrap_or(0);

    let (file_id, download_url, file_type) = if !mod_val["download"].is_null() {
        let dl = &mod_val["download"];
        (
            dl["id"].as_i64().unwrap_or(0),
            dl["download_url"].as_str().ok_or("no download_url")?.to_string(),
            dl["type"].as_str().unwrap_or("pak").to_string(),
        )
    } else if mod_val["has_download"].as_bool().unwrap_or(false) {
        let f = api_get(&app, &format!("/mods/{}/files/latest", mod_id), vec![]).await?;
        (
            f["id"].as_i64().unwrap_or(0),
            f["download_url"].as_str().ok_or("no download_url")?.to_string(),
            f["type"].as_str().unwrap_or("pak").to_string(),
        )
    } else {
        return Err("Mod has no download".to_string());
    };

    let tmp = download_file(&app, &download_url, &file_type).await?;

    let result = async {
        let sha256 = compute_sha256(&tmp).await?;
        let uid = file_id.to_string();
        let sp = get_state_path(&game_path);
        let saved = read_state(&sp);
        let existing_entry = saved.mods.iter()
            .find(|m| m.uid == uid)
            .or_else(|| if remote_id > 0 { saved.mods.iter().find(|m| m.id == remote_id) } else { None });
        let effective_folder_id = folder_id.or_else(|| existing_entry.and_then(|e| e.folder_id.clone()));
        let filename = saved.mods.iter().find(|m| m.uid == uid)
            .map(|m| m.filename.clone())
            .unwrap_or_else(|| pak_filename(&mod_name));

        // If the mod had a single previously-installed pak under a different uid
        // (i.e. an older version with a different file_id), remove it first so
        // install_mod_from_path doesn't produce two entries for the same mod.
        if saved.mods.iter().all(|m| m.uid != uid) && remote_id > 0 {
            let same: Vec<_> = saved.mods.iter().filter(|m| m.id == remote_id).collect();
            if same.len() == 1 {
                uninstall_mod_op(&game_path, &sp, &same[0].uid.clone());
            }
        }

        install_mod_from_path(
            &game_path,
            &sp,
            InstalledMod {
                uid,
                id: remote_id,
                name: mod_name,
                version: mod_version,
                filename,
                enabled: true,
                installed_at: Utc::now().to_rfc3339(),
                file_id: Some(file_id),
                file_type: Some(file_type.clone()),
                sha256: Some(sha256),
                ..InstalledMod::default()
            },
            &tmp,
            effective_folder_id,
        )?;

        let _ = reqwest::Client::new()
            .post(format!("https://api.modworkshop.net/files/{}/register-download", file_id))
            .send()
            .await;

        Ok::<(), String>(())
    }
    .await;

    let _ = tokio::fs::remove_file(&tmp).await;
    result
}

#[tauri::command]
pub async fn install_file(
    app: AppHandle,
    mod_id: i64,
    mod_name: String,
    file_id: i64,
    download_url: String,
    file_type: String,
    mod_version: String,
    game_path: String,
) -> Result<(), String> {
    let tmp = download_file(&app, &download_url, &file_type).await?;

    let result = async {
        let sha256 = compute_sha256(&tmp).await?;
        let uid = file_id.to_string();
        let sp = get_state_path(&game_path);
        let saved = read_state(&sp);
        let existing_entry = saved.mods.iter()
            .find(|m| m.uid == uid)
            .or_else(|| if mod_id > 0 { saved.mods.iter().find(|m| m.id == mod_id) } else { None });
        let effective_folder_id = existing_entry.and_then(|e| e.folder_id.clone());
        let filename = saved.mods.iter().find(|m| m.uid == uid)
            .map(|m| m.filename.clone())
            .unwrap_or_else(|| {
                if file_type == "main" { pak_filename(&mod_name) } else { pak_filename(&format!("{}_{}", mod_name, file_id)) }
            });

        install_mod_from_path(
            &game_path,
            &sp,
            InstalledMod {
                uid,
                id: mod_id,
                name: mod_name,
                version: mod_version,
                filename,
                enabled: true,
                installed_at: Utc::now().to_rfc3339(),
                file_id: Some(file_id),
                file_type: Some(file_type.clone()),
                sha256: Some(sha256),
                ..InstalledMod::default()
            },
            &tmp,
            effective_folder_id,
        )?;

        let _ = reqwest::Client::new()
            .post(format!("https://api.modworkshop.net/files/{}/register-download", file_id))
            .send()
            .await;

        Ok::<(), String>(())
    }
    .await;

    let _ = tokio::fs::remove_file(&tmp).await;
    result
}

#[tauri::command]
pub fn uninstall_mod(game_path: String, uid: String) {
    uninstall_mod_op(&game_path, &get_state_path(&game_path), &uid);
}

#[tauri::command]
pub fn enable_mod(game_path: String, uid: String) {
    enable_mod_op(&game_path, &get_state_path(&game_path), &uid);
}

#[tauri::command]
pub fn disable_mod(game_path: String, uid: String) {
    disable_mod_op(&game_path, &get_state_path(&game_path), &uid);
}

#[tauri::command]
pub fn reorder_in_folder(game_path: String, folder_id: Option<String>, ordered_uids: Vec<String>) {
    reorder_mods_in_folder_op(&game_path, &get_state_path(&game_path), folder_id.as_deref(), &ordered_uids);
}

#[tauri::command]
pub fn move_to_folder(game_path: String, uid: String, target_folder_id: Option<String>, target_position: usize) {
    move_mod_to_folder_op(&game_path, &get_state_path(&game_path), &uid, target_folder_id, target_position);
}

#[tauri::command]
pub fn reorder_children(game_path: String, parent_id: Option<String>, items: Vec<TopLevelItem>) {
    reorder_children_op(&game_path, &get_state_path(&game_path), parent_id.as_deref(), &items);
}

#[tauri::command]
pub fn move_folder(game_path: String, folder_id: String, target_parent_id: Option<String>) {
    move_folder_op(&game_path, &get_state_path(&game_path), &folder_id, target_parent_id);
}

#[tauri::command]
pub fn create_folder(
    game_path: String,
    display_name: String,
    parent_id: Option<String>,
) -> Result<ModFolder, String> {
    create_folder_op(&game_path, &get_state_path(&game_path), &display_name, parent_id)
}

#[tauri::command]
pub fn rename_folder(game_path: String, folder_id: String, display_name: String) {
    rename_folder_op(&game_path, &get_state_path(&game_path), &folder_id, &display_name);
}

#[tauri::command]
pub fn delete_folder(game_path: String, folder_id: String) {
    delete_folder_op(&game_path, &get_state_path(&game_path), &folder_id);
}

#[tauri::command]
pub fn open_mods_folder(app: AppHandle) {
    let settings = read_settings(&app);
    let Some(game_path) = settings.game_path else { return };
    let dir = mods_base(&game_path);
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
}

#[cfg(test)]
#[path = "mods_tests.rs"]
mod tests;

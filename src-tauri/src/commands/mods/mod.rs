mod folders;
mod install;
mod naming;
mod paths;
mod reorder;
mod state;
mod types;
mod zip;

// Public API used by lib.rs, launchers/, and other modules
pub use self::install::install_mod_from_path;
pub use self::paths::{find_untracked_paks, get_state_path, mods_base};
pub use self::state::{get_folder_path, read_state, reconcile_state};
pub use self::types::{InstalledMod, InstalledResponse, ModFolder, ModsState, TopLevelItem};
pub use self::zip::compute_sha256;

// Internal helpers used by Tauri commands in this file
pub(crate) use self::folders::{
    create_folder_op, delete_folder_op, move_folder_op, rename_folder_op,
};
pub(crate) use self::install::{disable_mod_op, enable_mod_op, uninstall_mod_op};
pub(crate) use self::naming::{hash_filename, pak_filename, strip_priority_prefix};
pub(crate) use self::paths::disabled_base;
pub(crate) use self::reorder::{move_mod_to_folder_op, reorder_children_op, reorder_mods_in_folder_op};
pub(crate) use self::state::save_state;
pub(crate) use self::zip::{extract_entry, mark_archive_files, resolve_archive_download};

// Re-exports needed only in test builds (suppressed in release to avoid unused-import warnings)
#[cfg(test)]
pub(crate) use self::naming::{apply_priority_prefix, make_uid};
#[cfg(test)]
pub(crate) use self::zip::{detect_archive, is_zip, list_pak_entries, ArchiveFormat};

use crate::commands::api::{api_get, http_client, user_agent};
use crate::commands::download::download_file;
use crate::commands::mod_index;
use crate::commands::settings::{game_settings, read_settings};
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tauri::AppHandle;
use uuid::Uuid;

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_installed(app: AppHandle, game_id: Option<String>) -> Result<InstalledResponse, String> {
    let game_id = game_id.as_deref().unwrap_or("pd3");
    if game_id != "pd3" {
        return Ok(InstalledResponse { mods: vec![], folders: vec![], mods_hidden: false });
    }
    let settings = read_settings(&app);
    let Some(game_path) = game_settings(&settings, "pd3").and_then(|gs| gs.game_path.clone()) else {
        return Ok(InstalledResponse { mods: vec![], folders: vec![], mods_hidden: false });
    };

    let state_path = get_state_path(&game_path);
    let bak = PathBuf::from(&game_path).join("PAYDAY3").join("Content").join("~mods.bak");
    let mods_hidden = bak.exists();

    let mut state = reconcile_state(&game_path, &state_path);

    // Upgrade negative-id entries whose SHA256 is now in the index (added after initial install).
    for m in &mut state.mods {
        if m.id >= 0 { continue; }
        let Some(ref sha) = m.sha256 else { continue };
        let Some(hit) = mod_index::lookup_sha256(&app, sha) else { continue };
        m.id = hit.mod_remote_id;
        m.name = hit.mod_name;
        m.version = hit.version;
        m.file_id = Some(hit.file_remote_id);
    }

    // Re-identify remaining negative-id entries whose name ends in " <number>" (a file id
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
        let (mods, any_checked) = mark_archive_files(&game_path, &state.folders, state.mods);
        if any_checked {
            save_state(&state_path, &ModsState { folders: state.folders.clone(), mods: mods.clone() });
        }
        return Ok(InstalledResponse { mods, folders: state.folders, mods_hidden: false });
    }

    let mut folder_path_to_id: HashMap<String, String> = state
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
            if folder_path_to_id.contains_key(&prefix) { continue; }
            let parent_path = if i == 0 { None } else { Some(segs[..i].join("/")) };
            let parent_id = parent_path.as_deref().and_then(|p| folder_path_to_id.get(p)).cloned();
            max_p += 1;
            let new_folder = ModFolder {
                id: Uuid::new_v4().to_string(),
                display_name: strip_priority_prefix(seg).replace('_', " ").trim().to_string(),
                disk_name: seg.to_string(),
                priority: max_p,
                parent_id,
            };
            folder_path_to_id.insert(prefix.clone(), new_folder.id.clone());
            state.folders.push(new_folder);
        }
    }

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

    let mut reconcile_ops: Vec<(String, String, bool, Option<String>)> = Vec::new();

    for ((rel_path, enabled), sha256) in untracked.iter().zip(sha256s.iter()) {
        let Some(sha) = sha256 else { continue };
        let Some(uid) = sha256_to_uid.get(sha.as_str()) else { continue };
        let parts: Vec<&str> = rel_path.split('/').collect();
        let filename = parts.last().unwrap_or(&"").to_string();
        let folder_path = if parts.len() > 1 { Some(parts[..parts.len() - 1].join("/")) } else { None };
        let folder_id = folder_path.as_deref().and_then(|fp| folder_path_to_id.get(fp).cloned());
        reconcile_ops.push((uid.clone(), filename, *enabled, folder_id));
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

    // Build by_uid before the loop so uid collision detection can check against it.
    let mut by_uid: HashMap<String, InstalledMod> =
        state.mods.iter().map(|m| (m.uid.clone(), m.clone())).collect();

    for ((rel_path, enabled), sha256) in untracked.iter().zip(sha256s.iter()) {
        // Already reconciled to an existing tracked entry above
        if sha256.as_deref().is_some_and(|s| sha256_to_uid.contains_key(s)) {
            continue;
        }

        let parts: Vec<&str> = rel_path.split('/').collect();
        let filename = parts.last().unwrap_or(&"").to_string();
        let folder_path = if parts.len() > 1 { Some(parts[..parts.len() - 1].join("/")) } else { None };
        let folder_id = folder_path.as_deref().and_then(|fp| folder_path_to_id.get(fp).cloned());

        let stem = filename
            .strip_suffix(".pak")
            .or_else(|| filename.strip_suffix(".pak.disabled"))
            .unwrap_or(&filename);
        let stripped = strip_priority_prefix(stem);

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

        // Fall back to filename uid when file_id already exists — multi-pak ZIPs share one file_id.
        let uid = match file_id {
            Some(fid) => {
                let candidate = fid.to_string();
                if by_uid.contains_key(&candidate) {
                    strip_priority_prefix(&filename).to_string()
                } else {
                    candidate
                }
            }
            None => strip_priority_prefix(&filename).to_string(),
        };

        by_uid.entry(uid.clone()).or_insert(InstalledMod {
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

    let folders = state.folders;
    let mods: Vec<InstalledMod> = by_uid.into_values().collect();
    let (mods, _) = mark_archive_files(&game_path, &folders, mods);
    save_state(&state_path, &ModsState { folders: folders.clone(), mods: mods.clone() });
    Ok(InstalledResponse { mods, folders, mods_hidden: false })
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

    let downloaded = download_file(&app, &download_url, &file_type).await?;
    let (tmp, zip_orig) = match resolve_archive_download(downloaded) {
        Err(e) if e.starts_with("ZIP_MULTI_PAK:") => {
            if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&e["ZIP_MULTI_PAK:".len()..]) {
                v["modId"] = serde_json::json!(remote_id);
                v["modName"] = serde_json::json!(&mod_name);
                v["fileId"] = serde_json::json!(file_id);
                v["fileType"] = serde_json::json!(&file_type);
                v["modVersion"] = serde_json::json!(&mod_version);
                return Err(format!("ZIP_MULTI_PAK:{}", v));
            }
            return Err(e);
        }
        result => result?,
    };

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

        let _ = http_client()
            .post(format!("https://api.modworkshop.net/files/{}/register-download", file_id))
            .header("User-Agent", user_agent(&app))
            .send()
            .await;

        Ok::<(), String>(())
    }
    .await;

    let _ = tokio::fs::remove_file(&tmp).await;
    if let Some(orig) = zip_orig {
        let _ = tokio::fs::remove_file(&orig).await;
    }
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
    let downloaded = download_file(&app, &download_url, &file_type).await?;
    let (tmp, zip_orig) = match resolve_archive_download(downloaded) {
        Err(e) if e.starts_with("ZIP_MULTI_PAK:") => {
            if let Ok(mut v) = serde_json::from_str::<serde_json::Value>(&e["ZIP_MULTI_PAK:".len()..]) {
                v["modId"] = serde_json::json!(mod_id);
                v["modName"] = serde_json::json!(&mod_name);
                v["fileId"] = serde_json::json!(file_id);
                v["fileType"] = serde_json::json!(&file_type);
                v["modVersion"] = serde_json::json!(&mod_version);
                return Err(format!("ZIP_MULTI_PAK:{}", v));
            }
            return Err(e);
        }
        result => result?,
    };

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

        let _ = http_client()
            .post(format!("https://api.modworkshop.net/files/{}/register-download", file_id))
            .header("User-Agent", user_agent(&app))
            .send()
            .await;

        Ok::<(), String>(())
    }
    .await;

    let _ = tokio::fs::remove_file(&tmp).await;
    if let Some(orig) = zip_orig {
        let _ = tokio::fs::remove_file(&orig).await;
    }
    result
}

#[tauri::command]
pub async fn install_from_zip_entry(
    app: AppHandle,
    zip_path: String,
    entry_name: String,
    mod_id: i64,
    mod_name: String,
    file_id: i64,
    file_type: String,
    mod_version: String,
    game_path: String,
    folder_id: Option<String>,
) -> Result<(), String> {
    let zip = PathBuf::from(&zip_path);
    let ext = std::env::temp_dir().join(format!("pd3-mod-{}.pak", Uuid::new_v4()));

    // Derive a per-entry uid so each pak from the same ZIP file gets its own state slot.
    let entry_stem = std::path::Path::new(&entry_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&entry_name);
    let entry_filename = std::path::Path::new(&entry_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&entry_name)
        .to_string();
    let uid = format!("{}_{}", file_id, entry_stem);

    let result = async {
        extract_entry(&zip, &entry_name, &ext)?;
        let sha256 = compute_sha256(&ext).await?;
        let sp = get_state_path(&game_path);
        let saved = read_state(&sp);

        // Reuse existing uid by SHA256 so a reinstall moves the entry in-place rather than duplicating.
        let sha256_match = saved.mods.iter().find(|m| m.sha256.as_deref() == Some(sha256.as_str()));
        let uid = sha256_match.map(|m| m.uid.clone()).unwrap_or(uid);

        // Never inherit folderId from existing entries; zip paks must land where the caller specifies.
        let effective_folder_id = folder_id;

        install_mod_from_path(
            &game_path,
            &sp,
            InstalledMod {
                uid,
                id: mod_id,
                name: mod_name,
                version: mod_version,
                filename: entry_filename,
                enabled: true,
                installed_at: Utc::now().to_rfc3339(),
                file_id: Some(file_id),
                file_type: Some(file_type),
                sha256: Some(sha256),
                ..InstalledMod::default()
            },
            &ext,
            effective_folder_id,
        )?;

        let _ = http_client()
            .post(format!("https://api.modworkshop.net/files/{}/register-download", file_id))
            .header("User-Agent", user_agent(&app))
            .send()
            .await;

        Ok::<(), String>(())
    }
    .await;

    // Keep the zip alive for multi-entry installs; only remove the extracted temp here.
    let _ = tokio::fs::remove_file(&ext).await;
    result
}

#[tauri::command]
pub async fn delete_temp_file(path: String) {
    let _ = tokio::fs::remove_file(&path).await;
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
    let Some(game_path) = game_settings(&settings, "pd3").and_then(|gs| gs.game_path.clone()) else { return };
    let dir = mods_base(&game_path);
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
}

#[cfg(test)]
mod tests;

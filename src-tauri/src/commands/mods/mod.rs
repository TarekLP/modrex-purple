mod engine;
mod folders;
mod install;
mod naming;
mod paths;
mod reorder;
mod state;
mod types;
mod zip;

// Public API used by lib.rs, launchers/, and other modules
pub use self::engine::{backup_dir, engine_for_game, ModEngineConfig};
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
pub(crate) use self::reorder::{
    move_mod_to_folder_op, reorder_children_op, reorder_mods_in_folder_op,
};
pub(crate) use self::state::save_state;
pub(crate) use self::zip::{
    extract_dir_entry, extract_entry, mark_archive_files, resolve_archive_download,
};

// Re-exports needed only in test builds (suppressed in release to avoid unused-import warnings)
#[cfg(test)]
pub(crate) use self::naming::{apply_priority_prefix, make_uid};
#[cfg(test)]
pub(crate) use self::zip::{detect_archive, is_zip, list_pak_entries, safe_dest, ArchiveFormat};

use crate::commands::api::{api_get, http_client, user_agent};
use crate::commands::download::download_file;
use crate::commands::mod_index;
use crate::commands::settings::{game_settings, read_settings};
use chrono::Utc;
use std::collections::{HashMap, HashSet};
use std::path::PathBuf;
use tauri::AppHandle;
use uuid::Uuid;

// ── Helpers ───────────────────────────────────────────────────────────────────

fn first_file_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut entries: Vec<_> = std::fs::read_dir(dir).ok()?.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in entries {
        let ft = entry.file_type().ok()?;
        if ft.is_file() {
            return Some(entry.path());
        }
        if ft.is_dir() {
            if let Some(p) = first_file_in_dir(&entry.path()) {
                return Some(p);
            }
        }
    }
    None
}

fn hashable_file_for_mod_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let main_xml = dir.join("main.xml");
    if main_xml.exists() {
        return Some(main_xml);
    }
    first_file_in_dir(dir)
}

/// Reads the value of an XML attribute (`name="value"` or `name='value'`) from a single
/// element's text, matching the attribute name case-insensitively. Lightweight scanner —
/// avoids pulling in a full XML parser for the one element we care about.
fn xml_attr<'a>(tag: &'a str, name: &str) -> Option<&'a str> {
    let lower = tag.to_ascii_lowercase();
    let needle = format!("{}=", name.to_ascii_lowercase());
    let mut from = 0;
    while let Some(rel) = lower[from..].find(&needle) {
        let at = from + rel;
        // Require a boundary before the name so `id=` doesn't match inside `someid=`.
        let boundary = at == 0 || !lower.as_bytes()[at - 1].is_ascii_alphanumeric();
        let eq = at + needle.len();
        let bytes = tag.as_bytes();
        if boundary && eq < bytes.len() && (bytes[eq] == b'"' || bytes[eq] == b'\'') {
            let quote = bytes[eq] as char;
            let start = eq + 1;
            if let Some(end) = tag[start..].find(quote) {
                return Some(&tag[start..start + end]);
            }
        }
        from = eq;
    }
    None
}

/// Returns the modworkshop mod id (and declared version, if present) that a BeardLib mod
/// embeds in `dir/main.xml` via `<AssetUpdates … provider="modworkshop" … id="N" …>`.
/// The provider defaults to modworkshop when omitted; any other provider is ignored.
/// This identity survives version drift, so it works even for very old installs.
fn embedded_modworkshop_id(dir: &std::path::Path) -> Option<(i64, Option<String>)> {
    let xml = std::fs::read_to_string(dir.join("main.xml")).ok()?;
    let lower = xml.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<assetupdates") {
        let start = from + rel;
        let Some(close) = xml[start..].find('>') else {
            break;
        };
        let tag = &xml[start..start + close];
        from = start + close + 1;

        if let Some(provider) = xml_attr(tag, "provider") {
            if !provider.eq_ignore_ascii_case("modworkshop") {
                continue;
            }
        }
        let Some(id) = xml_attr(tag, "id").and_then(|v| v.trim().parse::<i64>().ok()) else {
            continue;
        };
        if id <= 0 {
            continue;
        }
        return Some((id, xml_attr(tag, "version").map(str::to_string)));
    }
    None
}

// ── get_installed identification pipeline ──────────────────────────────────────

/// Upgrades negative-id (unidentified) entries whose SHA256 is now present in the index —
/// e.g. the mod was added to the index after it was first installed locally.
/// Returns true if any entries were upgraded (caller must persist the change).
fn upgrade_negative_ids_by_sha(
    app: &AppHandle,
    mods: &mut [InstalledMod],
    game_name: &str,
) -> bool {
    let mut any = false;
    for m in mods {
        if m.id >= 0 {
            continue;
        }
        let Some(ref sha) = m.sha256 else { continue };
        let Some(hit) = mod_index::lookup_sha256(app, sha, game_name) else {
            continue;
        };
        m.id = hit.mod_remote_id;
        m.name = hit.mod_name;
        m.version = hit.version;
        m.file_id = Some(hit.file_remote_id);
        any = true;
    }
    any
}

/// Re-groups negative-id entries whose name ends in " <number>" (a file-id suffix left by
/// fallback identification): when the base name matches a positively-identified tracked mod,
/// adopt that mod's id so all pak files from one mod group together in the UI.
fn regroup_negative_ids_by_name_suffix(mods: &mut [InstalledMod]) {
    let name_to_id: HashMap<String, i64> = mods
        .iter()
        .filter(|m| m.id > 0)
        .map(|m| (m.name.to_lowercase(), m.id))
        .collect();
    for m in mods.iter_mut() {
        if m.id >= 0 {
            continue;
        }
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

/// Creates app folders for every directory segment in the untracked paths that does not yet
/// exist, pushing them onto `state.folders`. Returns the folder-path-to-id map used to place
/// reconciled and newly identified mods.
fn ensure_untracked_folders(
    state: &mut ModsState,
    untracked: &[(String, bool, Option<String>)],
) -> HashMap<String, String> {
    let mut folder_path_to_id: HashMap<String, String> = state
        .folders
        .iter()
        .filter_map(|f| get_folder_path(&state.folders, Some(&f.id)).map(|p| (p, f.id.clone())))
        .collect();

    let mut max_p = state
        .folders
        .iter()
        .map(|f| f.priority)
        .max()
        .unwrap_or(0)
        .max(
            state
                .mods
                .iter()
                .filter(|m| m.folder_id.is_none())
                .filter_map(|m| m.priority)
                .max()
                .unwrap_or(0),
        );

    for (rel_path, _, _) in untracked {
        let parts: Vec<&str> = rel_path.split('/').collect();
        if parts.len() <= 1 {
            continue;
        }
        let segs = &parts[..parts.len() - 1];
        let mut prefix = String::new();
        for (i, &seg) in segs.iter().enumerate() {
            prefix = if i == 0 {
                seg.to_string()
            } else {
                format!("{}/{}", prefix, seg)
            };
            if folder_path_to_id.contains_key(&prefix) {
                continue;
            }
            let parent_path = if i == 0 {
                None
            } else {
                Some(segs[..i].join("/"))
            };
            let parent_id = parent_path
                .as_deref()
                .and_then(|p| folder_path_to_id.get(p))
                .cloned();
            max_p += 1;
            let new_folder = ModFolder {
                id: Uuid::new_v4().to_string(),
                display_name: strip_priority_prefix(seg)
                    .replace('_', " ")
                    .trim()
                    .to_string(),
                disk_name: seg.to_string(),
                priority: max_p,
                parent_id,
            };
            folder_path_to_id.insert(prefix.clone(), new_folder.id.clone());
            state.folders.push(new_folder);
        }
    }
    folder_path_to_id
}

/// Hashes each untracked entry (the pak file, or a mod directory's marker/representative file)
/// so it can be matched against the index. The returned vec is index-aligned with `untracked`.
async fn hash_untracked(
    game_path: &str,
    untracked: &[(String, bool, Option<String>)],
    cfg: &ModEngineConfig,
) -> Vec<Option<String>> {
    let sha_futures: Vec<_> = untracked
        .iter()
        .map(|(rel_path, enabled, location_tag)| {
            let game_path = game_path.to_string();
            let rel_path = rel_path.clone();
            let enabled = *enabled;
            let entry_target = cfg.target_for(location_tag.as_deref());
            async move {
                let path = match &entry_target.unit {
                    engine::ModUnit::File { .. } => {
                        if enabled {
                            mods_base(&game_path, entry_target).join(&rel_path)
                        } else {
                            disabled_base(&game_path, entry_target).join(format!(
                                "{}{}",
                                rel_path,
                                entry_target.disabled_suffix()
                            ))
                        }
                    }
                    engine::ModUnit::Directory { entry_markers, .. } => {
                        let mod_dir = if enabled {
                            mods_base(&game_path, entry_target).join(&rel_path)
                        } else {
                            disabled_base(&game_path, entry_target).join(&rel_path)
                        };
                        if entry_markers.is_empty() {
                            let Some(p) = hashable_file_for_mod_dir(&mod_dir) else {
                                return None;
                            };
                            return compute_sha256(&p).await.ok();
                        }
                        entry_markers
                            .iter()
                            .map(|m| mod_dir.join(m))
                            .find(|p| p.exists())
                            .unwrap_or_else(|| mod_dir.join(entry_markers[0]))
                    }
                };
                compute_sha256(&path).await.ok()
            }
        })
        .collect();
    futures::future::join_all(sha_futures).await
}

/// Reconciles untracked entries that hash-match an existing tracked mod (Phase 1, mutating
/// `state.mods` in place), then identifies the rest via the index with name/number/hash
/// fallbacks (Phase 2). Returns the full mod list: tracked entries plus newly identified ones.
fn identify_untracked(
    state: &mut ModsState,
    untracked: &[(String, bool, Option<String>)],
    sha256s: &[Option<String>],
    folder_path_to_id: &HashMap<String, String>,
    cfg: &ModEngineConfig,
    game_path: &str,
    index: Option<&rusqlite::Connection>,
) -> Vec<InstalledMod> {
    let sha256_to_uid: HashMap<String, String> = state
        .mods
        .iter()
        .filter_map(|m| m.sha256.as_ref().map(|h| (h.clone(), m.uid.clone())))
        .collect();

    let mut reconcile_ops: Vec<(String, String, bool, Option<String>)> = Vec::new();
    for ((rel_path, enabled, _), sha256) in untracked.iter().zip(sha256s.iter()) {
        let Some(sha) = sha256 else { continue };
        let Some(uid) = sha256_to_uid.get(sha.as_str()) else {
            continue;
        };
        let parts: Vec<&str> = rel_path.split('/').collect();
        let filename = parts.last().unwrap_or(&"").to_string();
        let folder_path = if parts.len() > 1 {
            Some(parts[..parts.len() - 1].join("/"))
        } else {
            None
        };
        let folder_id = folder_path
            .as_deref()
            .and_then(|fp| folder_path_to_id.get(fp).cloned());
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

    let now = Utc::now().to_rfc3339();
    let mut by_uid: HashMap<String, InstalledMod> = state
        .mods
        .iter()
        .map(|m| (m.uid.clone(), m.clone()))
        .collect();

    for ((rel_path, enabled, location_tag), sha256) in untracked.iter().zip(sha256s.iter()) {
        if sha256
            .as_deref()
            .is_some_and(|s| sha256_to_uid.contains_key(s))
        {
            continue;
        }

        let parts: Vec<&str> = rel_path.split('/').collect();
        let filename = parts.last().unwrap_or(&"").to_string();
        let folder_path = if parts.len() > 1 {
            Some(parts[..parts.len() - 1].join("/"))
        } else {
            None
        };
        let folder_id = folder_path
            .as_deref()
            .and_then(|fp| folder_path_to_id.get(fp).cloned());

        let entry_target = cfg.target_for(location_tag.as_deref());
        let stem = match &entry_target.unit {
            engine::ModUnit::File { .. } => filename
                .strip_suffix(".pak")
                .or_else(|| filename.strip_suffix(".pak.disabled"))
                .unwrap_or(&filename),
            engine::ModUnit::Directory { .. } => &filename[..],
        };
        let stripped = strip_priority_prefix(stem);

        let stripped_name = stripped.replace('_', " ");
        let stripped_base = stripped
            .rfind('_')
            .filter(|&p| stripped[p + 1..].chars().all(|c| c.is_ascii_digit()))
            .map(|p| stripped[..p].replace('_', " "));

        let gname = cfg.index_game_name;

        // BeardLib mods declare their modworkshop id in main.xml; this identity survives
        // version drift, so prefer it over the fuzzy name fallback (but below an exact hash
        // match, which also pins the precise file). Installed version comes from the mod's
        // own declaration; the real display name is enriched from the index when present.
        let embedded = if entry_target.is_directory_unit() {
            let mod_dir = if *enabled {
                mods_base(game_path, entry_target).join(rel_path)
            } else {
                disabled_base(game_path, entry_target).join(rel_path)
            };
            embedded_modworkshop_id(&mod_dir)
        } else {
            None
        };
        let resolve_embedded = |(mod_id, declared): (i64, Option<String>)| {
            let hit = index.and_then(|c| mod_index::query_mod_by_id(c, mod_id, gname));
            let name = hit
                .as_ref()
                .map(|h| h.mod_name.clone())
                .unwrap_or_else(|| stripped_name.trim().to_string());
            // Installed version = the mod's own declaration, so a drifted-old install still
            // reads as outdated against the current version. When it declares none, fall back
            // to the index's current version so it reads up-to-date instead of nagging an
            // endless false update (rather than the never-matching "unknown").
            let version = declared
                .or_else(|| hit.map(|h| h.version))
                .unwrap_or_else(|| "unknown".to_string());
            (mod_id, name, None, version)
        };

        let by_name = || {
            index
                .and_then(|c| mod_index::query_by_name(c, &stripped_name, gname))
                .or_else(|| {
                    stripped_base
                        .as_deref()
                        .and_then(|b| index.and_then(|c| mod_index::query_by_name(c, b, gname)))
                })
                .map(|remote_id| {
                    (
                        remote_id,
                        stripped_name.trim().to_string(),
                        None,
                        "unknown".to_string(),
                    )
                })
                .or_else(|| {
                    stripped
                        .parse::<i64>()
                        .ok()
                        .map(|num_id| (num_id, stripped.to_string(), None, "unknown".to_string()))
                })
                .unwrap_or_else(|| {
                    (
                        hash_filename(&filename),
                        stripped_name.trim().to_string(),
                        None,
                        "unknown".to_string(),
                    )
                })
        };

        let (id, name, file_id, version) = match sha256
            .as_deref()
            .and_then(|sha| index.and_then(|c| mod_index::query_sha256(c, sha, gname)))
        {
            Some(hit) => (
                hit.mod_remote_id,
                hit.mod_name,
                Some(hit.file_remote_id),
                hit.version,
            ),
            None => match embedded {
                Some(e) => resolve_embedded(e),
                None => by_name(),
            },
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
            location: location_tag.clone(),
            ..InstalledMod::default()
        });
    }

    by_uid.into_values().collect()
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn get_installed(
    app: AppHandle,
    game_id: Option<String>,
) -> Result<InstalledResponse, String> {
    let game_id = game_id.as_deref().unwrap_or("pd3");
    let cfg = engine_for_game(game_id);
    let settings = read_settings(&app);
    let Some(game_path) = game_settings(&settings, game_id).and_then(|gs| gs.game_path.clone())
    else {
        return Ok(InstalledResponse {
            mods: vec![],
            folders: vec![],
            mods_hidden: false,
        });
    };

    let state_path = get_state_path(&game_path, cfg);
    let mods_hidden = backup_dir(&game_path, cfg.primary()).exists();

    let mut state = reconcile_state(&game_path, &state_path, cfg);
    let any_upgraded = upgrade_negative_ids_by_sha(&app, &mut state.mods, cfg.index_game_name);
    regroup_negative_ids_by_name_suffix(&mut state.mods);

    if mods_hidden {
        if any_upgraded {
            save_state(&state_path, &state);
        }
        return Ok(InstalledResponse {
            mods: state.mods,
            folders: state.folders,
            mods_hidden: true,
        });
    }

    let known: HashSet<String> = state
        .mods
        .iter()
        .map(|m| {
            let rel = get_folder_path(&state.folders, m.folder_id.as_deref());
            let rel_path = match rel {
                Some(r) => format!("{}/{}", r, m.filename),
                None => m.filename.clone(),
            };
            format!("{}:{}", m.location.as_deref().unwrap_or(""), rel_path)
        })
        .collect();

    let untracked = find_untracked_paks(&game_path, &known, cfg).await;
    if untracked.is_empty() {
        let (mods, any_checked) = mark_archive_files(&game_path, &state.folders, state.mods, cfg);
        if any_checked || any_upgraded {
            save_state(
                &state_path,
                &ModsState {
                    folders: state.folders.clone(),
                    mods: mods.clone(),
                },
            );
        }
        return Ok(InstalledResponse {
            mods,
            folders: state.folders,
            mods_hidden: false,
        });
    }

    let folder_path_to_id = ensure_untracked_folders(&mut state, &untracked);
    let sha256s = hash_untracked(&game_path, &untracked, cfg).await;
    let index = mod_index::open_index(&app);
    let mods = identify_untracked(
        &mut state,
        &untracked,
        &sha256s,
        &folder_path_to_id,
        cfg,
        &game_path,
        index.as_ref(),
    );

    let folders = state.folders;
    let (mods, _) = mark_archive_files(&game_path, &folders, mods, cfg);
    save_state(
        &state_path,
        &ModsState {
            folders: folders.clone(),
            mods: mods.clone(),
        },
    );
    Ok(InstalledResponse {
        mods,
        folders,
        mods_hidden: false,
    })
}

#[tauri::command]
pub async fn install_mod(
    app: AppHandle,
    mod_id: u32,
    game_path: String,
    folder_id: Option<String>,
    game_id: Option<String>,
) -> Result<(), String> {
    let mod_val = api_get(&app, &format!("/mods/{}", mod_id), vec![]).await?;

    let mod_name = mod_val["name"].as_str().unwrap_or("").to_string();
    let mod_version = mod_val["version"].as_str().unwrap_or("").to_string();
    let remote_id = mod_val["id"].as_i64().unwrap_or(0);

    let (file_id, download_url, file_type) = if !mod_val["download"].is_null() {
        let dl = &mod_val["download"];
        (
            dl["id"].as_i64().unwrap_or(0),
            dl["download_url"]
                .as_str()
                .ok_or("no download_url")?
                .to_string(),
            dl["type"].as_str().unwrap_or("pak").to_string(),
        )
    } else if mod_val["has_download"].as_bool().unwrap_or(false) {
        let f = api_get(&app, &format!("/mods/{}/files/latest", mod_id), vec![]).await?;
        (
            f["id"].as_i64().unwrap_or(0),
            f["download_url"]
                .as_str()
                .ok_or("no download_url")?
                .to_string(),
            f["type"].as_str().unwrap_or("pak").to_string(),
        )
    } else {
        return Err("Mod has no download".to_string());
    };

    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    let downloaded = download_file(&app, &download_url, &file_type).await?;
    let (tmp, zip_orig, location_tag) = match resolve_archive_download(downloaded, cfg) {
        Err(e) if e.starts_with("ZIP_MULTI_PAK:") => {
            if let Ok(mut v) =
                serde_json::from_str::<serde_json::Value>(&e["ZIP_MULTI_PAK:".len()..])
            {
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
    let target = cfg.target_for(location_tag.as_deref());

    let result = async {
        let sha256 = match &target.unit {
            engine::ModUnit::File { .. } => compute_sha256(&tmp).await?,
            engine::ModUnit::Directory { entry_markers, .. } => {
                let hash_path = if entry_markers.is_empty() {
                    hashable_file_for_mod_dir(&tmp)
                        .ok_or_else(|| "mod directory is empty".to_string())?
                } else {
                    entry_markers
                        .iter()
                        .map(|m| tmp.join(m))
                        .find(|p| p.exists())
                        .unwrap_or_else(|| tmp.join(entry_markers[0]))
                };
                compute_sha256(&hash_path).await?
            }
        };
        let uid = file_id.to_string();
        let sp = get_state_path(&game_path, cfg);
        let saved = read_state(&sp);
        let existing_entry = saved.mods.iter().find(|m| m.uid == uid).or_else(|| {
            if remote_id <= 0 {
                return None;
            }
            let same: Vec<_> = saved.mods.iter().filter(|m| m.id == remote_id).collect();
            // Only inherit for single-entry mods; multi-pak entries span different folders.
            if same.len() == 1 {
                same.into_iter().next()
            } else {
                None
            }
        });
        // Don't inherit folder when same-id already has multiple files; each pak is placed deliberately.
        let effective_folder_id = folder_id.or_else(|| {
            if remote_id > 0 && saved.mods.iter().filter(|m| m.id == remote_id).count() > 1 {
                return None;
            }
            existing_entry.and_then(|e| e.folder_id.clone())
        });
        let filename = saved
            .mods
            .iter()
            .find(|m| m.uid == uid)
            .map(|m| m.filename.clone())
            .unwrap_or_else(|| match &target.unit {
                engine::ModUnit::File { .. } => pak_filename(&mod_name),
                engine::ModUnit::Directory { .. } => tmp
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&mod_name)
                    .to_string(),
            });

        // If the mod had a single previously-installed entry under a different uid
        // (i.e. an older version with a different file_id), remove it first so
        // install_mod_from_path doesn't produce two entries for the same mod.
        if saved.mods.iter().all(|m| m.uid != uid) && remote_id > 0 {
            let same: Vec<_> = saved.mods.iter().filter(|m| m.id == remote_id).collect();
            if same.len() == 1 {
                uninstall_mod_op(&game_path, &sp, &same[0].uid.clone(), cfg);
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
            cfg,
            target,
        )?;

        let _ = http_client()
            .post(format!(
                "https://api.modworkshop.net/files/{}/register-download",
                file_id
            ))
            .header("User-Agent", user_agent(&app))
            .send()
            .await;

        Ok::<(), String>(())
    }
    .await;

    match &target.unit {
        engine::ModUnit::File { .. } => {
            let _ = tokio::fs::remove_file(&tmp).await;
        }
        engine::ModUnit::Directory { .. } => {
            if let Some(parent) = tmp.parent() {
                let _ = tokio::fs::remove_dir_all(parent).await;
            }
        }
    }
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
    game_id: Option<String>,
) -> Result<(), String> {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    let downloaded = download_file(&app, &download_url, &file_type).await?;
    let (tmp, zip_orig, location_tag) = match resolve_archive_download(downloaded, cfg) {
        Err(e) if e.starts_with("ZIP_MULTI_PAK:") => {
            if let Ok(mut v) =
                serde_json::from_str::<serde_json::Value>(&e["ZIP_MULTI_PAK:".len()..])
            {
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
    let target = cfg.target_for(location_tag.as_deref());

    let result = async {
        let sha256 = match &target.unit {
            engine::ModUnit::File { .. } => compute_sha256(&tmp).await?,
            engine::ModUnit::Directory { entry_markers, .. } => {
                let hash_path = if entry_markers.is_empty() {
                    hashable_file_for_mod_dir(&tmp)
                        .ok_or_else(|| "mod directory is empty".to_string())?
                } else {
                    entry_markers
                        .iter()
                        .map(|m| tmp.join(m))
                        .find(|p| p.exists())
                        .unwrap_or_else(|| tmp.join(entry_markers[0]))
                };
                compute_sha256(&hash_path).await?
            }
        };
        let uid = file_id.to_string();
        let sp = get_state_path(&game_path, cfg);
        let saved = read_state(&sp);
        let existing_entry = saved.mods.iter().find(|m| m.uid == uid).or_else(|| {
            if mod_id <= 0 {
                return None;
            }
            let same: Vec<_> = saved.mods.iter().filter(|m| m.id == mod_id).collect();
            if same.len() == 1 {
                same.into_iter().next()
            } else {
                None
            }
        });
        // Never inherit folder when this mod_id already has multiple installed files.
        let effective_folder_id =
            if mod_id > 0 && saved.mods.iter().filter(|m| m.id == mod_id).count() > 1 {
                None
            } else {
                existing_entry.and_then(|e| e.folder_id.clone())
            };
        let filename = saved
            .mods
            .iter()
            .find(|m| m.uid == uid)
            .map(|m| m.filename.clone())
            .unwrap_or_else(|| match &target.unit {
                engine::ModUnit::File { .. } => {
                    if file_type == "main" {
                        pak_filename(&mod_name)
                    } else {
                        pak_filename(&format!("{}_{}", mod_name, file_id))
                    }
                }
                engine::ModUnit::Directory { .. } => tmp
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or(&mod_name)
                    .to_string(),
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
            cfg,
            target,
        )?;

        let _ = http_client()
            .post(format!(
                "https://api.modworkshop.net/files/{}/register-download",
                file_id
            ))
            .header("User-Agent", user_agent(&app))
            .send()
            .await;

        Ok::<(), String>(())
    }
    .await;

    match &target.unit {
        engine::ModUnit::File { .. } => {
            let _ = tokio::fs::remove_file(&tmp).await;
        }
        engine::ModUnit::Directory { .. } => {
            if let Some(parent) = tmp.parent() {
                let _ = tokio::fs::remove_dir_all(parent).await;
            }
        }
    }
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
    game_id: Option<String>,
    location_tag: Option<String>,
) -> Result<(), String> {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    let target = cfg.target_for(location_tag.as_deref());
    let zip = PathBuf::from(&zip_path);

    // entry_stem / entry_filename are the last path component of entry_name.
    let entry_stem = std::path::Path::new(&entry_name)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(&entry_name);
    let entry_filename = std::path::Path::new(&entry_name)
        .file_name()
        .and_then(|s| s.to_str())
        .unwrap_or(&entry_name)
        .to_string();

    // For File mods: ext is a temp .pak file.
    // For Directory mods: ext is {tmp_parent}/{dir_name} (two-level, consistent with resolve_archive_download).
    let (ext, tmp_parent) = match &target.unit {
        engine::ModUnit::File { .. } => {
            let p = std::env::temp_dir().join(format!("pd3-mod-{}.pak", Uuid::new_v4()));
            (p, None)
        }
        engine::ModUnit::Directory { .. } => {
            let parent = std::env::temp_dir().join(format!("modrex-mod-{}", Uuid::new_v4()));
            let p = parent.join(&entry_filename);
            (p, Some(parent))
        }
    };

    let uid = format!("{}_{}", file_id, entry_stem);

    let result = async {
        match &target.unit {
            engine::ModUnit::File { .. } => extract_entry(&zip, &entry_name, &ext)?,
            engine::ModUnit::Directory { .. } => extract_dir_entry(&zip, &entry_name, &ext)?,
        }
        let sha256 = match &target.unit {
            engine::ModUnit::File { .. } => compute_sha256(&ext).await?,
            engine::ModUnit::Directory { entry_markers, .. } => {
                let hash_path = if entry_markers.is_empty() {
                    hashable_file_for_mod_dir(&ext)
                        .ok_or_else(|| "mod directory is empty".to_string())?
                } else {
                    entry_markers
                        .iter()
                        .map(|m| ext.join(m))
                        .find(|p| p.exists())
                        .unwrap_or_else(|| ext.join(entry_markers[0]))
                };
                compute_sha256(&hash_path).await?
            }
        };
        let sp = get_state_path(&game_path, cfg);
        let saved = read_state(&sp);

        // Reuse existing uid by SHA256 so a reinstall moves the entry in-place rather than duplicating.
        let sha256_match = saved
            .mods
            .iter()
            .find(|m| m.sha256.as_deref() == Some(sha256.as_str()));
        let uid = sha256_match.map(|m| m.uid.clone()).unwrap_or(uid);

        // Never inherit folderId from existing entries; callers always supply the target folder.
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
            cfg,
            target,
        )?;

        let _ = http_client()
            .post(format!(
                "https://api.modworkshop.net/files/{}/register-download",
                file_id
            ))
            .header("User-Agent", user_agent(&app))
            .send()
            .await;

        Ok::<(), String>(())
    }
    .await;

    // Keep the zip alive for multi-entry installs; only remove the extracted temp here.
    if let Some(parent) = tmp_parent {
        let _ = tokio::fs::remove_dir_all(parent).await;
    } else {
        let _ = tokio::fs::remove_file(&ext).await;
    }
    result
}

#[tauri::command]
pub async fn delete_temp_file(path: String) {
    let _ = tokio::fs::remove_file(&path).await;
}

#[tauri::command]
pub fn uninstall_mod(game_path: String, uid: String, game_id: Option<String>) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    uninstall_mod_op(&game_path, &get_state_path(&game_path, cfg), &uid, cfg);
}

#[tauri::command]
pub fn enable_mod(game_path: String, uid: String, game_id: Option<String>) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    enable_mod_op(&game_path, &get_state_path(&game_path, cfg), &uid, cfg);
}

#[tauri::command]
pub fn disable_mod(game_path: String, uid: String, game_id: Option<String>) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    disable_mod_op(&game_path, &get_state_path(&game_path, cfg), &uid, cfg);
}

#[tauri::command]
pub fn reorder_in_folder(
    game_path: String,
    folder_id: Option<String>,
    ordered_uids: Vec<String>,
    game_id: Option<String>,
) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    reorder_mods_in_folder_op(
        &game_path,
        &get_state_path(&game_path, cfg),
        folder_id.as_deref(),
        &ordered_uids,
        cfg,
    );
}

#[tauri::command]
pub fn move_to_folder(
    game_path: String,
    uid: String,
    target_folder_id: Option<String>,
    target_position: usize,
    game_id: Option<String>,
) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    move_mod_to_folder_op(
        &game_path,
        &get_state_path(&game_path, cfg),
        &uid,
        target_folder_id,
        target_position,
        cfg,
    );
}

#[tauri::command]
pub fn reorder_children(
    game_path: String,
    parent_id: Option<String>,
    items: Vec<TopLevelItem>,
    game_id: Option<String>,
) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    reorder_children_op(
        &game_path,
        &get_state_path(&game_path, cfg),
        parent_id.as_deref(),
        &items,
        cfg,
    );
}

#[tauri::command]
pub fn move_folder(
    game_path: String,
    folder_id: String,
    target_parent_id: Option<String>,
    game_id: Option<String>,
) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    move_folder_op(
        &game_path,
        &get_state_path(&game_path, cfg),
        &folder_id,
        target_parent_id,
        cfg,
    );
}

#[tauri::command]
pub fn create_folder(
    game_path: String,
    display_name: String,
    parent_id: Option<String>,
    game_id: Option<String>,
) -> Result<ModFolder, String> {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    create_folder_op(
        &game_path,
        &get_state_path(&game_path, cfg),
        &display_name,
        parent_id,
        cfg,
    )
}

#[tauri::command]
pub fn rename_folder(
    game_path: String,
    folder_id: String,
    display_name: String,
    game_id: Option<String>,
) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    rename_folder_op(
        &game_path,
        &get_state_path(&game_path, cfg),
        &folder_id,
        &display_name,
        cfg,
    );
}

#[tauri::command]
pub fn delete_folder(game_path: String, folder_id: String, game_id: Option<String>) {
    let cfg = engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    delete_folder_op(
        &game_path,
        &get_state_path(&game_path, cfg),
        &folder_id,
        cfg,
    );
}

#[tauri::command]
pub fn open_mods_folder(app: AppHandle, game_id: Option<String>) {
    let gid = game_id.as_deref().unwrap_or("pd3");
    let settings = read_settings(&app);
    let Some(game_path) = game_settings(&settings, gid).and_then(|gs| gs.game_path.clone()) else {
        return;
    };
    let cfg = engine_for_game(gid);
    let dir = mods_base(&game_path, cfg.primary());
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(&dir).spawn();
    #[cfg(target_os = "linux")]
    let _ = std::process::Command::new("xdg-open").arg(&dir).spawn();
}

#[cfg(test)]
mod tests;

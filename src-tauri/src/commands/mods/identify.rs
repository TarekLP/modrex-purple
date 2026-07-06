//! Mod identification for `get_installed`: maps untracked / negative-id on-disk mods back to
//! their modworkshop identity via SHA256 index lookup, embedded BeardLib ids, and name matching.
//! Split out of `mod.rs`; the `#[tauri::command]` surface there orchestrates these helpers.

use super::crimeboss_settings;
use super::engine;
use super::*;
use crate::commands::mod_index;
use chrono::Utc;
use std::collections::HashMap;
use tauri::AppHandle;
use uuid::Uuid;

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

/// Recursively finds a `.pak` file inside `dir`, preferring it over `first_file_in_dir`'s
/// alphabetical-first pick. Crime Boss's `Mods/<name>/` can have a sibling `Config/` folder
/// (custom gameplay tags) that sorts before `Content/` — without this, identification would
/// hash an `.ini` instead of the `.pak` modrex-index actually records SHA256 for.
fn first_pak_file_in_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut entries: Vec<_> = std::fs::read_dir(dir).ok()?.flatten().collect();
    entries.sort_by_key(|e| e.file_name());
    for entry in &entries {
        if entry.file_type().ok()?.is_file()
            && entry.file_name().to_string_lossy().ends_with(".pak")
        {
            return Some(entry.path());
        }
    }
    for entry in &entries {
        if entry.file_type().ok()?.is_dir() {
            if let Some(p) = first_pak_file_in_dir(&entry.path()) {
                return Some(p);
            }
        }
    }
    None
}

pub(crate) fn hashable_file_for_mod_dir(dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let main_xml = dir.join("main.xml");
    if main_xml.exists() {
        return Some(main_xml);
    }
    first_pak_file_in_dir(dir).or_else(|| first_file_in_dir(dir))
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

/// Scans `xml` for elements whose name starts with `tag_name` and returns the first one
/// whose provider is modworkshop (the default when omitted) and whose `id_attr` parses as
/// a positive id, along with the element's own version attribute if present.
fn embedded_id_from_tag(xml: &str, tag_name: &str, id_attr: &str) -> Option<(i64, Option<String>)> {
    let lower = xml.to_ascii_lowercase();
    let needle = format!("<{}", tag_name);
    let mut from = 0;
    while let Some(rel) = lower[from..].find(&needle) {
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
        let Some(id) = xml_attr(tag, id_attr).and_then(|v| v.trim().parse::<i64>().ok()) else {
            continue;
        };
        if id <= 0 {
            continue;
        }
        return Some((id, xml_attr(tag, "version").map(str::to_string)));
    }
    None
}

/// The version attribute of supermod.xml's root mod element — RAID-SuperBLT mods declare
/// their version there, not on the update element.
fn supermod_root_version(xml: &str) -> Option<String> {
    let lower = xml.to_ascii_lowercase();
    let mut from = 0;
    while let Some(rel) = lower[from..].find("<mod") {
        let start = from + rel;
        from = start + 4;
        if !xml[start + 4..].starts_with(|c: char| c.is_whitespace()) {
            continue;
        }
        let close = xml[start..].find('>')?;
        return xml_attr(&xml[start..start + close], "version").map(str::to_string);
    }
    None
}

/// Returns the modworkshop mod id (and declared version, if present) a mod embeds in its
/// marker file. One format per BLT family, all verified against real downloads: BeardLib's
/// main.xml (AssetUpdates element, id + version attributes), RAID-SuperBLT's supermod.xml
/// (update element with an identifier attribute; version declared on the root mod element),
/// and legacy RaidBLT's mod.xml (auto_updates element, id + version attributes). The
/// provider defaults to modworkshop when omitted; any other provider is ignored. This
/// identity survives version drift, so it works even for very old installs.
pub(crate) fn embedded_modworkshop_id(dir: &std::path::Path) -> Option<(i64, Option<String>)> {
    if let Ok(xml) = std::fs::read_to_string(dir.join("main.xml")) {
        if let Some(hit) = embedded_id_from_tag(&xml, "assetupdates", "id") {
            return Some(hit);
        }
    }
    if let Ok(xml) = std::fs::read_to_string(dir.join("supermod.xml")) {
        if let Some((id, version)) = embedded_id_from_tag(&xml, "update", "identifier") {
            return Some((id, version.or_else(|| supermod_root_version(&xml))));
        }
    }
    if let Ok(xml) = std::fs::read_to_string(dir.join("mod.xml")) {
        if let Some(hit) = embedded_id_from_tag(&xml, "auto_updates", "id") {
            return Some(hit);
        }
    }
    None
}

// ── get_installed identification pipeline ──────────────────────────────────────

/// Upgrades negative-id (unidentified) entries whose SHA256 is now present in the index —
/// e.g. the mod was added to the index after it was first installed locally.
/// Returns true if any entries were upgraded (caller must persist the change).
/// Retries identification for every still-unidentified (negative-id) tracked mod on each
/// refresh — not just at first ambient discovery. SHA256 is tried first (exact, pins the
/// file); when a mod's modworkshop file has been updated since install (version drift), the
/// installed bytes no longer match anything in the index and SHA256 will never hit again, so
/// name is the only identity left. Without this second pass, a mod that missed both checks
/// once (e.g. because the local index was still stale at that exact moment) stays "Unknown"
/// forever — the user would have to wipe state and force a fresh discovery pass to fix it,
/// defeating the app's promise that nothing needs manual intervention.
pub(crate) fn upgrade_negative_ids(
    app: &AppHandle,
    mods: &mut [InstalledMod],
    game_name: &str,
) -> bool {
    let mut any = false;
    for m in mods {
        if m.id >= 0 {
            continue;
        }
        if let Some(hit) = m
            .sha256
            .as_deref()
            .and_then(|sha| mod_index::lookup_sha256(app, sha, game_name))
        {
            m.id = hit.mod_remote_id;
            m.name = hit.mod_name;
            m.version = hit.version;
            m.file_id = Some(hit.file_remote_id);
            any = true;
            continue;
        }
        if let Some(remote_id) = mod_index::lookup_by_name(app, &m.name, game_name) {
            m.id = remote_id;
            // The SHA256 check above just failed against the index's current file for this
            // mod, so unlike the embedded-id "no declared version" fallback (which has zero
            // signal and deliberately reads as up-to-date to avoid an endless false nag),
            // here we know for a fact the installed bytes are stale. "outdated" is never a
            // real modworkshop version string, so it reads as different from whatever the
            // current one turns out to be — surfacing the update instead of hiding it behind
            // the "unknown version" suppression in `useModData`.
            m.version = "outdated".to_string();
            any = true;
        }
    }
    any
}

/// Re-groups negative-id entries whose name ends in " <number>" (a file-id suffix left by
/// fallback identification): when the base name matches a positively-identified tracked mod,
/// adopt that mod's id so all pak files from one mod group together in the UI.
pub(crate) fn regroup_negative_ids_by_name_suffix(mods: &mut [InstalledMod]) {
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

/// Crime Boss mods can be toggled from the game's own Options > Mods screen, which writes
/// straight to `Saved/ModSettings/<id>.json` — Modrex's tracked `enabled` flag (driven by which
/// folder a mod's files happen to sit in) has no way to learn about that on its own. Re-reads
/// the real value for every tracked mod and corrects the flag where it disagrees. Returns `true`
/// if anything changed (callers fold that into their existing save_state decision).
pub(crate) fn resync_crimeboss_enabled_flags(
    game_path: &str,
    cfg: &ModEngineConfig,
    folders: &[ModFolder],
    mods: &mut [InstalledMod],
    launcher: Option<&str>,
) -> bool {
    let mut changed = false;
    for m in mods.iter_mut() {
        if is_host_pack_location(m.location.as_deref()) {
            continue;
        }
        let target = cfg.target_for(m.location.as_deref());
        let rel = get_folder_path(folders, m.folder_id.as_deref());
        // Don't trust `m.enabled` to pick which location holds the file: it's exactly the flag
        // this function corrects, so on the *second* in-game toggle in a row it would already be
        // stale relative to where the file actually sits (the in-game manager never moves
        // files — only this resync, or Modrex's own enable/disable, ever does). Check both.
        let active = active_mod_path(game_path, &m.filename, rel.as_deref(), target);
        let disabled = disabled_mod_path(game_path, &m.filename, rel.as_deref(), target);
        let path = if active.exists() {
            Some(active)
        } else if disabled.exists() {
            Some(disabled)
        } else {
            None
        };
        let Some(path) = path else { continue };
        if let Some(real_enabled) =
            crimeboss_settings::read_enabled(&path, target.is_directory_unit(), launcher)
        {
            if real_enabled != m.enabled {
                m.enabled = real_enabled;
                changed = true;
            }
        }
    }
    changed
}

fn is_host_pack_location(location: Option<&str>) -> bool {
    location.is_some_and(|l| l.starts_with("host:"))
}

/// Creates app folders for every directory segment in the untracked paths that does not yet
/// exist, pushing them onto `state.folders`. Returns the folder-path-to-id map used to place
/// reconciled and newly identified mods.
pub(crate) fn ensure_untracked_folders(
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
pub(crate) async fn hash_untracked(
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
pub(crate) fn identify_untracked(
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
                    // A confirmed name hit after the SHA256 check above already missed means
                    // the installed bytes are known-stale (unlike the numeric/hash_filename
                    // fallbacks below, which have no such confirmation) — "outdated" surfaces
                    // the update instead of being suppressed by the "unknown version" guard.
                    (
                        remote_id,
                        stripped_name.trim().to_string(),
                        None,
                        "outdated".to_string(),
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

        // Dirs discovered via index_gated_markers (e.g. base.lua) that didn't match the index
        // are loader framework modules, not user mods — drop them.
        // Guard: only filter when the index actually has entries for this game; if it doesn't,
        // we can't tell framework modules from real mods, so show everything (some "Unknown")
        // rather than hide everything. Once the game is indexed the filter kicks in correctly.
        if id < 0 {
            if let engine::ModUnit::Directory {
                scan_markers,
                index_gated_markers,
                ..
            } = &entry_target.unit
            {
                if !index_gated_markers.is_empty()
                    && index.is_some_and(|c| mod_index::has_game(c, gname))
                {
                    let mod_dir = if *enabled {
                        mods_base(game_path, entry_target).join(rel_path)
                    } else {
                        disabled_base(game_path, entry_target).join(rel_path)
                    };
                    if !scan_markers.iter().any(|m| mod_dir.join(m).exists()) {
                        continue;
                    }
                }
            }
        }

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

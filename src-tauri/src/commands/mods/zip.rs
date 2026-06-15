use super::engine::{ModEngineConfig, ModUnit};
use super::paths::{active_mod_path, disabled_mod_path};
use super::state::get_folder_path;
use super::types::{InstalledMod, ModFolder};
use sha2::{Digest, Sha256};
use std::collections::HashSet;
use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use uuid::Uuid;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    Zip,
    SevenZip,
    TarGz,
    TarXz,
    Rar,
}

pub fn detect_archive(path: &Path) -> Option<ArchiveFormat> {
    let mut buf = [0u8; 8];
    let n = File::open(path)
        .and_then(|mut f| f.read(&mut buf))
        .unwrap_or(0);
    if n >= 4 && buf[..4] == [0x50, 0x4B, 0x03, 0x04] {
        Some(ArchiveFormat::Zip)
    } else if n >= 6 && buf[..6] == [0x37, 0x7A, 0xBC, 0xAF, 0x27, 0x1C] {
        Some(ArchiveFormat::SevenZip)
    } else if n >= 2 && buf[..2] == [0x1F, 0x8B] {
        Some(ArchiveFormat::TarGz)
    } else if n >= 6 && buf[..6] == [0xFD, 0x37, 0x7A, 0x58, 0x5A, 0x00] {
        Some(ArchiveFormat::TarXz)
    } else if n >= 6 && buf[..6] == [0x52, 0x61, 0x72, 0x21, 0x1A, 0x07] {
        Some(ArchiveFormat::Rar)
    } else {
        None
    }
}

#[cfg(test)]
pub fn is_zip(path: &Path) -> bool {
    detect_archive(path) == Some(ArchiveFormat::Zip)
}

/// One archive member: `name` is normalized to forward slashes; `is_dir` flags directory
/// entries. The pak/dir listing operations are pure functions over a `Vec` of these.
struct ArchiveEntry {
    name: String,
    is_dir: bool,
}

/// Enumerates every member of an archive, dispatching on the detected format. This is the
/// single per-format read path; listing helpers operate on its output.
fn list_entries(path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    match detect_archive(path) {
        Some(ArchiveFormat::Zip) => list_entries_zip(path),
        Some(ArchiveFormat::SevenZip) => list_entries_7z(path),
        Some(ArchiveFormat::TarGz) => list_entries_tar(flate2::read::GzDecoder::new(
            File::open(path).map_err(|e| e.to_string())?,
        )),
        Some(ArchiveFormat::TarXz) => list_entries_tar(xz2::read::XzDecoder::new(
            File::open(path).map_err(|e| e.to_string())?,
        )),
        Some(ArchiveFormat::Rar) => list_entries_rar(path),
        None => Err("Not a supported archive format".to_string()),
    }
}

fn list_entries_zip(path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut out = Vec::with_capacity(archive.len());
    for i in 0..archive.len() {
        let entry = archive.by_index(i).map_err(|e| e.to_string())?;
        out.push(ArchiveEntry {
            name: entry.name().replace('\\', "/"),
            is_dir: entry.is_dir(),
        });
    }
    Ok(out)
}

fn list_entries_7z(path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    sevenz_rust::decompress_with_extract_fn(file, Path::new("."), |entry, reader, _dest| {
        out.push(ArchiveEntry {
            name: entry.name().replace('\\', "/"),
            is_dir: entry.is_directory(),
        });
        // Drain so the stream stays aligned for the next entry in solid archives.
        let _ = std::io::copy(reader, &mut std::io::sink());
        Ok(true)
    })
    .map_err(|e| e.to_string())?;
    Ok(out)
}

fn list_entries_tar<R: Read>(reader: R) -> Result<Vec<ArchiveEntry>, String> {
    let mut archive = tar::Archive::new(reader);
    let mut out = Vec::new();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let is_dir = entry.header().entry_type().is_dir();
        let name = entry
            .path()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        out.push(ArchiveEntry { name, is_dir });
    }
    Ok(out)
}

fn list_entries_rar(path: &Path) -> Result<Vec<ArchiveEntry>, String> {
    let archive = unrar::Archive::new(path)
        .open_for_listing()
        .map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for entry in archive {
        let entry = entry.map_err(|e| e.to_string())?;
        out.push(ArchiveEntry {
            name: entry.filename.to_string_lossy().replace('\\', "/"),
            is_dir: entry.is_directory(),
        });
    }
    Ok(out)
}

pub fn list_pak_entries(path: &Path) -> Result<Vec<String>, String> {
    Ok(list_entries(path)?
        .into_iter()
        .filter(|e| !e.is_dir && e.name.ends_with(".pak"))
        .map(|e| e.name)
        .collect())
}

pub fn extract_entry(archive_path: &Path, entry_name: &str, dest: &Path) -> Result<(), String> {
    match detect_archive(archive_path) {
        Some(ArchiveFormat::Zip) => extract_zip_entry(archive_path, entry_name, dest),
        Some(ArchiveFormat::SevenZip) => extract_7z_entry(archive_path, entry_name, dest),
        Some(ArchiveFormat::TarGz) => extract_tar_entry(
            flate2::read::GzDecoder::new(File::open(archive_path).map_err(|e| e.to_string())?),
            entry_name,
            dest,
        ),
        Some(ArchiveFormat::TarXz) => extract_tar_entry(
            xz2::read::XzDecoder::new(File::open(archive_path).map_err(|e| e.to_string())?),
            entry_name,
            dest,
        ),
        Some(ArchiveFormat::Rar) => extract_rar_entry(archive_path, entry_name, dest),
        None => Err("Not a supported archive format".to_string()),
    }
}

pub fn extract_zip_entry(zip_path: &Path, entry_name: &str, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    // Some Windows ZIPs store paths with backslashes; try both separators.
    let index = archive
        .index_for_name(entry_name)
        .or_else(|| archive.index_for_name(&entry_name.replace('/', "\\")))
        .ok_or_else(|| format!("entry '{}' not found in archive", entry_name))?;
    let mut entry = archive.by_index(index).map_err(|e| e.to_string())?;
    let mut dest_file = File::create(dest).map_err(|e| e.to_string())?;
    std::io::copy(&mut entry, &mut dest_file).map_err(|e| e.to_string())?;
    Ok(())
}

fn extract_7z_entry(archive_path: &Path, entry_name: &str, dest: &Path) -> Result<(), String> {
    use std::cell::RefCell;
    // Write directly from the callback reader; avoids depending on sevenz-rust's
    // directory-creation behavior. Normalize separators for cross-platform archives.
    let normalized = entry_name.replace('\\', "/");
    let write_result: RefCell<Option<Result<(), String>>> = RefCell::new(None);

    let file = File::open(archive_path).map_err(|e| e.to_string())?;
    sevenz_rust::decompress_with_extract_fn(file, Path::new("."), |entry, reader, _dest| {
        if !entry.is_directory() && entry.name().replace('\\', "/") == normalized {
            let r = File::create(dest)
                .and_then(|mut f| std::io::copy(reader, &mut f).map(|_| ()))
                .map_err(|e| e.to_string());
            *write_result.borrow_mut() = Some(r);
            Ok(false)
        } else {
            // Drain so the stream stays at the right offset for the next entry in solid archives.
            let _ = std::io::copy(reader, &mut std::io::sink());
            Ok(true)
        }
    })
    .map_err(|e| e.to_string())?;

    write_result
        .into_inner()
        .unwrap_or_else(|| Err(format!("entry '{}' not found in archive", entry_name)))
}

fn extract_tar_entry<R: Read>(reader: R, entry_name: &str, dest: &Path) -> Result<(), String> {
    let mut archive = tar::Archive::new(reader);
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        if entry.header().entry_type().is_dir() {
            continue;
        }
        let path = entry.path().map_err(|e| e.to_string())?;
        if path.to_string_lossy().replace('\\', "/") == entry_name {
            let mut dest_file = File::create(dest).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut dest_file).map_err(|e| e.to_string())?;
            return Ok(());
        }
    }
    Err(format!("entry '{}' not found in archive", entry_name))
}

pub async fn compute_sha256(path: &Path) -> Result<String, String> {
    let path = path.to_path_buf();
    tauri::async_runtime::spawn_blocking(move || {
        let mut file = File::open(&path).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 64 * 1024];
        loop {
            let n = file.read(&mut buf).map_err(|e| e.to_string())?;
            if n == 0 {
                break;
            }
            hasher.update(&buf[..n]);
        }
        Ok(hex::encode(hasher.finalize()))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Every directory path present in `names` (inferred from each entry's path components, so it
/// works whether or not the archive stores explicit directory entries). Names ending in `/`
/// are treated as directory entries.
fn collect_all_dirs(names: &[String]) -> std::collections::BTreeSet<String> {
    let mut set = std::collections::BTreeSet::new();
    for name in names {
        let last_is_file = !name.ends_with('/');
        let parts: Vec<&str> = name.split('/').collect();
        let upto = if last_is_file {
            parts.len().saturating_sub(1)
        } else {
            parts.len()
        };
        let mut acc = String::new();
        for part in parts.iter().take(upto) {
            if part.is_empty() {
                continue;
            }
            if !acc.is_empty() {
                acc.push('/');
            }
            acc.push_str(part);
            set.insert(acc.clone());
        }
    }
    set
}

/// Classifies an archive's mod directories by which scan target they install into. Each result
/// is `(dir_path, location_tag)` where `location_tag` is `None` for the primary target and
/// `Some(tag)` for a secondary target (e.g. `"mod_overrides"`).
///
/// - **Marker-bearing targets** (e.g. `mods` with `mod.txt`/`main.xml`) claim any dir that
///   contains one of their markers, at any depth — so BeardLib/BLT mods route to `mods/`
///   regardless of which folder the packager dropped them in.
/// - The **marker-less (override) target** claims marker-less directories that sit at the same
///   depth as the marker dirs (the asset-replacement mods packaged alongside the BLT mods).
///   When the archive has no markers at all, it falls back to the top-level directories —
///   preserving the single asset-override mod case.
///
/// A dir is never double-claimed; the first (lowest-index) target wins.
pub(crate) fn classify_archive_dirs(
    names: &[String],
    cfg: &ModEngineConfig,
) -> Vec<(String, Option<String>)> {
    use std::collections::BTreeMap;

    let tag_for = |idx: usize| -> Option<String> {
        if idx == 0 {
            None
        } else {
            Some(cfg.targets[idx].tag.to_string())
        }
    };

    let mut out: BTreeMap<String, Option<String>> = BTreeMap::new();

    // 1. Marker-bearing targets.
    let mut marker_dirs: Vec<String> = Vec::new();
    for (idx, target) in cfg.targets.iter().enumerate() {
        if let ModUnit::Directory { entry_markers, .. } = &target.unit {
            if entry_markers.is_empty() {
                continue;
            }
            for marker in *entry_markers {
                let suffix = format!("/{}", marker);
                for name in names {
                    if let Some(pos) = name.rfind(&suffix) {
                        if pos > 0 {
                            let dir = name[..pos].to_string();
                            if !marker_dirs.contains(&dir) {
                                marker_dirs.push(dir.clone());
                            }
                            out.entry(dir).or_insert_with(|| tag_for(idx));
                        }
                    }
                }
            }
        }
    }

    // 2. Marker-less (override) target(s).
    for (idx, target) in cfg.targets.iter().enumerate() {
        let ModUnit::Directory { entry_markers, .. } = &target.unit else {
            continue;
        };
        if !entry_markers.is_empty() {
            continue;
        }
        let tag = tag_for(idx);
        if marker_dirs.is_empty() {
            // No markers anywhere: every top-level directory is an asset-override mod.
            for name in names {
                if let Some(slash) = name.find('/') {
                    if slash > 0 {
                        out.entry(name[..slash].to_string())
                            .or_insert_with(|| tag.clone());
                    }
                }
            }
        } else {
            // Marker-less dirs at the same depth as marker dirs are asset-override mods packaged
            // alongside the BLT/BeardLib mods. Exclude marker dirs themselves, the internals of
            // marker mods, wrappers (ancestors of a marker), and nested content of an override
            // mod already chosen. `collect_all_dirs` yields parents before children, so the
            // maximality check sees an override before any of its descendants.
            let marker_depths: HashSet<usize> =
                marker_dirs.iter().map(|d| d.split('/').count()).collect();
            let mut chosen: Vec<String> = Vec::new();
            for d in collect_all_dirs(names) {
                if !marker_depths.contains(&d.split('/').count()) {
                    continue;
                }
                if marker_dirs.contains(&d) {
                    continue;
                }
                let d_prefix = format!("{}/", d);
                if marker_dirs.iter().any(|m| m.starts_with(&d_prefix)) {
                    continue; // d is an ancestor of a marker dir (a wrapper)
                }
                if marker_dirs
                    .iter()
                    .any(|m| d.starts_with(&format!("{}/", m)))
                {
                    continue; // d is internal content of a marker mod
                }
                if chosen.iter().any(|c| d.starts_with(&format!("{}/", c))) {
                    continue; // d is nested under an override mod already chosen
                }
                chosen.push(d.clone());
                out.entry(d).or_insert_with(|| tag.clone());
            }
        }
    }

    out.into_iter().collect()
}

/// Joins an archive-internal (`/`-separated) path onto `dest`, returning `None` if it would
/// escape `dest` via an absolute path, drive/UNC prefix, or `..` component. Archive entries
/// are attacker-controlled, so directory extractors must route writes through this (Zip-Slip).
pub(crate) fn safe_dest(dest: &Path, relative: &str) -> Option<PathBuf> {
    use std::path::Component;
    for comp in Path::new(relative).components() {
        match comp {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    Some(dest.join(relative))
}

/// Extracts all entries under `dir_prefix/` from the archive into `dest/`.
pub fn extract_dir_entry(archive_path: &Path, dir_prefix: &str, dest: &Path) -> Result<(), String> {
    match detect_archive(archive_path) {
        Some(ArchiveFormat::Zip) => extract_dir_zip(archive_path, dir_prefix, dest),
        Some(ArchiveFormat::SevenZip) => extract_dir_7z(archive_path, dir_prefix, dest),
        Some(ArchiveFormat::TarGz) => extract_dir_tar(
            flate2::read::GzDecoder::new(File::open(archive_path).map_err(|e| e.to_string())?),
            dir_prefix,
            dest,
        ),
        Some(ArchiveFormat::TarXz) => extract_dir_tar(
            xz2::read::XzDecoder::new(File::open(archive_path).map_err(|e| e.to_string())?),
            dir_prefix,
            dest,
        ),
        Some(ArchiveFormat::Rar) => extract_dir_rar(archive_path, dir_prefix, dest),
        None => Err("Not a supported archive format".to_string()),
    }
}

fn extract_dir_zip(zip_path: &Path, dir_prefix: &str, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let prefix = format!("{}/", dir_prefix);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        let relative = match name.strip_prefix(&prefix) {
            Some(r) if !r.is_empty() => r.to_string(),
            _ => continue,
        };
        let Some(dest_path) = safe_dest(dest, &relative) else {
            continue;
        };
        if entry.is_dir() {
            std::fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&dest_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

fn extract_dir_7z(archive_path: &Path, dir_prefix: &str, dest: &Path) -> Result<(), String> {
    use std::cell::RefCell;
    let file = File::open(archive_path).map_err(|e| e.to_string())?;
    let prefix = format!("{}/", dir_prefix);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let dest = dest.to_path_buf();
    let write_err: RefCell<Option<String>> = RefCell::new(None);
    sevenz_rust::decompress_with_extract_fn(file, Path::new("."), |entry, reader, _dst| {
        let name = entry.name().replace('\\', "/");
        let relative = match name.strip_prefix(&prefix) {
            Some(r) if !r.is_empty() => r.to_string(),
            _ => {
                let _ = std::io::copy(reader, &mut std::io::sink());
                return Ok(true);
            }
        };
        let Some(dest_path) = safe_dest(&dest, &relative) else {
            let _ = std::io::copy(reader, &mut std::io::sink());
            return Ok(true);
        };
        if entry.is_directory() {
            let _ = std::fs::create_dir_all(&dest_path);
            let _ = std::io::copy(reader, &mut std::io::sink());
            return Ok(true);
        }
        if let Some(parent) = dest_path.parent() {
            if let Err(e) = std::fs::create_dir_all(parent) {
                *write_err.borrow_mut() = Some(e.to_string());
                let _ = std::io::copy(reader, &mut std::io::sink());
                return Ok(true);
            }
        }
        match File::create(&dest_path).and_then(|mut f| std::io::copy(reader, &mut f).map(|_| ())) {
            Ok(_) => Ok(true),
            Err(e) => {
                *write_err.borrow_mut() = Some(e.to_string());
                Ok(true)
            }
        }
    })
    .map_err(|e| e.to_string())?;
    if let Some(e) = write_err.into_inner() {
        return Err(e);
    }
    Ok(())
}

fn extract_dir_tar<R: Read>(reader: R, dir_prefix: &str, dest: &Path) -> Result<(), String> {
    let mut archive = tar::Archive::new(reader);
    let prefix = format!("{}/", dir_prefix);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        let name = entry
            .path()
            .map_err(|e| e.to_string())?
            .to_string_lossy()
            .replace('\\', "/");
        let relative = match name.strip_prefix(&prefix) {
            Some(r) if !r.is_empty() => r.to_string(),
            _ => continue,
        };
        let Some(dest_path) = safe_dest(dest, &relative) else {
            continue;
        };
        if entry.header().entry_type().is_dir() {
            std::fs::create_dir_all(&dest_path).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&dest_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Resolves a downloaded archive into an installable path plus the detected scan-target tag.
/// Returns `(extracted_path, original_archive, location_tag)` where `location_tag` is `None`
/// for the primary target and `Some(tag)` for any secondary target (e.g. `"mod_overrides"`).
pub fn resolve_archive_download(
    downloaded: PathBuf,
    cfg: &ModEngineConfig,
) -> Result<(PathBuf, Option<PathBuf>, Option<String>), String> {
    if detect_archive(&downloaded).is_none() {
        return Ok((downloaded, None, None));
    }
    match &cfg.primary().unit {
        ModUnit::File { .. } => {
            let entries = list_pak_entries(&downloaded)?;
            match entries.len() {
                0 => {
                    let _ = std::fs::remove_file(&downloaded);
                    Err("This mod is packaged as an archive with no .pak files inside.".to_string())
                }
                1 => {
                    let tmp = std::env::temp_dir().join(format!("pd3-mod-{}.pak", Uuid::new_v4()));
                    extract_entry(&downloaded, &entries[0], &tmp)?;
                    Ok((tmp, Some(downloaded), None))
                }
                _ => {
                    let zip_path = downloaded.to_string_lossy().to_string();
                    let payload = serde_json::json!({ "zipPath": zip_path, "entries": entries, "targetTag": serde_json::Value::Null });
                    Err(format!("ZIP_MULTI_PAK:{}", payload))
                }
            }
        }
        ModUnit::Directory { .. } => {
            let names: Vec<String> = list_entries(&downloaded)?
                .into_iter()
                .map(|e| {
                    if e.is_dir && !e.name.ends_with('/') {
                        format!("{}/", e.name)
                    } else {
                        e.name
                    }
                })
                .collect();
            let dirs = classify_archive_dirs(&names, cfg);
            if dirs.is_empty() {
                let _ = std::fs::remove_file(&downloaded);
                return Err(
                    if let ModUnit::Directory { entry_markers, .. } = &cfg.primary().unit {
                        if entry_markers.is_empty() {
                            "This mod is packaged as an archive with no mod directory found inside."
                                .to_string()
                        } else {
                            format!(
                                "This mod is packaged as an archive with no {} found inside.",
                                entry_markers.join(" or ")
                            )
                        }
                    } else {
                        "No valid mod directory found in archive.".to_string()
                    },
                );
            }
            if dirs.len() == 1 {
                let (dir, location_tag) = &dirs[0];
                let dir_name = Path::new(dir)
                    .file_name()
                    .and_then(|s| s.to_str())
                    .unwrap_or("mod")
                    .to_string();
                // Two-level temp: {uuid_dir}/{dir_name} so tmp.file_name() == dir_name.
                let tmp_parent =
                    std::env::temp_dir().join(format!("modrex-mod-{}", Uuid::new_v4()));
                let tmp = tmp_parent.join(&dir_name);
                extract_dir_entry(&downloaded, dir, &tmp)?;
                return Ok((tmp, Some(downloaded), location_tag.clone()));
            }
            let zip_path = downloaded.to_string_lossy().to_string();
            let entry_names: Vec<&String> = dirs.iter().map(|(d, _)| d).collect();
            let distinct_tags: HashSet<&Option<String>> = dirs.iter().map(|(_, t)| t).collect();
            if distinct_tags.len() == 1 {
                // Single target: keep the legacy payload shape (one targetTag for all entries).
                let payload = serde_json::json!({ "zipPath": zip_path, "entries": entry_names, "targetTag": dirs[0].1 });
                Err(format!("ZIP_MULTI_PAK:{}", payload))
            } else {
                // Mixed targets (e.g. a modpack spanning mods/ and assets/mod_overrides/):
                // tag each entry individually so the picker routes it to the right place.
                let entry_tags: Vec<&Option<String>> = dirs.iter().map(|(_, t)| t).collect();
                let payload = serde_json::json!({ "zipPath": zip_path, "entries": entry_names, "entryTags": entry_tags, "targetTag": serde_json::Value::Null });
                Err(format!("ZIP_MULTI_PAK:{}", payload))
            }
        }
    }
}

fn extract_rar_entry(archive_path: &Path, entry_name: &str, dest: &Path) -> Result<(), String> {
    let normalized = entry_name.replace('\\', "/");
    let tmp_dir = std::env::temp_dir().join(format!("rar-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let mut archive = unrar::Archive::new(archive_path)
            .open_for_processing()
            .map_err(|e| e.to_string())?;
        loop {
            match archive.read_header().map_err(|e| e.to_string())? {
                None => return Err(format!("entry '{}' not found in archive", entry_name)),
                Some(header) => {
                    let name = header.entry().filename.to_string_lossy().replace('\\', "/");
                    if name == normalized {
                        // extract_with_base writes to tmp_dir joined with the internal name —
                        // reject traversal so it can't escape tmp_dir.
                        if safe_dest(&tmp_dir, &name).is_none() {
                            return Err("archive entry escapes extraction directory".to_string());
                        }
                        let entry_filename = header.entry().filename.clone();
                        header
                            .extract_with_base(&tmp_dir)
                            .map_err(|e| e.to_string())?;
                        let extracted = tmp_dir.join(&entry_filename);
                        return std::fs::copy(&extracted, dest)
                            .map(|_| ())
                            .map_err(|e| e.to_string());
                    } else {
                        archive = header.skip().map_err(|e| e.to_string())?;
                    }
                }
            }
        }
    })();
    let _ = std::fs::remove_dir_all(&tmp_dir);
    result
}

fn rar_copy_dir(src: &Path, dst: &Path) -> Result<(), String> {
    for entry in std::fs::read_dir(src).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let src_path = entry.path();
        let dst_path = dst.join(entry.file_name());
        if src_path.is_dir() {
            std::fs::create_dir_all(&dst_path).map_err(|e| e.to_string())?;
            rar_copy_dir(&src_path, &dst_path)?;
        } else {
            std::fs::copy(&src_path, &dst_path).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn extract_dir_rar(archive_path: &Path, dir_prefix: &str, dest: &Path) -> Result<(), String> {
    let prefix = format!("{}/", dir_prefix);
    std::fs::create_dir_all(dest).map_err(|e| e.to_string())?;
    let tmp_dir = std::env::temp_dir().join(format!("rar-{}", Uuid::new_v4()));
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let result = (|| -> Result<(), String> {
        let mut archive = unrar::Archive::new(archive_path)
            .open_for_processing()
            .map_err(|e| e.to_string())?;
        loop {
            match archive.read_header().map_err(|e| e.to_string())? {
                None => break,
                Some(header) => {
                    let name = header.entry().filename.to_string_lossy().replace('\\', "/");
                    // extract_with_base writes to tmp_dir joined with the internal name; skip
                    // any entry whose path would escape tmp_dir (Zip-Slip via `..`).
                    if !header.entry().is_directory()
                        && name.starts_with(&prefix)
                        && safe_dest(&tmp_dir, &name).is_some()
                    {
                        archive = header
                            .extract_with_base(&tmp_dir)
                            .map_err(|e| e.to_string())?;
                    } else {
                        archive = header.skip().map_err(|e| e.to_string())?;
                    }
                }
            }
        }
        let src = tmp_dir.join(dir_prefix.replace('/', std::path::MAIN_SEPARATOR_STR));
        rar_copy_dir(&src, dest)
    })();
    let _ = std::fs::remove_dir_all(&tmp_dir);
    result
}

/// Returns the updated mod list and whether any `archive_broken` value was newly determined.
/// Skips mods where `archive_broken` is already `Some` — the result was cached in the state file.
pub fn mark_archive_files(
    game_path: &str,
    folders: &[ModFolder],
    mut mods: Vec<InstalledMod>,
    cfg: &ModEngineConfig,
) -> (Vec<InstalledMod>, bool) {
    let mut any_checked = false;
    for m in &mut mods {
        if m.missing == Some(true) || m.archive_broken.is_some() {
            continue;
        }
        let rel = get_folder_path(folders, m.folder_id.as_deref());
        let target = cfg.target_for(m.location.as_deref());
        let path = if m.enabled {
            active_mod_path(game_path, &m.filename, rel.as_deref(), target)
        } else {
            disabled_mod_path(game_path, &m.filename, rel.as_deref(), target)
        };
        m.archive_broken = Some(detect_archive(&path).is_some());
        any_checked = true;
    }
    (mods, any_checked)
}

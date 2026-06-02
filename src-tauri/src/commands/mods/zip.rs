use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use super::paths::{active_mod_path, disabled_mod_path};
use super::state::get_folder_path;
use super::types::{InstalledMod, ModFolder};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveFormat {
    Zip,
    SevenZip,
    TarGz,
    TarXz,
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
    } else {
        None
    }
}

#[cfg(test)]
pub fn is_zip(path: &Path) -> bool {
    detect_archive(path) == Some(ArchiveFormat::Zip)
}

pub fn list_pak_entries(path: &Path) -> Result<Vec<String>, String> {
    match detect_archive(path) {
        Some(ArchiveFormat::Zip) => list_pak_entries_zip(path),
        Some(ArchiveFormat::SevenZip) => list_pak_entries_7z(path),
        Some(ArchiveFormat::TarGz) => list_pak_entries_tar(flate2::read::GzDecoder::new(
            File::open(path).map_err(|e| e.to_string())?,
        )),
        Some(ArchiveFormat::TarXz) => list_pak_entries_tar(xz2::read::XzDecoder::new(
            File::open(path).map_err(|e| e.to_string())?,
        )),
        None => Err("Not a supported archive format".to_string()),
    }
}

fn list_pak_entries_zip(path: &Path) -> Result<Vec<String>, String> {
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

fn list_pak_entries_7z(path: &Path) -> Result<Vec<String>, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let mut entries = Vec::new();
    sevenz_rust::decompress_with_extract_fn(file, Path::new("."), |entry, _reader, _dest| {
        if !entry.is_directory() && entry.name().ends_with(".pak") {
            entries.push(entry.name().replace('\\', "/")); // 7z archives may store paths with backslashes
        }
        Ok(false)
    })
    .map_err(|e| e.to_string())?;
    Ok(entries)
}

fn list_pak_entries_tar<R: Read>(reader: R) -> Result<Vec<String>, String> {
    let mut archive = tar::Archive::new(reader);
    let mut entries = Vec::new();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if entry.header().entry_type().is_dir() {
            continue;
        }
        let path = entry.path().map_err(|e| e.to_string())?;
        let name = path.to_string_lossy().replace('\\', "/");
        if name.ends_with(".pak") {
            entries.push(name);
        }
    }
    Ok(entries)
}

pub fn extract_entry(archive_path: &Path, entry_name: &str, dest: &Path) -> Result<(), String> {
    match detect_archive(archive_path) {
        Some(ArchiveFormat::Zip) => extract_zip_entry(archive_path, entry_name, dest),
        Some(ArchiveFormat::SevenZip) => extract_7z_entry(archive_path, entry_name, dest),
        Some(ArchiveFormat::TarGz) => extract_tar_entry(
            flate2::read::GzDecoder::new(
                File::open(archive_path).map_err(|e| e.to_string())?,
            ),
            entry_name,
            dest,
        ),
        Some(ArchiveFormat::TarXz) => extract_tar_entry(
            xz2::read::XzDecoder::new(
                File::open(archive_path).map_err(|e| e.to_string())?,
            ),
            entry_name,
            dest,
        ),
        None => Err("Not a supported archive format".to_string()),
    }
}

pub fn extract_zip_entry(zip_path: &Path, entry_name: &str, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    let mut entry = archive
        .by_name(entry_name)
        .map_err(|_| format!("entry '{}' not found in archive", entry_name))?;
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
        }
        Ok(false)
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
    let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

pub fn resolve_archive_download(downloaded: PathBuf) -> Result<(PathBuf, Option<PathBuf>), String> {
    if detect_archive(&downloaded).is_none() {
        return Ok((downloaded, None));
    }
    let entries = list_pak_entries(&downloaded)?;
    match entries.len() {
        0 => {
            let _ = std::fs::remove_file(&downloaded);
            Err("This mod is packaged as an archive with no .pak files inside.".to_string())
        }
        1 => {
            let tmp = std::env::temp_dir().join(format!("pd3-mod-{}.pak", Uuid::new_v4()));
            extract_entry(&downloaded, &entries[0], &tmp)?;
            Ok((tmp, Some(downloaded)))
        }
        _ => {
            let zip_path = downloaded.to_string_lossy().to_string();
            let payload = serde_json::json!({ "zipPath": zip_path, "entries": entries });
            Err(format!("ZIP_MULTI_PAK:{}", payload))
        }
    }
}

pub fn mark_archive_files(
    game_path: &str,
    folders: &[ModFolder],
    mut mods: Vec<InstalledMod>,
) -> Vec<InstalledMod> {
    for m in &mut mods {
        if m.missing == Some(true) {
            continue;
        }
        let rel = get_folder_path(folders, m.folder_id.as_deref());
        let path = if m.enabled {
            active_mod_path(game_path, &m.filename, rel.as_deref())
        } else {
            disabled_mod_path(game_path, &m.filename, rel.as_deref())
        };
        if detect_archive(&path).is_some() {
            m.archive_broken = Some(true);
        }
    }
    mods
}

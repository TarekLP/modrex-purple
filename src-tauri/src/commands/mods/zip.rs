use std::fs::File;
use std::io::Read;
use std::path::{Path, PathBuf};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use super::paths::{active_mod_path, disabled_mod_path};
use super::state::get_folder_path;
use super::types::{InstalledMod, ModFolder};

pub fn is_zip(path: &Path) -> bool {
    let mut buf = [0u8; 4];
    File::open(path)
        .and_then(|mut f| f.read_exact(&mut buf))
        .is_ok()
        && buf == [0x50, 0x4B, 0x03, 0x04]
}

pub fn list_pak_entries_in_zip(path: &Path) -> Result<Vec<String>, String> {
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

pub async fn compute_sha256(path: &Path) -> Result<String, String> {
    let bytes = tokio::fs::read(path).await.map_err(|e| e.to_string())?;
    let mut hasher = Sha256::new();
    hasher.update(&bytes);
    Ok(hex::encode(hasher.finalize()))
}

pub fn resolve_zip_download(downloaded: PathBuf) -> Result<(PathBuf, Option<PathBuf>), String> {
    if !is_zip(&downloaded) {
        return Ok((downloaded, None));
    }
    let entries = list_pak_entries_in_zip(&downloaded)?;
    match entries.len() {
        0 => {
            let _ = std::fs::remove_file(&downloaded);
            Err("This mod is packaged as a ZIP archive with no .pak files inside.".to_string())
        }
        1 => {
            let ext = std::env::temp_dir().join(format!("pd3-mod-{}.pak", Uuid::new_v4()));
            extract_zip_entry(&downloaded, &entries[0], &ext)?;
            Ok((ext, Some(downloaded)))
        }
        _ => {
            let zip_path = downloaded.to_string_lossy().to_string();
            let payload = serde_json::json!({ "zipPath": zip_path, "entries": entries });
            Err(format!("ZIP_MULTI_PAK:{}", payload))
        }
    }
}

pub fn mark_zip_archives(game_path: &str, folders: &[ModFolder], mut mods: Vec<InstalledMod>) -> Vec<InstalledMod> {
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
        if is_zip(&path) {
            m.zip_archive = Some(true);
        }
    }
    mods
}

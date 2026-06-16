use std::fs::File;
use std::path::{Component, Path, PathBuf};

use crate::commands::download::download_file;

/// DAHM hooks the game via lightfx.dll placed next to the executable.
/// Its ZIP extracts flat to the game root, so the DLL's presence is the install signal.
const LOADER_DLL: &str = "lightfx.dll";

/// Stable redirect URL maintained by DAHM's author — 302s to a versioned ZIP.
const LOADER_DOWNLOAD_URL: &str = "https://dahm.neonsynth.de/main.php";

#[tauri::command]
pub fn check_dahm(game_path: String) -> bool {
    Path::new(&game_path).join(LOADER_DLL).is_file()
}

/// Downloads the DAHM ZIP and extracts all entries flat into the game root.
#[tauri::command]
pub async fn install_dahm(app: tauri::AppHandle, game_path: String) -> Result<(), String> {
    let zip_path = download_file(&app, LOADER_DOWNLOAD_URL, "zip").await?;
    let dest_dir = Path::new(&game_path).to_path_buf();
    let zip = zip_path.clone();
    let result = tokio::task::spawn_blocking(move || extract_zip_to_dir(&zip, &dest_dir))
        .await
        .map_err(|e| e.to_string())?;
    let _ = tokio::fs::remove_file(&zip_path).await;
    result
}

fn safe_dest(dest: &Path, relative: &str) -> Option<PathBuf> {
    for comp in Path::new(relative).components() {
        match comp {
            Component::Normal(_) | Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => return None,
        }
    }
    Some(dest.join(relative))
}

fn extract_zip_to_dir(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let file = File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let name = entry.name().replace('\\', "/");
        if entry.is_dir() {
            if let Some(dp) = safe_dest(dest, &name) {
                std::fs::create_dir_all(&dp).map_err(|e| e.to_string())?;
            }
            continue;
        }
        let Some(dest_path) = safe_dest(dest, &name) else {
            continue;
        };
        if let Some(parent) = dest_path.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut out = File::create(&dest_path).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut out).map_err(|e| e.to_string())?;
    }
    Ok(())
}

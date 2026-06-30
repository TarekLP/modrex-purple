use std::path::Path;

use crate::commands::download::download_file;
use crate::commands::mods::extract_entry;

/// SuperBLT hooks the game via a loader placed next to the game executable:
/// WSOCK32.dll (current), IPHLPAPI.dll (legacy), libsuperblt_loader.so
/// (Linux native). The loader never appears under mods/, so its presence in
/// the game root is the only reliable install signal.
const LOADER_FILES: &[&str] = &["WSOCK32.dll", "IPHLPAPI.dll", "libsuperblt_loader.so"];

/// Latest-release endpoint from superblt.znix.xyz — 302s to a versioned zip
/// containing exactly WSOCK32.dll.
const LOADER_DOWNLOAD_URL: &str =
    "https://sblt-update.znix.xyz/pd2update/download/get.php?src=modrex&id=payday2bltwsockdll";

#[tauri::command]
pub fn check_superblt(game_path: String) -> bool {
    let dir = Path::new(&game_path);
    LOADER_FILES.iter().any(|f| dir.join(f).is_file())
}

/// Installs the loader DLL into the game root. The basemod (mods/base) is
/// fetched by the loader itself: on next launch it prompts the user to
/// download it if missing.
#[tauri::command]
pub async fn install_superblt(app: tauri::AppHandle, game_path: String) -> Result<(), String> {
    let zip_path = download_file(&app, LOADER_DOWNLOAD_URL, "zip", "loader:superblt").await?;
    let dest = Path::new(&game_path).join(LOADER_FILES[0]);
    let zip = zip_path.clone();
    let result = tokio::task::spawn_blocking(move || extract_entry(&zip, LOADER_FILES[0], &dest))
        .await
        .map_err(|e| e.to_string())?;
    let _ = tokio::fs::remove_file(&zip_path).await;
    result
}

#[tauri::command]
pub fn is_pd2_diesel3(game_path: String) -> bool {
    Path::new(&game_path).join("PAYDAY2.exe").is_file()
}

#[cfg(test)]
#[path = "superblt_tests.rs"]
mod tests;

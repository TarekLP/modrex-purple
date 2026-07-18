use std::path::Path;

use crate::commands::download::download_file;
use crate::commands::mods::extract_archive_flat;

/// RAID-SuperBLT hooks the game via a loader DLL placed next to the game
/// executable: WSOCK32.dll (preferred) or IPHLPAPI.dll. IPHLPAPI.dll is also
/// what the discontinued RaidBLT shipped, so its presence means a BLT hook is
/// installed, not necessarily the SuperBLT one. There is no Linux native
/// loader, unlike PD2's SuperBLT — RAID has no native Linux build.
const LOADER_FILES: &[&str] = &["WSOCK32.dll", "IPHLPAPI.dll"];

/// Stable default-download endpoint of the RAID-SuperBLT modworkshop page
/// (mod 49744) — 302s to the current release zip, laid out relative to the
/// game root: the loader DLL, the Lua basemod (mods/base), and updater/.
const LOADER_DOWNLOAD_URL: &str = "https://api.modworkshop.net/mods/49744/download";

#[tauri::command]
#[specta::specta]
pub fn check_raid_superblt(game_path: String) -> bool {
    let dir = Path::new(&game_path);
    LOADER_FILES.iter().any(|f| dir.join(f).is_file())
}

/// Downloads the RAID-SuperBLT zip and extracts it whole into the game root.
/// Unlike PD2's SuperBLT (DLL-only zip, basemod fetched by the loader on next
/// launch), the RAID zip ships the basemod inside, so a full extraction is
/// the complete install.
#[tauri::command]
#[specta::specta]
pub async fn install_raid_superblt(app: tauri::AppHandle, game_path: String) -> Result<(), String> {
    let zip_path = download_file(&app, LOADER_DOWNLOAD_URL, "zip", "loader:raid").await?;
    let dest_dir = Path::new(&game_path).to_path_buf();
    let zip = zip_path.clone();
    let result = tokio::task::spawn_blocking(move || extract_archive_flat(&zip, &dest_dir))
        .await
        .map_err(|e| e.to_string())?;
    let _ = tokio::fs::remove_file(&zip_path).await;
    result
}

#[cfg(test)]
#[path = "raid_superblt_tests.rs"]
mod tests;

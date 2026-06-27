use std::path::Path;

use crate::commands::download::download_file;
use crate::commands::mods::extract_entry;

/// PDTHModOverrides hooks the game via two DLLs placed next to the executable:
/// DINPUT8.dll (the proxy loader) and PDTHModOverrides.dll (the payload).
/// Neither lives under mods/, so DINPUT8.dll presence is the install signal.
const LOADER_FILES: &[&str] = &["DINPUT8.dll", "PDTHModOverrides.dll"];

const LOADER_DOWNLOAD_URL: &str =
    "https://github.com/HW12Dev/PDTHModOverrides/releases/latest/download/PDTHModOverrides.zip";

#[tauri::command]
pub fn check_pdth_overrides(game_path: String) -> bool {
    Path::new(&game_path).join(LOADER_FILES[0]).is_file()
}

#[tauri::command]
pub async fn install_pdth_overrides(
    app: tauri::AppHandle,
    game_path: String,
) -> Result<(), String> {
    let zip_path = download_file(&app, LOADER_DOWNLOAD_URL, "zip", "loader:pdth").await?;
    let dir = Path::new(&game_path).to_path_buf();
    for name in LOADER_FILES {
        let dest = dir.join(name);
        let zip = zip_path.clone();
        let entry = name.to_string();
        tokio::task::spawn_blocking(move || extract_entry(&zip, &entry, &dest))
            .await
            .map_err(|e| e.to_string())??;
    }
    let _ = tokio::fs::remove_file(&zip_path).await;
    Ok(())
}

#[cfg(test)]
#[path = "pdth_overrides_tests.rs"]
mod tests;

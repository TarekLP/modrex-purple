use std::path::Path;

use crate::commands::loaders::{install_loader_package, is_loader_installed, loader_spec};

/// SuperBLT's detection markers and download endpoint live in the loader registry
/// (`commands/loaders.rs`); this module is the PD2-facing command pair over them.
fn spec() -> &'static crate::commands::loaders::LoaderSpec {
    loader_spec("superblt").expect("superblt is registered in LOADER_REGISTRY")
}

#[tauri::command]
#[specta::specta]
pub fn check_superblt(game_path: String) -> bool {
    is_loader_installed(spec(), "pd2", &game_path, None)
}

/// Installs the loader DLL into the game root. The basemod (mods/base) is
/// fetched by the loader itself: on next launch it prompts the user to
/// download it if missing.
#[tauri::command]
#[specta::specta]
pub async fn install_superblt(app: tauri::AppHandle, game_path: String) -> Result<(), String> {
    install_loader_package(spec(), &app, &game_path).await
}

#[tauri::command]
#[specta::specta]
pub fn is_pd2_diesel3(game_path: String) -> bool {
    Path::new(&game_path).join("PAYDAY2.exe").is_file()
}

#[cfg(test)]
#[path = "superblt_tests.rs"]
mod tests;

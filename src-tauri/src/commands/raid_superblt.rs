use crate::commands::loaders::{install_loader_package, is_loader_installed, loader_spec};

/// RAID-SuperBLT's detection markers and download endpoint live in the loader registry
/// (`commands/loaders.rs`); this module is the RAID-facing command pair over them.
fn spec() -> &'static crate::commands::loaders::LoaderSpec {
    loader_spec("raid_superblt").expect("raid_superblt is registered in LOADER_REGISTRY")
}

#[tauri::command]
#[specta::specta]
pub fn check_raid_superblt(game_path: String) -> bool {
    is_loader_installed(spec(), "raid", &game_path, None)
}

/// Downloads the RAID-SuperBLT zip and extracts it whole into the game root.
/// Unlike PD2's SuperBLT (DLL-only zip, basemod fetched by the loader on next
/// launch), the RAID zip ships the basemod inside, so a full extraction is
/// the complete install.
#[tauri::command]
#[specta::specta]
pub async fn install_raid_superblt(app: tauri::AppHandle, game_path: String) -> Result<(), String> {
    install_loader_package(spec(), &app, &game_path).await
}

#[cfg(test)]
#[path = "raid_superblt_tests.rs"]
mod tests;

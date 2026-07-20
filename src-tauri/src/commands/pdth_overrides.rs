use crate::commands::loaders::{install_loader_package, is_loader_installed, loader_spec};

/// PDTHModOverrides' detection marker and download endpoint live in the loader registry
/// (`commands/loaders.rs`); this module is the PDTH-facing command pair over them.
fn spec() -> &'static crate::commands::loaders::LoaderSpec {
    loader_spec("pdth_overrides").expect("pdth_overrides is registered in LOADER_REGISTRY")
}

#[tauri::command]
#[specta::specta]
pub fn check_pdth_overrides(game_path: String) -> bool {
    is_loader_installed(spec(), "pdth", &game_path, None)
}

#[tauri::command]
#[specta::specta]
pub async fn install_pdth_overrides(
    app: tauri::AppHandle,
    game_path: String,
) -> Result<(), String> {
    install_loader_package(spec(), &app, &game_path).await
}

#[cfg(test)]
#[path = "pdth_overrides_tests.rs"]
mod tests;

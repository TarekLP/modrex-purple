//! SuperBLT's detection markers and download endpoint live in the loader registry
//! (commands/loaders.rs), driven by the generic check_loader/install_loader commands.
//! What stays here is the PD2-specific Diesel 3.0 probe, which is not loader data.

use std::path::Path;

/// The Diesel 3.0 branch ships PAYDAY2.exe; the stable branch's executable is
/// payday2_win32_release.exe. That branch has no SuperBLT build, so check_loader
/// reports the loader unusable there even when its DLL is present.
pub(crate) fn is_diesel3(game_path: &str) -> bool {
    Path::new(game_path).join("PAYDAY2.exe").is_file()
}

#[tauri::command]
#[specta::specta]
pub fn is_pd2_diesel3(game_path: String) -> bool {
    is_diesel3(&game_path)
}

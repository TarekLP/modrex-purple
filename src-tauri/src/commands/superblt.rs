use std::path::Path;

/// SuperBLT hooks the game via a loader placed next to the game executable:
/// WSOCK32.dll (current), IPHLPAPI.dll (legacy), libsuperblt_loader.so
/// (Linux native). The loader never appears under mods/, so its presence in
/// the game root is the only reliable install signal.
const LOADER_FILES: &[&str] = &["WSOCK32.dll", "IPHLPAPI.dll", "libsuperblt_loader.so"];

#[tauri::command]
pub fn check_superblt(game_path: String) -> bool {
    let dir = Path::new(&game_path);
    LOADER_FILES.iter().any(|f| dir.join(f).is_file())
}

#[cfg(test)]
#[path = "superblt_tests.rs"]
mod tests;

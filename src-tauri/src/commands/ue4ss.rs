use std::path::{Path, PathBuf};

use tauri::AppHandle;

use crate::commands::mods::extract_archive_flat;
use crate::commands::settings::{game_settings, read_settings};

/// UE4SS is a community-forked Lua/native modding framework, unlike SuperBLT/DAHM
/// (one maintainer, one stable build) — each game's UE4SS build is a separately
/// maintained fork with its own proxy DLL and destination. Verified by downloading
/// and inspecting the real released archives rather than assumed:
/// - Crime Boss ("UE4SS-CB", modworkshop id 47749): proxy `dwmapi.dll`, installs into
///   `CrimeBoss/Binaries/Win64`. Only Steam verified — Crime Boss has no Xbox/GamePass
///   release, and no Epic build of this mod has been confirmed.
/// - PAYDAY 3 ("PD3 UE4SS V3.01 + Allow Pak Mods", modworkshop id 47771): proxy
///   `xinput1_3.dll`, installs into `<game_path>/PAYDAY3/Binaries/Win64` for Steam/Epic
///   (`game_path` already ends in `PAYDAY3`, the Steam installdir name — this is the
///   *inner* project subfolder, not a second copy of it; verified against a real install).
///   The Xbox/GamePass build uses a different destination (`Binaries/WinGDK`) and an
///   unverified proxy DLL — intentionally unsupported here rather than guessed.
struct Ue4ssDescriptor {
    proxy_dll: &'static str,
    binaries_subpath: &'static [&'static str],
}

fn descriptor_for(game_id: &str, launcher: Option<&str>) -> Option<Ue4ssDescriptor> {
    match (game_id, launcher) {
        ("cb", Some("steam")) => Some(Ue4ssDescriptor {
            proxy_dll: "dwmapi.dll",
            binaries_subpath: &["CrimeBoss", "Binaries", "Win64"],
        }),
        ("pd3", Some("steam")) | ("pd3", Some("epic")) => Some(Ue4ssDescriptor {
            proxy_dll: "xinput1_3.dll",
            // game_path already ends in `.../PAYDAY3` (the Steam installdir name) — this adds
            // the *inner* PAYDAY3 project subfolder, not a second copy of the installdir.
            // Verified against the real install: `<game_path>/PAYDAY3/Binaries/Win64/`.
            binaries_subpath: &["PAYDAY3", "Binaries", "Win64"],
        }),
        _ => None,
    }
}

fn binaries_dir(game_path: &str, descriptor: &Ue4ssDescriptor) -> PathBuf {
    descriptor
        .binaries_subpath
        .iter()
        .fold(Path::new(game_path).to_path_buf(), |acc, part| {
            acc.join(part)
        })
}

/// Pure presence check, kept free of `AppHandle` so it's directly unit-testable —
/// the launcher must already be resolved by the caller (mirrors
/// `crimeboss_settings::sync_enabled`'s `launcher: Option<&str>` shape).
fn is_installed(game_id: &str, game_path: &str, launcher: Option<&str>) -> bool {
    let Some(descriptor) = descriptor_for(game_id, launcher) else {
        return false;
    };
    binaries_dir(game_path, &descriptor)
        .join(descriptor.proxy_dll)
        .is_file()
}

/// Extracts a downloaded UE4SS loader package flat into the game's `Binaries` directory.
/// Unlike a normal mod install, this is never recorded in `state.json` — mirrors
/// `superblt`/`dahm`: presence-detected via `is_installed`, not tracked or uninstallable
/// through Modrex.
pub(crate) fn install_loader(
    game_id: &str,
    game_path: &str,
    launcher: Option<&str>,
    zip_path: &Path,
) -> Result<(), String> {
    let Some(descriptor) = descriptor_for(game_id, launcher) else {
        return Err(
            "UE4SS isn't supported yet for this game and launcher combination.".to_string(),
        );
    };
    let dest = binaries_dir(game_path, &descriptor);
    extract_archive_flat(zip_path, &dest)
}

#[tauri::command]
pub fn check_ue4ss(app: AppHandle, game_path: String, game_id: Option<String>) -> bool {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    let settings = read_settings(&app);
    let launcher = game_settings(&settings, &game_id).and_then(|gs| gs.launcher.clone());
    is_installed(&game_id, &game_path, launcher.as_deref())
}

#[cfg(test)]
#[path = "ue4ss_tests.rs"]
mod tests;

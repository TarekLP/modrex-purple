//! The one table a mod loader registers in. A loader is a hook installed next to the
//! game (never tracked in state.json, never uninstallable through Modrex), so all five
//! differ only in how presence is detected and how the package lands on disk - this
//! captures both as data, so the per-loader modules are thin command pairs over it.
//! The renderer still carries its own loader-id tables in deps.ts; folding those in
//! (and replacing the five command pairs with generic ones) is the next step.

use tauri::AppHandle;

use crate::commands::download::download_file;
use crate::commands::mods::{extract_archive_flat, extract_entry};

/// How a loader's presence is detected. Both variants read the disk only — a loader is
/// never recorded in state.json, so the files themselves are the sole install signal.
pub enum DetectStrategy {
    /// Any one of these files sitting in the game root means the loader is installed.
    RootFiles(&'static [&'static str]),
    /// UE4SS resolves its proxy DLL and destination per (game, launcher) and lives in a
    /// nested Binaries dir, so detection delegates to `ue4ss`'s verified descriptor table
    /// rather than flattening into a root-file list.
    Ue4ssProxy,
}

/// How a loader's package is installed. The URLs are stable redirect endpoints, verified
/// against the real downloads.
pub enum InstallStrategy {
    /// Pull exactly these entries out of the archive into the game root. Used when the
    /// archive carries more than the loader itself, or when only the DLLs are wanted.
    ExtractEntries {
        url: &'static str,
        entries: &'static [&'static str],
    },
    /// Extract the whole archive flat into the game root. Used when the package ships
    /// support files the loader needs (DAHM's framework modules, RAID's Lua basemod).
    ExtractAllFlat { url: &'static str },
    /// No canonical download host - each release is somebody's modworkshop mod page, so
    /// installing goes through the normal mod-install flow instead (see zip.rs's
    /// UE4SS_LOADER sentinel).
    ViaModFlow,
}

pub struct LoaderSpec {
    pub id: &'static str,
    /// modworkshop mod ids this loader is published under. A dependency on one of these
    /// means "install the loader", not "install a mod". Empty for loaders hosted offsite
    /// (SuperBLT has no modworkshop page - the renderer matches it by a name heuristic).
    pub modworkshop_ids: &'static [i64],
    /// Games whose mods can depend on this loader.
    pub games: &'static [&'static str],
    pub detect: DetectStrategy,
    pub install: InstallStrategy,
}

/// The registry as the renderer sees it, so loader ids and their games live in one
/// place instead of being restated in deps.ts.
#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct LoaderInfo {
    pub id: String,
    pub modworkshop_ids: Vec<i64>,
    pub games: Vec<String>,
    /// No direct download - the renderer must route installs through the normal mod
    /// flow rather than calling install_loader.
    pub via_mod_flow: bool,
}

pub static LOADER_REGISTRY: &[LoaderSpec] = &[
    LoaderSpec {
        id: "superblt",
        modworkshop_ids: &[],
        games: &["pd2"],
        // WSOCK32.dll (current), IPHLPAPI.dll (legacy), libsuperblt_loader.so (Linux
        // native). The loader never appears under mods/, so game-root presence is the
        // only reliable signal.
        detect: DetectStrategy::RootFiles(&[
            "WSOCK32.dll",
            "IPHLPAPI.dll",
            "libsuperblt_loader.so",
        ]),
        // Latest-release endpoint from superblt.znix.xyz - 302s to a versioned zip
        // containing exactly WSOCK32.dll. The basemod (mods/base) is fetched by the
        // loader itself on next launch, which is why only the DLL is extracted.
        install: InstallStrategy::ExtractEntries {
            url: "https://sblt-update.znix.xyz/pd2update/download/get.php?src=modrex&id=payday2bltwsockdll",
            entries: &["WSOCK32.dll"],
        },
    },
    LoaderSpec {
        id: "pdth_overrides",
        modworkshop_ids: &[53474],
        games: &["pdth"],
        // DINPUT8.dll is the proxy loader and PDTHModOverrides.dll the payload; only the
        // proxy's presence is the install signal, but both are extracted below.
        detect: DetectStrategy::RootFiles(&["DINPUT8.dll"]),
        install: InstallStrategy::ExtractEntries {
            url: "https://github.com/HW12Dev/PDTHModOverrides/releases/latest/download/PDTHModOverrides.zip",
            entries: &["DINPUT8.dll", "PDTHModOverrides.dll"],
        },
    },
    LoaderSpec {
        id: "dahm",
        modworkshop_ids: &[14267],
        games: &["pdth"],
        detect: DetectStrategy::RootFiles(&["lightfx.dll"]),
        // Stable redirect maintained by DAHM's author - 302s to a versioned ZIP that
        // extracts flat to the game root (it ships ~40 framework modules alongside).
        install: InstallStrategy::ExtractAllFlat {
            url: "https://dahm.neonsynth.de/main.php",
        },
    },
    LoaderSpec {
        id: "raid_superblt",
        modworkshop_ids: &[49744],
        games: &["raid"],
        // IPHLPAPI.dll is also what the discontinued RaidBLT shipped, so its presence
        // means a BLT hook is installed, not necessarily the SuperBLT one. No Linux
        // variant - RAID has no native Linux build.
        detect: DetectStrategy::RootFiles(&["WSOCK32.dll", "IPHLPAPI.dll"]),
        // Stable default-download endpoint of the modworkshop page. Unlike PD2's
        // SuperBLT the zip ships the Lua basemod (mods/base) and updater/ inside, so a
        // full extraction is the complete install.
        install: InstallStrategy::ExtractAllFlat {
            url: "https://api.modworkshop.net/mods/49744/download",
        },
    },
    LoaderSpec {
        id: "ue4ss",
        // Crime Boss (47749) plus PD3's two independently-maintained mod pages
        // (47771 newer, 44048 older) - both PD3 ids must be recognized.
        modworkshop_ids: &[47749, 47771, 44048],
        games: &["cb", "pd3"],
        detect: DetectStrategy::Ue4ssProxy,
        install: InstallStrategy::ViaModFlow,
    },
];

pub fn loader_spec(loader_id: &str) -> Option<&'static LoaderSpec> {
    LOADER_REGISTRY.iter().find(|s| s.id == loader_id)
}

fn spec_or_err(loader_id: &str) -> Result<&'static LoaderSpec, String> {
    loader_spec(loader_id).ok_or_else(|| format!("unknown loader id '{loader_id}'"))
}

/// The whole registry, for the renderer to map dependency ids to loaders without
/// restating the tables.
#[tauri::command]
#[specta::specta]
pub fn list_loaders() -> Vec<LoaderInfo> {
    LOADER_REGISTRY
        .iter()
        .map(|s| LoaderInfo {
            id: s.id.to_string(),
            modworkshop_ids: s.modworkshop_ids.to_vec(),
            games: s.games.iter().map(|g| g.to_string()).collect(),
            via_mod_flow: matches!(s.install, InstallStrategy::ViaModFlow),
        })
        .collect()
}

#[tauri::command]
#[specta::specta]
pub fn check_loader(
    app: AppHandle,
    loader_id: String,
    game_id: String,
    game_path: String,
) -> Result<bool, String> {
    let spec = spec_or_err(&loader_id)?;
    let settings = crate::commands::settings::read_settings(&app);
    let launcher = crate::commands::settings::game_settings(&settings, &game_id)
        .and_then(|gs| gs.launcher.clone());
    Ok(is_loader_installed(
        spec,
        &game_id,
        &game_path,
        launcher.as_deref(),
    ))
}

#[tauri::command]
#[specta::specta]
pub async fn install_loader(
    app: AppHandle,
    loader_id: String,
    game_path: String,
) -> Result<(), String> {
    install_loader_package(spec_or_err(&loader_id)?, &app, &game_path).await
}

/// Whether the loader's files are on disk. `launcher` is only consulted by the UE4SS
/// descriptor table; root-file loaders ignore it.
pub fn is_loader_installed(
    spec: &LoaderSpec,
    game_id: &str,
    game_path: &str,
    launcher: Option<&str>,
) -> bool {
    match spec.detect {
        DetectStrategy::RootFiles(files) => {
            let dir = std::path::Path::new(game_path);
            files.iter().any(|f| dir.join(f).is_file())
        }
        DetectStrategy::Ue4ssProxy => {
            crate::commands::ue4ss::is_installed(game_id, game_path, launcher)
        }
    }
}

/// Downloads a loader package and lays it out per its install strategy. `ViaModFlow`
/// loaders have no canonical URL and never reach this path.
pub async fn install_loader_package(
    spec: &'static LoaderSpec,
    app: &AppHandle,
    game_path: &str,
) -> Result<(), String> {
    let (url, entries) = match spec.install {
        InstallStrategy::ExtractEntries { url, entries } => (url, Some(entries)),
        InstallStrategy::ExtractAllFlat { url } => (url, None),
        InstallStrategy::ViaModFlow => {
            return Err(format!(
                "loader '{}' installs through the normal mod flow, not a direct download",
                spec.id
            ))
        }
    };

    let download_id = format!("loader:{}", spec.id);
    let zip_path = download_file(app, url, "zip", &download_id).await?;
    let dest_dir = std::path::Path::new(game_path).to_path_buf();

    let result = match entries {
        Some(entries) => {
            let mut outcome = Ok(());
            for name in entries {
                let zip = zip_path.clone();
                let dest = dest_dir.join(name);
                let entry = name.to_string();
                outcome = tokio::task::spawn_blocking(move || extract_entry(&zip, &entry, &dest))
                    .await
                    .map_err(|e| e.to_string())?;
                if outcome.is_err() {
                    break;
                }
            }
            outcome
        }
        None => {
            let zip = zip_path.clone();
            tokio::task::spawn_blocking(move || extract_archive_flat(&zip, &dest_dir))
                .await
                .map_err(|e| e.to_string())?
        }
    };

    let _ = tokio::fs::remove_file(&zip_path).await;
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn loader_ids_are_unique() {
        let mut ids: Vec<&str> = LOADER_REGISTRY.iter().map(|s| s.id).collect();
        ids.sort_unstable();
        ids.dedup();
        assert_eq!(ids.len(), LOADER_REGISTRY.len());
    }

    /// Every module that fronts a loader resolves its spec by id at call time, so a
    /// renamed or dropped entry must fail here rather than at the user's first click.
    #[test]
    fn every_fronted_loader_id_resolves() {
        for id in [
            "superblt",
            "pdth_overrides",
            "dahm",
            "raid_superblt",
            "ue4ss",
        ] {
            assert!(loader_spec(id).is_some(), "{id} is not in LOADER_REGISTRY");
        }
    }
}

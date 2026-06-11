mod epic;
mod games;
mod steam;
mod types;
mod xbox;

use epic::Epic;
use games::{PD2, PD3, PDTH};
use steam::Steam;
use types::{GameDef, Launcher};
use xbox::Xbox;

use crate::commands::mods::{backup_dir, engine_for_game, mods_base};
use crate::commands::settings::{game_settings, read_settings, write_settings};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::AppHandle;

static STEAM: Steam = Steam;
static EPIC: Epic = Epic;
static XBOX: Xbox = Xbox;

fn all_launchers() -> [&'static dyn Launcher; 3] {
    [&STEAM, &EPIC, &XBOX]
}

fn game_def_for_id(game_id: &str) -> &'static GameDef {
    match game_id {
        "pd2" => &PD2,
        "pdth" => &PDTH,
        _ => &PD3,
    }
}

fn detect_game(game: &'static GameDef) -> Option<DetectedGame> {
    for launcher in all_launchers() {
        if !launcher.is_installed() {
            continue;
        }
        if let Some(path) = launcher.find_game(game) {
            return Some(DetectedGame { launcher: launcher.id().to_string(), game_path: path });
        }
    }
    None
}

// ── OS helpers ────────────────────────────────────────────────────────────────

pub(super) fn open_url(url: &str) {
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("cmd")
            .args(["/c", "start", "", url])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

fn open_path_on_system(path: &str) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(path).spawn();
    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("xdg-open").arg(path).spawn();
}

// ── Orchestration ─────────────────────────────────────────────────────────────

pub fn identify_launcher_for_path(game_path: &str) -> String {
    for launcher in all_launchers() {
        if launcher.identify_path(game_path) {
            return launcher.id().to_string();
        }
    }
    "manual".to_string()
}

fn launch_with(launcher_id: &str, game: &'static GameDef, game_path: &str, opts: Option<&str>) {
    if let Some(launcher) = all_launchers().iter().find(|l| l.id() == launcher_id) {
        launcher.launch(game, game_path, opts);
    } else {
        let exe = Path::new(game_path).join(game.executable);
        let args: Vec<&str> = opts.map(|o| o.split_whitespace().collect()).unwrap_or_default();
        if let Err(e) = std::process::Command::new(&exe).args(&args).spawn() {
            log::warn!("launch_game: spawn {exe:?}: {e}");
        }
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGame {
    pub launcher: String,
    pub game_path: String,
}

#[tauri::command]
pub fn auto_detect_game(game_id: Option<String>) -> Option<DetectedGame> {
    detect_game(game_def_for_id(game_id.as_deref().unwrap_or("pd3")))
}

#[tauri::command]
pub fn installed_launchers(game_id: Option<String>) -> Vec<String> {
    let game = game_def_for_id(game_id.as_deref().unwrap_or("pd3"));
    all_launchers()
        .iter()
        .filter(|l| l.find_game(game).is_some())
        .map(|l| l.id().to_string())
        .collect()
}

#[tauri::command]
pub fn identify_launcher(game_path: String) -> String {
    identify_launcher_for_path(&game_path)
}

#[tauri::command]
pub fn configure_game_path(app: AppHandle, game_id: Option<String>, game_path: Option<String>) {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    let game_def = game_def_for_id(&game_id);
    let mut s = read_settings(&app);
    let games = s.games.get_or_insert_with(HashMap::new);
    let entry = games.entry(game_id).or_default();
    if let Some(ref path) = game_path {
        entry.game_path = Some(path.clone());
        entry.launcher = Some(identify_launcher_for_path(path));
    } else {
        // Validate existing saved path before falling back to auto-detect.
        if let Some(ref path) = entry.game_path.clone() {
            if Path::new(path).join(game_def.executable).exists() {
                // Re-running identify_launcher_for_path on every focus clobbers games without marker files.
                if entry.launcher.is_none() {
                    entry.launcher = Some(identify_launcher_for_path(path));
                }
            } else if let Some(detected) = detect_game(game_def) {
                entry.game_path = Some(detected.game_path);
                entry.launcher = Some(detected.launcher);
            } else {
                entry.game_path = None;
                entry.launcher = None;
            }
        } else if let Some(detected) = detect_game(game_def) {
            entry.game_path = Some(detected.game_path);
            entry.launcher = Some(detected.launcher);
        } else {
            entry.game_path = None;
            entry.launcher = None;
        }
    }
    write_settings(&app, &s);
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle, default_path: Option<String>) -> Option<String> {
    use tauri_plugin_dialog::DialogExt;
    tauri::async_runtime::spawn_blocking(move || {
        let mut builder = app
            .dialog()
            .file()
            .set_title(format!("Select {} installation folder", PD3.name));
        if let Some(ref path) = default_path {
            builder = builder.set_directory(path);
        }
        builder.blocking_pick_folder().map(|p| p.to_string())
    })
    .await
    .ok()?
}

fn do_restore(game_path: &str, cfg: &crate::commands::mods::ModEngineConfig) -> Result<(), String> {
    let mods_dir = mods_base(game_path, cfg);
    let mods_bak = backup_dir(game_path, cfg.primary());

    if !mods_bak.exists() {
        return Ok(());
    }

    if cfg.primary().is_directory_unit() {
        let _ = fs::create_dir_all(&mods_dir);
        if let Ok(entries) = fs::read_dir(&mods_bak) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let _ = fs::rename(mods_bak.join(&name), mods_dir.join(&name));
            }
        }
        // remove_dir no-ops when non-empty, so any entry that failed to rename is never deleted.
        fs::remove_dir(&mods_bak).ok();
    } else if !mods_dir.exists() {
        fs::rename(&mods_bak, &mods_dir).map_err(|e| {
            format!(
                "Could not restore mods folder. You may need to manually rename the backup folder. ({})",
                e.kind()
            )
        })?;
    } else {
        fs::remove_dir_all(&mods_bak).ok();
    }
    Ok(())
}

#[tauri::command]
pub fn launch_game(app: AppHandle, game_id: Option<String>) {
    let game_id = game_id.as_deref().unwrap_or("pd3");
    let s = read_settings(&app);
    let Some(gs) = game_settings(&s, game_id) else { return };
    let Some(ref game_path) = gs.game_path else { return };
    let cfg = engine_for_game(game_id);
    let _ = do_restore(game_path, cfg);
    launch_with(gs.launcher.as_deref().unwrap_or("steam"), game_def_for_id(game_id), game_path, gs.launch_options.as_deref());
}

#[tauri::command]
pub fn launch_without_mods(app: AppHandle, game_id: Option<String>) -> Result<(), String> {
    let game_id = game_id.as_deref().unwrap_or("pd3");
    let s = read_settings(&app);
    let Some(gs) = game_settings(&s, game_id) else { return Ok(()) };
    let Some(ref game_path) = gs.game_path else { return Ok(()) };

    let cfg = engine_for_game(game_id);
    let mods_dir = mods_base(game_path, cfg);
    let mods_bak = backup_dir(game_path, cfg.primary());

    if !mods_bak.exists() {
        if cfg.primary().is_directory_unit() {
            if mods_dir.exists() {
                fs::create_dir(&mods_bak).map_err(|e| {
                    format!(
                        "Could not create backup folder — try running as administrator. ({})",
                        e.kind()
                    )
                })?;
                if let Ok(entries) = fs::read_dir(&mods_dir) {
                    for entry in entries.flatten() {
                        if !entry.file_type().map(|t| t.is_dir()).unwrap_or(false) {
                            continue;
                        }
                        if entry.file_name().to_string_lossy() == "base" {
                            continue; // BLT recreates base/ if missing, showing a "base mod missing" dialog
                        }
                        let _ = fs::rename(
                            mods_dir.join(entry.file_name()),
                            mods_bak.join(entry.file_name()),
                        );
                    }
                }
            }
        } else if mods_dir.exists() {
            fs::rename(&mods_dir, &mods_bak).map_err(|e| {
                format!(
                    "Could not hide mods folder — the game may still have files open. Close the game first and try again. ({})",
                    e.kind()
                )
            })?;
        }
    }

    launch_with(
        gs.launcher.as_deref().unwrap_or("steam"),
        game_def_for_id(game_id),
        game_path,
        gs.launch_options.as_deref(),
    );
    Ok(())
}

#[tauri::command]
pub fn restore_mods(app: AppHandle, game_id: Option<String>) -> Result<(), String> {
    let game_id = game_id.as_deref().unwrap_or("pd3");
    let s = read_settings(&app);
    let Some(gs) = game_settings(&s, game_id) else { return Ok(()) };
    let Some(ref game_path) = gs.game_path else { return Ok(()) };
    let cfg = engine_for_game(game_id);
    do_restore(game_path, cfg)
}

#[tauri::command]
pub fn is_game_running(game_id: Option<String>) -> bool {
    let process_name = game_def_for_id(game_id.as_deref().unwrap_or("pd3")).process_name;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let filter = format!("IMAGENAME eq {}.exe", process_name);
        std::process::Command::new("tasklist")
            .args(["/FI", &filter, "/NH"])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains(process_name))
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("pgrep")
            .args(["-f", process_name])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

#[tauri::command]
pub fn stop_game(game_id: Option<String>) {
    let process_name = game_def_for_id(game_id.as_deref().unwrap_or("pd3")).process_name;
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/IM", &format!("{}.exe", process_name)])
            .creation_flags(0x08000000) // CREATE_NO_WINDOW
            .output();
    }
    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("pkill")
        .args(["-f", process_name])
        .output();
}

#[tauri::command]
pub fn shell_open_external(url: String) {
    open_url(&url);
}

#[tauri::command]
pub fn shell_open_path(path: String) {
    open_path_on_system(&path);
}

#[tauri::command]
pub fn open_log_file(app: AppHandle) {
    use tauri::Manager;
    let Ok(log_dir) = app.path().app_log_dir() else { return };
    let log_file = log_dir.join(format!("{}.log", app.package_info().name));
    if let Ok(content) = std::fs::read_to_string(&log_file) {
        let snapshot = std::env::temp_dir().join("modrex_log.txt");
        if std::fs::write(&snapshot, content).is_ok() {
            open_url(&snapshot.to_string_lossy());
            return;
        }
    }
    open_path_on_system(&log_dir.to_string_lossy());
}

#[cfg(test)]
#[path = "mod_tests.rs"]
mod tests;

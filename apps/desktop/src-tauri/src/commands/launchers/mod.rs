mod epic;
mod games;
mod steam;
mod types;
mod xbox;

use epic::Epic;
pub(crate) use games::{CRIMEBOSS, PD2, PD3, PDTH, RAID};
use steam::Steam;
pub(crate) use types::GameDef;
use types::Launcher;
use xbox::Xbox;

use crate::commands::mods::{backup_dir, engine_for_game, mods_base};
use crate::commands::settings::{game_settings, read_settings, update_settings, GameSettings};
use serde::Serialize;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use tauri::AppHandle;

static STEAM: Steam = Steam;
static EPIC: Epic = Epic;
static XBOX: Xbox = Xbox;

const PD3_XBOX_CRASH_REPORTER_FILES: &[&str] = &["BsSndRpt64.exe", "BugSplatRc64.dll"];

fn all_launchers() -> [&'static dyn Launcher; 3] {
    [&STEAM, &EPIC, &XBOX]
}

fn game_def_for_id(game_id: &str) -> Result<&'static GameDef, String> {
    crate::commands::games::game_spec(game_id)
        .map(|s| s.def)
        .ok_or_else(|| format!("unknown game id '{game_id}'"))
}

// A stalled find_game leaves no trace in Modrex.log without the probe line before it.
fn detect_game(game: &'static GameDef) -> Option<DetectedGame> {
    for launcher in all_launchers() {
        if !launcher.is_installed() {
            continue;
        }
        log::info!("probing {} for {}", launcher.id(), game.name);
        if let Some(path) = launcher.find_game(game) {
            log::info!("found {} via {}: {path}", game.name, launcher.id());
            return Some(DetectedGame {
                launcher: launcher.id().to_string(),
                game_path: path,
            });
        }
    }
    None
}

// ── OS helpers ────────────────────────────────────────────────────────────────

// reg and Get-AppxPackage hang forever when their backing service is wedged —
// poll with a deadline and kill instead of .output()'s unbounded wait. Callers'
// output is a single line, so reading stdout only after exit can't fill the pipe.
#[cfg(target_os = "windows")]
pub(super) fn run_bounded(
    mut cmd: std::process::Command,
    timeout: std::time::Duration,
) -> Option<String> {
    use std::io::Read;
    use std::os::windows::process::CommandExt;
    let mut child = cmd
        .creation_flags(0x08000000) // CREATE_NO_WINDOW
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::null())
        .spawn()
        .ok()?;
    let deadline = std::time::Instant::now() + timeout;
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                let mut out = String::new();
                if let Some(mut stdout) = child.stdout.take() {
                    let _ = stdout.read_to_string(&mut out);
                }
                return Some(out);
            }
            Ok(None) if std::time::Instant::now() >= deadline => {
                log::warn!("detection subprocess timed out after {timeout:?}: {cmd:?}");
                let _ = child.kill();
                return None;
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Err(_) => return None,
        }
    }
}

pub(super) fn open_url(url: &str) {
    // Never route this through cmd /c start: cmd re-parses its command line,
    // so a & in a query string truncates the URL there and executes what
    // follows as a command, and %..% sequences risk variable expansion.
    // explorer.exe is no good either: it validates its argument and falls back
    // to opening the Documents folder for URLs it considers malformed, which
    // includes query strings. rundll32's FileProtocolHandler takes the URL as
    // one argument and hands it to the shell's URL handler unmodified.
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("rundll32")
        .args(["url.dll,FileProtocolHandler", url])
        .spawn();
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
        let exe_name = game
            .resolve_executable(game_path)
            .unwrap_or(game.executables[0]);
        let exe = Path::new(game_path).join(exe_name);
        let args: Vec<&str> = opts
            .map(|o| o.split_whitespace().collect())
            .unwrap_or_default();
        if let Err(e) = std::process::Command::new(&exe).args(&args).spawn() {
            log::warn!("launch_game: spawn {exe:?}: {e}");
        }
    }
}

fn pd3_xbox_crash_reporter_dir(game_path: &Path) -> std::path::PathBuf {
    game_path.join("PAYDAY3").join("Binaries").join("WinGDK")
}

fn remove_pd3_xbox_crash_reporter_files(game_path: &str) {
    let game_path = Path::new(game_path);
    let dir = pd3_xbox_crash_reporter_dir(game_path);

    for filename in PD3_XBOX_CRASH_REPORTER_FILES {
        let file = dir.join(filename);
        if !file.starts_with(game_path) || !file.exists() {
            continue;
        }
        match fs::remove_file(&file) {
            Ok(()) => log::info!("removed PAYDAY 3 Xbox crash reporter file {file:?}"),
            Err(e) => log::warn!("remove PAYDAY 3 Xbox crash reporter file {file:?}: {e}"),
        }
    }
}

fn maybe_suppress_crash_reporter(game_id: &str, settings: &GameSettings) {
    if game_id != "pd3"
        || settings.launcher.as_deref() != Some("xbox")
        || settings.suppress_crash_reporter != Some(true)
    {
        return;
    }

    if let Some(game_path) = settings.game_path.as_deref() {
        remove_pd3_xbox_crash_reporter_files(game_path);
    }
}

// ── Tauri commands ────────────────────────────────────────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DetectedGame {
    pub launcher: String,
    pub game_path: String,
}

// Detection stats paths on every drive and Steam library, which blocks for the
// SMB timeout on a dead network drive, sync commands run on the main thread,
// so all detection work goes through spawn_blocking.
#[tauri::command]
#[specta::specta]
pub async fn installed_launchers(game_id: String) -> Result<Vec<String>, String> {
    let game = game_def_for_id(game_id.as_str())?;
    tauri::async_runtime::spawn_blocking(move || {
        let mut found = Vec::new();
        for launcher in all_launchers() {
            if !launcher.is_installed() {
                continue;
            }
            log::info!("probing {} for {}", launcher.id(), game.name);
            if launcher.find_game(game).is_some() {
                found.push(launcher.id().to_string());
            }
        }
        found
    })
    .await
    .map_err(|e| e.to_string())
}

fn resolve_and_save_game_path(
    app: &AppHandle,
    game_id: String,
    game_path: Option<String>,
) -> Result<(), String> {
    let game_def = game_def_for_id(&game_id)?;
    // Path validation and detection can stall for seconds (SMB timeouts, wedged
    // services), so resolve first and only take the settings lock to apply the
    // result — sync commands on the main thread must never wait behind a probe.
    let (resolved_path, resolved_launcher) = if let Some(path) = game_path {
        let launcher = identify_launcher_for_path(&path);
        (Some(path), Some(launcher))
    } else {
        let existing = game_settings(&read_settings(app), &game_id)
            .cloned()
            .unwrap_or_default();
        // Validate existing saved path before falling back to auto-detect.
        let exe_exists = existing
            .game_path
            .as_deref()
            .is_some_and(|p| game_def.resolve_executable(p).is_some());
        if exe_exists {
            // Re-running identify_launcher_for_path on every focus clobbers games without marker files.
            let launcher = existing.launcher.or_else(|| {
                existing
                    .game_path
                    .as_deref()
                    .map(identify_launcher_for_path)
            });
            (existing.game_path, launcher)
        } else if let Some(detected) = detect_game(game_def) {
            (Some(detected.game_path), Some(detected.launcher))
        } else {
            (None, None)
        }
    };
    update_settings(app, |s| {
        let entry = s
            .games
            .get_or_insert_with(HashMap::new)
            .entry(game_id)
            .or_default();
        entry.game_path = resolved_path;
        entry.launcher = resolved_launcher;
    });
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub async fn configure_game_path(app: AppHandle, game_id: String, game_path: Option<String>) {
    let _ = tauri::async_runtime::spawn_blocking(move || {
        resolve_and_save_game_path(&app, game_id, game_path)
    })
    .await;
}

#[tauri::command]
#[specta::specta]
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

// Loader-created runtime dirs safe to drop from a stranded backup on restore: pure caches/logs the
// loader regenerates. Deliberately narrower than a target's full excluded_names: saves/ (mod
// user data) and base/ are on that list too but must never be auto-deleted.
const DISPOSABLE_BACKUP_DIRS: &[&str] = &["logs", "downloads"];

fn do_restore(game_path: &str, cfg: &crate::commands::mods::ModEngineConfig) -> Result<(), String> {
    for target in cfg.targets {
        let mods_dir = mods_base(game_path, target);
        let mods_bak = backup_dir(game_path, target);

        if !mods_bak.exists() {
            continue;
        }

        if target.is_directory_unit() {
            let _ = fs::create_dir_all(&mods_dir);
            if let Ok(entries) = fs::read_dir(&mods_bak) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let dest = mods_dir.join(&name);
                    // Self-heal installs stranded by the pre-fix behaviour: a disposable runtime dir
                    // (BLT's logs/downloads) backed up by an older build, then recreated in mods/
                    // while the game ran, can't rename back over the fresh copy, which strands
                    // mods.bak and pins the "mods hidden" banner. These are regenerated caches, not
                    // mods, so drop the stale backup so mods.bak can clear. Deliberately excludes
                    // saves/ (mod-persisted user data) and base/: those are never auto-deleted.
                    let name_str = name.to_string_lossy();
                    if dest.exists()
                        && target.excluded_names().contains(&name_str.as_ref())
                        && DISPOSABLE_BACKUP_DIRS.contains(&name_str.as_ref())
                    {
                        fs::remove_dir_all(mods_bak.join(&name)).ok();
                        continue;
                    }
                    let _ = fs::rename(mods_bak.join(&name), dest);
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
    }
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn launch_game(app: AppHandle, game_id: String) -> Result<(), String> {
    let game_id = game_id.as_str();
    let s = read_settings(&app);
    let Some(gs) = game_settings(&s, game_id) else {
        return Ok(());
    };
    let Some(ref game_path) = gs.game_path else {
        return Ok(());
    };
    let cfg = engine_for_game(game_id)?;
    let _ = do_restore(game_path, cfg);
    maybe_suppress_crash_reporter(game_id, gs);
    crate::commands::analytics::track(
        &app,
        "game_launched",
        serde_json::json!({ "game": game_id, "launcher": gs.launcher.as_deref().unwrap_or("steam") }),
    );
    launch_with(
        gs.launcher.as_deref().unwrap_or("steam"),
        game_def_for_id(game_id)?,
        game_path,
        gs.launch_options.as_deref(),
    );
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn launch_without_mods(app: AppHandle, game_id: String) -> Result<(), String> {
    let game_id = game_id.as_str();
    let s = read_settings(&app);
    let Some(gs) = game_settings(&s, game_id) else {
        return Ok(());
    };
    let Some(ref game_path) = gs.game_path else {
        return Ok(());
    };

    let cfg = engine_for_game(game_id)?;
    for (i, target) in cfg.targets.iter().enumerate() {
        let mods_dir = mods_base(game_path, target);
        let mods_bak = backup_dir(game_path, target);

        if mods_bak.exists() {
            continue;
        }

        if target.is_directory_unit() {
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
                        let name = entry.file_name();
                        let name = name.to_string_lossy();
                        if i == 0 && name == "base" {
                            continue; // BLT recreates base/ if missing, showing a "base mod missing" dialog
                        }
                        // Never back up runtime/infra folders (RAID's downloads/logs/saves): the
                        // game recreates them in mods/ while running, so a restore would then fail
                        // to rename the backed-up copy over the fresh one, stranding mods.bak and
                        // pinning the "mods hidden" banner on forever.
                        if target.excluded_names().contains(&name.as_ref()) {
                            continue;
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

    crate::commands::analytics::track(
        &app,
        "launch_without_mods",
        serde_json::json!({ "game": game_id, "launcher": gs.launcher.as_deref().unwrap_or("steam") }),
    );
    maybe_suppress_crash_reporter(game_id, gs);
    launch_with(
        gs.launcher.as_deref().unwrap_or("steam"),
        game_def_for_id(game_id)?,
        game_path,
        gs.launch_options.as_deref(),
    );
    Ok(())
}

#[tauri::command]
#[specta::specta]
pub fn restore_mods(app: AppHandle, game_id: String) -> Result<(), String> {
    let game_id = game_id.as_str();
    let s = read_settings(&app);
    let Some(gs) = game_settings(&s, game_id) else {
        return Ok(());
    };
    let Some(ref game_path) = gs.game_path else {
        return Ok(());
    };
    let cfg = engine_for_game(game_id)?;
    do_restore(game_path, cfg)
}

// Native process enumeration (NtQuerySystemInformation / /proc) — never spawns
// tasklist/pgrep, so a wedged WMI service or missing procps can't hang the UI.
fn refresh_process_list() -> sysinfo::System {
    let mut sys = sysinfo::System::new();
    let kind = sysinfo::ProcessRefreshKind::nothing();
    // cmdlines are only needed to see through Proton/wine wrapper process names;
    // on Windows the process name is always the exe name
    #[cfg(not(windows))]
    let kind = kind.with_cmd(sysinfo::UpdateKind::Always);
    sys.refresh_processes_specifics(sysinfo::ProcessesToUpdate::All, true, kind);
    sys
}

// The on-disk name may carry `.exe` (Windows, Proton) and Linux /proc truncates
// names to 15 chars, so prefix-match the name; the command-line fallback keeps
// the old `pgrep -f` behavior for games launched through Proton/Wine wrappers.
fn matches_process(name: &str, cmd: &[String], process_name: &str) -> bool {
    name.starts_with(process_name) || cmd.iter().any(|c| c.contains(process_name))
}

fn process_matches(p: &sysinfo::Process, process_name: &str) -> bool {
    let cmd: Vec<String> = p
        .cmd()
        .iter()
        .map(|c| c.to_string_lossy().into_owned())
        .collect();
    matches_process(&p.name().to_string_lossy(), &cmd, process_name)
}

#[tauri::command]
#[specta::specta]
pub async fn is_game_running(game_id: String) -> Result<bool, String> {
    let process_names = game_def_for_id(game_id.as_str())?.process_names;
    tauri::async_runtime::spawn_blocking(move || {
        let sys = refresh_process_list();
        sys.processes()
            .values()
            .any(|p| process_names.iter().any(|n| process_matches(p, n)))
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
#[specta::specta]
pub fn stop_game(game_id: String) -> Result<(), String> {
    let process_names = game_def_for_id(game_id.as_str())?.process_names;
    let sys = refresh_process_list();
    for p in sys
        .processes()
        .values()
        .filter(|p| process_names.iter().any(|n| process_matches(p, n)))
    {
        p.kill();
    }
    Ok(())
}

/// Returns the URL only if it is safe to hand to the OS shell: an `http`, `https`, or
/// `mailto` URL containing no characters that could break out of the Windows `cmd /c start`
/// invocation. Links come from untrusted mod authors, so this gates every external open.
fn sanitize_external_url(url: &str) -> Option<&str> {
    if url.contains(['"', '\n', '\r']) {
        return None;
    }
    let scheme = reqwest::Url::parse(url).ok()?.scheme().to_string();
    matches!(scheme.as_str(), "http" | "https" | "mailto").then_some(url)
}

#[tauri::command]
#[specta::specta]
pub fn shell_open_external(url: String) {
    if let Some(safe) = sanitize_external_url(&url) {
        open_url(safe);
    }
}

#[tauri::command]
#[specta::specta]
pub fn shell_open_path(path: String) {
    open_path_on_system(&path);
}

#[tauri::command]
#[specta::specta]
pub fn open_log_file(app: AppHandle) {
    use tauri::Manager;
    let Ok(log_dir) = app.path().app_log_dir() else {
        return;
    };
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

#[tauri::command]
#[specta::specta]
pub fn open_data_folder(app: AppHandle) {
    use tauri::Manager;
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    open_path_on_system(&dir.to_string_lossy());
}

#[tauri::command]
#[specta::specta]
pub fn open_app_folder() {
    let Ok(exe) = std::env::current_exe() else {
        return;
    };
    let Some(dir) = exe.parent() else {
        return;
    };
    open_path_on_system(&dir.to_string_lossy());
}

#[cfg(test)]
#[path = "mod_tests.rs"]
mod tests;

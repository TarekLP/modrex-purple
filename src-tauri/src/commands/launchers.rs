use crate::commands::mods::mods_base;
use crate::commands::settings::{read_settings, write_settings};
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
use tauri::AppHandle;

// ── PD3 game constants ────────────────────────────────────────────────────────

const STEAM_APP_ID: u32 = 1272080;
const STEAM_FOLDER_NAME: &str = "PAYDAY3";
const EPIC_DISPLAY_NAME: &str = "PAYDAY 3";
const XBOX_PRODUCT_ID: &str = "9NPZVDCH73SX";
const GAME_NAME: &str = "PAYDAY 3";
const GAME_EXECUTABLE: &str = "PAYDAY3.exe";
const XBOX_GAME_EXECUTABLE: &str = "PAYDAY3/Binaries/WinGDK/PAYDAY3-WinGDK-Shipping.exe";
const XBOX_GAMING_APP: &str = "Microsoft.GamingApp_8wekyb3d8bbwe";
const XBOX_DRIVES: &[&str] = &["C", "D", "E", "F", "G"];

// ── OS helpers ────────────────────────────────────────────────────────────────

fn open_url(url: &str) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("cmd").args(["/c", "start", "", url]).spawn();
    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("xdg-open").arg(url).spawn();
}

fn open_path_on_system(path: &str) {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("explorer").arg(path).spawn();
    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("xdg-open").arg(path).spawn();
}

// ── Steam ─────────────────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn steam_install_path() -> Option<String> {
    let out = std::process::Command::new("reg")
        .args(["query", "HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam", "/v", "InstallPath"])
        .output()
        .ok()?;
    let text = String::from_utf8_lossy(&out.stdout);
    let line = text.lines().find(|l| l.contains("InstallPath") && l.contains("REG_SZ"))?;
    let value = line.split("REG_SZ").nth(1)?.trim().to_string();
    if value.is_empty() { None } else { Some(value) }
}

#[cfg(not(target_os = "windows"))]
fn steam_install_path() -> Option<String> {
    let home = std::env::var("HOME").unwrap_or_default();
    let xdg = std::env::var("XDG_DATA_HOME").unwrap_or_else(|_| format!("{}/.local/share", home));
    let steam_dir = std::env::var("STEAM_DIR").ok();
    let candidates: Vec<String> = [
        steam_dir,
        Some(format!("{}/Steam", xdg)),
        Some(format!("{}/.steam/steam", home)),
        Some(format!("{}/.steam/Steam", home)),
        Some(format!("{}/snap/steam/common/.local/share/Steam", home)),
        Some(format!("{}/.var/app/com.valvesoftware.Steam/.local/share/Steam", home)),
    ]
    .into_iter()
    .flatten()
    .collect();
    candidates.into_iter().find(|p| Path::new(p).join("steamapps").exists())
}

fn steam_libraries(steam_path: &str) -> Vec<String> {
    let vdf = Path::new(steam_path).join("steamapps").join("libraryfolders.vdf");
    let mut paths = vec![steam_path.to_string()];
    if let Ok(content) = fs::read_to_string(vdf) {
        for line in content.lines() {
            let line = line.trim();
            if line.contains("\"path\"") {
                if let Some(p) = line.split('"').nth(3) {
                    paths.push(p.replace("\\\\", "\\"));
                }
            }
        }
    }
    paths
}

fn steam_game_path() -> Option<String> {
    let steam_path = steam_install_path()?;
    for lib in steam_libraries(&steam_path) {
        let candidate = Path::new(&lib).join("steamapps").join("common").join(STEAM_FOLDER_NAME);
        if candidate.exists() {
            return Some(candidate.to_string_lossy().into_owned());
        }
    }
    None
}

fn steam_launch(opts: Option<&str>) {
    let trimmed = opts.map(|o| o.trim()).filter(|o| !o.is_empty());
    if let (Some(opts_str), Some(steam_path)) = (trimmed, steam_install_path()) {
        #[cfg(target_os = "windows")]
        let exe = Path::new(&steam_path).join("steam.exe").to_string_lossy().into_owned();
        #[cfg(not(target_os = "windows"))]
        let exe = {
            let sh = Path::new(&steam_path).join("steam.sh");
            if sh.exists() { sh.to_string_lossy().into_owned() } else { "steam".to_string() }
        };
        let mut args = vec!["-applaunch".to_string(), STEAM_APP_ID.to_string()];
        args.extend(opts_str.split_whitespace().map(String::from));
        let _ = std::process::Command::new(&exe).args(&args).spawn();
    } else {
        open_url(&format!("steam://rungameid/{}", STEAM_APP_ID));
    }
}

// ── Epic ──────────────────────────────────────────────────────────────────────

fn epic_manifest_dir() -> PathBuf {
    let prog_data = std::env::var("PROGRAMDATA").unwrap_or_else(|_| "C:\\ProgramData".to_string());
    PathBuf::from(prog_data)
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests")
}

fn epic_find_game() -> Option<(String, String)> {
    let manifest_dir = epic_manifest_dir();
    if !manifest_dir.exists() { return None; }
    for entry in fs::read_dir(&manifest_dir).ok()?.flatten() {
        let path = entry.path();
        if path.extension().and_then(|e| e.to_str()) != Some("item") { continue; }
        let content = fs::read_to_string(&path).unwrap_or_default();
        if content.trim().is_empty() { continue; }
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&content) {
            if v["DisplayName"].as_str() == Some(EPIC_DISPLAY_NAME) {
                let location = v["InstallLocation"].as_str()?.to_string();
                let app_name = v["AppName"].as_str().unwrap_or("").to_string();
                return Some((location, app_name));
            }
        }
    }
    None
}

fn epic_game_path() -> Option<String> {
    epic_find_game().map(|(loc, _)| loc)
}

fn epic_launch() {
    if let Some((_, app_name)) = epic_find_game() {
        open_url(&format!(
            "com.epicgames.launcher://apps/{}?action=launch&silent=true",
            app_name
        ));
    }
}

// ── Xbox ──────────────────────────────────────────────────────────────────────

fn xbox_is_installed() -> bool {
    #[cfg(not(target_os = "windows"))]
    return false;
    #[cfg(target_os = "windows")]
    {
        let local = std::env::var("LOCALAPPDATA")
            .unwrap_or_else(|_| "C:\\Users\\Default\\AppData\\Local".to_string());
        Path::new(&local).join("Packages").join(XBOX_GAMING_APP).exists()
    }
}

fn xbox_find_in_drives() -> Option<String> {
    for drive in XBOX_DRIVES {
        let drive_root = PathBuf::from(format!("{}:\\", drive));
        if !drive_root.exists() {
            continue;
        }
        let dirs = match fs::read_dir(&drive_root) {
            Ok(d) => d,
            Err(_) => continue,
        };
        for entry in dirs.flatten() {
            let candidate = entry.path().join(GAME_NAME).join("Content");
            if candidate.join(XBOX_GAME_EXECUTABLE).exists() {
                return Some(candidate.to_string_lossy().into_owned());
            }
        }
    }
    None
}

#[cfg(target_os = "windows")]
fn xbox_find_via_package_manager() -> Option<String> {
    let script = format!(
        "$p=Get-AppxPackage|?{{$c=Join-Path $_.InstallLocation 'Content\\MicrosoftGame.config';(Test-Path $c)-and((gc $c -Raw)-match '{}')}}|Select -First 1;if($p){{Join-Path $p.InstallLocation 'Content'}}",
        XBOX_PRODUCT_ID
    );
    let out = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .output()
        .ok()?;
    let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
    if path.is_empty() {
        return None;
    }
    if Path::new(&path).join(XBOX_GAME_EXECUTABLE).exists() {
        Some(path)
    } else {
        None
    }
}

fn xbox_game_path() -> Option<String> {
    if let Some(p) = xbox_find_in_drives() {
        return Some(p);
    }
    #[cfg(target_os = "windows")]
    {
        xbox_find_via_package_manager()
    }
    #[cfg(not(target_os = "windows"))]
    None
}

fn xbox_launch(game_path: &str) {
    let helper = Path::new(game_path).join("gamelaunchhelper.exe");
    if helper.exists() {
        let child = std::process::Command::new(&helper)
            .spawn();
        drop(child);
    } else {
        open_url(&format!("msxbox://game/?productId={}", XBOX_PRODUCT_ID));
    }
}

// ── Launcher logic ────────────────────────────────────────────────────────────

pub fn identify_launcher_for_path(game_path: &str) -> String {
    if Path::new(game_path).join("steam_appid.txt").exists() {
        return "steam".to_string();
    }
    if Path::new(game_path).join(".egstore").exists() {
        return "epic".to_string();
    }
    if Path::new(game_path).join("MicrosoftGame.config").exists() {
        return "xbox".to_string();
    }
    "manual".to_string()
}

fn launcher_has_game(launcher: &str) -> bool {
    match launcher {
        "steam" => steam_game_path().is_some(),
        "epic" => epic_game_path().is_some(),
        "xbox" => xbox_game_path().is_some(),
        _ => false,
    }
}

fn launch_with(launcher: &str, game_path: &str, opts: Option<&str>) {
    match launcher {
        "steam" => steam_launch(opts),
        "epic" => epic_launch(),
        "xbox" => xbox_launch(game_path),
        _ => {
            let exe = Path::new(game_path).join(GAME_EXECUTABLE);
            let args: Vec<&str> =
                opts.map(|o| o.split_whitespace().collect()).unwrap_or_default();
            let _ = std::process::Command::new(&exe).args(&args).spawn();
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
pub fn auto_detect_game() -> Option<DetectedGame> {
    if let Some(path) = steam_game_path() {
        return Some(DetectedGame { launcher: "steam".to_string(), game_path: path });
    }
    if let Some(path) = epic_game_path() {
        return Some(DetectedGame { launcher: "epic".to_string(), game_path: path });
    }
    if xbox_is_installed() {
        if let Some(path) = xbox_game_path() {
            return Some(DetectedGame { launcher: "xbox".to_string(), game_path: path });
        }
    }
    None
}

#[tauri::command]
pub fn installed_launchers() -> Vec<String> {
    ["steam", "epic", "xbox"]
        .iter()
        .filter(|&&l| launcher_has_game(l))
        .map(|&l| l.to_string())
        .collect()
}

#[tauri::command]
pub fn identify_launcher(game_path: String) -> String {
    identify_launcher_for_path(&game_path)
}

#[tauri::command]
pub fn configure_game_path(app: AppHandle, game_path: Option<String>) {
    let mut s = read_settings(&app);
    if let Some(ref path) = game_path {
        s.game_path = Some(path.clone());
        s.launcher = Some(identify_launcher_for_path(path));
    } else {
        if let Some(detected) = auto_detect_game() {
            s.game_path = Some(detected.game_path);
            s.launcher = Some(detected.launcher);
        } else {
            s.game_path = None;
            s.launcher = None;
        }
    }
    write_settings(&app, &s);
}

#[tauri::command]
pub async fn pick_folder(default_path: Option<String>) -> Option<String> {
    #[cfg(target_os = "windows")]
    {
        let initial = default_path.as_deref().unwrap_or("").replace('\'', "''");
        let init_line = if initial.is_empty() {
            String::new()
        } else {
            format!("$d.SelectedPath = '{}'; ", initial)
        };
        let script = format!(
            "Add-Type -AssemblyName System.Windows.Forms; $d = New-Object System.Windows.Forms.FolderBrowserDialog; $d.Description = 'Select PAYDAY 3 installation folder'; {}if ($d.ShowDialog() -eq 'OK') {{ Write-Output $d.SelectedPath }}",
            init_line
        );
        let out = tokio::process::Command::new("powershell")
            .args(["-NonInteractive", "-NoProfile", "-Command", &script])
            .output()
            .await
            .ok()?;
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if path.is_empty() { None } else { Some(path) }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let mut cmd = tokio::process::Command::new("zenity");
        cmd.args(["--file-selection", "--directory", "--title=Select PAYDAY 3 installation folder"]);
        if let Some(ref p) = default_path {
            cmd.args(["--filename", p]);
        }
        let out = cmd.output().await.ok()?;
        let path = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if path.is_empty() { None } else { Some(path) }
    }
}

#[tauri::command]
pub fn launch_game(app: AppHandle) {
    let s = read_settings(&app);
    let Some(game_path) = s.game_path else { return };
    let launcher = s.launcher.as_deref().unwrap_or("steam");
    launch_with(launcher, &game_path, s.launch_options.as_deref());
}

#[tauri::command]
pub fn launch_without_mods(app: AppHandle) -> Result<(), String> {
    let s = read_settings(&app);
    let Some(ref game_path) = s.game_path else { return Ok(()) };

    let mods_dir = mods_base(game_path);
    let mods_bak = PathBuf::from(game_path).join("PAYDAY3").join("Content").join("~mods.bak");

    if mods_dir.exists() {
        fs::rename(&mods_dir, &mods_bak).map_err(|e| {
            format!(
                "Could not hide mods folder — the game may still have files open. Close the game first and try again. ({})",
                e.kind()
            )
        })?;
    }

    launch_with(
        s.launcher.as_deref().unwrap_or("steam"),
        game_path,
        s.launch_options.as_deref(),
    );
    Ok(())
}

#[tauri::command]
pub fn restore_mods(app: AppHandle) -> Result<(), String> {
    let s = read_settings(&app);
    let Some(ref game_path) = s.game_path else { return Ok(()) };

    let mods_dir = mods_base(game_path);
    let mods_bak = PathBuf::from(game_path).join("PAYDAY3").join("Content").join("~mods.bak");

    if !mods_bak.exists() { return Ok(()); }

    if !mods_dir.exists() {
        fs::rename(&mods_bak, &mods_dir).map_err(|e| {
            format!(
                "Could not restore mods folder. You may need to manually rename ~mods.bak back to ~mods. ({})",
                e.kind()
            )
        })?;
    } else {
        fs::remove_dir_all(&mods_bak).ok();
    }
    Ok(())
}

#[tauri::command]
pub fn is_game_running() -> bool {
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("tasklist")
            .args(["/FI", "IMAGENAME eq PAYDAY3-Win64-Shipping.exe", "/NH"])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stdout).contains("PAYDAY3-Win64-Shipping"))
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "windows"))]
    {
        std::process::Command::new("pgrep")
            .args(["-f", "PAYDAY3-Win64-Shipping"])
            .status()
            .map(|s| s.success())
            .unwrap_or(false)
    }
}

#[tauri::command]
pub fn stop_game() {
    #[cfg(target_os = "windows")]
    let _ = std::process::Command::new("taskkill")
        .args(["/F", "/IM", "PAYDAY3-Win64-Shipping.exe"])
        .output();
    #[cfg(not(target_os = "windows"))]
    let _ = std::process::Command::new("pkill")
        .args(["-f", "PAYDAY3-Win64-Shipping"])
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
#[path = "launchers_tests.rs"]
mod tests;

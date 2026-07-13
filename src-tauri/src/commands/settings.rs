use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GameSettings {
    pub game_path: Option<String>,
    pub launcher: Option<String>,
    pub launch_options: Option<String>,
    pub suppress_crash_reporter: Option<bool>,
    // Crime Boss only: "auto" (default, every install lands in Mods/) or "ask" (the renderer
    // shows a Mods/ vs ~mods choice before each new install). `None` behaves as "auto".
    pub crimeboss_install_mode: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct NexusOAuthTokens {
    pub access_token: String,
    pub refresh_token: String,
    // Unix seconds, computed from the token response's expires_in at receipt.
    pub expires_at: i64,
}

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub games: Option<HashMap<String, GameSettings>>,
    pub skip_file_open_log_warning: Option<bool>,
    pub dismissed_deps_warnings: Option<Vec<i32>>,
    // Telemetry. `analytics_enabled` is tri-state: `None` = user hasn't been
    // asked yet (renderer shows the first-run consent dialog), `Some(true/false)`
    // = explicit choice. `analytics_id` is a random per-install identifier; it is
    // never transmitted unless the user has enabled analytics.
    pub analytics_enabled: Option<bool>,
    pub analytics_id: Option<String>,
    pub discord_rich_presence_enabled: Option<bool>,
    // OAuth credentials are persisted only in local settings and sent only to
    // Nexus's OAuth and API endpoints.
    pub nexus_oauth: Option<NexusOAuthTokens>,
    // Legacy flat fields: deserialized from old files but never written back.
    #[serde(skip_serializing, default)]
    pub game_path: Option<String>,
    #[serde(skip_serializing, default)]
    pub launcher: Option<String>,
    #[serde(skip_serializing, default)]
    pub launch_options: Option<String>,
}

fn settings_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("no app data dir")
        .join("settings.json")
}

pub fn migrate_settings(mut s: Settings) -> Settings {
    if s.games.is_none() {
        let mut games: HashMap<String, GameSettings> = HashMap::new();
        if s.game_path.is_some() || s.launcher.is_some() || s.launch_options.is_some() {
            games.insert(
                "pd3".to_string(),
                GameSettings {
                    game_path: s.game_path.clone(),
                    launcher: s.launcher.clone(),
                    launch_options: s.launch_options.clone(),
                    ..GameSettings::default()
                },
            );
        }
        s.games = Some(games);
    }
    s
}

pub fn read_settings(app: &AppHandle) -> Settings {
    let path = settings_path(app);
    if !path.exists() {
        return Settings::default();
    }
    let content = std::fs::read_to_string(path).unwrap_or_default();
    let s: Settings = serde_json::from_str(&content).unwrap_or_default();
    migrate_settings(s)
}

pub fn write_settings(app: &AppHandle, settings: &Settings) {
    let path = settings_path(app);
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!("write_settings: create_dir_all {parent:?}: {e}");
        }
    }
    if let Err(e) = std::fs::write(
        &path,
        serde_json::to_string_pretty(settings).unwrap_or_default(),
    ) {
        log::warn!("write_settings: write {path:?}: {e}");
    }
}

pub fn game_settings<'a>(s: &'a Settings, game_id: &str) -> Option<&'a GameSettings> {
    s.games.as_ref()?.get(game_id)
}

/// On first launch after the Electron-to-Tauri migration, copy settings.json
/// and mod-index.db from the old Electron userData path to the new Tauri path.
/// Safe to remove once no Electron installs remain in the wild.
pub fn migrate_from_old_identifier(app: &AppHandle) {
    let new_settings = settings_path(app);
    if new_settings.exists() {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let Ok(appdata) = std::env::var("APPDATA") else {
            return;
        };
        let old_dir = PathBuf::from(appdata).join("io.github.shulhaoleh.pd3modmanager");
        let new_dir = new_settings.parent().unwrap();
        let _ = std::fs::create_dir_all(new_dir);
        if old_dir.join("settings.json").exists() {
            let _ = std::fs::copy(old_dir.join("settings.json"), &new_settings);
        }
        let old_index = old_dir.join("mod-index.db");
        let new_index = new_dir.join("mod-index.db");
        if old_index.exists() && !new_index.exists() {
            let _ = std::fs::copy(old_index, new_index);
        }
    }
    #[cfg(target_os = "linux")]
    {
        let Ok(home) = std::env::var("HOME") else {
            return;
        };
        let old_dir = PathBuf::from(home)
            .join(".config")
            .join("io.github.shulhaoleh.pd3modmanager");
        let new_dir = new_settings.parent().unwrap();
        let _ = std::fs::create_dir_all(new_dir);
        if old_dir.join("settings.json").exists() {
            let _ = std::fs::copy(old_dir.join("settings.json"), &new_settings);
        }
        let old_index = old_dir.join("mod-index.db");
        let new_index = new_dir.join("mod-index.db");
        if old_index.exists() && !new_index.exists() {
            let _ = std::fs::copy(old_index, new_index);
        }
    }
}

pub fn migrate_from_electron(app: &AppHandle) {
    let new_settings = settings_path(app);
    if new_settings.exists() {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let Ok(appdata) = std::env::var("APPDATA") else {
            return;
        };
        let old_dir = PathBuf::from(appdata).join("PD3 Mod Manager");
        let new_dir = new_settings.parent().unwrap();
        let _ = std::fs::create_dir_all(new_dir);
        if old_dir.join("settings.json").exists() {
            let _ = std::fs::copy(old_dir.join("settings.json"), &new_settings);
        }
        let old_index = old_dir.join("mod-index.db");
        let new_index = new_dir.join("mod-index.db");
        if old_index.exists() && !new_index.exists() {
            let _ = std::fs::copy(old_index, new_index);
        }
    }
    #[cfg(target_os = "linux")]
    {
        let Ok(home) = std::env::var("HOME") else {
            return;
        };
        let old_dir = PathBuf::from(home).join(".config").join("pd3-mod-manager");
        let new_dir = new_settings.parent().unwrap();
        let _ = std::fs::create_dir_all(new_dir);
        if old_dir.join("settings.json").exists() {
            let _ = std::fs::copy(old_dir.join("settings.json"), &new_settings);
        }
        let old_index = old_dir.join("mod-index.db");
        let new_index = new_dir.join("mod-index.db");
        if old_index.exists() && !new_index.exists() {
            let _ = std::fs::copy(old_index, new_index);
        }
    }
}

/// Returns a backwards-compatible flat view of PD3 settings for the renderer.
/// Commit 4 will switch callers to `get_game_settings` once the game switcher lands.
#[tauri::command]
pub fn get_settings(app: AppHandle) -> Value {
    let s = read_settings(&app);
    let gs = s.games.as_ref().and_then(|g| g.get("pd3"));
    serde_json::json!({
        "gamePath": gs.and_then(|g| g.game_path.as_deref()),
        "launcher": gs.and_then(|g| g.launcher.as_deref()),
        "launchOptions": gs.and_then(|g| g.launch_options.as_deref()),
        "skipFileOpenLogWarning": s.skip_file_open_log_warning,
        "dismissedDepsWarnings": s.dismissed_deps_warnings,
    })
}

#[tauri::command]
pub fn get_game_settings(app: AppHandle, game_id: String) -> GameSettings {
    let s = read_settings(&app);
    s.games
        .as_ref()
        .and_then(|g| g.get(&game_id))
        .cloned()
        .unwrap_or_default()
}

#[tauri::command]
pub fn set_game_path(app: AppHandle, game_id: Option<String>, game_path: Option<String>) {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    let mut s = read_settings(&app);
    s.games
        .get_or_insert_with(HashMap::new)
        .entry(game_id)
        .or_default()
        .game_path = game_path;
    write_settings(&app, &s);
}

#[tauri::command]
pub fn set_launcher(app: AppHandle, game_id: Option<String>, launcher: String) {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    let mut s = read_settings(&app);
    s.games
        .get_or_insert_with(HashMap::new)
        .entry(game_id)
        .or_default()
        .launcher = Some(launcher);
    write_settings(&app, &s);
}

#[tauri::command]
pub fn set_launch_options(app: AppHandle, game_id: Option<String>, launch_options: String) {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    let mut s = read_settings(&app);
    s.games
        .get_or_insert_with(HashMap::new)
        .entry(game_id)
        .or_default()
        .launch_options = Some(launch_options);
    write_settings(&app, &s);
}

#[tauri::command]
pub fn set_crimeboss_install_mode(app: AppHandle, mode: String) {
    let mut s = read_settings(&app);
    s.games
        .get_or_insert_with(HashMap::new)
        .entry("cb".to_string())
        .or_default()
        .crimeboss_install_mode = Some(mode);
    write_settings(&app, &s);
}

#[tauri::command]
pub fn set_suppress_crash_reporter(app: AppHandle, game_id: Option<String>, suppress: bool) {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    let mut s = read_settings(&app);
    s.games
        .get_or_insert_with(HashMap::new)
        .entry(game_id)
        .or_default()
        .suppress_crash_reporter = Some(suppress);
    write_settings(&app, &s);
}

#[tauri::command]
pub fn set_skip_fileopenlog_warning(app: AppHandle, skip: bool) {
    let mut s = read_settings(&app);
    s.skip_file_open_log_warning = Some(skip);
    write_settings(&app, &s);
}

/// Current analytics consent: `None` = not yet asked, `Some(true/false)` = chosen.
#[tauri::command]
pub fn get_analytics_consent(app: AppHandle) -> Option<bool> {
    read_settings(&app).analytics_enabled
}

/// Records the user's explicit analytics choice. Generates the anonymous install
/// ID lazily on first opt-in, so a user who never enables analytics never gets one.
#[tauri::command]
pub fn set_analytics_consent(app: AppHandle, enabled: bool) {
    let mut s = read_settings(&app);
    s.analytics_enabled = Some(enabled);
    if enabled && s.analytics_id.is_none() {
        s.analytics_id = Some(uuid::Uuid::new_v4().to_string());
    }
    write_settings(&app, &s);
}

/// Returns the persisted anonymous analytics ID, generating and persisting one if
/// absent. Used by the analytics sender; the ID never leaves the device unless the
/// user has enabled analytics.
pub(crate) fn ensure_analytics_id(app: &AppHandle) -> String {
    let mut s = read_settings(app);
    if let Some(id) = s.analytics_id.clone() {
        return id;
    }
    let id = uuid::Uuid::new_v4().to_string();
    s.analytics_id = Some(id.clone());
    write_settings(app, &s);
    id
}

#[tauri::command]
pub fn dismiss_deps_warning(app: AppHandle, mod_id: i32) {
    let mut s = read_settings(&app);
    let mut warnings = s.dismissed_deps_warnings.unwrap_or_default();
    if !warnings.contains(&mod_id) {
        warnings.push(mod_id);
    }
    s.dismissed_deps_warnings = Some(warnings);
    write_settings(&app, &s);
}

#[cfg(test)]
#[path = "settings_tests.rs"]
mod tests;

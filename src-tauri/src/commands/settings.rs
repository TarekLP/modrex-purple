use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Serialize, Deserialize, Default, Clone, specta::Type)]
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
    // modworkshop mod ids only; ids from other sources must not land here.
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
    // One-time "star us on GitHub" prompt bookkeeping. Lives here (not localStorage)
    // so it shares the telemetry consent's lifecycle: survives uninstall/reinstall
    // (the NSIS uninstaller never touches app data) and only resets on a full
    // app-data wipe, where the guards below re-rate-limit it to once per 7+ days.
    pub successful_installs: Option<u64>,
    pub first_install_at: Option<u64>,
    pub support_prompt_shown: Option<bool>,
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
    let content = std::fs::read_to_string(&path).unwrap_or_default();
    let s: Settings = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(e) => {
            log::warn!("read_settings: parse {path:?}: {e}; falling back to defaults");
            Settings::default()
        }
    };
    migrate_settings(s)
}

pub(crate) fn write_settings(app: &AppHandle, settings: &Settings) {
    let path = settings_path(app);
    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            log::warn!("write_settings: create_dir_all {parent:?}: {e}");
        }
    }
    // Write-then-rename so a reader can never see a half-written file: a torn
    // read parses as default settings, and the next save would persist that
    // empty default, wiping every configured game.
    let tmp = path.with_extension("json.tmp");
    if let Err(e) = std::fs::write(
        &tmp,
        serde_json::to_string_pretty(settings).unwrap_or_default(),
    ) {
        log::warn!("write_settings: write {tmp:?}: {e}");
        return;
    }
    if let Err(e) = std::fs::rename(&tmp, &path) {
        log::warn!("write_settings: rename {tmp:?} -> {path:?}: {e}");
    }
}

static SETTINGS_LOCK: Mutex<()> = Mutex::new(());

/// Serializes every read-modify-write of settings.json. The game picker
/// resolves all games' paths concurrently; without the lock those writers
/// overwrote each other's just-saved paths, making games flap between
/// installed and not installed.
pub fn update_settings<T>(app: &AppHandle, mutate: impl FnOnce(&mut Settings) -> T) -> T {
    let _guard = SETTINGS_LOCK.lock().unwrap();
    let mut s = read_settings(app);
    let result = mutate(&mut s);
    write_settings(app, &s);
    result
}

pub fn game_settings<'a>(s: &'a Settings, game_id: &str) -> Option<&'a GameSettings> {
    s.games.as_ref()?.get(game_id)
}

/// Factory-resets settings.json to defaults: clears every configured game path,
/// launcher choice, launch options, analytics consent + id, and all other
/// preferences. Does not touch installed mods, game files, or the on-disk caches.
#[tauri::command]
#[specta::specta]
pub fn reset_app_settings(app: AppHandle) {
    update_settings(&app, |s| *s = Settings::default());
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
/// Commit 4 will switch callers to get_game_settings once the game switcher lands.
#[tauri::command]
#[specta::specta]
pub fn get_settings(app: AppHandle) -> crate::commands::api::Json {
    let s = read_settings(&app);
    let gs = s.games.as_ref().and_then(|g| g.get("pd3"));
    crate::commands::api::Json(serde_json::json!({
        "gamePath": gs.and_then(|g| g.game_path.as_deref()),
        "launcher": gs.and_then(|g| g.launcher.as_deref()),
        "launchOptions": gs.and_then(|g| g.launch_options.as_deref()),
        "skipFileOpenLogWarning": s.skip_file_open_log_warning,
        "dismissedDepsWarnings": s.dismissed_deps_warnings,
    }))
}

#[tauri::command]
#[specta::specta]
pub fn get_game_settings(app: AppHandle, game_id: String) -> GameSettings {
    let s = read_settings(&app);
    s.games
        .as_ref()
        .and_then(|g| g.get(&game_id))
        .cloned()
        .unwrap_or_default()
}

#[tauri::command]
#[specta::specta]
pub fn set_launcher(app: AppHandle, game_id: Option<String>, launcher: String) {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    update_settings(&app, |s| {
        s.games
            .get_or_insert_with(HashMap::new)
            .entry(game_id)
            .or_default()
            .launcher = Some(launcher);
    });
}

#[tauri::command]
#[specta::specta]
pub fn set_launch_options(app: AppHandle, game_id: Option<String>, launch_options: String) {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    update_settings(&app, |s| {
        s.games
            .get_or_insert_with(HashMap::new)
            .entry(game_id)
            .or_default()
            .launch_options = Some(launch_options);
    });
}

#[tauri::command]
#[specta::specta]
pub fn set_crimeboss_install_mode(app: AppHandle, mode: String) {
    update_settings(&app, |s| {
        s.games
            .get_or_insert_with(HashMap::new)
            .entry("cb".to_string())
            .or_default()
            .crimeboss_install_mode = Some(mode);
    });
}

#[tauri::command]
#[specta::specta]
pub fn set_suppress_crash_reporter(app: AppHandle, game_id: Option<String>, suppress: bool) {
    let game_id = game_id.unwrap_or_else(|| "pd3".to_string());
    update_settings(&app, |s| {
        s.games
            .get_or_insert_with(HashMap::new)
            .entry(game_id)
            .or_default()
            .suppress_crash_reporter = Some(suppress);
    });
}

#[tauri::command]
#[specta::specta]
pub fn set_skip_fileopenlog_warning(app: AppHandle, skip: bool) {
    update_settings(&app, |s| s.skip_file_open_log_warning = Some(skip));
}

/// Current analytics consent: None = not yet asked, Some(true/false) = chosen.
#[tauri::command]
#[specta::specta]
pub fn get_analytics_consent(app: AppHandle) -> Option<bool> {
    read_settings(&app).analytics_enabled
}

/// Records the user's explicit analytics choice. Generates the anonymous install
/// ID lazily on first opt-in, so a user who never enables analytics never gets one.
#[tauri::command]
#[specta::specta]
pub fn set_analytics_consent(app: AppHandle, enabled: bool) {
    update_settings(&app, |s| {
        s.analytics_enabled = Some(enabled);
        if enabled && s.analytics_id.is_none() {
            s.analytics_id = Some(uuid::Uuid::new_v4().to_string());
        }
    });
}

/// Returns the persisted anonymous analytics ID, generating and persisting one if
/// absent. Used by the analytics sender; the ID never leaves the device unless the
/// user has enabled analytics.
pub(crate) fn ensure_analytics_id(app: &AppHandle) -> String {
    if let Some(id) = read_settings(app).analytics_id {
        return id;
    }
    update_settings(app, |s| {
        s.analytics_id
            .get_or_insert_with(|| uuid::Uuid::new_v4().to_string())
            .clone()
    })
}

const SUPPORT_PROMPT_MIN_INSTALLS: u64 = 10;
const SUPPORT_PROMPT_MIN_AGE_MS: u64 = 7 * 24 * 60 * 60 * 1000;

pub(crate) fn support_prompt_eligible(installs: u64, first_install_at: u64, now_ms: u64) -> bool {
    installs >= SUPPORT_PROMPT_MIN_INSTALLS
        && now_ms.saturating_sub(first_install_at) >= SUPPORT_PROMPT_MIN_AGE_MS
}

/// Counts a successful mod install toward the one-time "star us on GitHub"
/// prompt. When the milestone is reached in a clean session, the shown flag is
/// persisted *before* the renderer displays anything (write-on-show), so the
/// prompt can never fire twice while settings.json survives.
#[tauri::command]
#[specta::specta]
pub fn record_successful_install(app: AppHandle, clean_session: bool) {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);
    let show_prompt = update_settings(&app, |s| {
        if s.support_prompt_shown == Some(true) {
            return false;
        }
        let first = *s.first_install_at.get_or_insert(now);
        let count = s.successful_installs.unwrap_or(0) + 1;
        s.successful_installs = Some(count);
        if clean_session && support_prompt_eligible(count, first, now) {
            s.support_prompt_shown = Some(true);
            return true;
        }
        false
    });
    if show_prompt {
        let _ = app.emit("support-prompt:eligible", ());
    }
}

#[tauri::command]
#[specta::specta]
pub fn dismiss_deps_warning(app: AppHandle, mod_id: i32) {
    update_settings(&app, |s| {
        let warnings = s.dismissed_deps_warnings.get_or_insert_with(Vec::new);
        if !warnings.contains(&mod_id) {
            warnings.push(mod_id);
        }
    });
}

#[cfg(test)]
#[path = "settings_tests.rs"]
mod tests;

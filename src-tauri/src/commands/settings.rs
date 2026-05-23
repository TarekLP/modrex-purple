use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::{AppHandle, Manager};

#[derive(Debug, Serialize, Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub game_path: Option<String>,
    pub launcher: Option<String>,
    pub launch_options: Option<String>,
    pub skip_file_open_log_warning: Option<bool>,
    pub dismissed_deps_warnings: Option<Vec<i32>>,
}

fn settings_path(app: &AppHandle) -> PathBuf {
    app.path().app_data_dir().unwrap().join("settings.json")
}

pub fn read_settings(app: &AppHandle) -> Settings {
    let path = settings_path(app);
    if !path.exists() {
        return Settings::default();
    }
    let content = std::fs::read_to_string(path).unwrap_or_default();
    serde_json::from_str(&content).unwrap_or_default()
}

pub fn write_settings(app: &AppHandle, settings: &Settings) {
    let path = settings_path(app);
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, serde_json::to_string_pretty(settings).unwrap_or_default());
}

/// On first launch after the Electron-to-Tauri migration, copy settings.json
/// and mod-index.db from the old Electron userData path to the new Tauri path.
pub fn migrate_from_electron(app: &AppHandle) {
    let new_settings = settings_path(app);
    if new_settings.exists() {
        return;
    }
    #[cfg(target_os = "windows")]
    {
        let Ok(appdata) = std::env::var("APPDATA") else { return };
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
}

#[tauri::command]
pub fn get_settings(app: AppHandle) -> Settings {
    read_settings(&app)
}

#[tauri::command]
pub fn set_game_path(app: AppHandle, game_path: Option<String>) {
    let mut s = read_settings(&app);
    s.game_path = game_path;
    write_settings(&app, &s);
}

#[tauri::command]
pub fn set_launcher(app: AppHandle, launcher: String) {
    let mut s = read_settings(&app);
    s.launcher = Some(launcher);
    write_settings(&app, &s);
}

#[tauri::command]
pub fn set_launch_options(app: AppHandle, launch_options: String) {
    let mut s = read_settings(&app);
    s.launch_options = Some(launch_options);
    write_settings(&app, &s);
}

#[tauri::command]
pub fn set_skip_fileopenlog_warning(app: AppHandle, skip: bool) {
    let mut s = read_settings(&app);
    s.skip_file_open_log_warning = Some(skip);
    write_settings(&app, &s);
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

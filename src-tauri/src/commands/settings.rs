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

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn write_to(path: &std::path::Path, settings: &Settings) {
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        std::fs::write(path, serde_json::to_string_pretty(settings).unwrap()).unwrap();
    }

    fn read_from(path: &std::path::Path) -> Settings {
        let content = std::fs::read_to_string(path).unwrap_or_default();
        serde_json::from_str(&content).unwrap_or_default()
    }

    #[test]
    fn roundtrip_all_fields_set() {
        let f = NamedTempFile::new().unwrap();
        let original = Settings {
            game_path: Some("C:\\Games\\PAYDAY3".to_string()),
            launcher: Some("steam".to_string()),
            launch_options: Some("-fileopenlog".to_string()),
            skip_file_open_log_warning: Some(true),
            dismissed_deps_warnings: Some(vec![1, 2, 3]),
        };
        write_to(f.path(), &original);
        let loaded = read_from(f.path());
        assert_eq!(loaded.game_path, original.game_path);
        assert_eq!(loaded.launcher, original.launcher);
        assert_eq!(loaded.launch_options, original.launch_options);
        assert_eq!(loaded.skip_file_open_log_warning, original.skip_file_open_log_warning);
        assert_eq!(loaded.dismissed_deps_warnings, original.dismissed_deps_warnings);
    }

    #[test]
    fn roundtrip_all_optional_fields_none() {
        let f = NamedTempFile::new().unwrap();
        let original = Settings::default();
        write_to(f.path(), &original);
        let loaded = read_from(f.path());
        assert_eq!(loaded.game_path, None);
        assert_eq!(loaded.launcher, None);
        assert_eq!(loaded.launch_options, None);
        assert_eq!(loaded.skip_file_open_log_warning, None);
        assert_eq!(loaded.dismissed_deps_warnings, None);
    }

    #[test]
    fn missing_file_returns_default() {
        let loaded = read_from(std::path::Path::new("/nonexistent/settings.json"));
        assert_eq!(loaded.game_path, None);
        assert_eq!(loaded.launcher, None);
    }

    #[test]
    fn corrupt_json_returns_default() {
        let mut f = NamedTempFile::new().unwrap();
        write!(f, "{{not valid json}}").unwrap();
        let loaded = read_from(f.path());
        assert_eq!(loaded.game_path, None);
    }

    #[test]
    fn unknown_fields_ignored() {
        let mut f = NamedTempFile::new().unwrap();
        write!(f, r#"{{"gamePath":"C:\\Games","unknownField":true}}"#).unwrap();
        let loaded = read_from(f.path());
        assert_eq!(loaded.game_path, Some("C:\\Games".to_string()));
    }
}

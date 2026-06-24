use super::*;
use std::collections::HashMap;
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
    let mut games = HashMap::new();
    games.insert(
        "pd3".to_string(),
        GameSettings {
            game_path: Some("C:\\Games\\PAYDAY3".to_string()),
            launcher: Some("steam".to_string()),
            launch_options: Some("-fileopenlog".to_string()),
            suppress_crash_reporter: Some(true),
            ..Default::default()
        },
    );
    games.insert(
        "cb".to_string(),
        GameSettings {
            crimeboss_install_mode: Some("ask".to_string()),
            ..Default::default()
        },
    );
    let original = Settings {
        games: Some(games),
        skip_file_open_log_warning: Some(true),
        dismissed_deps_warnings: Some(vec![1, 2, 3]),
        ..Default::default()
    };
    write_to(f.path(), &original);
    let loaded = read_from(f.path());
    let pd3 = loaded.games.as_ref().unwrap().get("pd3").unwrap();
    assert_eq!(pd3.game_path.as_deref(), Some("C:\\Games\\PAYDAY3"));
    assert_eq!(pd3.launcher.as_deref(), Some("steam"));
    assert_eq!(pd3.launch_options.as_deref(), Some("-fileopenlog"));
    assert_eq!(pd3.suppress_crash_reporter, Some(true));
    let cb = loaded.games.as_ref().unwrap().get("cb").unwrap();
    assert_eq!(cb.crimeboss_install_mode.as_deref(), Some("ask"));
    assert_eq!(loaded.skip_file_open_log_warning, Some(true));
    assert_eq!(loaded.dismissed_deps_warnings, Some(vec![1, 2, 3]));
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
    assert_eq!(loaded.analytics_enabled, None);
    assert_eq!(loaded.analytics_id, None);
}

#[test]
fn roundtrip_analytics_fields() {
    let f = NamedTempFile::new().unwrap();
    let original = Settings {
        analytics_enabled: Some(true),
        analytics_id: Some("11111111-2222-3333-4444-555555555555".to_string()),
        ..Default::default()
    };
    write_to(f.path(), &original);
    let loaded = read_from(f.path());
    assert_eq!(loaded.analytics_enabled, Some(true));
    assert_eq!(
        loaded.analytics_id.as_deref(),
        Some("11111111-2222-3333-4444-555555555555")
    );
}

#[test]
fn analytics_consent_is_tristate() {
    // An old settings file with no analytics keys must read back as "not yet asked"
    // (None), not as an implicit opt-in or opt-out.
    let mut f = NamedTempFile::new().unwrap();
    write!(f, r#"{{"gamePath":"C:\\Games"}}"#).unwrap();
    let loaded = read_from(f.path());
    assert_eq!(loaded.analytics_enabled, None);
    assert_eq!(loaded.analytics_id, None);
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
    // Legacy flat field is still deserializable from old JSON
    assert_eq!(loaded.game_path, Some("C:\\Games".to_string()));
}

#[test]
fn migration_from_legacy_flat_fields() {
    let mut f = NamedTempFile::new().unwrap();
    write!(
        f,
        r#"{{"gamePath":"C:\\Games\\PAYDAY3","launcher":"steam","skipFileOpenLogWarning":true}}"#
    )
    .unwrap();
    let content = std::fs::read_to_string(f.path()).unwrap();
    let raw: Settings = serde_json::from_str(&content).unwrap();
    let migrated = migrate_settings(raw);
    let pd3 = migrated.games.as_ref().unwrap().get("pd3").unwrap();
    assert_eq!(pd3.game_path.as_deref(), Some("C:\\Games\\PAYDAY3"));
    assert_eq!(pd3.launcher.as_deref(), Some("steam"));
    assert_eq!(migrated.skip_file_open_log_warning, Some(true));
}

#[test]
fn migration_skipped_when_games_already_present() {
    let mut games = HashMap::new();
    games.insert(
        "pd3".to_string(),
        GameSettings {
            game_path: Some("new_path".to_string()),
            ..Default::default()
        },
    );
    let s = Settings {
        games: Some(games),
        game_path: Some("old_path".to_string()),
        ..Default::default()
    };
    let migrated = migrate_settings(s);
    // Existing games map must not be overwritten by legacy flat field
    assert_eq!(
        migrated
            .games
            .as_ref()
            .unwrap()
            .get("pd3")
            .unwrap()
            .game_path
            .as_deref(),
        Some("new_path")
    );
}

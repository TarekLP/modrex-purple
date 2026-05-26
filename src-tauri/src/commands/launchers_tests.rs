use super::*;
use tempfile::TempDir;

// ── steam_libraries ───────────────────────────────────────────────────────

fn write_vdf(dir: &TempDir, content: &str) -> String {
    let steam_path = dir.path().to_str().unwrap().to_string();
    let steamapps = dir.path().join("steamapps");
    std::fs::create_dir_all(&steamapps).unwrap();
    std::fs::write(steamapps.join("libraryfolders.vdf"), content).unwrap();
    steam_path
}

#[test]
fn steam_libraries_empty_content() {
    let dir = TempDir::new().unwrap();
    let steam_path = write_vdf(&dir, "");
    let libs = steam_libraries(&steam_path);
    assert_eq!(libs, vec![steam_path]);
}

#[test]
fn steam_libraries_one_extra_path() {
    let dir = TempDir::new().unwrap();
    let steam_path = write_vdf(
        &dir,
        r#""libraryfolders"
{
    "0"
    {
        "path"    "D:\\SteamLibrary"
    }
}"#,
    );
    let libs = steam_libraries(&steam_path);
    assert_eq!(libs.len(), 2);
    assert!(libs.contains(&steam_path));
    assert!(libs.contains(&"D:\\SteamLibrary".to_string()));
}

#[test]
fn steam_libraries_multiple_paths() {
    let dir = TempDir::new().unwrap();
    let steam_path = write_vdf(
        &dir,
        r#""libraryfolders"
{
    "0"
    {
        "path"    "D:\\SteamLibrary"
    }
    "1"
    {
        "path"    "E:\\Games"
    }
}"#,
    );
    let libs = steam_libraries(&steam_path);
    assert_eq!(libs.len(), 3);
    assert!(libs.contains(&"D:\\SteamLibrary".to_string()));
    assert!(libs.contains(&"E:\\Games".to_string()));
}

#[test]
fn steam_libraries_escaped_backslashes_unescaped() {
    let dir = TempDir::new().unwrap();
    // Real Steam VDF uses \\ for a single backslash in the path
    let steam_path = write_vdf(
        &dir,
        r#""libraryfolders"
{
    "0"
    {
        "path"    "D:\\SteamLibrary"
    }
}"#,
    );
    let libs = steam_libraries(&steam_path);
    assert!(libs.contains(&"D:\\SteamLibrary".to_string()));
}

#[test]
fn steam_libraries_no_path_key() {
    let dir = TempDir::new().unwrap();
    let steam_path = write_vdf(&dir, r#""libraryfolders" { "label" "value" }"#);
    let libs = steam_libraries(&steam_path);
    assert_eq!(libs, vec![steam_path]);
}

// ── identify_launcher_for_path ────────────────────────────────────────────

#[test]
fn identify_launcher_steam() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("steam_appid.txt"), "1272080").unwrap();
    assert_eq!(identify_launcher_for_path(dir.path().to_str().unwrap()), "steam");
}

#[test]
fn identify_launcher_epic() {
    let dir = TempDir::new().unwrap();
    std::fs::create_dir(dir.path().join(".egstore")).unwrap();
    assert_eq!(identify_launcher_for_path(dir.path().to_str().unwrap()), "epic");
}

#[test]
fn identify_launcher_xbox() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("MicrosoftGame.config"), "").unwrap();
    assert_eq!(identify_launcher_for_path(dir.path().to_str().unwrap()), "xbox");
}

#[test]
fn identify_launcher_manual_when_no_marker() {
    let dir = TempDir::new().unwrap();
    assert_eq!(identify_launcher_for_path(dir.path().to_str().unwrap()), "manual");
}

#[test]
fn identify_launcher_steam_takes_precedence() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("steam_appid.txt"), "1272080").unwrap();
    std::fs::create_dir(dir.path().join(".egstore")).unwrap();
    assert_eq!(identify_launcher_for_path(dir.path().to_str().unwrap()), "steam");
}

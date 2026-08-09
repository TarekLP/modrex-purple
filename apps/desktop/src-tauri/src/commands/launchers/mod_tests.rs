use super::steam::steam_libraries;
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

// ── is_installation ───────────────────────────────────────────────────────

fn touch(path: std::path::PathBuf) {
    std::fs::create_dir_all(path.parent().unwrap()).unwrap();
    std::fs::write(path, "").unwrap();
}

#[test]
fn is_installation_accepts_win64_layout() {
    let dir = TempDir::new().unwrap();
    touch(dir.path().join("PAYDAY3.exe"));
    assert!(PD3.is_installation(dir.path().to_str().unwrap()));
}

// A Microsoft Store copy stages only the WinGDK binary, so the launch executable is
// absent and validating against it alone rejected a real installation.
#[test]
fn is_installation_accepts_microsoft_store_layout() {
    let dir = TempDir::new().unwrap();
    touch(
        dir.path()
            .join("PAYDAY3")
            .join("Binaries")
            .join("WinGDK")
            .join("PAYDAY3-WinGDK-Shipping.exe"),
    );
    let path = dir.path().to_str().unwrap();
    assert!(PD3.resolve_executable(path).is_none());
    assert!(PD3.is_installation(path));
}

#[test]
fn is_installation_rejects_unrelated_folder() {
    let dir = TempDir::new().unwrap();
    touch(dir.path().join("readme.txt"));
    assert!(!PD3.is_installation(dir.path().to_str().unwrap()));
}

// PAYDAY 2 has no Microsoft Store release, so nothing widens its check.
#[test]
fn is_installation_without_xbox_release_matches_executables_only() {
    let dir = TempDir::new().unwrap();
    touch(dir.path().join("payday2_win32_release.exe"));
    assert!(PD2.is_installation(dir.path().to_str().unwrap()));

    let other = TempDir::new().unwrap();
    touch(other.path().join("PAYDAY3.exe"));
    assert!(!PD2.is_installation(other.path().to_str().unwrap()));
}

// ── probe_order ───────────────────────────────────────────────────────────

fn order_ids(preferred: Option<&str>) -> Vec<&'static str> {
    probe_order(preferred).iter().map(|l| l.id()).collect()
}

#[test]
fn probe_order_defaults_to_registration_order() {
    assert_eq!(order_ids(None), vec!["steam", "epic", "xbox"]);
}

#[test]
fn probe_order_puts_the_chosen_launcher_first() {
    assert_eq!(order_ids(Some("xbox")), vec!["xbox", "epic", "steam"]);
    assert_eq!(order_ids(Some("epic")), vec!["epic", "steam", "xbox"]);
}

// A hand-picked folder saves "manual", which is not a store, and must not reorder or
// drop any probe.
#[test]
fn probe_order_ignores_a_launcher_that_is_not_a_store() {
    assert_eq!(order_ids(Some("manual")), vec!["steam", "epic", "xbox"]);
}

// ── identify_launcher_for_path ────────────────────────────────────────────

#[test]
fn identify_launcher_steam() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("steam_appid.txt"), "1272080").unwrap();
    assert_eq!(
        identify_launcher_for_path(dir.path().to_str().unwrap()),
        "steam"
    );
}

#[test]
fn identify_launcher_epic() {
    let dir = TempDir::new().unwrap();
    std::fs::create_dir(dir.path().join(".egstore")).unwrap();
    assert_eq!(
        identify_launcher_for_path(dir.path().to_str().unwrap()),
        "epic"
    );
}

#[test]
fn identify_launcher_xbox() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("MicrosoftGame.config"), "").unwrap();
    assert_eq!(
        identify_launcher_for_path(dir.path().to_str().unwrap()),
        "xbox"
    );
}

#[test]
fn identify_launcher_manual_when_no_marker() {
    let dir = TempDir::new().unwrap();
    assert_eq!(
        identify_launcher_for_path(dir.path().to_str().unwrap()),
        "manual"
    );
}

#[test]
fn identify_launcher_steam_takes_precedence() {
    let dir = TempDir::new().unwrap();
    std::fs::write(dir.path().join("steam_appid.txt"), "1272080").unwrap();
    std::fs::create_dir(dir.path().join(".egstore")).unwrap();
    assert_eq!(
        identify_launcher_for_path(dir.path().to_str().unwrap()),
        "steam"
    );
}

#[test]
fn pd3_xbox_crash_reporter_dir_uses_wingdk_subdir() {
    let dir = TempDir::new().unwrap();
    assert_eq!(
        pd3_xbox_crash_reporter_dir(dir.path()),
        dir.path().join("PAYDAY3").join("Binaries").join("WinGDK")
    );
}

#[test]
fn suppress_crash_reporter_removes_only_known_files() {
    let dir = TempDir::new().unwrap();
    let crash_dir = pd3_xbox_crash_reporter_dir(dir.path());
    std::fs::create_dir_all(&crash_dir).unwrap();
    for name in PD3_XBOX_CRASH_REPORTER_FILES {
        std::fs::write(crash_dir.join(name), "placeholder").unwrap();
    }
    std::fs::write(crash_dir.join("PAYDAY3-WinGDK-Shipping.exe"), "game").unwrap();

    maybe_suppress_crash_reporter(
        "pd3",
        &GameSettings {
            game_path: Some(dir.path().to_string_lossy().into_owned()),
            launcher: Some("xbox".to_string()),
            suppress_crash_reporter: true,
            ..Default::default()
        },
    );

    for name in PD3_XBOX_CRASH_REPORTER_FILES {
        assert!(!crash_dir.join(name).exists());
    }
    assert!(crash_dir.join("PAYDAY3-WinGDK-Shipping.exe").exists());
}

#[test]
fn suppress_crash_reporter_requires_pd3_xbox_opt_in() {
    let dir = TempDir::new().unwrap();
    let crash_dir = pd3_xbox_crash_reporter_dir(dir.path());
    std::fs::create_dir_all(&crash_dir).unwrap();
    std::fs::write(
        crash_dir.join(PD3_XBOX_CRASH_REPORTER_FILES[0]),
        "placeholder",
    )
    .unwrap();

    maybe_suppress_crash_reporter(
        "pd3",
        &GameSettings {
            game_path: Some(dir.path().to_string_lossy().into_owned()),
            launcher: Some("steam".to_string()),
            suppress_crash_reporter: true,
            ..Default::default()
        },
    );
    assert!(crash_dir.join(PD3_XBOX_CRASH_REPORTER_FILES[0]).exists());

    maybe_suppress_crash_reporter(
        "pd3",
        &GameSettings {
            game_path: Some(dir.path().to_string_lossy().into_owned()),
            launcher: Some("xbox".to_string()),
            suppress_crash_reporter: false,
            ..Default::default()
        },
    );
    assert!(crash_dir.join(PD3_XBOX_CRASH_REPORTER_FILES[0]).exists());
}

// ── sanitize_external_url ─────────────────────────────────────────────────

#[test]
fn sanitize_url_allows_web_and_mailto() {
    assert!(sanitize_external_url("http://example.com/a?b=1&c=2").is_some());
    assert!(sanitize_external_url("https://modworkshop.net/mod/123").is_some());
    assert!(sanitize_external_url("mailto:author@example.com").is_some());
}

#[test]
fn sanitize_url_rejects_file_and_unc() {
    assert!(sanitize_external_url("file:///C:/Windows/System32/calc.exe").is_none());
    assert!(sanitize_external_url(r"\\attacker\share\evil.exe").is_none());
}

#[test]
fn sanitize_url_rejects_dangerous_schemes() {
    assert!(sanitize_external_url("vbscript:msgbox(1)").is_none());
    assert!(sanitize_external_url("javascript:alert(1)").is_none());
}

#[test]
fn sanitize_url_rejects_cmd_breakout_chars() {
    assert!(sanitize_external_url("http://x/\" & calc.exe & \"").is_none());
}

#[test]
fn matches_process_windows_exe_name() {
    assert!(matches_process("PAYDAY3Client.exe", &[], "PAYDAY3Client"));
}

#[test]
fn matches_process_linux_truncated_comm() {
    // /proc comm is truncated to 15 chars for Proton-run Windows binaries
    assert!(matches_process("PAYDAY3Client.e", &[], "PAYDAY3Client"));
}

#[test]
fn matches_process_native_linux_name() {
    assert!(matches_process("payday2_release", &[], "payday2_release"));
}

#[test]
fn matches_process_proton_wrapper_cmdline() {
    let cmd = vec![
        String::from(r"Z:\games\PAYDAY3\PAYDAY3Client.exe"),
        String::from("-fileopenlog"),
    ];
    assert!(matches_process("wine64-preloader", &cmd, "PAYDAY3Client"));
}

#[test]
fn matches_process_rejects_unrelated() {
    let cmd = vec![String::from("/usr/bin/steam")];
    assert!(!matches_process("steam", &cmd, "PAYDAY3Client"));
}

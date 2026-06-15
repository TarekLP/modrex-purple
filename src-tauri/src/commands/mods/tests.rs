use super::*;
use std::collections::HashSet;
use std::fs::{self, File};
use std::io::Write;
use tempfile::{NamedTempFile, TempDir};

fn make_zip(entries: &[(&str, &[u8])]) -> NamedTempFile {
    let f = NamedTempFile::new().unwrap();
    let mut zip = ::zip::ZipWriter::new(File::create(f.path()).unwrap());
    let opts = ::zip::write::SimpleFileOptions::default();
    for (name, data) in entries {
        zip.start_file(*name, opts).unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
    f
}

// ── detect_archive / is_zip ───────────────────────────────────────────────────

#[test]
fn is_zip_detects_zip_magic() {
    let zip = make_zip(&[("mod.pak", b"fake pak content")]);
    assert_eq!(detect_archive(zip.path()), Some(ArchiveFormat::Zip));
    assert!(is_zip(zip.path()));
}

#[test]
fn is_zip_rejects_non_zip() {
    let mut f = NamedTempFile::new().unwrap();
    f.write_all(b"\xC1\x83\x2A\x9E").unwrap();
    assert_eq!(detect_archive(f.path()), None);
    assert!(!is_zip(f.path()));
}

#[test]
fn is_zip_rejects_empty_file() {
    let f = NamedTempFile::new().unwrap();
    assert_eq!(detect_archive(f.path()), None);
}

// ── list_pak_entries (zip path) ───────────────────────────────────────────────

#[test]
fn list_pak_entries_finds_pak_files() {
    let zip = make_zip(&[
        ("readme.txt", b"hello"),
        ("weapons_default.pak", b"pak content"),
        ("weapons_alt.pak", b"pak content 2"),
    ]);
    let mut entries = list_pak_entries(zip.path()).unwrap();
    entries.sort();
    assert_eq!(entries, vec!["weapons_alt.pak", "weapons_default.pak"]);
}

#[test]
fn list_pak_entries_empty_when_no_paks() {
    let zip = make_zip(&[("readme.txt", b"hello"), ("data.bin", b"data")]);
    let entries = list_pak_entries(zip.path()).unwrap();
    assert!(entries.is_empty());
}

#[test]
fn list_pak_entries_handles_nested_paths() {
    let zip = make_zip(&[("Real Weapon Names/weapons_default.pak", b"content")]);
    let entries = list_pak_entries(zip.path()).unwrap();
    assert_eq!(entries, vec!["Real Weapon Names/weapons_default.pak"]);
}

// ── extract_entry (zip path) ──────────────────────────────────────────────────

#[test]
fn extract_zip_entry_writes_correct_bytes() {
    let content = b"this is a pak file";
    let zip = make_zip(&[("my_mod.pak", content)]);
    let dest = NamedTempFile::new().unwrap();
    extract_entry(zip.path(), "my_mod.pak", dest.path()).unwrap();
    let written = std::fs::read(dest.path()).unwrap();
    assert_eq!(written, content);
}

#[test]
fn extract_zip_entry_errors_on_missing_entry() {
    let zip = make_zip(&[("other.pak", b"content")]);
    let dest = NamedTempFile::new().unwrap();
    let result = extract_entry(zip.path(), "nonexistent.pak", dest.path());
    assert!(result.is_err());
}

#[test]
fn extract_zip_entry_handles_nested_path() {
    let content = b"nested pak content";
    let zip = make_zip(&[("Real Weapon Names/weapons_default.pak", content)]);
    let dest = NamedTempFile::new().unwrap();
    extract_entry(
        zip.path(),
        "Real Weapon Names/weapons_default.pak",
        dest.path(),
    )
    .unwrap();
    let written = std::fs::read(dest.path()).unwrap();
    assert_eq!(written, content);
}

// ── strip_priority_prefix ─────────────────────────────────────────────────

#[test]
fn strip_prefix_no_prefix() {
    assert_eq!(strip_priority_prefix("foo.pak"), "foo.pak");
}

#[test]
fn strip_prefix_single_digit() {
    assert_eq!(strip_priority_prefix("1_foo.pak"), "foo.pak");
}

#[test]
fn strip_prefix_multi_digit() {
    assert_eq!(strip_priority_prefix("012_foo.pak"), "foo.pak");
}

#[test]
fn strip_prefix_digits_without_underscore() {
    assert_eq!(strip_priority_prefix("123foo.pak"), "123foo.pak");
}

#[test]
fn strip_prefix_empty() {
    assert_eq!(strip_priority_prefix(""), "");
}

// ── apply_priority_prefix ─────────────────────────────────────────────────

#[test]
fn apply_prefix_unprefixed() {
    assert_eq!(apply_priority_prefix("foo.pak", 3), "003_foo.pak");
}

#[test]
fn apply_prefix_already_prefixed() {
    assert_eq!(apply_priority_prefix("012_foo.pak", 3), "003_foo.pak");
}

#[test]
fn apply_prefix_zero() {
    assert_eq!(apply_priority_prefix("foo.pak", 0), "000_foo.pak");
}

#[test]
fn apply_prefix_large_number() {
    assert_eq!(apply_priority_prefix("foo.pak", 999), "999_foo.pak");
}

// ── pak_filename ──────────────────────────────────────────────────────────

#[test]
fn pak_filename_spaces_become_underscores() {
    assert_eq!(pak_filename("My Mod"), "My_Mod.pak");
}

#[test]
fn pak_filename_consecutive_spaces_collapse() {
    assert_eq!(pak_filename("My  Mod"), "My_Mod.pak");
}

#[test]
fn pak_filename_leading_trailing_stripped() {
    assert_eq!(pak_filename("  My Mod  "), "My_Mod.pak");
}

#[test]
fn pak_filename_allowed_chars_preserved() {
    assert_eq!(
        pak_filename("CSA-39_Assault.Rifle"),
        "CSA-39_Assault.Rifle.pak"
    );
}

#[test]
fn pak_filename_special_chars_removed() {
    // trailing separator from '>' is trimmed by trim_matches('_')
    assert_eq!(pak_filename("Mod: \"Test\" <v1>"), "Mod_Test_v1.pak");
}

// ── hash_filename ─────────────────────────────────────────────────────────

#[test]
fn hash_filename_is_deterministic() {
    assert_eq!(hash_filename("foo.pak"), hash_filename("foo.pak"));
}

#[test]
fn hash_filename_is_negative() {
    let h = hash_filename("foo.pak");
    assert!(h < 0);
}

#[test]
fn hash_filename_different_inputs_differ() {
    assert_ne!(hash_filename("foo.pak"), hash_filename("bar.pak"));
}

#[test]
fn hash_filename_empty_returns_minus_one() {
    assert_eq!(hash_filename(""), -1);
}

// ── make_uid ──────────────────────────────────────────────────────────────

#[test]
fn make_uid_with_file_id() {
    assert_eq!(make_uid(Some(42), "003_foo.pak"), "42");
}

#[test]
fn make_uid_without_file_id_prefixed() {
    assert_eq!(make_uid(None, "003_foo.pak"), "foo.pak");
}

#[test]
fn make_uid_without_file_id_unprefixed() {
    assert_eq!(make_uid(None, "foo.pak"), "foo.pak");
}

// ── get_folder_path ───────────────────────────────────────────────────────

fn folder(id: &str, disk_name: &str, parent_id: Option<&str>) -> ModFolder {
    ModFolder {
        id: id.to_string(),
        disk_name: disk_name.to_string(),
        display_name: disk_name.to_string(),
        priority: 1,
        parent_id: parent_id.map(str::to_string),
    }
}

#[test]
fn folder_path_none_id() {
    assert_eq!(get_folder_path(&[], None), None);
}

#[test]
fn folder_path_id_not_in_list() {
    assert_eq!(get_folder_path(&[], Some("missing")), None);
}

#[test]
fn folder_path_root_folder() {
    let folders = vec![folder("a", "001_weapons", None)];
    assert_eq!(
        get_folder_path(&folders, Some("a")),
        Some("001_weapons".to_string())
    );
}

#[test]
fn folder_path_one_level_nested() {
    let folders = vec![
        folder("a", "001_weapons", None),
        folder("b", "002_rifles", Some("a")),
    ];
    assert_eq!(
        get_folder_path(&folders, Some("b")),
        Some("001_weapons/002_rifles".to_string())
    );
}

#[test]
fn folder_path_two_levels_nested() {
    let folders = vec![
        folder("a", "001_weapons", None),
        folder("b", "002_rifles", Some("a")),
        folder("c", "003_ak47", Some("b")),
    ];
    assert_eq!(
        get_folder_path(&folders, Some("c")),
        Some("001_weapons/002_rifles/003_ak47".to_string())
    );
}

// ── read_state ────────────────────────────────────────────────────────────

#[test]
fn read_state_missing_file_returns_default() {
    let path = std::path::Path::new("/nonexistent/path/.pd3mm.json");
    let state = read_state(path);
    assert!(state.mods.is_empty());
    assert!(state.folders.is_empty());
}

#[test]
fn read_state_invalid_json_returns_default() {
    let mut f = NamedTempFile::new().unwrap();
    write!(f, "not valid json").unwrap();
    let state = read_state(f.path());
    assert!(state.mods.is_empty());
}

#[test]
fn read_state_valid_json_round_trips() {
    let json = r#"{
        "folders": [],
        "mods": [{
            "uid": "42",
            "id": 100,
            "name": "Test Mod",
            "version": "1.0",
            "filename": "001_Test_Mod.pak",
            "enabled": true,
            "installedAt": "2024-01-01T00:00:00Z"
        }]
    }"#;
    let mut f = NamedTempFile::new().unwrap();
    write!(f, "{}", json).unwrap();
    let state = read_state(f.path());
    assert_eq!(state.mods.len(), 1);
    assert_eq!(state.mods[0].uid, "42");
    assert_eq!(state.mods[0].name, "Test Mod");
    assert!(state.mods[0].enabled);
}

#[test]
fn read_state_missing_uid_synthesized_from_file_id() {
    let json = r#"{
        "folders": [],
        "mods": [{
            "id": 100,
            "name": "Test Mod",
            "version": "1.0",
            "filename": "001_Test_Mod.pak",
            "enabled": true,
            "installedAt": "2024-01-01T00:00:00Z",
            "fileId": 55
        }]
    }"#;
    let mut f = NamedTempFile::new().unwrap();
    write!(f, "{}", json).unwrap();
    let state = read_state(f.path());
    assert_eq!(state.mods[0].uid, "55");
}

#[test]
fn read_state_missing_uid_and_file_id_uses_stripped_filename() {
    let json = r#"{
        "folders": [],
        "mods": [{
            "id": 100,
            "name": "Test Mod",
            "version": "1.0",
            "filename": "001_Test_Mod.pak",
            "enabled": true,
            "installedAt": "2024-01-01T00:00:00Z"
        }]
    }"#;
    let mut f = NamedTempFile::new().unwrap();
    write!(f, "{}", json).unwrap();
    let state = read_state(f.path());
    assert_eq!(state.mods[0].uid, "Test_Mod.pak");
}

#[test]
fn read_state_missing_parent_id_defaults_to_none() {
    let json = r#"{
        "folders": [{
            "id": "f1",
            "diskName": "001_weapons",
            "displayName": "weapons",
            "priority": 1
        }],
        "mods": []
    }"#;
    let mut f = NamedTempFile::new().unwrap();
    write!(f, "{}", json).unwrap();
    let state = read_state(f.path());
    assert_eq!(state.folders[0].parent_id, None);
}

// ── InstalledMod.location field ───────────────────────────────────────────

#[test]
fn read_state_location_field_round_trips() {
    let json = r#"{
        "folders": [],
        "mods": [{
            "uid": "99",
            "id": 1,
            "name": "BeardLib Mod",
            "version": "1.0",
            "filename": "some_mod",
            "enabled": true,
            "installedAt": "2024-01-01T00:00:00Z",
            "location": "mod_overrides"
        }]
    }"#;
    let mut f = NamedTempFile::new().unwrap();
    write!(f, "{}", json).unwrap();
    let state = read_state(f.path());
    assert_eq!(state.mods[0].location.as_deref(), Some("mod_overrides"));
}

#[test]
fn read_state_missing_location_is_none() {
    let json = r#"{
        "folders": [],
        "mods": [{
            "uid": "42",
            "id": 100,
            "name": "Test Mod",
            "version": "1.0",
            "filename": "001_Test_Mod.pak",
            "enabled": true,
            "installedAt": "2024-01-01T00:00:00Z"
        }]
    }"#;
    let mut f = NamedTempFile::new().unwrap();
    write!(f, "{}", json).unwrap();
    let state = read_state(f.path());
    assert_eq!(state.mods[0].location, None);
}

// ── PD2 multi-target engine ───────────────────────────────────────────────

#[test]
fn pd2_engine_has_two_targets() {
    let cfg = engine_for_game("pd2");
    assert_eq!(cfg.targets.len(), 2);
    assert_eq!(cfg.targets[0].tag, "mods");
    assert_eq!(cfg.targets[1].tag, "mod_overrides");
}

#[test]
fn target_for_none_returns_primary() {
    let cfg = engine_for_game("pd2");
    assert_eq!(cfg.target_for(None).tag, "mods");
}

#[test]
fn target_for_secondary_tag_routes_correctly() {
    let cfg = engine_for_game("pd2");
    assert_eq!(cfg.target_for(Some("mod_overrides")).tag, "mod_overrides");
}

#[test]
fn target_for_unknown_tag_falls_back_to_primary() {
    let cfg = engine_for_game("pd2");
    assert_eq!(cfg.target_for(Some("nonexistent")).tag, "mods");
}

// ── classify_archive_dirs ────────────────────────────────────────────────

fn classify(names: &[&str]) -> Vec<(String, Option<String>)> {
    let owned: Vec<String> = names.iter().map(|s| s.to_string()).collect();
    classify_archive_dirs(&owned, engine_for_game("pd2"))
}

fn tag_of<'a>(v: &'a [(String, Option<String>)], dir: &str) -> Option<&'a Option<String>> {
    v.iter().find(|(d, _)| d == dir).map(|(_, t)| t)
}

#[test]
fn classify_single_beardlib_mod_routes_to_primary() {
    let dirs = classify(&["MyMod/main.xml", "MyMod/assets/x.texture"]);
    assert_eq!(dirs, vec![("MyMod".to_string(), None)]);
}

#[test]
fn classify_single_blt_mod_routes_to_primary() {
    let dirs = classify(&["MyMod/mod.txt", "MyMod/lua/x.lua"]);
    assert_eq!(dirs, vec![("MyMod".to_string(), None)]);
}

#[test]
fn classify_single_override_mod_routes_to_overrides() {
    let dirs = classify(&["MyOverride/guis/x.texture"]);
    assert_eq!(
        dirs,
        vec![("MyOverride".to_string(), Some("mod_overrides".to_string()))]
    );
}

#[test]
fn classify_multiple_overrides_all_secondary() {
    let dirs = classify(&["OverrideA/guis/a.texture", "OverrideB/units/b.unit"]);
    assert_eq!(
        tag_of(&dirs, "OverrideA"),
        Some(&Some("mod_overrides".into()))
    );
    assert_eq!(
        tag_of(&dirs, "OverrideB"),
        Some(&Some("mod_overrides".into()))
    );
}

#[test]
fn classify_mixed_modpack_routes_each_dir_to_its_target() {
    // RAMP-shaped: a wrapper with a "mods" folder and an "overrides" folder; the overrides
    // folder mixes BeardLib mods (have main.xml → must go to mods/) and asset-only dirs.
    let dirs = classify(&[
        "Pack/mods folder/BeardlibMod/main.xml",
        "Pack/mods folder/BltMod/mod.txt",
        "Pack/overrides folder/BeardlibOverride/main.xml",
        "Pack/overrides folder/AssetMod/guis/x.texture",
        "Pack/overrides folder/AssetMod2/units/y.unit",
    ]);
    // Marker dirs → primary (mods), regardless of which folder they were packaged in.
    assert_eq!(tag_of(&dirs, "Pack/mods folder/BeardlibMod"), Some(&None));
    assert_eq!(tag_of(&dirs, "Pack/mods folder/BltMod"), Some(&None));
    assert_eq!(
        tag_of(&dirs, "Pack/overrides folder/BeardlibOverride"),
        Some(&None)
    );
    // Marker-less sibling dirs → overrides.
    assert_eq!(
        tag_of(&dirs, "Pack/overrides folder/AssetMod"),
        Some(&Some("mod_overrides".into()))
    );
    assert_eq!(
        tag_of(&dirs, "Pack/overrides folder/AssetMod2"),
        Some(&Some("mod_overrides".into()))
    );
}

#[test]
fn classify_excludes_wrapper_and_nested_paths() {
    let dirs = classify(&[
        "Pack/mods folder/BltMod/mod.txt",
        "Pack/overrides folder/AssetMod/guis/x.texture",
    ]);
    // The wrapper and the destination folders (ancestors of mod dirs) are never installed.
    assert_eq!(tag_of(&dirs, "Pack"), None);
    assert_eq!(tag_of(&dirs, "Pack/mods folder"), None);
    assert_eq!(tag_of(&dirs, "Pack/overrides folder"), None);
    // Nested content under an override mod is not a separate mod.
    assert_eq!(tag_of(&dirs, "Pack/overrides folder/AssetMod/guis"), None);
    assert_eq!(dirs.len(), 2);
}

#[test]
fn classify_empty_archive_is_empty() {
    assert!(classify(&["readme.txt"]).is_empty());
}

#[test]
fn classify_unwraps_inner_mod_overrides_segment() {
    // HQ-Inventory-Icons shape: an override mod re-wrapped inside its own
    // assets/mod_overrides/<name>, sitting next to an inner BLT mod with a marker.
    let dirs = classify(&[
        "Pack/overrides folder/HQ/assets/mod_overrides/HQ/guis/x.texture",
        "Pack/overrides folder/HQ/mods/HQ/mod.txt",
    ]);
    // The asset half installs un-nested (the dir inside the segment, not the outer wrapper).
    assert_eq!(
        tag_of(&dirs, "Pack/overrides folder/HQ/assets/mod_overrides/HQ"),
        Some(&Some("mod_overrides".into()))
    );
    // The inner BLT mod still routes to mods/.
    assert_eq!(
        tag_of(&dirs, "Pack/overrides folder/HQ/mods/HQ"),
        Some(&None)
    );
    // The outer wrapper is never installed directly (would double-nest).
    assert_eq!(tag_of(&dirs, "Pack/overrides folder/HQ"), None);
    assert_eq!(dirs.len(), 2);
}

#[test]
fn classify_mixes_bare_and_wrapped_overrides() {
    let dirs = classify(&[
        "Pack/mods folder/BltMod/mod.txt",
        "Pack/overrides folder/Bare/units/x.unit",
        "Pack/overrides folder/Wrapped/assets/mod_overrides/Wrapped/guis/y.texture",
    ]);
    assert_eq!(tag_of(&dirs, "Pack/mods folder/BltMod"), Some(&None));
    assert_eq!(
        tag_of(&dirs, "Pack/overrides folder/Bare"),
        Some(&Some("mod_overrides".into()))
    );
    assert_eq!(
        tag_of(
            &dirs,
            "Pack/overrides folder/Wrapped/assets/mod_overrides/Wrapped"
        ),
        Some(&Some("mod_overrides".into()))
    );
    assert_eq!(tag_of(&dirs, "Pack/overrides folder/Wrapped"), None);
    assert_eq!(dirs.len(), 3);
}

#[test]
fn classify_ignores_beardlib_internal_overrides() {
    // A BeardLib mod (has main.xml) that carries its own assets/mod_overrides internally must
    // stay a single mods/ mod — its internals are not separate override mods.
    let dirs = classify(&[
        "Pack/mods folder/BeardMod/main.xml",
        "Pack/mods folder/BeardMod/assets/mod_overrides/Internal/x.texture",
    ]);
    assert_eq!(dirs, vec![("Pack/mods folder/BeardMod".to_string(), None)]);
}

#[test]
fn classify_pure_wrapped_override_pack() {
    // No markers anywhere, override content wrapped in a destination segment.
    let dirs = classify(&[
        "Pack/assets/mod_overrides/Foo/guis/a.texture",
        "Pack/assets/mod_overrides/Bar/units/b.unit",
    ]);
    assert_eq!(
        tag_of(&dirs, "Pack/assets/mod_overrides/Foo"),
        Some(&Some("mod_overrides".into()))
    );
    assert_eq!(
        tag_of(&dirs, "Pack/assets/mod_overrides/Bar"),
        Some(&Some("mod_overrides".into()))
    );
    assert_eq!(tag_of(&dirs, "Pack"), None);
    assert_eq!(dirs.len(), 2);
}

// ── find_untracked_paks multi-target ─────────────────────────────────────

fn make_dir_mod(parent: &std::path::Path, name: &str, marker: &str) {
    let dir = parent.join(name);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join(marker), b"").unwrap();
}

#[tokio::test]
async fn find_untracked_paks_primary_has_no_location() {
    let tmp = TempDir::new().unwrap();
    let mods_dir = tmp.path().join("mods");
    fs::create_dir_all(&mods_dir).unwrap();
    make_dir_mod(&mods_dir, "my_blt_mod", "mod.txt");

    let cfg = engine_for_game("pd2");
    let results = find_untracked_paks(tmp.path().to_str().unwrap(), &HashSet::new(), cfg).await;

    assert_eq!(results.len(), 1);
    let (rel, enabled, location) = &results[0];
    assert_eq!(rel, "my_blt_mod");
    assert!(*enabled);
    assert_eq!(*location, None);
}

#[tokio::test]
async fn find_untracked_paks_secondary_has_location_tag() {
    let tmp = TempDir::new().unwrap();
    let mo_dir = tmp.path().join("assets").join("mod_overrides");
    fs::create_dir_all(&mo_dir).unwrap();
    make_dir_mod(&mo_dir, "my_beardlib_mod", "main.xml");

    let cfg = engine_for_game("pd2");
    let results = find_untracked_paks(tmp.path().to_str().unwrap(), &HashSet::new(), cfg).await;

    assert_eq!(results.len(), 1);
    let (rel, enabled, location) = &results[0];
    assert_eq!(rel, "my_beardlib_mod");
    assert!(*enabled);
    assert_eq!(location.as_deref(), Some("mod_overrides"));
}

#[tokio::test]
async fn find_untracked_paks_known_filter_isolates_by_target() {
    let tmp = TempDir::new().unwrap();
    let mods_dir = tmp.path().join("mods");
    let mo_dir = tmp.path().join("assets").join("mod_overrides");
    fs::create_dir_all(&mods_dir).unwrap();
    fs::create_dir_all(&mo_dir).unwrap();
    make_dir_mod(&mods_dir, "shared_name", "mod.txt");
    make_dir_mod(&mo_dir, "shared_name", "main.xml");

    let cfg = engine_for_game("pd2");
    // Mark the primary-target entry as known; secondary entry must still be reported.
    let known: HashSet<String> = [":shared_name".to_string()].into();
    let results = find_untracked_paks(tmp.path().to_str().unwrap(), &known, cfg).await;

    assert_eq!(results.len(), 1);
    let (rel, _, location) = &results[0];
    assert_eq!(rel, "shared_name");
    assert_eq!(location.as_deref(), Some("mod_overrides"));
}

#[tokio::test]
async fn find_untracked_paks_skips_target_when_backup_exists() {
    let tmp = TempDir::new().unwrap();
    let mods_dir = tmp.path().join("mods");
    let mods_bak = tmp.path().join("mods.bak");
    let mo_dir = tmp.path().join("assets").join("mod_overrides");
    fs::create_dir_all(&mods_dir).unwrap();
    fs::create_dir_all(&mods_bak).unwrap();
    fs::create_dir_all(&mo_dir).unwrap();
    make_dir_mod(&mods_dir, "blt_mod", "mod.txt");
    make_dir_mod(&mo_dir, "beardlib_mod", "main.xml");

    let cfg = engine_for_game("pd2");
    let results = find_untracked_paks(tmp.path().to_str().unwrap(), &HashSet::new(), cfg).await;

    // Primary skipped (backup exists), only secondary returned.
    assert_eq!(results.len(), 1);
    let (rel, _, location) = &results[0];
    assert_eq!(rel, "beardlib_mod");
    assert_eq!(location.as_deref(), Some("mod_overrides"));
}

#[tokio::test]
async fn find_untracked_paks_skips_blt_basemod() {
    let tmp = TempDir::new().unwrap();
    let mods_dir = tmp.path().join("mods");
    fs::create_dir_all(&mods_dir).unwrap();
    make_dir_mod(&mods_dir, "base", "mod.txt");
    make_dir_mod(&mods_dir, "my_blt_mod", "mod.txt");

    let cfg = engine_for_game("pd2");
    let results = find_untracked_paks(tmp.path().to_str().unwrap(), &HashSet::new(), cfg).await;

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].0, "my_blt_mod");
}

#[tokio::test]
async fn find_untracked_paks_keeps_base_in_secondary_target() {
    let tmp = TempDir::new().unwrap();
    let mo_dir = tmp.path().join("assets").join("mod_overrides");
    fs::create_dir_all(mo_dir.join("base")).unwrap();

    let cfg = engine_for_game("pd2");
    let results = find_untracked_paks(tmp.path().to_str().unwrap(), &HashSet::new(), cfg).await;

    assert_eq!(results.len(), 1);
    let (rel, _, location) = &results[0];
    assert_eq!(rel, "base");
    assert_eq!(location.as_deref(), Some("mod_overrides"));
}

// ── safe_dest (Zip-Slip guard) ────────────────────────────────────────────

#[test]
fn safe_dest_allows_normal_nested_path() {
    let dest = std::path::Path::new("/tmp/out");
    assert_eq!(
        safe_dest(dest, "sub/file.pak"),
        Some(std::path::PathBuf::from("/tmp/out/sub/file.pak"))
    );
}

#[test]
fn safe_dest_allows_current_dir_segments() {
    let dest = std::path::Path::new("/tmp/out");
    assert_eq!(
        safe_dest(dest, "./file.pak"),
        Some(std::path::PathBuf::from("/tmp/out/./file.pak"))
    );
}

#[test]
fn safe_dest_rejects_parent_traversal() {
    let dest = std::path::Path::new("/tmp/out");
    assert_eq!(safe_dest(dest, "../escape.pak"), None);
    assert_eq!(safe_dest(dest, "sub/../../escape.pak"), None);
}

#[test]
fn safe_dest_rejects_absolute_path() {
    let dest = std::path::Path::new("/tmp/out");
    assert_eq!(safe_dest(dest, "/etc/passwd"), None);
}

// ── extract_dir_entry Zip-Slip behavior ───────────────────────────────────

#[test]
fn extract_dir_entry_drops_traversal_entries() {
    // An archive whose mod directory smuggles a `../` entry must not write outside dest.
    let zip = make_zip(&[
        ("mymod/main.xml", b"safe"),
        ("mymod/../escape.pak", b"malicious"),
    ]);
    let out = TempDir::new().unwrap();
    let dest = out.path().join("extracted");
    extract_dir_entry(zip.path(), "mymod", &dest).unwrap();

    assert_eq!(fs::read(dest.join("main.xml")).unwrap(), b"safe");
    // The traversal target (sibling of dest) must never be created.
    assert!(!out.path().join("escape.pak").exists());
}

// ── embedded_modworkshop_id (BeardLib AssetUpdates) ───────────────────────────

fn dir_with_main_xml(content: &str) -> TempDir {
    let tmp = TempDir::new().unwrap();
    fs::write(tmp.path().join("main.xml"), content).unwrap();
    tmp
}

#[test]
fn embedded_id_reads_standard_assetupdates() {
    let d = dir_with_main_xml(
        r#"<mod name="x"><AssetUpdates id="19169" version="1.859" provider="modworkshop"/></mod>"#,
    );
    assert_eq!(
        embedded_modworkshop_id(d.path()),
        Some((19169, Some("1.859".to_string())))
    );
}

#[test]
fn embedded_id_is_attribute_order_independent() {
    let d = dir_with_main_xml(r#"<AssetUpdates provider="modworkshop" id="51099"/>"#);
    assert_eq!(embedded_modworkshop_id(d.path()), Some((51099, None)));
}

#[test]
fn embedded_id_defaults_provider_to_modworkshop() {
    let d = dir_with_main_xml(r#"<AssetUpdates id="123" version="2"/>"#);
    assert_eq!(
        embedded_modworkshop_id(d.path()),
        Some((123, Some("2".to_string())))
    );
}

#[test]
fn embedded_id_rejects_other_providers() {
    let d = dir_with_main_xml(r#"<AssetUpdates id="5" provider="github"/>"#);
    assert_eq!(embedded_modworkshop_id(d.path()), None);
}

#[test]
fn embedded_id_none_without_assetupdates() {
    let d = dir_with_main_xml(r#"<mod name="gray_cowl" author="HedyL"></mod>"#);
    assert_eq!(embedded_modworkshop_id(d.path()), None);
}

#[test]
fn embedded_id_none_without_main_xml() {
    let tmp = TempDir::new().unwrap();
    assert_eq!(embedded_modworkshop_id(tmp.path()), None);
}

#[test]
fn embedded_id_rejects_non_numeric_id() {
    let d = dir_with_main_xml(r#"<AssetUpdates id="abc" provider="modworkshop"/>"#);
    assert_eq!(embedded_modworkshop_id(d.path()), None);
}

#[test]
fn embedded_id_ignores_substring_attribute_names() {
    // `someid="7"` must not be mistaken for `id`.
    let d = dir_with_main_xml(r#"<AssetUpdates someid="7" id="42" provider="modworkshop"/>"#);
    assert_eq!(embedded_modworkshop_id(d.path()), Some((42, None)));
}

// ── identify_untracked (hash → embedded-id → name priority) ───────────────────

fn make_index() -> rusqlite::Connection {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch(
        "CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT);
         CREATE TABLE sources (id INTEGER PRIMARY KEY, game_id INTEGER);
         CREATE TABLE mods (id INTEGER PRIMARY KEY, source_id INTEGER, remote_id INTEGER, name TEXT);
         CREATE TABLE files (id INTEGER PRIMARY KEY, mod_id INTEGER, remote_id INTEGER, sha256 TEXT, version TEXT, entry_name TEXT NOT NULL DEFAULT '');
         INSERT INTO games VALUES (2, 'PAYDAY 2');
         INSERT INTO sources VALUES (2, 2);",
    )
    .unwrap();
    conn
}

fn make_mod_dir(
    game: &std::path::Path,
    location: Option<&str>,
    name: &str,
    marker: &str,
    body: &str,
) {
    let base = match location {
        Some("mod_overrides") => game.join("assets").join("mod_overrides"),
        _ => game.join("mods"),
    };
    let dir = base.join(name);
    fs::create_dir_all(&dir).unwrap();
    fs::write(dir.join(marker), body).unwrap();
}

fn run_identify(
    game: &std::path::Path,
    untracked: Vec<(String, bool, Option<String>)>,
    sha256s: Vec<Option<String>>,
    conn: &rusqlite::Connection,
) -> Vec<InstalledMod> {
    let mut state = ModsState::default();
    identify_untracked(
        &mut state,
        &untracked,
        &sha256s,
        &std::collections::HashMap::new(),
        engine_for_game("pd2"),
        game.to_str().unwrap(),
        Some(conn),
    )
}

#[test]
fn identify_untracked_uses_embedded_id_when_hash_misses() {
    let game = TempDir::new().unwrap();
    make_mod_dir(
        game.path(),
        None,
        "My Cool Mod",
        "main.xml",
        r#"<AssetUpdates id="300" version="2.0" provider="modworkshop"/>"#,
    );
    let conn = make_index();
    conn.execute_batch(
        "INSERT INTO mods VALUES (1, 2, 300, 'Cool Mod (Official Name)');
         INSERT INTO files VALUES (1, 1, 700, 'indexsha', '2.5', 'x/main.xml');",
    )
    .unwrap();

    let mods = run_identify(
        game.path(),
        vec![("My Cool Mod".to_string(), true, None)],
        vec![Some("does-not-match".to_string())],
        &conn,
    );

    assert_eq!(mods.len(), 1);
    let m = &mods[0];
    assert_eq!(m.id, 300); // identified by the embedded modworkshop id
    assert_eq!(m.name, "Cool Mod (Official Name)"); // real name pulled from the index
    assert_eq!(m.file_id, None); // a drifted install pins no specific file
    assert_eq!(m.version, "2.0"); // installed version = the mod's own declaration
}

#[test]
fn identify_untracked_hash_beats_embedded_id() {
    let game = TempDir::new().unwrap();
    make_mod_dir(
        game.path(),
        None,
        "My Cool Mod",
        "main.xml",
        r#"<AssetUpdates id="300" version="2.0" provider="modworkshop"/>"#,
    );
    let conn = make_index();
    conn.execute_batch(
        "INSERT INTO mods VALUES (1, 2, 300, 'Embedded Mod');
         INSERT INTO mods VALUES (2, 2, 999, 'Hash Match Mod');
         INSERT INTO files VALUES (1, 2, 555, 'deadbeef', '9.0', 'x/main.xml');",
    )
    .unwrap();

    let mods = run_identify(
        game.path(),
        vec![("My Cool Mod".to_string(), true, None)],
        vec![Some("deadbeef".to_string())], // marker hash matches mod 999
        &conn,
    );

    let m = &mods[0];
    assert_eq!(m.id, 999); // exact hash wins over the embedded id 300
    assert_eq!(m.name, "Hash Match Mod");
    assert_eq!(m.file_id, Some(555));
    assert_eq!(m.version, "9.0");
}

#[test]
fn identify_untracked_embedded_without_version_uses_index_version() {
    let game = TempDir::new().unwrap();
    make_mod_dir(
        game.path(),
        Some("mod_overrides"),
        "Beardlib Mod",
        "main.xml",
        r#"<AssetUpdates id="301" provider="modworkshop"/>"#,
    );
    let conn = make_index();
    conn.execute_batch(
        "INSERT INTO mods VALUES (1, 2, 301, 'Beardlib Mod Official');
         INSERT INTO files VALUES (1, 1, 800, 'sha', '3.3', 'x/main.xml');",
    )
    .unwrap();

    let mods = run_identify(
        game.path(),
        vec![(
            "Beardlib Mod".to_string(),
            true,
            Some("mod_overrides".to_string()),
        )],
        vec![Some("nomatch".to_string())],
        &conn,
    );

    let m = &mods[0];
    assert_eq!(m.id, 301);
    assert_eq!(m.version, "3.3"); // no declared version → index's current version (avoids false update)
    assert_eq!(m.file_id, None);
}

#[test]
fn identify_untracked_falls_back_to_name_without_embedded() {
    let game = TempDir::new().unwrap();
    // mod.txt mod — no main.xml, so no embedded id; resolution drops to name match.
    make_mod_dir(game.path(), None, "SomeMod", "mod.txt", "{}");
    let conn = make_index();
    conn.execute_batch(
        "INSERT INTO mods VALUES (1, 2, 555, 'SomeMod');
         INSERT INTO files VALUES (1, 1, 900, 'othersha', '1.0', 'x/mod.txt');",
    )
    .unwrap();

    let mods = run_identify(
        game.path(),
        vec![("SomeMod".to_string(), true, None)],
        vec![Some("nomatch".to_string())],
        &conn,
    );

    let m = &mods[0];
    assert_eq!(m.id, 555); // matched by name
    assert_eq!(m.file_id, None);
    assert_eq!(m.version, "unknown");
}

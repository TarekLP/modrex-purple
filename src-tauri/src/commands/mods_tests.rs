use super::*;
use std::fs::File;
use std::io::Write;
use tempfile::NamedTempFile;

fn make_zip(entries: &[(&str, &[u8])]) -> NamedTempFile {
    let f = NamedTempFile::new().unwrap();
    let mut zip = zip::ZipWriter::new(File::create(f.path()).unwrap());
    let opts = zip::write::SimpleFileOptions::default();
    for (name, data) in entries {
        zip.start_file(*name, opts).unwrap();
        zip.write_all(data).unwrap();
    }
    zip.finish().unwrap();
    f
}

// ── is_zip ────────────────────────────────────────────────────────────────────

#[test]
fn is_zip_detects_zip_magic() {
    let zip = make_zip(&[("mod.pak", b"fake pak content")]);
    assert!(is_zip(zip.path()));
}

#[test]
fn is_zip_rejects_non_zip() {
    let mut f = NamedTempFile::new().unwrap();
    f.write_all(b"\xC1\x83\x2A\x9E").unwrap();
    assert!(!is_zip(f.path()));
}

#[test]
fn is_zip_rejects_empty_file() {
    let f = NamedTempFile::new().unwrap();
    assert!(!is_zip(f.path()));
}

// ── list_pak_entries_in_zip ───────────────────────────────────────────────────

#[test]
fn list_pak_entries_finds_pak_files() {
    let zip = make_zip(&[
        ("readme.txt", b"hello"),
        ("weapons_default.pak", b"pak content"),
        ("weapons_alt.pak", b"pak content 2"),
    ]);
    let mut entries = list_pak_entries_in_zip(zip.path()).unwrap();
    entries.sort();
    assert_eq!(entries, vec!["weapons_alt.pak", "weapons_default.pak"]);
}

#[test]
fn list_pak_entries_empty_when_no_paks() {
    let zip = make_zip(&[("readme.txt", b"hello"), ("data.bin", b"data")]);
    let entries = list_pak_entries_in_zip(zip.path()).unwrap();
    assert!(entries.is_empty());
}

#[test]
fn list_pak_entries_handles_nested_paths() {
    let zip = make_zip(&[("Real Weapon Names/weapons_default.pak", b"content")]);
    let entries = list_pak_entries_in_zip(zip.path()).unwrap();
    assert_eq!(entries, vec!["Real Weapon Names/weapons_default.pak"]);
}

// ── extract_zip_entry ─────────────────────────────────────────────────────────

#[test]
fn extract_zip_entry_writes_correct_bytes() {
    let content = b"this is a pak file";
    let zip = make_zip(&[("my_mod.pak", content)]);
    let dest = NamedTempFile::new().unwrap();
    extract_zip_entry(zip.path(), "my_mod.pak", dest.path()).unwrap();
    let written = std::fs::read(dest.path()).unwrap();
    assert_eq!(written, content);
}

#[test]
fn extract_zip_entry_errors_on_missing_entry() {
    let zip = make_zip(&[("other.pak", b"content")]);
    let dest = NamedTempFile::new().unwrap();
    let result = extract_zip_entry(zip.path(), "nonexistent.pak", dest.path());
    assert!(result.is_err());
}

#[test]
fn extract_zip_entry_handles_nested_path() {
    let content = b"nested pak content";
    let zip = make_zip(&[("Real Weapon Names/weapons_default.pak", content)]);
    let dest = NamedTempFile::new().unwrap();
    extract_zip_entry(zip.path(), "Real Weapon Names/weapons_default.pak", dest.path()).unwrap();
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
    assert_eq!(pak_filename("CSA-39_Assault.Rifle"), "CSA-39_Assault.Rifle.pak");
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
    assert_eq!(get_folder_path(&folders, Some("a")), Some("001_weapons".to_string()));
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

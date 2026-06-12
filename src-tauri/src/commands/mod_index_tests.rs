use super::*;

fn setup_db() -> rusqlite::Connection {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch("
        CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE sources (id INTEGER PRIMARY KEY, game_id INTEGER);
        CREATE TABLE mods (id INTEGER PRIMARY KEY, source_id INTEGER, remote_id INTEGER, name TEXT);
        CREATE TABLE files (id INTEGER PRIMARY KEY, mod_id INTEGER, remote_id INTEGER, sha256 TEXT, version TEXT, entry_name TEXT NOT NULL DEFAULT '');

        INSERT INTO games VALUES (1, 'PAYDAY 3');
        INSERT INTO games VALUES (2, 'PAYDAY 2');
        INSERT INTO sources VALUES (1, 1);
        INSERT INTO sources VALUES (2, 2);
        INSERT INTO mods VALUES (1, 1, 100, 'CSA-39 Assault Rifle');
        INSERT INTO mods VALUES (2, 1, 200, 'Dark Matter Skins');
        INSERT INTO mods VALUES (3, 2, 300, 'Better Crosshair Customizer (+customfov)');
        INSERT INTO files VALUES (1, 1, 500, 'aabbcc', '1.0.0', 'csa39.pak');
        INSERT INTO files VALUES (2, 2, 600, 'ddeeff', '2.0.0', 'DarkMatterSkins/zDarkMatter_AG-9.pak');
        INSERT INTO files VALUES (3, 3, 700, 'ff1122', '1.5.0', '');
        INSERT INTO files VALUES (4, 2, 600, '112233', '2.0.0', 'DarkMatterSkins/zDarkMatter_Bison.pak');
        INSERT INTO files VALUES (5, 2, 600, '445566', '2.0.0', '');
    ").unwrap();
    conn
}

// ── query_sha256 ──────────────────────────────────────────────────────────

#[test]
fn sha256_known_hash_returns_match() {
    let conn = setup_db();
    let result = query_sha256(&conn, "aabbcc", "PAYDAY 3").unwrap();
    assert_eq!(result.mod_remote_id, 100);
    assert_eq!(result.mod_name, "CSA-39 Assault Rifle");
    assert_eq!(result.file_remote_id, 500);
    assert_eq!(result.version, "1.0.0");
}

#[test]
fn sha256_unknown_hash_returns_none() {
    let conn = setup_db();
    assert!(query_sha256(&conn, "000000", "PAYDAY 3").is_none());
}

#[test]
fn sha256_wrong_game_returns_none() {
    let conn = setup_db();
    // "aabbcc" is a PD3 file — must not match when querying PD2
    assert!(query_sha256(&conn, "aabbcc", "PAYDAY 2").is_none());
}

#[test]
fn sha256_pd2_hash_returns_pd2_match() {
    let conn = setup_db();
    let result = query_sha256(&conn, "ff1122", "PAYDAY 2").unwrap();
    assert_eq!(result.mod_remote_id, 300);
}

// ── query_by_name ─────────────────────────────────────────────────────────

#[test]
fn by_name_exact_unique_match_returns_id() {
    let conn = setup_db();
    assert_eq!(query_by_name(&conn, "CSA-39 Assault Rifle", "PAYDAY 3"), Some(100));
}

#[test]
fn by_name_partial_unique_match_returns_id() {
    let conn = setup_db();
    assert_eq!(query_by_name(&conn, "CSA-39", "PAYDAY 3"), Some(100));
}

#[test]
fn by_name_no_match_returns_none() {
    let conn = setup_db();
    assert!(query_by_name(&conn, "nonexistent mod", "PAYDAY 3").is_none());
}

#[test]
fn by_name_ambiguous_two_matches_returns_none() {
    let conn = setup_db();
    // both PD3 mod names contain "a" — ambiguous within PAYDAY 3
    assert!(query_by_name(&conn, "a", "PAYDAY 3").is_none());
}

#[test]
fn by_name_wrong_game_returns_none() {
    let conn = setup_db();
    // "Better Crosshair" exists only in PD2 — must not match when querying PD3
    assert!(query_by_name(&conn, "Better Crosshair", "PAYDAY 3").is_none());
}

#[test]
fn by_name_pd2_mod_matches_in_pd2() {
    let conn = setup_db();
    assert_eq!(query_by_name(&conn, "Better Crosshair", "PAYDAY 2"), Some(300));
}

// ── query_mod_files ───────────────────────────────────────────────────────

#[test]
fn mod_files_returns_named_entries_in_id_order() {
    let conn = setup_db();
    let result = query_mod_files(&conn, 200, "PAYDAY 3");
    assert_eq!(result.len(), 2);
    assert_eq!(result[0].file_remote_id, 600);
    assert_eq!(result[0].entry_name, "DarkMatterSkins/zDarkMatter_AG-9.pak");
    assert_eq!(result[1].entry_name, "DarkMatterSkins/zDarkMatter_Bison.pak");
}

#[test]
fn mod_files_excludes_rows_without_entry_name() {
    let conn = setup_db();
    // mod 300's only row predates the entry_name column (empty)
    assert!(query_mod_files(&conn, 300, "PAYDAY 2").is_empty());
}

#[test]
fn mod_files_wrong_game_returns_empty() {
    let conn = setup_db();
    assert!(query_mod_files(&conn, 200, "PAYDAY 2").is_empty());
}

#[test]
fn mod_files_unknown_mod_returns_empty() {
    let conn = setup_db();
    assert!(query_mod_files(&conn, 999, "PAYDAY 3").is_empty());
}

#[test]
fn mod_files_old_schema_without_column_returns_empty() {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch("
        CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE sources (id INTEGER PRIMARY KEY, game_id INTEGER);
        CREATE TABLE mods (id INTEGER PRIMARY KEY, source_id INTEGER, remote_id INTEGER, name TEXT);
        CREATE TABLE files (id INTEGER PRIMARY KEY, mod_id INTEGER, remote_id INTEGER, sha256 TEXT, version TEXT);
        INSERT INTO games VALUES (1, 'PAYDAY 3');
        INSERT INTO sources VALUES (1, 1);
        INSERT INTO mods VALUES (1, 1, 100, 'CSA-39 Assault Rifle');
        INSERT INTO files VALUES (1, 1, 500, 'aabbcc', '1.0.0');
    ").unwrap();
    assert!(query_mod_files(&conn, 100, "PAYDAY 3").is_empty());
}

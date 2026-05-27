use super::*;

fn setup_db() -> rusqlite::Connection {
    let conn = rusqlite::Connection::open_in_memory().unwrap();
    conn.execute_batch("
        CREATE TABLE games (id INTEGER PRIMARY KEY, name TEXT);
        CREATE TABLE sources (id INTEGER PRIMARY KEY, game_id INTEGER);
        CREATE TABLE mods (id INTEGER PRIMARY KEY, source_id INTEGER, remote_id INTEGER, name TEXT);
        CREATE TABLE files (id INTEGER PRIMARY KEY, mod_id INTEGER, remote_id INTEGER, sha256 TEXT, version TEXT);

        INSERT INTO games VALUES (1, 'PAYDAY 3');
        INSERT INTO sources VALUES (1, 1);
        INSERT INTO mods VALUES (1, 1, 100, 'CSA-39 Assault Rifle');
        INSERT INTO mods VALUES (2, 1, 200, 'Dark Matter Skins');
        INSERT INTO files VALUES (1, 1, 500, 'aabbcc', '1.0.0');
        INSERT INTO files VALUES (2, 2, 600, 'ddeeff', '2.0.0');
    ").unwrap();
    conn
}

// ── query_sha256 ──────────────────────────────────────────────────────────

#[test]
fn sha256_known_hash_returns_match() {
    let conn = setup_db();
    let result = query_sha256(&conn, "aabbcc").unwrap();
    assert_eq!(result.mod_remote_id, 100);
    assert_eq!(result.mod_name, "CSA-39 Assault Rifle");
    assert_eq!(result.file_remote_id, 500);
    assert_eq!(result.version, "1.0.0");
}

#[test]
fn sha256_unknown_hash_returns_none() {
    let conn = setup_db();
    assert!(query_sha256(&conn, "000000").is_none());
}

// ── query_by_name ─────────────────────────────────────────────────────────

#[test]
fn by_name_exact_unique_match_returns_id() {
    let conn = setup_db();
    assert_eq!(query_by_name(&conn, "CSA-39 Assault Rifle"), Some(100));
}

#[test]
fn by_name_partial_unique_match_returns_id() {
    let conn = setup_db();
    assert_eq!(query_by_name(&conn, "CSA-39"), Some(100));
}

#[test]
fn by_name_no_match_returns_none() {
    let conn = setup_db();
    assert!(query_by_name(&conn, "nonexistent mod").is_none());
}

#[test]
fn by_name_ambiguous_two_matches_returns_none() {
    let conn = setup_db();
    // both mod names contain "a" — ambiguous
    assert!(query_by_name(&conn, "a").is_none());
}

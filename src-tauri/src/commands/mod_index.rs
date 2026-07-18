use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const INDEX_URL: &str =
    "https://github.com/modrexio/modrex-index/releases/download/latest-index/index.db";
const MAX_AGE_SECS: u64 = 3600;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexMatch {
    pub mod_remote_id: i64,
    pub mod_name: String,
    pub file_remote_id: i64,
    pub version: String,
}

#[derive(Debug, Clone, serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct IndexModFile {
    pub file_remote_id: i64,
    pub entry_name: String,
}

pub fn index_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join("mod-index.db")
}

pub async fn ensure_index(app: AppHandle) {
    let outcome = refresh_index(&app).await;
    crate::commands::analytics::track(
        &app,
        "index_refresh",
        serde_json::json!({ "outcome": outcome }),
    );
}

/// Refreshes the on-disk index if stale, returning the outcome for telemetry.
/// Outcomes: `cached` (still fresh), `updated` (downloaded), or a specific failure.
async fn refresh_index(app: &AppHandle) -> &'static str {
    let path = index_path(app);
    if path.exists() {
        let age_ok = std::fs::metadata(&path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.elapsed().ok())
            .map(|e| e.as_secs() < MAX_AGE_SECS)
            .unwrap_or(false);
        if age_ok {
            return "cached";
        }
    }
    let client = match reqwest::Client::builder()
        .user_agent(concat!("modrex/", env!("CARGO_PKG_VERSION")))
        // The index is a single multi-megabyte download that grows with the catalog. A whole
        // request deadline aborts a healthy but slow connection partway through the body,
        // stranding the user with no index and every mod unidentified, and it only gets
        // tighter as the index grows. Bound the connect attempt and per-read stalls instead:
        // a dead host still fails fast, but a slow steady download is allowed to finish.
        .connect_timeout(std::time::Duration::from_secs(15))
        .read_timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(_) => return "client_error",
    };
    let resp = match client.get(INDEX_URL).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            log::warn!("mod_index: download failed: HTTP {}", r.status());
            return "http_error";
        }
        Err(e) => {
            log::warn!("mod_index: download failed: {e}");
            return "network_error";
        }
    };
    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            log::warn!("mod_index: read response body failed: {e}");
            return "read_error";
        }
    };
    // The refresh runs fire-and-forget while get_installed holds this same file open
    // read-only for identification. Overwriting the multi-megabyte index in place lets that
    // reader observe a truncated database, and a crash mid-write leaves a short file carrying
    // a fresh mtime that still reads as cached for the next hour. Stage into a sibling temp
    // file and rename over the live index instead: rename is atomic on one volume, so a
    // reader always opens a whole database, old or new.
    let tmp = path.with_extension("db.tmp");
    if let Err(e) = std::fs::write(&tmp, &bytes) {
        log::warn!("mod_index: write failed: {e}");
        return "write_error";
    }
    if let Err(e) = std::fs::rename(&tmp, &path) {
        log::warn!("mod_index: rename failed: {e}");
        let _ = std::fs::remove_file(&tmp);
        return "write_error";
    }
    "updated"
}

fn open_conn(path: &std::path::Path) -> Option<rusqlite::Connection> {
    rusqlite::Connection::open_with_flags(
        path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()
}

/// Opens the on-disk index once so a caller can run several queries against one connection
/// instead of reopening per lookup. Returns None when the index is absent.
pub(crate) fn open_index(app: &AppHandle) -> Option<rusqlite::Connection> {
    let path = index_path(app);
    if !path.exists() {
        return None;
    }
    open_conn(&path)
}

/// Returns true when the index contains at least one mod entry for the given game name.
/// Used to gate index-gated scanning: if the game isn't indexed yet, we can't reliably
/// distinguish framework modules from user mods, so we show everything instead of nothing.
pub(crate) fn has_game(conn: &rusqlite::Connection, game_name: &str) -> bool {
    conn.query_row(
        "SELECT 1 FROM games WHERE name = ?1 LIMIT 1",
        rusqlite::params![game_name],
        |_| Ok(()),
    )
    .is_ok()
}

pub(crate) fn query_sha256(
    conn: &rusqlite::Connection,
    sha256: &str,
    game_name: &str,
) -> Option<IndexMatch> {
    conn.query_row(
        "SELECT m.remote_id, m.name, f.remote_id, f.version
         FROM files f
         JOIN mods m ON m.id = f.mod_id
         JOIN sources s ON s.id = m.source_id
         JOIN games g ON g.id = s.game_id
         WHERE f.sha256 = ?1 AND g.name = ?2
         LIMIT 1",
        rusqlite::params![sha256, game_name],
        |row| {
            Ok(IndexMatch {
                mod_remote_id: row.get(0)?,
                mod_name: row.get(1)?,
                file_remote_id: row.get(2)?,
                version: row.get(3)?,
            })
        },
    )
    .ok()
}

/// Resolves a modworkshop mod id to its name and current (latest indexed) file. Used to
/// enrich mods identified by an embedded AssetUpdates id. The index is append-only, so the
/// highest file id is the newest version.
pub(crate) fn query_mod_by_id(
    conn: &rusqlite::Connection,
    mod_remote_id: i64,
    game_name: &str,
) -> Option<IndexMatch> {
    conn.query_row(
        "SELECT m.remote_id, m.name, f.remote_id, f.version
         FROM files f
         JOIN mods m ON m.id = f.mod_id
         JOIN sources s ON s.id = m.source_id
         JOIN games g ON g.id = s.game_id
         WHERE m.remote_id = ?1 AND g.name = ?2
         ORDER BY f.id DESC
         LIMIT 1",
        rusqlite::params![mod_remote_id, game_name],
        |row| {
            Ok(IndexMatch {
                mod_remote_id: row.get(0)?,
                mod_name: row.get(1)?,
                file_remote_id: row.get(2)?,
                version: row.get(3)?,
            })
        },
    )
    .ok()
}

pub(crate) fn query_by_name(
    conn: &rusqlite::Connection,
    name: &str,
    game_name: &str,
) -> Option<i64> {
    // Escape LIKE metacharacters so a mod name that literally contains % or _ matches as
    // itself instead of as a wildcard. Escape the backslash first, or it would double-escape
    // the escapes added for % and _ on the following lines.
    let escaped = name
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_");
    let pattern = format!("%{}%", escaped);
    // Join files so a name only resolves to a mod that actually has indexed content: a mod
    // with no files cannot be the source of an installed pak, and anchoring on files keeps
    // this in step with the sha256 and id lookups above. DISTINCT collapses the one row per
    // file the join would otherwise produce, so a single many-file mod still reads as one
    // match and does not trip the ambiguity guard below.
    let mut stmt = conn
        .prepare(
            "SELECT DISTINCT m.remote_id FROM mods m
             JOIN files f ON f.mod_id = m.id
             JOIN sources s ON s.id = m.source_id
             JOIN games g ON g.id = s.game_id
             WHERE m.name LIKE ?1 ESCAPE '\\' AND g.name = ?2
             LIMIT 2",
        )
        .ok()?;
    let rows: Vec<i64> = stmt
        .query_map(rusqlite::params![pattern, game_name], |row| row.get(0))
        .ok()?
        .filter_map(|r| r.ok())
        .collect();
    (rows.len() == 1).then(|| rows[0])
}

fn query_mod_files(
    conn: &rusqlite::Connection,
    mod_remote_id: i64,
    game_name: &str,
) -> Vec<IndexModFile> {
    let mut stmt = match conn.prepare(
        "SELECT f.remote_id, f.entry_name
         FROM files f
         JOIN mods m ON m.id = f.mod_id
         JOIN sources s ON s.id = m.source_id
         JOIN games g ON g.id = s.game_id
         WHERE m.remote_id = ?1 AND g.name = ?2 AND f.entry_name != ''
         ORDER BY f.id",
    ) {
        Ok(s) => s,
        // index.db predating the entry_name column (1-hour TTL transition)
        Err(_) => return Vec::new(),
    };
    stmt.query_map(rusqlite::params![mod_remote_id, game_name], |row| {
        Ok(IndexModFile {
            file_remote_id: row.get(0)?,
            entry_name: row.get(1)?,
        })
    })
    .map(|rows| rows.filter_map(|r| r.ok()).collect())
    .unwrap_or_default()
}

pub fn lookup_mod_files(app: &AppHandle, mod_remote_id: i64, game_name: &str) -> Vec<IndexModFile> {
    let path = index_path(app);
    if !path.exists() {
        return Vec::new();
    }
    match open_conn(&path) {
        Some(conn) => query_mod_files(&conn, mod_remote_id, game_name),
        None => Vec::new(),
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_index_mod_files(
    app: AppHandle,
    mod_id: i64,
    game_id: Option<String>,
) -> Vec<IndexModFile> {
    let cfg = crate::commands::mods::engine_for_game(game_id.as_deref().unwrap_or("pd3"));
    lookup_mod_files(&app, mod_id, cfg.index_game_name)
}

pub fn lookup_sha256(app: &AppHandle, sha256: &str, game_name: &str) -> Option<IndexMatch> {
    let path = index_path(app);
    if !path.exists() {
        return None;
    }
    let conn = open_conn(&path)?;
    query_sha256(&conn, sha256, game_name)
}

#[cfg(test)]
#[path = "mod_index_tests.rs"]
mod tests;

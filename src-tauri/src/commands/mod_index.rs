use std::path::PathBuf;
use tauri::{AppHandle, Manager};

const INDEX_URL: &str = "https://github.com/modrexio/modrex-index/releases/download/latest-index/index.db";
const MAX_AGE_SECS: u64 = 3600;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IndexMatch {
    pub mod_remote_id: i64,
    pub mod_name: String,
    pub file_remote_id: i64,
    pub version: String,
}

pub fn index_path(app: &AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .expect("failed to resolve app data dir")
        .join("mod-index.db")
}

pub async fn ensure_index(app: AppHandle) {
    let path = index_path(&app);
    if path.exists() {
        let age_ok = std::fs::metadata(&path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.elapsed().ok())
            .map(|e| e.as_secs() < MAX_AGE_SECS)
            .unwrap_or(false);
        if age_ok {
            return;
        }
    }
    let client = match reqwest::Client::builder()
        .user_agent(concat!("modrex/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(30))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };
    let resp = match client.get(INDEX_URL).send().await {
        Ok(r) if r.status().is_success() => r,
        Ok(r) => {
            eprintln!("[mod-index] download failed: HTTP {}", r.status());
            return;
        }
        Err(e) => {
            eprintln!("[mod-index] download failed: {}", e);
            return;
        }
    };
    let bytes = match resp.bytes().await {
        Ok(b) => b,
        Err(e) => {
            eprintln!("[mod-index] read response body failed: {}", e);
            return;
        }
    };
    if let Err(e) = std::fs::write(&path, &bytes) {
        eprintln!("[mod-index] write failed: {}", e);
    }
}

pub fn lookup_sha256(app: &AppHandle, sha256: &str) -> Option<IndexMatch> {
    let path = index_path(app);
    if !path.exists() {
        return None;
    }
    let conn = rusqlite::Connection::open_with_flags(
        &path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()?;
    conn.query_row(
        "SELECT m.remote_id, m.name, f.remote_id, f.version
         FROM files f
         JOIN mods m ON m.id = f.mod_id
         WHERE f.sha256 = ?1
         LIMIT 1",
        rusqlite::params![sha256],
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

pub fn lookup_by_name(app: &AppHandle, name: &str) -> Option<i64> {
    let path = index_path(app);
    if !path.exists() {
        return None;
    }
    let conn = rusqlite::Connection::open_with_flags(
        &path,
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_NO_MUTEX,
    )
    .ok()?;
    let pattern = format!("%{}%", name);
    let mut stmt = conn
        .prepare("SELECT remote_id FROM mods WHERE name LIKE ?1 LIMIT 2")
        .ok()?;
    let rows: Vec<i64> = stmt
        .query_map(rusqlite::params![pattern], |row| row.get(0))
        .ok()?
        .filter_map(|r| r.ok())
        .collect();
    if rows.len() == 1 { Some(rows[0]) } else { None }
}

use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

use crate::commands::mod_index::{index_dir, legacy_index_path};

/// Sizes in bytes of the app's regenerable on-disk caches, for the Settings
/// storage view. settings.json (user data) and the renderer's localStorage
/// mod-metadata cache are measured and cleared elsewhere.
#[derive(serde::Serialize, specta::Type)]
#[serde(rename_all = "camelCase")]
pub struct StorageUsage {
    pub thumbnails: u64,
    pub index_db: u64,
    pub news: u64,
}

fn thumbnails_dir(app: &AppHandle) -> Option<PathBuf> {
    app.path()
        .app_cache_dir()
        .ok()
        .map(|d| d.join("thumbnails"))
}

fn news_files(app: &AppHandle) -> Vec<PathBuf> {
    let Ok(dir) = app.path().app_data_dir() else {
        return Vec::new();
    };
    let Ok(entries) = std::fs::read_dir(dir) else {
        return Vec::new();
    };
    entries
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n.starts_with("news-") && n.ends_with(".json"))
        })
        .collect()
}

// Flat, files-only: the thumbnails cache is a flat directory of image files,
// matching thumbnails::cleanup_dir.
fn dir_size(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    entries
        .flatten()
        .filter_map(|e| e.metadata().ok())
        .filter(|m| m.is_file())
        .map(|m| m.len())
        .sum()
}

// Leaves the directory itself in place so the cache can refill.
fn remove_files_in(dir: &Path) -> u64 {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return 0;
    };
    let mut freed = 0u64;
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else {
            continue;
        };
        if !meta.is_file() {
            continue;
        }
        if std::fs::remove_file(entry.path()).is_ok() {
            freed += meta.len();
        }
    }
    freed
}

/// Deletes a single file, returning the bytes freed (0 if it was absent or the
/// removal failed, e.g. a live handle on Windows).
fn remove_file_freed(path: &Path) -> u64 {
    let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
    if std::fs::remove_file(path).is_ok() {
        size
    } else {
        0
    }
}

#[tauri::command]
#[specta::specta]
pub fn get_storage_usage(app: AppHandle) -> StorageUsage {
    let thumbnails = thumbnails_dir(&app).map(|d| dir_size(&d)).unwrap_or(0);
    let index_db = dir_size(&index_dir(&app))
        + std::fs::metadata(legacy_index_path(&app))
            .map(|m| m.len())
            .unwrap_or(0);
    let news = news_files(&app)
        .iter()
        .filter_map(|p| std::fs::metadata(p).ok())
        .map(|m| m.len())
        .sum();
    StorageUsage {
        thumbnails,
        index_db,
        news,
    }
}

#[tauri::command]
#[specta::specta]
pub fn clear_thumbnail_cache(app: AppHandle) -> u64 {
    thumbnails_dir(&app)
        .map(|d| remove_files_in(&d))
        .unwrap_or(0)
}

#[tauri::command]
#[specta::specta]
pub fn clear_index_cache(app: AppHandle) -> u64 {
    remove_files_in(&index_dir(&app)) + remove_file_freed(&legacy_index_path(&app))
}

#[tauri::command]
#[specta::specta]
pub fn clear_news_cache(app: AppHandle) -> u64 {
    news_files(&app).iter().map(|p| remove_file_freed(p)).sum()
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;

    #[test]
    fn dir_size_sums_flat_files() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("a"), b"12345").unwrap();
        fs::write(tmp.path().join("b"), b"678").unwrap();
        assert_eq!(dir_size(tmp.path()), 8);
    }

    #[test]
    fn dir_size_missing_dir_is_zero() {
        assert_eq!(dir_size(Path::new("nonexistent-dir-xyz")), 0);
    }

    #[test]
    fn remove_files_in_frees_and_empties() {
        let tmp = tempfile::tempdir().unwrap();
        fs::write(tmp.path().join("a"), b"12345").unwrap();
        fs::write(tmp.path().join("b"), b"678").unwrap();
        let freed = remove_files_in(tmp.path());
        assert_eq!(freed, 8);
        assert_eq!(dir_size(tmp.path()), 0);
    }

    #[test]
    fn remove_file_freed_reports_size_then_zero() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("f");
        fs::write(&p, b"abcd").unwrap();
        assert_eq!(remove_file_freed(&p), 4);
        assert!(!p.exists());
        assert_eq!(remove_file_freed(&p), 0);
    }
}

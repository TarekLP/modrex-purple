use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use std::time::{Duration, SystemTime};
use tauri::{AppHandle, Manager};
use tokio::sync::Semaphore;

const CACHE_MAX_AGE: Duration = Duration::from_secs(90 * 24 * 60 * 60);

const THUMBNAIL_BASE_URL: &str = "https://storage.modworkshop.net/mods/images";

static HTTP_CLIENT: OnceLock<reqwest::Client> = OnceLock::new();
static SEMAPHORE: OnceLock<Semaphore> = OnceLock::new();

fn client() -> &'static reqwest::Client {
    HTTP_CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .pool_max_idle_per_host(6)
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap()
    })
}

fn semaphore() -> &'static Semaphore {
    SEMAPHORE.get_or_init(|| Semaphore::new(6))
}

fn cache_path(app: &AppHandle, filename: &str) -> Result<PathBuf, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("thumbnails").join(filename))
}

#[tauri::command]
pub async fn get_thumbnail(app: AppHandle, filename: String) -> Result<String, String> {
    let path = cache_path(&app, &filename)?;

    if path.exists() {
        return Ok(path.to_string_lossy().into_owned());
    }

    let _permit = semaphore().acquire().await.map_err(|e| e.to_string())?;

    // Re-check: a concurrent call may have downloaded it while we waited
    if path.exists() {
        return Ok(path.to_string_lossy().into_owned());
    }

    tokio::fs::create_dir_all(path.parent().expect("cache path has parent"))
        .await
        .map_err(|e| e.to_string())?;

    let url = format!("{}/{}", THUMBNAIL_BASE_URL, filename);
    let bytes = client()
        .get(&url)
        .header("User-Agent", format!("modrex/{}", app.package_info().version))
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;

    let tmp = path.with_extension("tmp");
    tokio::fs::write(&tmp, &bytes).await.map_err(|e| e.to_string())?;
    tokio::fs::rename(&tmp, &path).await.map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().into_owned())
}

pub(crate) fn cleanup_dir(dir: &Path, max_age: Duration) {
    let cutoff = SystemTime::now() - max_age;
    let Ok(entries) = std::fs::read_dir(dir) else { return };
    for entry in entries.flatten() {
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() { continue }
        let Ok(modified) = meta.modified() else { continue };
        if modified < cutoff {
            let _ = std::fs::remove_file(entry.path());
        }
    }
}

pub async fn cleanup_thumbnail_cache(app: AppHandle) {
    let dir = match app.path().app_cache_dir() {
        Ok(d) => d.join("thumbnails"),
        Err(_) => return,
    };
    tokio::task::spawn_blocking(move || cleanup_dir(&dir, CACHE_MAX_AGE))
        .await
        .ok();
}

#[cfg(test)]
#[path = "thumbnails_tests.rs"]
mod tests;

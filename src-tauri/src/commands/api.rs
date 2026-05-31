use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::sync::OnceLock;
use std::time::Duration;
use tauri::AppHandle;
use tokio::sync::Semaphore;

const BASE: &str = "https://api.modworkshop.net";
const GAME_ID: u32 = 853;
const MAX_CONCURRENT: usize = 3;

static API_SEMAPHORE: OnceLock<Semaphore> = OnceLock::new();
static HTTP_CLIENT: OnceLock<Client> = OnceLock::new();

fn semaphore() -> &'static Semaphore {
    API_SEMAPHORE.get_or_init(|| Semaphore::new(MAX_CONCURRENT))
}

fn http_client() -> &'static Client {
    HTTP_CLIENT.get_or_init(|| Client::builder().pool_max_idle_per_host(4).build().unwrap())
}

fn user_agent(app: &AppHandle) -> String {
    format!("modrex/{}", app.package_info().version)
}

pub(crate) async fn api_get(app: &AppHandle, path: &str, params: Vec<(&str, String)>) -> Result<Value, String> {
    let mut url = reqwest::Url::parse(&format!("{}{}", BASE, path)).map_err(|e| e.to_string())?;
    {
        let mut pairs = url.query_pairs_mut();
        for (k, v) in &params {
            pairs.append_pair(k, v);
        }
    }
    let client = http_client();
    let ua = user_agent(app);

    for attempt in 0..3 {
        let _permit = semaphore().acquire().await.map_err(|e| e.to_string())?;
        let res = client
            .get(url.clone())
            .header("Accept", "application/json")
            .header("User-Agent", &ua)
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if res.status() == 429 {
            drop(_permit);
            let retry_ms = res
                .headers()
                .get("retry-after")
                .and_then(|v| v.to_str().ok())
                .and_then(|v| v.parse::<u64>().ok())
                .map(|s| s * 1000)
                .unwrap_or_else(|| {
                    let nanos = std::time::SystemTime::now()
                        .duration_since(std::time::UNIX_EPOCH)
                        .unwrap_or_default()
                        .subsec_nanos();
                    1500 + (nanos % 1500) as u64 * (attempt + 1)
                });
            tokio::time::sleep(Duration::from_millis(retry_ms)).await;
            continue;
        }

        if !res.status().is_success() {
            return Err(format!("modworkshop API {}: {}", res.status(), path));
        }
        return res.json().await.map_err(|e| e.to_string());
    }

    Err(format!("modworkshop API 429: {}", path))
}

#[derive(Debug, Deserialize)]
pub struct ListModsParams {
    pub query: Option<String>,
    pub limit: Option<u32>,
    pub sort: Option<String>,
    pub category_id: Option<u32>,
    pub page: Option<u32>,
}

#[tauri::command]
pub async fn list_mods(app: AppHandle, params: Option<ListModsParams>) -> Result<Value, String> {
    let mut query: Vec<(&str, String)> = vec![];
    if let Some(p) = &params {
        if let Some(v) = &p.query { query.push(("query", v.clone())); }
        if let Some(v) = p.limit { query.push(("limit", v.to_string())); }
        if let Some(v) = &p.sort { query.push(("sort", v.clone())); }
        if let Some(v) = p.category_id { query.push(("category_id", v.to_string())); }
        if let Some(v) = p.page { query.push(("page", v.to_string())); }
    }
    api_get(&app, &format!("/games/{}/mods", GAME_ID), query).await
}

#[tauri::command]
pub async fn get_mod(app: AppHandle, id: u32) -> Result<Value, String> {
    api_get(&app, &format!("/mods/{}", id), vec![]).await
}

#[tauri::command]
pub async fn get_latest_file(app: AppHandle, mod_id: u32) -> Result<Value, String> {
    api_get(&app, &format!("/mods/{}/files/latest", mod_id), vec![]).await
}

#[tauri::command]
pub async fn list_mod_files(app: AppHandle, mod_id: u32) -> Result<Value, String> {
    api_get(&app, &format!("/mods/{}/files", mod_id), vec![]).await
}

#[tauri::command]
pub async fn list_mod_links(app: AppHandle, mod_id: u32) -> Result<Value, String> {
    api_get(&app, &format!("/mods/{}/links", mod_id), vec![]).await
}

#[tauri::command]
pub async fn list_categories(app: AppHandle) -> Result<Value, String> {
    api_get(&app, &format!("/games/{}/categories", GAME_ID), vec![]).await
}

#[tauri::command]
pub async fn register_download(app: AppHandle, file_id: u32) -> Result<(), String> {
    let _permit = semaphore().acquire().await.map_err(|e| e.to_string())?;
    http_client()
        .post(format!("{}/files/{}/register-download", BASE, file_id))
        .header("User-Agent", user_agent(&app))
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

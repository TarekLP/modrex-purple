use reqwest::Client;
use serde::Deserialize;
use serde_json::Value;
use std::time::Duration;
use tauri::AppHandle;

const BASE: &str = "https://api.modworkshop.net";
const GAME_ID: u32 = 853;

fn user_agent(app: &AppHandle) -> String {
    format!("modrex/{}", app.package_info().version)
}

async fn api_get(app: &AppHandle, path: &str, params: Vec<(&str, String)>) -> Result<Value, String> {
    let mut url = reqwest::Url::parse(&format!("{}{}", BASE, path)).map_err(|e| e.to_string())?;
    {
        let mut pairs = url.query_pairs_mut();
        for (k, v) in &params {
            pairs.append_pair(k, v);
        }
    }
    let res = Client::new()
        .get(url)
        .header("Accept", "application/json")
        .header("User-Agent", user_agent(app))
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("modworkshop API {}: {}", res.status(), path));
    }
    res.json().await.map_err(|e| e.to_string())
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
pub async fn list_categories(app: AppHandle) -> Result<Value, String> {
    api_get(&app, &format!("/games/{}/categories", GAME_ID), vec![]).await
}

#[tauri::command]
pub async fn register_download(file_id: u32) -> Result<(), String> {
    Client::new()
        .post(format!("{}/files/{}/register-download", BASE, file_id))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    Ok(())
}

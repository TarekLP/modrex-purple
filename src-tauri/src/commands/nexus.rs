// Prototype only. Personal API key — Nexus's Acceptable Use Policy forbids
// that auth mode in a public build, so nothing here is wired into a release
// path yet. Nexus's REST v1 has no free-text search endpoint, only fixed
// listings (updated/latest_added/trending), unlike modworkshop's query param.

use reqwest::header::HeaderMap;
use serde_json::Value;
use std::sync::atomic::{AtomicI64, Ordering};
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use tauri::AppHandle;

use crate::commands::api::{http_client, user_agent};
use crate::commands::settings::read_settings;

const BASE: &str = "https://api.nexusmods.com/v1";

// Nexus reports quota per-request via X-RL-Hourly-Remaining, undocumented
// but observed live. No confirmed steady rate exists ahead of time, so this
// bucket starts conservative and the low-remaining pause below is what
// actually protects the budget once real headers come back.
const RATE_BURST: f64 = 2.0;
const RATE_PER_SEC: f64 = 0.5;

static RATE_REMAINING: AtomicI64 = AtomicI64::new(-1);
const LOW_REMAINING_THRESHOLD: i64 = 5;
const LOW_REMAINING_PAUSE: Duration = Duration::from_secs(5);

fn parse_hourly_remaining(headers: &HeaderMap) -> Option<i64> {
    headers
        .get("x-rl-hourly-remaining")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<i64>().ok())
}

struct TokenBucket {
    tokens: f64,
    max: f64,
    refill_per_ms: f64,
    last_refill: Instant,
}

impl TokenBucket {
    fn new(max: f64, per_second: f64) -> Self {
        Self {
            tokens: max,
            max,
            refill_per_ms: per_second / 1000.0,
            last_refill: Instant::now(),
        }
    }

    fn consume(&mut self) -> Duration {
        let now = Instant::now();
        let elapsed_ms = now.duration_since(self.last_refill).as_secs_f64() * 1000.0;
        self.tokens = (self.tokens + elapsed_ms * self.refill_per_ms).min(self.max);
        self.last_refill = now;
        if self.tokens >= 1.0 {
            self.tokens -= 1.0;
            Duration::ZERO
        } else {
            let wait_ms = ((1.0 - self.tokens) / self.refill_per_ms) as u64;
            Duration::from_millis(wait_ms)
        }
    }
}

static RATE_LIMITER: OnceLock<Mutex<TokenBucket>> = OnceLock::new();

fn rate_limiter() -> &'static Mutex<TokenBucket> {
    RATE_LIMITER.get_or_init(|| Mutex::new(TokenBucket::new(RATE_BURST, RATE_PER_SEC)))
}

// Only the two games Modrex actually installs to today are wired up — an
// unsupported id is a real error, not a silent fallback to a default game.
pub(crate) fn nexus_domain(game_id: &str) -> Result<&'static str, String> {
    match game_id {
        "pd3" => Ok("payday3"),
        "cb" => Ok("crimebossrockaycity"),
        other => Err(format!("nexus: no game domain mapping for '{other}'")),
    }
}

// Reverse of nexus_domain, for nxm:// links where Nexus hands us its own
// domain and we need the internal game_id to route the download.
pub(crate) fn game_id_for_domain(domain: &str) -> Result<&'static str, String> {
    match domain {
        "payday3" => Ok("pd3"),
        "crimebossrockaycity" => Ok("cb"),
        other => Err(format!("nexus: no game id mapping for domain '{other}'")),
    }
}

async fn nexus_get(
    app: &AppHandle,
    path: &str,
    query: Vec<(&str, String)>,
) -> Result<Value, String> {
    let api_key = read_settings(app)
        .nexus_api_key
        .filter(|k| !k.trim().is_empty())
        .ok_or_else(|| "nexus: no API key configured".to_string())?;

    let mut url = reqwest::Url::parse(&format!("{BASE}{path}")).map_err(|e| e.to_string())?;
    {
        let mut pairs = url.query_pairs_mut();
        for (k, v) in &query {
            pairs.append_pair(k, v);
        }
    }
    let client = http_client();
    let ua = user_agent(app);

    for attempt in 0u64..3 {
        let wait = rate_limiter()
            .lock()
            .unwrap_or_else(|e| e.into_inner())
            .consume();
        if !wait.is_zero() {
            tokio::time::sleep(wait).await;
        }

        let remaining = RATE_REMAINING.load(Ordering::Relaxed);
        if (0..=LOW_REMAINING_THRESHOLD).contains(&remaining) {
            tokio::time::sleep(LOW_REMAINING_PAUSE).await;
        }

        let res = client
            .get(url.clone())
            .header("apikey", &api_key)
            .header("Accept", "application/json")
            .header("User-Agent", &ua)
            .header("Application-Name", "Modrex")
            .header(
                "Application-Version",
                app.package_info().version.to_string(),
            )
            .timeout(Duration::from_secs(15))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        if let Some(remaining) = parse_hourly_remaining(res.headers()) {
            RATE_REMAINING.store(remaining, Ordering::Relaxed);
        }

        if res.status() == 429 {
            let base_ms = 1000u64 << attempt.min(3);
            tokio::time::sleep(Duration::from_millis(base_ms)).await;
            continue;
        }

        if res.status() == 403 {
            return Err(
                "nexus: 403 — this endpoint may require Premium, or the API key is invalid"
                    .to_string(),
            );
        }

        if !res.status().is_success() {
            return Err(format!("nexus API {}: {}", res.status(), path));
        }
        return res.json().await.map_err(|e| e.to_string());
    }

    Err(format!("nexus API 429: {path}"))
}

// period applies only to the "updated" listing: "1d", "1w", or "1m".
#[tauri::command]
pub async fn nexus_list_mods(
    app: AppHandle,
    game_id: String,
    listing: String,
    period: Option<String>,
) -> Result<Value, String> {
    let domain = nexus_domain(&game_id)?;
    let (path, query) = match listing.as_str() {
        "updated" => (
            format!("/games/{domain}/mods/updated.json"),
            vec![("period", period.unwrap_or_else(|| "1m".to_string()))],
        ),
        "latest_added" => (format!("/games/{domain}/mods/latest_added.json"), vec![]),
        "trending" => (format!("/games/{domain}/mods/trending.json"), vec![]),
        other => return Err(format!("nexus: unknown listing '{other}'")),
    };
    nexus_get(&app, &path, query).await
}

#[tauri::command]
pub async fn nexus_get_mod(app: AppHandle, game_id: String, mod_id: u32) -> Result<Value, String> {
    let domain = nexus_domain(&game_id)?;
    nexus_get(&app, &format!("/games/{domain}/mods/{mod_id}.json"), vec![]).await
}

#[tauri::command]
pub async fn nexus_list_mod_files(
    app: AppHandle,
    game_id: String,
    mod_id: u32,
) -> Result<Value, String> {
    let domain = nexus_domain(&game_id)?;
    nexus_get(
        &app,
        &format!("/games/{domain}/mods/{mod_id}/files.json"),
        vec![],
    )
    .await
}

// key/expires come from a real nxm:// link, proof the download was
// authorized via a site click — passing them lets this endpoint succeed for
// free accounts too. Omitted, it 403s free accounts by design (confirmed
// live, not a bug here); that direct path is for Premium only.
#[tauri::command]
pub async fn nexus_get_download_link(
    app: AppHandle,
    game_id: String,
    mod_id: u32,
    file_id: u32,
    key: Option<String>,
    expires: Option<String>,
) -> Result<Value, String> {
    let domain = nexus_domain(&game_id)?;
    let path = format!("/games/{domain}/mods/{mod_id}/files/{file_id}/download_link.json");
    let query = match (key, expires) {
        (Some(key), Some(expires)) => vec![("key", key), ("expires", expires)],
        (None, None) => vec![],
        _ => return Err("nexus: key and expires must be provided together".to_string()),
    };
    nexus_get(&app, &path, query).await
}

#[tauri::command]
pub async fn nexus_validate_key(app: AppHandle) -> Result<Value, String> {
    nexus_get(&app, "/users/validate.json", vec![]).await
}

#[cfg(test)]
#[path = "nexus_tests.rs"]
mod tests;

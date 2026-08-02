//! Anonymous, opt-in usage analytics via the GA4 Measurement Protocol.
//!
//! Events are sent from Rust rather than the webview, which keeps the consent gate
//! in one place, attaches reliable environment data (OS, arch, version), and cannot
//! be stripped by in-page ad blockers. Every send is fire-and-forget and failures
//! are swallowed, so analytics can never block or break the app.
//!
//! Requests go to https://modrex.net/api/collect, not Google directly. Sending from
//! Rust defeats only in-page blocking, whereas DNS-level and hosts-file blocklists
//! (Pi-hole, AdGuard Home, NextDNS, debloat-Windows scripts) and outbound firewalls
//! block google-analytics.com for every process on the machine, Rust included, and
//! this audience runs that tooling heavily. A Cloudflare Pages Function at
//! apps/site/functions/api/collect.ts forwards each request verbatim to GA4.
//!
//! Nothing is transmitted unless analytics_enabled is true in settings and the build
//! carries the GA credentials below. This module is the only place that knows the
//! backend is GA4, so swapping sinks is a change to send_event alone.

use crate::commands::api::{http_client, user_agent};
use crate::commands::settings;
use serde_json::{json, Value};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::AppHandle;

/// GA4 credentials, embedded at compile time. Absent in local and dev builds (and any
/// build without the CI secrets), which makes every send a no-op, so development never
/// pollutes production data. The API secret is write-only and rotatable, so shipping it
/// in the binary is low-risk.
fn measurement_id() -> Option<&'static str> {
    option_env!("MODREX_GA_MEASUREMENT_ID").filter(|s| !s.is_empty())
}

fn api_secret() -> Option<&'static str> {
    option_env!("MODREX_GA_API_SECRET").filter(|s| !s.is_empty())
}

/// Our own domain, not Google's, for the reason in the module doc. The Pages Function
/// behind this path forwards verbatim to GA4's mp/collect, so the query-string contract
/// (measurement_id, api_secret) is unchanged. Overridable at compile time for local
/// testing; release builds never set it and always get the production URL.
fn collect_url() -> &'static str {
    option_env!("MODREX_ANALYTICS_ENDPOINT")
        .filter(|s| !s.is_empty())
        .unwrap_or("https://modrex.net/api/collect")
}

/// One session id per app launch. GA4 needs session_id and engagement_time_msec on
/// events, or its session and realtime reports stay empty.
fn session_id() -> &'static str {
    static SID: OnceLock<String> = OnceLock::new();
    SID.get_or_init(|| {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_secs().to_string())
            .unwrap_or_else(|_| "0".to_string())
    })
}

/// Fire-and-forget an event. Safe to call from synchronous code. The network send
/// happens on the async runtime and any error is logged, never propagated.
pub(crate) fn track(app: &AppHandle, name: &str, params: Value) {
    let app = app.clone();
    let name = name.to_string();
    tauri::async_runtime::spawn(async move {
        send_event(&app, &name, params).await;
    });
}

async fn send_event(app: &AppHandle, name: &str, mut params: Value) {
    // Consent gate, the single choke point. No opt-in, nothing leaves the device.
    if !settings::read_settings(app).analytics_enabled {
        return;
    }
    let (Some(measurement_id), Some(api_secret)) = (measurement_id(), api_secret()) else {
        return;
    };

    inject_defaults(app, &mut params);

    let body = json!({
        "client_id": settings::ensure_analytics_id(app),
        "events": [{ "name": name, "params": params }],
    });

    let url = format!(
        "{}?measurement_id={measurement_id}&api_secret={api_secret}",
        collect_url()
    );
    let res = http_client()
        .post(&url)
        .header("User-Agent", user_agent(app))
        .timeout(std::time::Duration::from_secs(10))
        .json(&body)
        .send()
        .await;
    if let Err(e) = res {
        log::warn!("analytics send failed: {e}");
    }
}

/// Adds the properties every event carries. Callers can override any of them by
/// supplying the key themselves, since or_insert only fills what is missing.
fn inject_defaults(app: &AppHandle, params: &mut Value) {
    if !params.is_object() {
        *params = json!({});
    }
    let obj = params.as_object_mut().expect("params is an object");
    obj.entry("app_version")
        .or_insert_with(|| json!(app.package_info().version.to_string()));
    obj.entry("os")
        .or_insert_with(|| json!(std::env::consts::OS));
    obj.entry("arch")
        .or_insert_with(|| json!(std::env::consts::ARCH));
    obj.entry("session_id")
        .or_insert_with(|| json!(session_id()));
    obj.entry("engagement_time_msec")
        .or_insert_with(|| json!(100));
}

/// Renderer-origin events route through here. Rust-native events call track
/// directly. Both share the consent gate in send_event.
#[tauri::command]
#[specta::specta]
pub fn track_event(app: AppHandle, name: String, params: Option<crate::commands::api::Json>) {
    track(
        &app,
        &name,
        params.map(|p| p.0).unwrap_or_else(|| json!({})),
    );
}

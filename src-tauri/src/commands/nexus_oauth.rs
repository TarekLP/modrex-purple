// OAuth2 + PKCE (RFC 7636) against users.nexusmods.com, mirroring the flow
// the first-party NexusMods.App uses: public client (no secret), S256
// challenge, custom-scheme redirect, form-encoded token exchange, and the
// refresh_token grant. Endpoints verified live via
// users.nexusmods.com/.well-known/openid-configuration.

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use rand::RngCore;
use serde::Deserialize;
use sha2::{Digest, Sha256};
use std::sync::Mutex;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

use crate::commands::api::{http_client, user_agent};
use crate::commands::launchers::shell_open_external;
use crate::commands::settings::{read_settings, write_settings, NexusOAuthTokens};

const OAUTH_BASE: &str = "https://users.nexusmods.com/oauth";

// Placeholder until Nexus registers the app; their backend whitelists the
// (client_id, redirect_uri) pair, so both values here must match what
// registration assigns.
pub(crate) const CLIENT_ID: &str = "modrex";
pub(crate) const REDIRECT_URI: &str = "modrex://oauth/callback";

const SCOPE: &str = "openid profile email";

pub(crate) struct Pkce {
    pub verifier: String,
    pub challenge: String,
}

pub(crate) fn generate_pkce() -> Pkce {
    let mut bytes = [0u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    let verifier = URL_SAFE_NO_PAD.encode(bytes);
    let challenge = s256_challenge(&verifier);
    Pkce {
        verifier,
        challenge,
    }
}

fn s256_challenge(verifier: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(verifier.as_bytes()))
}

pub(crate) fn authorize_url(challenge: &str, state: &str) -> String {
    let mut url =
        reqwest::Url::parse(&format!("{OAUTH_BASE}/authorize")).expect("static oauth url");
    url.query_pairs_mut()
        .append_pair("response_type", "code")
        .append_pair("scope", SCOPE)
        .append_pair("code_challenge_method", "S256")
        .append_pair("client_id", CLIENT_ID)
        .append_pair("redirect_uri", REDIRECT_URI)
        .append_pair("code_challenge", challenge)
        .append_pair("state", state);
    url.to_string()
}

#[derive(Deserialize, Debug, Clone)]
pub(crate) struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub expires_in: u64,
}

pub(crate) async fn exchange_code(
    app: &AppHandle,
    code: &str,
    verifier: &str,
) -> Result<TokenResponse, String> {
    token_request(
        app,
        &[
            ("grant_type", "authorization_code"),
            ("client_id", CLIENT_ID),
            ("redirect_uri", REDIRECT_URI),
            ("code", code),
            ("code_verifier", verifier),
        ],
    )
    .await
}

pub(crate) async fn refresh_tokens(
    app: &AppHandle,
    refresh_token: &str,
) -> Result<TokenResponse, String> {
    token_request(
        app,
        &[
            ("grant_type", "refresh_token"),
            ("client_id", CLIENT_ID),
            ("refresh_token", refresh_token),
        ],
    )
    .await
}

async fn token_request(app: &AppHandle, params: &[(&str, &str)]) -> Result<TokenResponse, String> {
    let res = http_client()
        .post(format!("{OAUTH_BASE}/token"))
        .header("User-Agent", user_agent(app))
        .form(params)
        .timeout(Duration::from_secs(15))
        .send()
        .await
        .map_err(|e| e.to_string())?;
    if !res.status().is_success() {
        return Err(format!("nexus oauth token: {}", res.status()));
    }
    res.json().await.map_err(|e| e.to_string())
}

struct PendingLogin {
    verifier: String,
    state: String,
}

// One login attempt at a time; a new "sign in" click replaces any stale
// attempt whose browser tab the user abandoned.
static PENDING_LOGIN: Mutex<Option<PendingLogin>> = Mutex::new(None);

#[tauri::command]
pub fn nexus_oauth_start() {
    let pkce = generate_pkce();
    let state = uuid::Uuid::new_v4().to_string();
    let url = authorize_url(&pkce.challenge, &state);
    *PENDING_LOGIN.lock().unwrap_or_else(|e| e.into_inner()) = Some(PendingLogin {
        verifier: pkce.verifier,
        state,
    });
    shell_open_external(url);
}

// Callback shape: modrex://oauth/callback?code=...&state=..., or an
// error/error_description pair when the user denies the request.
pub(crate) fn parse_callback_url(url: &str) -> Result<(String, String), String> {
    let parsed =
        reqwest::Url::parse(url).map_err(|e| format!("nexus oauth: invalid callback: {e}"))?;
    let full = format!(
        "{}://{}{}",
        parsed.scheme(),
        parsed.host_str().unwrap_or(""),
        parsed.path()
    );
    if full != REDIRECT_URI {
        return Err(format!("nexus oauth: unexpected callback '{full}'"));
    }

    let pairs: std::collections::HashMap<_, _> = parsed.query_pairs().into_owned().collect();
    if let Some(error) = pairs.get("error") {
        let description = pairs
            .get("error_description")
            .map(|d| format!(": {d}"))
            .unwrap_or_default();
        return Err(format!("nexus oauth: {error}{description}"));
    }
    let code = pairs
        .get("code")
        .cloned()
        .ok_or("nexus oauth: missing code param")?;
    let state = pairs
        .get("state")
        .cloned()
        .ok_or("nexus oauth: missing state param")?;
    Ok((code, state))
}

pub fn spawn_handle_oauth_callback(app: &AppHandle, url: String) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = handle_oauth_callback(&app, &url).await {
            log::warn!("nexus oauth sign-in failed: {e}");
            let _ = app.emit("nexus-oauth:failed", e);
        }
    });
}

async fn handle_oauth_callback(app: &AppHandle, url: &str) -> Result<(), String> {
    let (code, state) = parse_callback_url(url)?;
    let pending = PENDING_LOGIN
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .take()
        .ok_or("nexus oauth: no sign-in in progress")?;
    if pending.state != state {
        return Err("nexus oauth: state mismatch".to_string());
    }

    let tokens = exchange_code(app, &code, &pending.verifier).await?;
    store_tokens(app, &tokens);
    log::info!("nexus oauth: signed in");
    app.emit("nexus-oauth:signed-in", ())
        .map_err(|e| e.to_string())
}

// Refresh a minute early so a token never expires mid-request.
const EXPIRY_MARGIN_SECS: i64 = 60;

fn needs_refresh(expires_at: i64, now: i64) -> bool {
    now + EXPIRY_MARGIN_SECS >= expires_at
}

// Serializes refreshes: concurrent requests (e.g. the nxm flow's joined pair)
// would otherwise both send the same refresh token, and if Nexus rotates
// refresh tokens the losing request would invalidate the winner's grant.
static REFRESH_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

// None = not signed in via OAuth (caller decides its fallback).
pub(crate) async fn access_token(app: &AppHandle) -> Result<Option<String>, String> {
    let Some(tokens) = read_settings(app).nexus_oauth else {
        return Ok(None);
    };
    if !needs_refresh(tokens.expires_at, chrono::Utc::now().timestamp()) {
        return Ok(Some(tokens.access_token));
    }

    let _guard = REFRESH_LOCK.lock().await;
    // Another request may have refreshed while this one waited on the lock.
    let Some(tokens) = read_settings(app).nexus_oauth else {
        return Ok(None);
    };
    if !needs_refresh(tokens.expires_at, chrono::Utc::now().timestamp()) {
        return Ok(Some(tokens.access_token));
    }

    let fresh = refresh_tokens(app, &tokens.refresh_token)
        .await
        .map_err(|e| format!("nexus oauth: token refresh failed ({e}), sign in again"))?;
    store_tokens(app, &fresh);
    Ok(Some(fresh.access_token))
}

pub(crate) fn store_tokens(app: &AppHandle, tokens: &TokenResponse) {
    let mut settings = read_settings(app);
    settings.nexus_oauth = Some(NexusOAuthTokens {
        access_token: tokens.access_token.clone(),
        refresh_token: tokens.refresh_token.clone(),
        expires_at: chrono::Utc::now().timestamp() + tokens.expires_in as i64,
    });
    write_settings(app, &settings);
}

#[cfg(test)]
#[path = "nexus_oauth_tests.rs"]
mod tests;

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
use std::time::Duration;
use tauri::AppHandle;

use crate::commands::api::{http_client, user_agent};

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

#[cfg(test)]
#[path = "nexus_oauth_tests.rs"]
mod tests;

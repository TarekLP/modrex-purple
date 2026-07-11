use super::*;

// RFC 7636 appendix B reference vector.
#[test]
fn s256_challenge_matches_rfc7636_vector() {
    assert_eq!(
        s256_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
        "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
    );
}

#[test]
fn generate_pkce_produces_valid_verifier() {
    let pkce = generate_pkce();
    // 32 random bytes base64url-encoded without padding is always 43 chars,
    // the RFC 7636 minimum verifier length.
    assert_eq!(pkce.verifier.len(), 43);
    assert!(pkce
        .verifier
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    assert_eq!(pkce.challenge, s256_challenge(&pkce.verifier));
}

#[test]
fn generate_pkce_is_random() {
    assert_ne!(generate_pkce().verifier, generate_pkce().verifier);
}

#[test]
fn authorize_url_carries_all_oauth_params() {
    let url = authorize_url("test-challenge", "test-state");
    let parsed = reqwest::Url::parse(&url).unwrap();
    assert_eq!(
        parsed.origin().ascii_serialization(),
        "https://users.nexusmods.com"
    );
    assert_eq!(parsed.path(), "/oauth/authorize");

    let params: std::collections::HashMap<String, String> =
        parsed.query_pairs().into_owned().collect();
    assert_eq!(params["response_type"], "code");
    assert_eq!(params["scope"], "openid profile email");
    assert_eq!(params["code_challenge_method"], "S256");
    assert_eq!(params["client_id"], CLIENT_ID);
    assert_eq!(params["redirect_uri"], REDIRECT_URI);
    assert_eq!(params["code_challenge"], "test-challenge");
    assert_eq!(params["state"], "test-state");
}

#[test]
fn parse_callback_extracts_code_and_state() {
    let (code, state) =
        parse_callback_url("modrex://oauth/callback?code=abc123&state=xyz").unwrap();
    assert_eq!(code, "abc123");
    assert_eq!(state, "xyz");
}

#[test]
fn parse_callback_rejects_other_schemes_and_paths() {
    assert!(parse_callback_url("nxm://oauth/callback?code=a&state=b").is_err());
    assert!(parse_callback_url("modrex://other/callback?code=a&state=b").is_err());
    assert!(parse_callback_url("modrex://oauth/other?code=a&state=b").is_err());
}

#[test]
fn parse_callback_requires_code_and_state() {
    assert!(parse_callback_url("modrex://oauth/callback?state=b").is_err());
    assert!(parse_callback_url("modrex://oauth/callback?code=a").is_err());
}

#[test]
fn parse_callback_surfaces_oauth_error() {
    let err = parse_callback_url(
        "modrex://oauth/callback?error=access_denied&error_description=User+denied",
    )
    .unwrap_err();
    assert!(err.contains("access_denied"));
    assert!(err.contains("User denied"));
}

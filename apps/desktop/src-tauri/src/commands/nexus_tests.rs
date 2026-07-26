use super::*;

#[test]
fn parses_present_header() {
    let mut headers = HeaderMap::new();
    headers.insert("x-rl-hourly-remaining", "42".parse().unwrap());
    assert_eq!(parse_hourly_remaining(&headers), Some(42));
}

#[test]
fn returns_none_when_absent() {
    let headers = HeaderMap::new();
    assert_eq!(parse_hourly_remaining(&headers), None);
}

#[test]
fn returns_none_when_malformed() {
    let mut headers = HeaderMap::new();
    headers.insert("x-rl-hourly-remaining", "not-a-number".parse().unwrap());
    assert_eq!(parse_hourly_remaining(&headers), None);
}

#[test]
fn domain_maps_supported_games() {
    assert_eq!(nexus_domain("pd3"), Ok("payday3"));
    assert_eq!(nexus_domain("pd2"), Ok("payday2"));
    assert_eq!(nexus_domain("pdth"), Ok("paydaytheheist"));
    assert_eq!(nexus_domain("cb"), Ok("crimebossrockaycity"));
}

#[test]
fn domain_rejects_unsupported_games() {
    assert!(nexus_domain("raid").is_err());
    assert!(nexus_domain("made_up").is_err());
}

#[test]
fn sort_field_accepts_known_values() {
    for field in ["relevance", "downloads", "endorsements", "updatedAt"] {
        assert_eq!(validate_sort_field(field), Ok(field));
    }
}

#[test]
fn sort_field_rejects_unknown_values() {
    assert!(validate_sort_field("name").is_err());
    assert!(validate_sort_field("").is_err());
}

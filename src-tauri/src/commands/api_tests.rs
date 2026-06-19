use super::*;

#[test]
fn parses_present_header() {
    let mut headers = HeaderMap::new();
    headers.insert("x-ratelimit-remaining", "5".parse().unwrap());
    assert_eq!(parse_rate_limit_remaining(&headers), Some(5));
}

#[test]
fn parses_zero() {
    let mut headers = HeaderMap::new();
    headers.insert("x-ratelimit-remaining", "0".parse().unwrap());
    assert_eq!(parse_rate_limit_remaining(&headers), Some(0));
}

#[test]
fn returns_none_when_absent() {
    let headers = HeaderMap::new();
    assert_eq!(parse_rate_limit_remaining(&headers), None);
}

#[test]
fn returns_none_when_malformed() {
    let mut headers = HeaderMap::new();
    headers.insert("x-ratelimit-remaining", "not-a-number".parse().unwrap());
    assert_eq!(parse_rate_limit_remaining(&headers), None);
}

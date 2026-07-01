use super::*;

#[test]
fn parses_valid_link() {
    let link =
        parse_nxm_url("nxm://payday3/mods/12/files/34?key=abc123&expires=1700000000").unwrap();
    assert_eq!(
        link,
        NxmLink {
            game_id: "pd3".to_string(),
            mod_id: 12,
            file_id: 34,
            key: "abc123".to_string(),
            expires: "1700000000".to_string(),
        }
    );
}

#[test]
fn rejects_wrong_scheme() {
    assert!(parse_nxm_url("https://payday3/mods/12/files/34?key=a&expires=1").is_err());
}

#[test]
fn rejects_unknown_domain() {
    assert!(parse_nxm_url("nxm://skyrimspecialedition/mods/1/files/1?key=a&expires=1").is_err());
}

#[test]
fn rejects_missing_key() {
    assert!(parse_nxm_url("nxm://payday3/mods/12/files/34?expires=1").is_err());
}

#[test]
fn rejects_wrong_path_shape() {
    assert!(parse_nxm_url("nxm://payday3/mods/12?key=a&expires=1").is_err());
}

#[test]
fn extension_from_uri_reads_real_filename() {
    assert_eq!(
        extension_from_uri("https://cdn.nexusmods.com/path/SomeMod-12-1-0.zip?token=x"),
        Some("zip".to_string())
    );
}

#[test]
fn extension_from_uri_none_when_no_extension() {
    assert_eq!(
        extension_from_uri("https://cdn.nexusmods.com/path/SomeMod?token=x"),
        None
    );
}

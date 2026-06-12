use super::*;
use std::fs;
use tempfile::TempDir;

fn path_str(tmp: &TempDir) -> String {
    tmp.path().to_string_lossy().into_owned()
}

#[test]
fn empty_game_dir_is_not_installed() {
    let tmp = TempDir::new().unwrap();
    assert!(!check_superblt(path_str(&tmp)));
}

#[test]
fn wsock32_dll_counts_as_installed() {
    let tmp = TempDir::new().unwrap();
    fs::write(tmp.path().join("WSOCK32.dll"), b"").unwrap();
    assert!(check_superblt(path_str(&tmp)));
}

#[test]
fn legacy_iphlpapi_dll_counts_as_installed() {
    let tmp = TempDir::new().unwrap();
    fs::write(tmp.path().join("IPHLPAPI.dll"), b"").unwrap();
    assert!(check_superblt(path_str(&tmp)));
}

#[test]
fn linux_native_loader_counts_as_installed() {
    let tmp = TempDir::new().unwrap();
    fs::write(tmp.path().join("libsuperblt_loader.so"), b"").unwrap();
    assert!(check_superblt(path_str(&tmp)));
}

#[test]
fn directory_named_like_loader_does_not_count() {
    let tmp = TempDir::new().unwrap();
    fs::create_dir(tmp.path().join("WSOCK32.dll")).unwrap();
    assert!(!check_superblt(path_str(&tmp)));
}

#[test]
fn nonexistent_game_path_is_not_installed() {
    assert!(!check_superblt("Z:/does/not/exist".to_string()));
}

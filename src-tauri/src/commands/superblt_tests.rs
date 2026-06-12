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

// install_superblt is download_file + this extraction; the network half is
// covered by the shared download path, so only the loader-specific wiring
// (entry name, overwrite of an existing DLL) is tested here.
#[test]
fn extracting_loader_dll_overwrites_existing() {
    use std::io::Write;

    let tmp = TempDir::new().unwrap();
    let zip_path = tmp.path().join("sblt.zip");
    let mut zip = ::zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
    zip.start_file(LOADER_FILES[0], ::zip::write::SimpleFileOptions::default())
        .unwrap();
    zip.write_all(b"new loader").unwrap();
    zip.finish().unwrap();

    let dest = tmp.path().join(LOADER_FILES[0]);
    fs::write(&dest, b"old loader").unwrap();
    extract_entry(&zip_path, LOADER_FILES[0], &dest).unwrap();
    assert_eq!(fs::read(&dest).unwrap(), b"new loader");
}

use super::*;
use crate::commands::mods::extract_archive_flat;
use std::fs;
use tempfile::TempDir;

fn path_str(tmp: &TempDir) -> String {
    tmp.path().to_string_lossy().into_owned()
}

#[test]
fn empty_game_dir_is_not_installed() {
    let tmp = TempDir::new().unwrap();
    assert!(!check_raid_superblt(path_str(&tmp)));
}

#[test]
fn wsock32_dll_counts_as_installed() {
    let tmp = TempDir::new().unwrap();
    fs::write(tmp.path().join("WSOCK32.dll"), b"").unwrap();
    assert!(check_raid_superblt(path_str(&tmp)));
}

#[test]
fn iphlpapi_dll_counts_as_installed() {
    let tmp = TempDir::new().unwrap();
    fs::write(tmp.path().join("IPHLPAPI.dll"), b"").unwrap();
    assert!(check_raid_superblt(path_str(&tmp)));
}

#[test]
fn directory_named_like_loader_does_not_count() {
    let tmp = TempDir::new().unwrap();
    fs::create_dir(tmp.path().join("WSOCK32.dll")).unwrap();
    assert!(!check_raid_superblt(path_str(&tmp)));
}

#[test]
fn nonexistent_game_path_is_not_installed() {
    assert!(!check_raid_superblt("Z:/does/not/exist".to_string()));
}

// install_raid_superblt is download_file + extract_archive_flat; the network
// half and the extractor's traversal guard are covered elsewhere, so only the
// loader-specific wiring is tested here: a game-root-layout zip (DLL next to
// mods/base) lands both pieces and overwrites an existing loader DLL.
#[test]
fn full_zip_extraction_lands_dll_and_basemod() {
    use std::io::Write;

    let tmp = TempDir::new().unwrap();
    let zip_path = tmp.path().join("raid-sblt.zip");
    let mut zip = ::zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
    let opts = ::zip::write::SimpleFileOptions::default();
    zip.start_file("WSOCK32.dll", opts).unwrap();
    zip.write_all(b"new loader").unwrap();
    zip.start_file("mods/base/supermod.xml", opts).unwrap();
    zip.write_all(b"<mod/>").unwrap();
    zip.finish().unwrap();

    let game = TempDir::new().unwrap();
    fs::write(game.path().join("WSOCK32.dll"), b"old loader").unwrap();
    extract_archive_flat(&zip_path, game.path()).unwrap();

    assert_eq!(
        fs::read(game.path().join("WSOCK32.dll")).unwrap(),
        b"new loader"
    );
    assert_eq!(
        fs::read(game.path().join("mods").join("base").join("supermod.xml")).unwrap(),
        b"<mod/>"
    );
}

use super::*;
use crate::commands::mods::extract_entry;
use std::fs;
use tempfile::TempDir;

fn path_str(tmp: &TempDir) -> String {
    tmp.path().to_string_lossy().into_owned()
}

#[test]
fn empty_game_dir_is_not_installed() {
    let tmp = TempDir::new().unwrap();
    assert!(!check_pdth_overrides(path_str(&tmp)));
}

#[test]
fn dinput8_dll_counts_as_installed() {
    let tmp = TempDir::new().unwrap();
    fs::write(tmp.path().join("DINPUT8.dll"), b"").unwrap();
    assert!(check_pdth_overrides(path_str(&tmp)));
}

#[test]
fn pdthmodoverrides_dll_alone_does_not_count() {
    let tmp = TempDir::new().unwrap();
    fs::write(tmp.path().join("PDTHModOverrides.dll"), b"").unwrap();
    assert!(!check_pdth_overrides(path_str(&tmp)));
}

#[test]
fn directory_named_like_loader_does_not_count() {
    let tmp = TempDir::new().unwrap();
    fs::create_dir(tmp.path().join("DINPUT8.dll")).unwrap();
    assert!(!check_pdth_overrides(path_str(&tmp)));
}

#[test]
fn nonexistent_game_path_is_not_installed() {
    assert!(!check_pdth_overrides("Z:/does/not/exist".to_string()));
}

#[test]
fn extracting_loader_dlls_overwrites_existing() {
    use std::io::Write;

    let tmp = TempDir::new().unwrap();
    let zip_path = tmp.path().join("pdth_overrides.zip");
    let mut zip = ::zip::ZipWriter::new(fs::File::create(&zip_path).unwrap());
    for name in ["DINPUT8.dll", "PDTHModOverrides.dll"] {
        zip.start_file(name, ::zip::write::SimpleFileOptions::default())
            .unwrap();
        zip.write_all(b"new loader").unwrap();
    }
    zip.finish().unwrap();

    for name in ["DINPUT8.dll", "PDTHModOverrides.dll"] {
        let dest = tmp.path().join(name);
        fs::write(&dest, b"old loader").unwrap();
        extract_entry(&zip_path, name, &dest).unwrap();
        assert_eq!(fs::read(&dest).unwrap(), b"new loader");
    }
}

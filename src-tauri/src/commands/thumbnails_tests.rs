use super::cleanup_dir;
use filetime::FileTime;
use std::time::{Duration, SystemTime};
use tempfile::tempdir;

fn set_mtime_days_ago(path: &std::path::Path, days: u64) {
    let t = SystemTime::now() - Duration::from_secs(days * 24 * 60 * 60);
    filetime::set_file_mtime(path, FileTime::from_system_time(t)).unwrap();
}

#[test]
fn removes_files_older_than_max_age() {
    let dir = tempdir().unwrap();
    let old = dir.path().join("old.webp");
    std::fs::write(&old, b"x").unwrap();
    set_mtime_days_ago(&old, 91);

    cleanup_dir(dir.path(), Duration::from_secs(90 * 24 * 60 * 60));

    assert!(!old.exists());
}

#[test]
fn keeps_files_within_max_age() {
    let dir = tempdir().unwrap();
    let fresh = dir.path().join("fresh.webp");
    std::fs::write(&fresh, b"x").unwrap();
    set_mtime_days_ago(&fresh, 89);

    cleanup_dir(dir.path(), Duration::from_secs(90 * 24 * 60 * 60));

    assert!(fresh.exists());
}

#[test]
fn mixed_keeps_fresh_removes_old() {
    let dir = tempdir().unwrap();
    let old = dir.path().join("old.webp");
    let fresh = dir.path().join("fresh.webp");
    std::fs::write(&old, b"x").unwrap();
    std::fs::write(&fresh, b"x").unwrap();
    set_mtime_days_ago(&old, 91);
    set_mtime_days_ago(&fresh, 10);

    cleanup_dir(dir.path(), Duration::from_secs(90 * 24 * 60 * 60));

    assert!(!old.exists());
    assert!(fresh.exists());
}

#[test]
fn missing_dir_does_not_panic() {
    cleanup_dir(std::path::Path::new("/nonexistent/thumbnails"), Duration::from_secs(1));
}

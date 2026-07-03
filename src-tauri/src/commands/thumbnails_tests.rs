use super::{cleanup_dir, is_safe_thumb_filename, sanitize_thumb_filename, thumb_content_type};
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
    cleanup_dir(
        std::path::Path::new("/nonexistent/thumbnails"),
        Duration::from_secs(1),
    );
}

#[test]
fn sanitize_accepts_plain_filenames() {
    assert_eq!(
        sanitize_thumb_filename("/abc123.webp"),
        Some("abc123.webp".into())
    );
    assert_eq!(
        sanitize_thumb_filename("/a%20b.png"),
        Some("a b.png".into())
    );
}

#[test]
fn sanitize_rejects_traversal_and_separators() {
    assert_eq!(sanitize_thumb_filename("/"), None);
    assert_eq!(sanitize_thumb_filename("/../settings.json"), None);
    assert_eq!(sanitize_thumb_filename("/%2e%2e/settings.json"), None);
    assert_eq!(sanitize_thumb_filename("/a/b.png"), None);
    assert_eq!(sanitize_thumb_filename("/a%2Fb.png"), None);
    assert_eq!(sanitize_thumb_filename("/a%5Cb.png"), None);
}

#[test]
fn thumb_filename_accepts_plain_names() {
    assert!(is_safe_thumb_filename("abc123.webp"));
    assert!(is_safe_thumb_filename("thumbnail_abc123.png"));
    assert!(is_safe_thumb_filename("a b.jpg"));
}

#[test]
fn thumb_filename_rejects_traversal_and_separators() {
    // Attacker-controlled modworkshop image names must never escape the cache dir.
    assert!(!is_safe_thumb_filename(""));
    assert!(!is_safe_thumb_filename(".."));
    assert!(!is_safe_thumb_filename("../settings.json"));
    assert!(!is_safe_thumb_filename("..\\..\\settings.json"));
    assert!(!is_safe_thumb_filename("sub/dir.png"));
    assert!(!is_safe_thumb_filename("sub\\dir.png"));
    assert!(!is_safe_thumb_filename("/etc/passwd"));
    assert!(!is_safe_thumb_filename("C:\\Windows\\evil.bat"));
}

#[test]
fn content_type_by_extension() {
    assert_eq!(thumb_content_type("a.png"), "image/png");
    assert_eq!(thumb_content_type("a.jpg"), "image/jpeg");
    assert_eq!(thumb_content_type("a.webp"), "image/webp");
    assert_eq!(thumb_content_type("a.bin"), "application/octet-stream");
}

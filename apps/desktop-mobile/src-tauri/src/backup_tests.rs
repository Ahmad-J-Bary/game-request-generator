use super::*;
use std::fs;
use std::io::Write;

fn create_temp_dir() -> tempfile::TempDir {
    tempfile::tempdir().expect("Failed to create temp dir")
}

fn touch(path: &Path, content: &[u8]) {
    let mut f = fs::File::create(path).expect("Failed to create file");
    f.write_all(content).expect("Failed to write file");
}

fn create_backup_file(dir: &Path, timestamp: &str, content: &[u8]) {
    let name = format!("backup_{}.sqlite", timestamp);
    touch(&dir.join(name), content);
}

// ===== files_identical =====
#[test]
fn files_identical_same_content() {
    let dir = create_temp_dir();
    let a = dir.path().join("a.bin");
    let b = dir.path().join("b.bin");
    touch(&a, b"hello world");
    touch(&b, b"hello world");
    assert!(files_identical(&a, &b));
}

#[test]
fn files_identical_different_content() {
    let dir = create_temp_dir();
    let a = dir.path().join("a.bin");
    let b = dir.path().join("b.bin");
    touch(&a, b"hello");
    touch(&b, b"world");
    assert!(!files_identical(&a, &b));
}

#[test]
fn files_identical_one_missing() {
    let dir = create_temp_dir();
    let a = dir.path().join("exists.bin");
    let b = dir.path().join("missing.bin");
    touch(&a, b"data");
    assert!(!files_identical(&a, &b));
    assert!(!files_identical(&b, &a));
}

#[test]
fn files_identical_different_sizes() {
    let dir = create_temp_dir();
    let a = dir.path().join("short.bin");
    let b = dir.path().join("long.bin");
    touch(&a, b"abc");
    touch(&b, b"abcdef");
    assert!(!files_identical(&a, &b));
}

#[test]
fn files_identical_empty_files() {
    let dir = create_temp_dir();
    let a = dir.path().join("empty1.bin");
    let b = dir.path().join("empty2.bin");
    touch(&a, b"");
    touch(&b, b"");
    assert!(files_identical(&a, &b));
}

// ===== find_latest_backup =====
#[test]
fn find_latest_backup_empty_dir() {
    let dir = create_temp_dir();
    assert!(find_latest_backup(dir.path()).is_none());
}

#[test]
fn find_latest_backup_picks_newest_by_filename_timestamp() {
    let dir = create_temp_dir();
    create_backup_file(dir.path(), "20250101_000000", b"old");
    create_backup_file(dir.path(), "20250615_120000", b"mid");
    create_backup_file(dir.path(), "20251231_235959", b"newest");
    let latest = find_latest_backup(dir.path());
    assert!(latest.is_some());
    let name = latest
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();
    assert_eq!(name, "backup_20251231_235959.sqlite");
}

#[test]
fn find_latest_backup_ignores_non_backup_files() {
    let dir = create_temp_dir();
    touch(&dir.path().join("not_a_backup.txt"), b"ignore me");
    touch(&dir.path().join("database.sqlite"), b"also ignore");
    create_backup_file(dir.path(), "20260101_120000", b"only real backup");
    let latest = find_latest_backup(dir.path());
    assert!(latest.is_some());
    let name = latest
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();
    assert_eq!(name, "backup_20260101_120000.sqlite");
}

#[test]
fn find_latest_backup_single_file() {
    let dir = create_temp_dir();
    create_backup_file(dir.path(), "20260115_083000", b"lonely");
    let latest = find_latest_backup(dir.path());
    assert!(latest.is_some());
    let name = latest
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();
    assert_eq!(name, "backup_20260115_083000.sqlite");
}

#[test]
fn find_latest_backup_with_subdirs() {
    let dir = create_temp_dir();
    let sub = dir.path().join("subfolder");
    fs::create_dir(&sub).unwrap();
    create_backup_file(&sub, "20260101_000000", b"in subdir");
    create_backup_file(dir.path(), "20260102_000000", b"in root");
    // find_latest_backup only scans the given dir (not recursive)
    let latest = find_latest_backup(dir.path());
    assert!(latest.is_some());
    let name = latest
        .unwrap()
        .file_name()
        .unwrap()
        .to_string_lossy()
        .to_string();
    assert_eq!(name, "backup_20260102_000000.sqlite");
}

// ===== cleanup_old_backups =====
fn cleanup_deletes_old_backups() {
    let dir = create_temp_dir();
    // "Very old" files: guaranteed to be older than (today - 1 day)
    create_backup_file(dir.path(), "20200101_000000", b"ancient jan 2020");
    create_backup_file(dir.path(), "20200615_120000", b"mid 2020");
    create_backup_file(dir.path(), "20201231_235959", b"end of 2020");
    // "Future" files: guaranteed to be newer than (today - 1 day)
    create_backup_file(dir.path(), "20991230_000000", b"far future day 1");
    create_backup_file(dir.path(), "20991231_235959", b"far future day 2");
    // Non-backup file should never be touched
    touch(&dir.path().join("important.txt"), b"do not delete");

    cleanup_old_backups(dir.path()).expect("cleanup should succeed");

    // Deleted: all 2020 files (older than today - 1 day)
    assert!(
        !dir.path().join("backup_20200101_000000.sqlite").exists(),
        "2020-01-01 should be deleted"
    );
    assert!(
        !dir.path().join("backup_20200615_120000.sqlite").exists(),
        "2020-06-15 should be deleted"
    );
    assert!(
        !dir.path().join("backup_20201231_235959.sqlite").exists(),
        "2020-12-31 should be deleted"
    );

    // Kept: future files (today - 1 day and newer)
    assert!(
        dir.path().join("backup_20991230_000000.sqlite").exists(),
        "2099-12-30 should be kept"
    );
    assert!(
        dir.path().join("backup_20991231_235959.sqlite").exists(),
        "2099-12-31 should be kept"
    );

    // Non-backup file untouched
    assert!(
        dir.path().join("important.txt").exists(),
        "non-backup file should be untouched"
    );
}

#[test]
fn cleanup_empty_dir_is_ok() {
    let dir = create_temp_dir();
    let result = cleanup_old_backups(dir.path());
    assert!(result.is_ok());
}

#[test]
fn cleanup_dir_with_only_recent_files() {
    let dir = create_temp_dir();
    create_backup_file(dir.path(), "20991230_000000", b"recent A");
    create_backup_file(dir.path(), "20991231_235959", b"recent B");

    cleanup_old_backups(dir.path()).expect("cleanup should succeed");

    assert!(dir.path().join("backup_20991230_000000.sqlite").exists());
    assert!(dir.path().join("backup_20991231_235959.sqlite").exists());
}

#[test]
fn cleanup_does_not_delete_malformed_names() {
    let dir = create_temp_dir();
    // File that starts with backup_ but has unparseable date
    touch(
        &dir.path().join("backup_notadate.sqlite"),
        b"malformed name",
    );
    // Normal old backup that should be deleted
    create_backup_file(dir.path(), "20200101_000000", b"old");

    cleanup_old_backups(dir.path()).expect("cleanup should succeed");

    // Malformed name should survive (can't determine its date)
    assert!(
        dir.path().join("backup_notadate.sqlite").exists(),
        "malformed backup name should not be deleted"
    );
    // Old backup deleted
    assert!(
        !dir.path().join("backup_20200101_000000.sqlite").exists(),
        "old backup should be deleted"
    );
}

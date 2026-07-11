use std::fs;

use tempfile::tempdir;

use crate::process::log_rotate::{RotatingLineWriter, RotationPolicy};

#[test]
fn keeps_complete_lines_and_rotates_before_exceeding_threshold() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("service.log");
    let mut writer = RotatingLineWriter::new(&path, RotationPolicy::new(8, 5));

    writer.write_line("1234567\n").expect("exact-sized line");
    assert_eq!(fs::read_to_string(&path).unwrap(), "1234567\n");
    assert!(!path.with_extension("log.1").exists());

    writer.write_line("abc\n").expect("overflowing line");
    assert_eq!(fs::read_to_string(&path).unwrap(), "abc\n");
    assert_eq!(
        fs::read_to_string(path.with_extension("log.1")).unwrap(),
        "1234567\n"
    );
}

#[test]
fn retains_active_plus_four_archives_and_preserves_newest_first_order() {
    let dir = tempdir().expect("temp dir");
    let path = dir.path().join("service.log");
    let mut writer = RotatingLineWriter::new(&path, RotationPolicy::new(3, 5));

    for line in ["00\n", "11\n", "22\n", "33\n", "44\n", "55\n"] {
        writer.write_line(line).expect("line write");
    }

    assert_eq!(fs::read_to_string(&path).unwrap(), "55\n");
    for (suffix, expected) in [(1, "44\n"), (2, "33\n"), (3, "22\n"), (4, "11\n")] {
        assert_eq!(
            fs::read_to_string(format!("{}.{}", path.display(), suffix)).unwrap(),
            expected
        );
    }
    assert!(!std::path::Path::new(&format!("{}.5", path.display())).exists());
}

#[test]
fn write_failure_is_reported_and_a_later_attempt_can_recover() {
    let dir = tempdir().expect("temp dir");
    let parent = dir.path().join("temporarily-missing");
    let path = parent.join("service.log");
    let mut writer = RotatingLineWriter::new(&path, RotationPolicy::new(8, 5));

    assert!(writer.write_line("first\n").is_err());
    fs::create_dir(&parent).expect("restore writable parent");
    writer.write_line("second\n").expect("retry succeeds");
    assert_eq!(fs::read_to_string(path).unwrap(), "second\n");
}

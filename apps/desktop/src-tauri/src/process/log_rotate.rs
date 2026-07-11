use std::fs::{self, OpenOptions};
use std::io::{self, Write};
use std::path::{Path, PathBuf};

pub const DEFAULT_MAX_BYTES: u64 = 10 * 1024 * 1024;
pub const DEFAULT_MAX_FILES: usize = 5;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RotationPolicy {
    pub max_bytes: u64,
    pub max_files: usize,
}

impl RotationPolicy {
    pub const fn new(max_bytes: u64, max_files: usize) -> Self {
        Self {
            max_bytes,
            max_files,
        }
    }
}

impl Default for RotationPolicy {
    fn default() -> Self {
        Self::new(DEFAULT_MAX_BYTES, DEFAULT_MAX_FILES)
    }
}

/// A bounded log writer that rotates only between complete, caller-supplied lines.
pub struct RotatingLineWriter {
    path: PathBuf,
    policy: RotationPolicy,
}

impl RotatingLineWriter {
    pub fn new(path: impl Into<PathBuf>, policy: RotationPolicy) -> Self {
        Self {
            path: path.into(),
            policy,
        }
    }

    pub fn write_line(&mut self, line: &str) -> io::Result<()> {
        let current_len = fs::metadata(&self.path).map(|m| m.len()).unwrap_or(0);
        let projected_len = current_len.saturating_add(line.len() as u64);
        if current_len > 0 && projected_len > self.policy.max_bytes {
            self.rotate()?;
        }

        let mut file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.path)?;
        file.write_all(line.as_bytes())?;
        file.flush()
    }

    fn rotate(&self) -> io::Result<()> {
        if self.policy.max_files <= 1 {
            if self.path.exists() {
                fs::remove_file(&self.path)?;
            }
            return Ok(());
        }

        let oldest = self.archive_path(self.policy.max_files - 1);
        if oldest.exists() {
            fs::remove_file(oldest)?;
        }
        for suffix in (1..self.policy.max_files - 1).rev() {
            let from = self.archive_path(suffix);
            if from.exists() {
                fs::rename(from, self.archive_path(suffix + 1))?;
            }
        }
        fs::rename(&self.path, self.archive_path(1))
    }

    fn archive_path(&self, suffix: usize) -> PathBuf {
        Path::new(&format!("{}.{}", self.path.display(), suffix)).to_path_buf()
    }
}

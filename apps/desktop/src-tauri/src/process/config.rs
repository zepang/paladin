//! `processes.json` 配置 schema — dev / packaged 双模式可切换 (D-14)。
//!
//! Plan 07.3-01 建立 serde 结构体；plan 07.3-03 补 loader (`load_from_path`) +
//! [`ConfigError`] + [`ProcessConfig::validate`] (SPEC Edge R1：配置错 → 不 spawn、
//! 报配置错误)。
//!
//! SPEC Prohibition P1: `cmd` 字段必须是 `Vec<String>` 数组形态，禁止单 string 走 shell 解释；
//! `env` 字段值透传字面值不展开 `${VAR}`；`load_from_path` 签名只接受 `AsRef<Path>`，
//! 编译期排除远程 HTTP 客户端的 Url 类型 / Tauri IPC 字符串。

// 本模块的类型与方法在 plan 07.3-06 supervisor 集成前仅被测试调用,
// 用 module-level `#![allow(dead_code)]` 抑制集成前的 dead_code warning
// (与 plan 02 state_machine.rs 同款)。plan 06 supervisor 真正消费
// `ProcessConfig::load_from_path` / `validate` / `ConfigError` 后会自然消失。
#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

/// 进程配置根 (对应 `processes.json` 顶层)。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProcessConfig {
    pub mode: String,
    pub processes: HashMap<ProcessNameKey, ProcessEntry>,
    pub backoff_secs: Vec<u64>,
    pub max_restarts: u32,
    pub shutdown_grace_secs: u64,
}

/// Runtime mode boundary. Serde keeps `ProcessConfig.mode` as String for schema stability,
/// while validation exposes the typed meaning.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RuntimeMode {
    Dev,
    Packaged,
}

/// 单个进程描述 — 命令行、工作目录、端口、健康端点。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProcessEntry {
    pub cmd: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub env: HashMap<String, String>,
    pub port: u16,
    pub health: HealthConfig,
    pub startup_grace_secs: u64,
}

/// 健康端点配置 — liveness 必填 (触发重启)，readiness 可选 (仅报 degraded)。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct HealthConfig {
    pub liveness: EndpointConfig,
    pub readiness: Option<EndpointConfig>,
}

/// HTTP 探针端点 — path + 期望状态码。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct EndpointConfig {
    pub path: String,
    pub expect_status: u16,
}

/// 配置文件中的进程名键 — serde lowercase 序列化为 "agent" / "server"。
#[derive(Debug, Clone, Copy, Hash, Eq, PartialEq, Deserialize, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessNameKey {
    Agent,
    Server,
}

/// 加载 `processes.json` 时可能发生的错误。
///
/// 设计为四个互斥 variants，让 supervisor (plan 06) 对每种错误可做不同的诊断/告警：
/// - `NotFound`：配置文件缺失（典型：dev 用户未创建，或 packaged 路径错）。
/// - `IoError`：文件存在但读取出错（权限、磁盘）。
/// - `ParseError`：JSON 语法或类型不匹配（含 SPEC Prohibition P1：`cmd` 单字符串
///   被 `Vec<String>` 类型层拒绝、`port` 越过 `u16` 边界、`liveness` 缺失）。
/// - `InvalidSchema`：JSON 合法但字段值违反业务约束（端口 0、cmd 空数组、
///   backoff 太长、max_restarts 太大、shutdown_grace 越界）。
#[derive(Debug)]
pub enum ConfigError {
    NotFound(PathBuf),
    IoError(std::io::Error),
    ParseError(serde_json::Error),
    InvalidSchema(String),
}

impl std::fmt::Display for ConfigError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ConfigError::NotFound(p) => {
                write!(f, "processes.json not found at {}", p.display())
            }
            ConfigError::IoError(e) => write!(f, "io error: {e}"),
            ConfigError::ParseError(e) => write!(f, "parse error: {e}"),
            ConfigError::InvalidSchema(m) => write!(f, "invalid schema: {m}"),
        }
    }
}

impl std::error::Error for ConfigError {
    fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
        match self {
            ConfigError::IoError(e) => Some(e),
            ConfigError::ParseError(e) => Some(e),
            ConfigError::NotFound(_) | ConfigError::InvalidSchema(_) => None,
        }
    }
}

impl From<std::io::Error> for ConfigError {
    fn from(e: std::io::Error) -> Self {
        ConfigError::IoError(e)
    }
}

impl From<serde_json::Error> for ConfigError {
    fn from(e: serde_json::Error) -> Self {
        ConfigError::ParseError(e)
    }
}

const BACKOFF_MAX_LEN: usize = 5;
const MAX_RESTARTS_LIMIT: u32 = 5;
const SHUTDOWN_GRACE_MIN_SECS: u64 = 1;
const SHUTDOWN_GRACE_MAX_SECS: u64 = 60;
const HTTP_STATUS_MIN: u16 = 100;
const HTTP_STATUS_MAX: u16 = 599;

impl ProcessConfig {
    /// 从本地文件系统路径加载并校验配置。
    ///
    /// SPEC Prohibition P1：函数签名只接受 `AsRef<Path>`，编译期排除 `http://` URL、
    /// 远程 HTTP 客户端的 Url 类型、Tauri IPC 字符串等远程/不可信源。`env` 字段透传
    /// serde 字面值，**不**展开 `${VAR}` —— 由调用方 (supervisor) 原样写入子进程 env。
    pub fn load_from_path(path: impl AsRef<Path>) -> Result<Self, ConfigError> {
        let p = path.as_ref();
        if !p.exists() {
            return Err(ConfigError::NotFound(p.to_path_buf()));
        }
        let bytes = std::fs::read(p).map_err(ConfigError::IoError)?;
        let cfg: ProcessConfig = serde_json::from_slice(&bytes).map_err(ConfigError::ParseError)?;
        cfg.validate().map_err(ConfigError::InvalidSchema)?;
        Ok(cfg)
    }

    /// 业务约束校验 — JSON 合法但字段值越界的检查。
    ///
    /// 返回 `Result<(), String>`（错误描述字符串），由 `load_from_path` 包装为
    /// `ConfigError::InvalidSchema(String)`。这样 supervisor 与单元测试可以直接
    /// 调用 `validate()` 拿到人类可读消息，无需 unpack custom error。
    pub fn validate(&self) -> Result<(), String> {
        let mode = self.runtime_mode()?;
        if self.backoff_secs.len() > BACKOFF_MAX_LEN {
            return Err(format!(
                "backoff_secs length {} > {}",
                self.backoff_secs.len(),
                BACKOFF_MAX_LEN
            ));
        }
        if self.max_restarts > MAX_RESTARTS_LIMIT {
            return Err(format!(
                "max_restarts {} > {}",
                self.max_restarts, MAX_RESTARTS_LIMIT
            ));
        }
        if self.shutdown_grace_secs < SHUTDOWN_GRACE_MIN_SECS
            || self.shutdown_grace_secs > SHUTDOWN_GRACE_MAX_SECS
        {
            return Err(format!(
                "shutdown_grace_secs {} out of range ({}..={})",
                self.shutdown_grace_secs, SHUTDOWN_GRACE_MIN_SECS, SHUTDOWN_GRACE_MAX_SECS
            ));
        }
        for (name, entry) in &self.processes {
            if entry.cmd.is_empty() {
                return Err(format!("{name:?} cmd empty"));
            }
            if mode == RuntimeMode::Packaged {
                validate_packaged_entry(*name, entry)?;
            }
            if entry.port == 0 {
                return Err(format!("{name:?} port 0"));
            }
            validate_endpoint(*name, "liveness", &entry.health.liveness)?;
            if let Some(readiness) = &entry.health.readiness {
                validate_endpoint(*name, "readiness", readiness)?;
            }
        }
        Ok(())
    }

    pub fn runtime_mode(&self) -> Result<RuntimeMode, String> {
        match self.mode.as_str() {
            "dev" => Ok(RuntimeMode::Dev),
            "packaged" => Ok(RuntimeMode::Packaged),
            other => Err(format!("mode must be dev or packaged, got {other:?}")),
        }
    }
}

fn validate_endpoint(name: ProcessNameKey, kind: &str, ep: &EndpointConfig) -> Result<(), String> {
    if ep.expect_status < HTTP_STATUS_MIN || ep.expect_status > HTTP_STATUS_MAX {
        return Err(format!(
            "{name:?} {kind} expect_status {} out of range ({}..={})",
            ep.expect_status, HTTP_STATUS_MIN, HTTP_STATUS_MAX
        ));
    }
    Ok(())
}

fn validate_packaged_entry(name: ProcessNameKey, entry: &ProcessEntry) -> Result<(), String> {
    if is_dev_tool_command(entry) {
        return Err(format!(
            "{name:?} packaged mode rejects dev command {:?}",
            entry.cmd.first().map(String::as_str).unwrap_or_default()
        ));
    }
    if let Some(cwd) = &entry.cwd {
        if is_repo_relative_dev_cwd(cwd) {
            return Err(format!(
                "{name:?} packaged mode rejects repo-relative dev cwd {}",
                cwd.display()
            ));
        }
    }
    Ok(())
}

pub fn is_dev_tool_command(entry: &ProcessEntry) -> bool {
    matches!(entry.cmd.first().map(String::as_str), Some("uv" | "go"))
}

pub fn is_repo_relative_dev_cwd(cwd: &Path) -> bool {
    matches!(
        cwd.to_str(),
        Some("../../agent" | "../../server" | "../../apps/agent" | "../../apps/server")
    )
}

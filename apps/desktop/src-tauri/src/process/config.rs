/// `processes.json` 配置 schema — dev / packaged 双模式可切换 (D-14)。
///
/// 本文件在 plan 07.3-01 中仅定义 serde 结构体；loader (文件读取 + 校验) 在 plan 07.3-03 实现。
/// SPEC Prohibition P1: `cmd` 字段必须是 `Vec<String>` 数组形态，禁止单 string 走 shell 解释。
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

/// 进程配置根 (对应 `processes.json` 顶层)。
#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProcessConfig {
    pub mode: String,
    pub processes: HashMap<ProcessNameKey, ProcessEntry>,
    pub backoff_secs: Vec<u64>,
    pub max_restarts: u32,
    pub shutdown_grace_secs: u64,
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

//! `processes.json` loader + schema 校验的单元测试。
//!
//! 覆盖 SPEC Edge R1（loader 报错正确）与 Prohibition P1（cmd Vec<String> 类型层 +
//! env 字面值不展开）。使用 tempfile 注入错误 JSON，零外部依赖、零网络。

#![allow(dead_code)]

use std::fs;
use std::path::PathBuf;

use tempfile::{tempdir, TempDir};

use crate::process::config::{ConfigError, ProcessConfig, ProcessNameKey};

/// plan 01 写的 dev 模式 processes.json — round-trip 黄金样本。
const DEV_CONFIG_JSON: &str = include_str!("../../processes.json");

/// 把 `content` 写入临时目录下的 `processes.json`,返回 (保持目录存活, 配置路径)。
/// `TempDir` 必须由调用方持有直至断言完成 — drop 后文件会被删除。
fn write_temp_config(content: &str) -> (TempDir, PathBuf) {
    let dir = tempdir().expect("tempdir created");
    let path = dir.path().join("processes.json");
    fs::write(&path, content).expect("temp config written");
    (dir, path)
}

/// 构造一份骨架 JSON,允许覆盖单个 process 的字段 — 简化边界测试。
fn dev_skeleton_json(agent_override: &str, server_override: &str) -> String {
    format!(
        r#"{{
            "mode": "dev",
            "processes": {{
                "agent": {agent_override},
                "server": {server_override}
            }},
            "backoff_secs": [1, 2, 4, 8, 16],
            "max_restarts": 5,
            "shutdown_grace_secs": 5
        }}"#
    )
}

const AGENT_OK: &str = r#"{
    "cmd": ["uv", "run", "paladin-agent", "serve", "--dev"],
    "cwd": "../../apps/agent",
    "env": {},
    "port": 9876,
    "health": { "liveness": { "path": "/health", "expect_status": 200 } },
    "startup_grace_secs": 5
}"#;

const SERVER_OK: &str = r#"{
    "cmd": ["go", "run", "./cmd/server"],
    "cwd": "../../apps/server",
    "env": {},
    "port": 9880,
    "health": {
        "liveness": { "path": "/healthz", "expect_status": 200 },
        "readiness": { "path": "/readyz", "expect_status": 200 }
    },
    "startup_grace_secs": 5
}"#;

#[test]
fn test_load_valid_dev_config_round_trip() {
    let (_dir, path) = write_temp_config(DEV_CONFIG_JSON);
    let cfg = ProcessConfig::load_from_path(&path).expect("dev config loads");
    assert_eq!(cfg.mode, "dev");
    assert_eq!(cfg.backoff_secs, vec![1, 2, 4, 8, 16]);
    assert_eq!(cfg.max_restarts, 5);
    assert_eq!(cfg.shutdown_grace_secs, 5);

    let agent = cfg.processes.get(&ProcessNameKey::Agent).expect("agent");
    assert_eq!(
        agent.cmd,
        vec!["uv", "run", "paladin-agent", "serve", "--dev"]
    );
    assert_eq!(agent.port, 9876);
    assert_eq!(agent.health.liveness.path, "/health");
    assert_eq!(agent.health.liveness.expect_status, 200);
    assert!(agent.health.readiness.is_none(), "agent has no readiness");
    assert_eq!(agent.startup_grace_secs, 5);

    let server = cfg.processes.get(&ProcessNameKey::Server).expect("server");
    assert_eq!(server.cmd, vec!["go", "run", "./cmd/server"]);
    assert_eq!(server.port, 9880);
    assert_eq!(server.health.liveness.path, "/healthz");
    let readiness = server.health.readiness.as_ref().expect("server readiness");
    assert_eq!(readiness.path, "/readyz");
    assert_eq!(readiness.expect_status, 200);
}

#[test]
fn test_load_not_found_returns_not_found_error() {
    let dir = tempdir().expect("tempdir");
    let path = dir.path().join("definitely-missing.json");
    let err = ProcessConfig::load_from_path(&path).expect_err("missing file errors");
    assert!(
        matches!(err, ConfigError::NotFound(_)),
        "expected NotFound, got: {err:?}"
    );
}

#[test]
fn test_load_corrupt_json_returns_parse_error() {
    let (_dir, path) = write_temp_config("{");
    let err = ProcessConfig::load_from_path(&path).expect_err("corrupt json errors");
    assert!(
        matches!(err, ConfigError::ParseError(_)),
        "expected ParseError, got: {err:?}"
    );
}

#[test]
fn test_cmd_single_string_rejected_by_serde() {
    // SPEC Prohibition P1: cmd 必须是 Vec<String>,单字符串形态在 serde 反序列化阶段拒绝。
    let agent = r#"{
        "cmd": "uv run foo",
        "cwd": "../../apps/agent",
        "env": {},
        "port": 9876,
        "health": { "liveness": { "path": "/health", "expect_status": 200 } },
        "startup_grace_secs": 5
    }"#;
    let raw = dev_skeleton_json(agent, SERVER_OK);
    let (_dir, path) = write_temp_config(&raw);
    let err = ProcessConfig::load_from_path(&path).expect_err("string cmd rejected");
    assert!(
        matches!(err, ConfigError::ParseError(_)),
        "expected ParseError for string cmd, got: {err:?}"
    );
}

#[test]
fn test_env_value_literal_no_shell_expansion() {
    // SPEC Prohibition P1: env 字段值不展开 ${VAR},字面值透传。
    let agent = r#"{
        "cmd": ["uv", "run", "paladin-agent", "serve", "--dev"],
        "cwd": "../../apps/agent",
        "env": { "FOO": "${BAR}" },
        "port": 9876,
        "health": { "liveness": { "path": "/health", "expect_status": 200 } },
        "startup_grace_secs": 5
    }"#;
    let raw = dev_skeleton_json(agent, SERVER_OK);
    let (_dir, path) = write_temp_config(&raw);
    let cfg = ProcessConfig::load_from_path(&path).expect("env literal loads");
    let agent = cfg.processes.get(&ProcessNameKey::Agent).expect("agent");
    assert_eq!(
        agent.env.get("FOO").map(String::as_str),
        Some("${BAR}"),
        "env value must be preserved literally without shell expansion"
    );
}

#[test]
fn test_validate_rejects_port_zero() {
    let agent = r#"{
        "cmd": ["uv", "run", "paladin-agent", "serve", "--dev"],
        "cwd": "../../apps/agent",
        "env": {},
        "port": 0,
        "health": { "liveness": { "path": "/health", "expect_status": 200 } },
        "startup_grace_secs": 5
    }"#;
    let raw = dev_skeleton_json(agent, SERVER_OK);
    let (_dir, path) = write_temp_config(&raw);
    let err = ProcessConfig::load_from_path(&path).expect_err("port 0 rejected");
    assert!(
        matches!(err, ConfigError::InvalidSchema(_)),
        "expected InvalidSchema for port=0, got: {err:?}"
    );
}

#[test]
fn test_validate_rejects_port_out_of_range_via_serde() {
    // port 字段为 u16 — 65536 在 serde 反序列化阶段即被拒绝(ParseError)。
    // 这是 u16 类型层 + validate 双重锁的第一层(SPEC Prohibition P1 类型层强制)。
    let agent = r#"{
        "cmd": ["uv", "run", "paladin-agent", "serve", "--dev"],
        "cwd": "../../apps/agent",
        "env": {},
        "port": 65536,
        "health": { "liveness": { "path": "/health", "expect_status": 200 } },
        "startup_grace_secs": 5
    }"#;
    let raw = dev_skeleton_json(agent, SERVER_OK);
    let (_dir, path) = write_temp_config(&raw);
    let err = ProcessConfig::load_from_path(&path).expect_err("port 65536 rejected");
    assert!(
        matches!(err, ConfigError::ParseError(_)),
        "expected ParseError for port=65536 (u16 overflow), got: {err:?}"
    );
}

#[test]
fn test_validate_rejects_empty_cmd_array() {
    let agent = r#"{
        "cmd": [],
        "cwd": "../../apps/agent",
        "env": {},
        "port": 9876,
        "health": { "liveness": { "path": "/health", "expect_status": 200 } },
        "startup_grace_secs": 5
    }"#;
    let raw = dev_skeleton_json(agent, SERVER_OK);
    let (_dir, path) = write_temp_config(&raw);
    let err = ProcessConfig::load_from_path(&path).expect_err("empty cmd rejected");
    assert!(
        matches!(err, ConfigError::InvalidSchema(_)),
        "expected InvalidSchema for empty cmd, got: {err:?}"
    );
}

#[test]
fn test_validate_rejects_missing_liveness() {
    // liveness 是 EndpointConfig 必填(非 Option),缺失在 serde 阶段拒绝(ParseError)。
    let agent = r#"{
        "cmd": ["uv", "run", "paladin-agent", "serve", "--dev"],
        "cwd": "../../apps/agent",
        "env": {},
        "port": 9876,
        "health": {},
        "startup_grace_secs": 5
    }"#;
    let raw = dev_skeleton_json(agent, SERVER_OK);
    let (_dir, path) = write_temp_config(&raw);
    let err = ProcessConfig::load_from_path(&path).expect_err("missing liveness rejected");
    assert!(
        matches!(err, ConfigError::ParseError(_)),
        "expected ParseError for missing liveness, got: {err:?}"
    );
}

#[test]
fn test_validate_rejects_backoff_too_long() {
    let raw = format!(
        r#"{{
            "mode": "dev",
            "processes": {{
                "agent": {AGENT_OK},
                "server": {SERVER_OK}
            }},
            "backoff_secs": [1, 2, 3, 4, 5, 6],
            "max_restarts": 5,
            "shutdown_grace_secs": 5
        }}"#
    );
    let (_dir, path) = write_temp_config(&raw);
    let err = ProcessConfig::load_from_path(&path).expect_err("backoff too long rejected");
    assert!(
        matches!(err, ConfigError::InvalidSchema(_)),
        "expected InvalidSchema for backoff_secs.len()=6, got: {err:?}"
    );
}

#[test]
fn test_validate_rejects_max_restarts_too_high() {
    let raw = format!(
        r#"{{
            "mode": "dev",
            "processes": {{
                "agent": {AGENT_OK},
                "server": {SERVER_OK}
            }},
            "backoff_secs": [1, 2, 4, 8, 16],
            "max_restarts": 99,
            "shutdown_grace_secs": 5
        }}"#
    );
    let (_dir, path) = write_temp_config(&raw);
    let err = ProcessConfig::load_from_path(&path).expect_err("max_restarts too high rejected");
    assert!(
        matches!(err, ConfigError::InvalidSchema(_)),
        "expected InvalidSchema for max_restarts=99, got: {err:?}"
    );
}

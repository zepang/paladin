//! 日志敏感信息脱敏过滤器 — 纯函数模块 (Phase 8 D-15 继承)。
//!
//! 在 supervisor (plan 07.3-06) 把子进程 stdout/stderr 落盘或推送前端之前,
//! 调用 `redact_log_line(&line)` 把以下 5 类 secret 模式做 case-insensitive 掩码:
//!
//! 1. `DEEPSEEK_API_KEY=xxx` / `DEEPSEEK_API_KEY: xxx` (Agent LLM provider key)
//! 2. `JWT_SECRET=xxx` (Go Server token signing secret)
//! 3. `PALADIN_JWT_SECRET=xxx` (Go Server 专案 secret)
//! 4. `Authorization: Bearer xxx` (HTTP Bearer token)
//! 5. `password=xxx` / `password: xxx` / `"password":"xxx"` (含 JSON 形态)
//!
//! 替换策略:保留 key 名与分隔符 (即 group 1),值替换为字面占位符 `[REDACTED]`。
//! 脱敏是单向的 —— `[REDACTED]` 占位符不可被反向构造为真实 secret。
//!
//! 本模块零 tokio / reqwest / std::process,只用 regex crate 做字符串替换,
//! 可独立毫秒级单元测试。

#![allow(dead_code)]

use regex::Regex;
use std::sync::LazyLock;

/// 五类需要脱敏的 secret key 名,供 supervisor 静态展示与外部审计引用。
pub const SECRET_PATTERNS: &[&str] = &[
    "DEEPSEEK_API_KEY",
    "JWT_SECRET",
    "PALADIN_JWT_SECRET",
    "Authorization",
    "password",
];

static DEEPSEEK_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(DEEPSEEK_API_KEY\s*[=:]\s*)\S+").unwrap());

static JWT_SECRET_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(JWT_SECRET\s*[=:]\s*)\S+").unwrap());

static PALADIN_JWT_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(PALADIN_JWT_SECRET\s*[=:]\s*)\S+").unwrap());

static AUTHORIZATION_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(Authorization\s*:\s*Bearer\s+)\S+").unwrap());

static PASSWORD_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"(?i)(password\s*["']?\s*[=:]\s*["']?)\S+"#).unwrap());

/// 把单行日志中匹配 5 类 secret 模式的值替换为 `[REDACTED]`。
///
/// 逐模式串行 `replace_all`,顺序: DEEPSEEK → JWT_SECRET → PALADIN_JWT_SECRET →
/// Authorization → password。无 secret 时原样返回 (`replace_all` 在无匹配时不分配新 String,
/// 但函数签名返回 `String`,调用方拿到的总是新分配)。
pub fn redact_log_line(line: &str) -> String {
    let mut s = DEEPSEEK_PATTERN
        .replace_all(line, "${1}[REDACTED]")
        .into_owned();
    s = JWT_SECRET_PATTERN
        .replace_all(&s, "${1}[REDACTED]")
        .into_owned();
    s = PALADIN_JWT_PATTERN
        .replace_all(&s, "${1}[REDACTED]")
        .into_owned();
    s = AUTHORIZATION_PATTERN
        .replace_all(&s, "${1}[REDACTED]")
        .into_owned();
    s = PASSWORD_PATTERN
        .replace_all(&s, "${1}[REDACTED]")
        .into_owned();
    s
}

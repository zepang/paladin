//! log_redact 单元测试 — Phase 8 D-15 (日志/error/WS 绝不含明文密码或 JWT)。
//!
//! 覆盖 5 类 secret 模式 + case-insensitive + placeholder 单向 + 多 secret 同行 + JSON 形态:
//! - DEEPSEEK_API_KEY / JWT_SECRET / PALADIN_JWT_SECRET
//! - Authorization Bearer
//! - password (含 `password=xxx` / `password: xxx` / JSON `"password":"xxx"`)
//! - case-insensitive (deepseek_api_key / DEEPSEEK_API_KEY / Deepseek_Api_Key)
//! - 无 secret 行原样返回
//! - 占位符 [REDACTED] 不泄露原值
//! - 多 secret 同行都掩码

use crate::process::log_redact::{redact_log_line, SECRET_PATTERNS};

#[test]
fn test_redact_deepseek_api_key() {
    let input = "DEEPSEEK_API_KEY=sk-abc123xyz";
    let output = redact_log_line(input);
    assert!(
        !output.contains("sk-abc123xyz"),
        "secret value must not appear in output: got {:?}",
        output
    );
    assert!(
        output.contains("DEEPSEEK_API_KEY"),
        "key name should be preserved: got {:?}",
        output
    );
    assert!(
        output.contains("[REDACTED]"),
        "value should be replaced with [REDACTED]: got {:?}",
        output
    );
}

#[test]
fn test_redact_jwt_secret() {
    let output = redact_log_line("JWT_SECRET=mys3cr3t");
    assert!(
        !output.contains("mys3cr3t"),
        "secret value must not appear: got {:?}",
        output
    );
    assert!(output.contains("JWT_SECRET"));
    assert!(output.contains("[REDACTED]"));
}

#[test]
fn test_redact_paladin_jwt_secret() {
    let output = redact_log_line("PALADIN_JWT_SECRET=paladin-xyz-token");
    assert!(
        !output.contains("paladin-xyz-token"),
        "secret value must not appear: got {:?}",
        output
    );
    assert!(output.contains("PALADIN_JWT_SECRET"));
    assert!(output.contains("[REDACTED]"));
}

#[test]
fn test_redact_authorization_bearer() {
    let output = redact_log_line("Authorization: Bearer eyJhbGci.payload.sig");
    assert!(
        !output.contains("eyJhbGci"),
        "JWT payload must not appear: got {:?}",
        output
    );
    assert!(
        output.contains("Authorization"),
        "scheme name should be preserved: got {:?}",
        output
    );
    assert!(output.contains("[REDACTED]"));
}

#[test]
fn test_redact_password() {
    let output = redact_log_line("password=hunter2");
    assert!(
        !output.contains("hunter2"),
        "password must not appear: got {:?}",
        output
    );
    assert!(output.contains("[REDACTED]"));
}

#[test]
fn test_redact_case_insensitive() {
    for input in [
        "deepseek_api_key=sk-abc",
        "DEEPSEEK_API_KEY=sk-abc",
        "Deepseek_Api_Key=sk-abc",
    ] {
        let output = redact_log_line(input);
        assert!(
            !output.contains("sk-abc"),
            "case-insensitive match failed for input {:?}: got {:?}",
            input,
            output
        );
        assert!(
            output.contains("[REDACTED]"),
            "[REDACTED] missing for input {:?}: got {:?}",
            input,
            output
        );
    }
}

#[test]
fn test_redact_no_secret_returns_unchanged() {
    let input = "INFO agent started on port 9876";
    let output = redact_log_line(input);
    assert_eq!(
        output, input,
        "line without secret should be returned unchanged"
    );
}

#[test]
fn test_redact_placeholder_not_leaking_original() {
    let output = redact_log_line("JWT_SECRET=abc123");
    assert!(
        !output.contains("abc123"),
        "placeholder replacement must not leak original value: got {:?}",
        output
    );
}

#[test]
fn test_redact_multiple_secrets_same_line() {
    let output = redact_log_line("DEEPSEEK_API_KEY=sk-1 JWT_SECRET=j-2");
    assert!(
        !output.contains("sk-1"),
        "first secret must be redacted: got {:?}",
        output
    );
    assert!(
        !output.contains("j-2"),
        "second secret must be redacted: got {:?}",
        output
    );
    assert_eq!(
        output.matches("[REDACTED]").count(),
        2,
        "both secrets should be redacted on the same line: got {:?}",
        output
    );
}

#[test]
fn test_redact_password_json_form() {
    let output = redact_log_line(r#"{"password":"hunter2"}"#);
    assert!(
        !output.contains("hunter2"),
        "JSON password must be redacted: got {:?}",
        output
    );
    assert!(output.contains("[REDACTED]"));
}

#[test]
fn test_secret_patterns_constant_lists_all_five_categories() {
    for required in [
        "DEEPSEEK_API_KEY",
        "JWT_SECRET",
        "PALADIN_JWT_SECRET",
        "Authorization",
        "password",
    ] {
        assert!(
            SECRET_PATTERNS.iter().any(|p| *p == required),
            "SECRET_PATTERNS must list {:?}",
            required
        );
    }
}

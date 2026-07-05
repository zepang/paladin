//! port_probe 单元测试 — SPEC R1 (端口冲突报错) + Edge R9 (孤儿进程检测)。
//!
//! 覆盖:
//! - 空闲端口 → `is_port_available` 返回 true。
//! - 占用端口 → false。
//! - listener 在 check 后立即 drop (不泄露 socket 资源 — 否则 supervisor 后续 spawn 会失败)。
//! - `check_port_or_error` 占用时返回含端口数与进程名的中文 Err。
//! - `check_port_or_error` 空闲时返回 Ok。

use crate::process::port_probe::{check_port_or_error, is_port_available};
use std::net::TcpListener;

fn pick_free_port() -> u16 {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind 127.0.0.1:0 failed");
    let port = listener.local_addr().expect("local_addr").port();
    drop(listener);
    port
}

#[test]
fn test_is_port_available_returns_true_for_free_port() {
    let port = pick_free_port();
    assert!(
        is_port_available(port),
        "free port {} should report available",
        port
    );
}

#[test]
fn test_is_port_available_returns_false_when_occupied() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind 0 failed");
    let port = listener.local_addr().expect("local_addr").port();

    assert!(
        !is_port_available(port),
        "occupied port {} should report unavailable",
        port
    );

    drop(listener);
}

#[test]
fn test_listener_dropped_after_check() {
    let port = pick_free_port();

    assert!(
        is_port_available(port),
        "first check on free port should be true"
    );
    assert!(
        is_port_available(port),
        "second check on same free port must still be true — listener was leaked"
    );
}

#[test]
fn test_check_port_or_error_occupied_returns_err() {
    let listener = TcpListener::bind(("127.0.0.1", 0)).expect("bind 0 failed");
    let port = listener.local_addr().expect("local_addr").port();
    let process_name = "agent";

    let result = check_port_or_error(port, process_name);
    assert!(
        result.is_err(),
        "occupied port should return Err from check_port_or_error"
    );
    let msg = result.unwrap_err();
    assert!(
        msg.contains(&port.to_string()),
        "error message should contain port number: got {:?}",
        msg
    );
    assert!(
        msg.contains(process_name),
        "error message should contain process name: got {:?}",
        msg
    );

    drop(listener);
}

#[test]
fn test_check_port_or_error_free_returns_ok() {
    let port = pick_free_port();
    let result = check_port_or_error(port, "server");
    assert!(
        result.is_ok(),
        "free port should return Ok from check_port_or_error"
    );
}

//! Port-in-use 探测器 — 纯函数模块 (SPEC R1 + Edge R9)。
//!
//! 在 supervisor (plan 07.3-06) spawn 子进程之前,通过 `std::net::TcpListener::bind`
//! 同步探测 127.0.0.1:port 是否空闲:
//! - bind 成功 → 空闲,函数返回 true,listener 在函数返回时立即 drop (不持有 socket)。
//! - bind 失败 → 已被占用,返回 false。
//!
//! SPEC R1 Acceptance: 端口 9876 / 9880 被占时监督器报端口占用错误且不 spawn 该进程。
//! SPEC Edge R9: 崩溃后下次启动通过 port-in-use 检测孤儿进程 (旧进程仍占端口 → bind 失败)。
//!
//! 本模块零 tokio / reqwest / std::process,可独立毫秒级单元测试,跨平台一致。

#![allow(dead_code)]

use std::net::TcpListener;

/// 探测 127.0.0.1:port 是否可被绑定 (空闲)。
///
/// 实现说明:`TcpListener::bind` 成功时返回的 listener 在本函数返回时立即 drop
/// (因为没有被持久化到任何字段),因此 socket 资源会被释放 —
/// 调用方在 `is_port_available(p)` 返回 true 后立即再次 `bind(p)` 不会冲突
/// (见 `test_listener_dropped_after_check`)。
pub fn is_port_available(port: u16) -> bool {
    TcpListener::bind(("127.0.0.1", port)).is_ok()
}

/// 把 `is_port_available` 包装成 supervisor 可直接 `?` 的 Result。
///
/// 占用时返回 `Err(String)`,错误消息含端口数字与进程名,形如:
/// `"端口 9876 已被占用(agent 进程无法启动),请释放后重试"`。
pub fn check_port_or_error(port: u16, process_name: &str) -> Result<(), String> {
    if is_port_available(port) {
        Ok(())
    } else {
        Err(format!(
            "端口 {} 已被占用({} 进程无法启动),请释放后重试",
            port, process_name
        ))
    }
}

//! 6 个 Tauri invoke 命令 (plan 07.3-06 Task 6)。
//!
//! SPEC 行为契约:
//! - `restart_agent` / `restart_server`: 持 `restart_lock` (Edge R7 并发幂等),
//!   先 `graceful_shutdown_one` 再 `spawn_child_to_slot`,transition(RestartRequested)
//!   清零 snapshot (Edge R4 手动 restart 计数清零)。
//! - `stop_agent` / `stop_server`: `graceful_shutdown_one` (SIGTERM + 5s grace),
//!   幂等 — 已 Stopped 时再次调用是 no-op。
//! - `get_process_status`: 返回 agent + server 双路状态,前端首屏与轮询用。
//! - `get_runtime_config`: D-07 单一 Rust URL 真相源 (Agent/Server 端口 → URL)。

use crate::process::supervisor::{
    ProcessName, ProcessStatusSnapshot, ProcessSupervisor, RuntimeConfig,
};
use tauri::State;

/// 重启 Agent — 持 restart_lock,先 graceful_shutdown 再 spawn。
#[tauri::command]
pub async fn restart_agent(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
    supervisor.restart_one(ProcessName::Agent).await
}

/// 停止 Agent — SIGTERM + 5s grace,幂等 (已 Stopped 是 no-op)。
#[tauri::command]
pub async fn stop_agent(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
    supervisor.stop_one(ProcessName::Agent).await
}

/// 重新检测 Agent — dev hybrid attach/spawn/conflict,不复用 restart。
#[tauri::command]
pub async fn redetect_agent(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
    supervisor.redetect_one(ProcessName::Agent).await
}

/// 重启 Server — 持 restart_lock,先 graceful_shutdown 再 spawn。
#[tauri::command]
pub async fn restart_server(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
    supervisor.restart_one(ProcessName::Server).await
}

/// 停止 Server — SIGTERM + 5s grace,幂等。
#[tauri::command]
pub async fn stop_server(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
    supervisor.stop_one(ProcessName::Server).await
}

/// 重新检测 Server — dev hybrid attach/spawn/conflict,不复用 restart。
#[tauri::command]
pub async fn redetect_server(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
    supervisor.redetect_one(ProcessName::Server).await
}

/// 获取 agent + server 双路状态快照 (前端轮询 / 首屏遮罩用)。
#[tauri::command]
pub async fn get_process_status(
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<ProcessStatusSnapshot, String> {
    Ok(supervisor.status().await)
}

/// D-07 单一 Rust URL 真相源 — 前端不再硬编码 URL,从 processes.json 推导。
#[tauri::command]
pub async fn get_runtime_config(
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<RuntimeConfig, String> {
    Ok(supervisor.runtime_config())
}

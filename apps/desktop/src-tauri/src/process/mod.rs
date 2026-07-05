/// 进程监督器模块入口 — 管理 Python Agent 与 Go Server 子进程的生命周期。
///
/// 本模块在 plan 07.3-01 中仅建立类型骨架与共享定义；
/// spawn / 健康探针 / 重启 / 退避 / 优雅关闭 / 日志捕获行为在 plan 07.3-06 实现。
pub mod commands;
pub mod config;
pub mod state_machine;
pub mod supervisor;

pub use config::ProcessConfig;
pub use supervisor::{ProcessName, ProcessState, ProcessSupervisor};

#[cfg(test)]
mod state_machine_tests;

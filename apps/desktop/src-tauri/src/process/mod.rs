/// 进程监督器模块入口 — 管理 Python Agent 与 Go Server 子进程的生命周期。
///
/// plan 07.3-01:类型骨架与共享定义;
/// plan 07.3-02:状态机纯函数 transition/backoff_delay;
/// plan 07.3-03:配置加载器 load_from_path + ConfigError;
/// plan 07.3-05:端口探测 is_port_available + 日志脱敏 redact_log_line;
/// plan 07.3-06:supervisor 主体 + 6 commands + setup() wiring。
pub mod commands;
pub mod config;
pub mod log_redact;
pub mod port_probe;
pub mod state_machine;
pub mod supervisor;

pub use config::ProcessConfig;
pub use supervisor::{
    LogChunk, LogStream, ProcessInfoDTO, ProcessName, ProcessStatusPayload, ProcessStatusSnapshot,
    ProcessState, ProcessSupervisor, RuntimeConfig,
};

#[cfg(test)]
mod config_tests;

#[cfg(test)]
mod log_redact_tests;

#[cfg(test)]
mod port_probe_tests;

#[cfg(test)]
mod state_machine_tests;

//! 进程监督器主体 (plan 07.3-06)。
//!
//! 把 plan 02 状态机 / plan 03 配置加载器 / plan 05 端口探测与日志脱敏等
//! 已验证的纯函数与 `tokio::process` 子进程管理、Tauri `Emitter`、reqwest 探针、
//! 文件落盘、跨平台终止机制组装为完整的 `ProcessSupervisor`,在 `setup()` 内
//! `app.manage + start()`。
//!
//! 架构:
//! - `ProcessSupervisor` 持 `agent: Arc<ProcessSlot>` + `server: Arc<ProcessSlot>`,
//!   `ProcessSlot` 内分别用 `Mutex<ManagedProcess>` 保护状态字段、`Mutex<Option<Child>>`
//!   保护子进程 handle、`Arc<AtomicBool>` 跨 task 共享 shutdown 旗标。
//! - 状态决策委托 [`state_machine::transition`],并发串行化用 `restart_lock` mutex。
//! - 三个独立 task (probe_loop / wait_exit / capture_lines) 各持有 `Arc<ProcessSlot>`
//!   副本,互不阻塞:probe 仅读 state、wait 持 child mutex、capture 仅 append。
//!
//! SPEC 硬约束闭环:
//! - R1 / Edge R9: [`ProcessSupervisor::spawn_one`] 先 [`check_port_or_error`] 预检,
//!   失败返回 Err 不 spawn,emit 端口占用态。
//! - Prohibition P1: [`Command::new(&entry.cmd[0]).args(&entry.cmd[1..])]` 不走 shell,
//!   `cmd` 来自静态配置。
//! - Prohibition P4: 关闭路径只对 tracked Child handle 调 `start_kill`/`kill`,
//!   不读 PID 文件、不系统 kill 匹配。
//! - Prohibition P2: [`ProcessSupervisor::emit_status`] 在每次状态变化时 emit
//!   `last_error` + `stderr_tail` (末尾 50 行)。

// Task 1-4 已完成所有 stub,无 unused imports/dead_code;此 allow 已移除。

use crate::go_config::{GoConfigManager, GoEnvironment, GoRuntimeSnapshot};
use crate::process::config::{
    EndpointConfig, HealthConfig, ProcessConfig, ProcessEntry, ProcessNameKey, RuntimeMode,
};
use crate::process::log_redact::redact_log_line;
use crate::process::log_rotate::{RotatingLineWriter, RotationPolicy};
use crate::process::port_probe::{check_port_or_error, is_port_available};
use crate::process::state_machine::{
    backoff_delay, transition, ProcessEvent, SupervisorSnapshot, STARTUP_GRACE_SECS,
};
use serde::Serialize;
use std::collections::{HashMap, VecDeque};
use std::env;
use std::ffi::OsString;
use std::future::Future;
use std::path::{Path, PathBuf};
use std::pin::Pin;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncBufReadExt;
use tokio::io::{AsyncRead, BufReader};
use tokio::process::{Child, ChildStderr, ChildStdout, Command};
use tokio::sync::Mutex;

/// 探针节奏: 10s 一次 (SPEC Constraints)。
pub const PROBE_INTERVAL_SECS: u64 = 10;

/// 探针单次请求超时 (防止卡死)。
const PROBE_TIMEOUT_SECS: u64 = 5;

/// dev attach preflight grace: a manually started sidecar may bind its port before
/// its health endpoint is ready, so retry briefly before reporting conflict.
const DEV_PREFLIGHT_GRACE_SECS: u64 = 5;

/// stderr_tail VecDeque 容量,保留末尾 N 行 (SPEC Prohibition P2 暴露退出原因)。
const STDERR_TAIL_CAPACITY: usize = 50;

const BUSINESS_ENV_ALLOWLIST: &[&str] = &[
    "PALADIN_AI_PROVIDER",
    "PALADIN_AI_BASE_URL",
    "PALADIN_AI_API_KEY",
    "PALADIN_AI_MODEL",
    "PALADIN_PORT",
    "PALADIN_DATABASE_URL",
    "PALADIN_REDIS_URL",
    "PALADIN_JWT_SECRET",
    "PALADIN_JWT_TTL",
    "PALADIN_BCRYPT_COST",
    "PALADIN_ADMIN_EMAIL",
    "PALADIN_ADMIN_PASSWORD",
    "PALADIN_AUTO_MIGRATE",
    "PALADIN_QUOTA_LIMIT",
    "PALADIN_QUOTA_WINDOW",
    "LOGFIRE_PYDANTIC_RECORD",
];

const SYSTEM_ENV_ALLOWLIST: &[&str] = &[
    "HOME",
    "USERPROFILE",
    "TMPDIR",
    "TMP",
    "TEMP",
    "LANG",
    "LC_ALL",
    "LC_CTYPE",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "REQUESTS_CA_BUNDLE",
    "CURL_CA_BUNDLE",
];

pub(crate) fn environment_for_process(
    mode: RuntimeMode,
    parent: &HashMap<OsString, OsString>,
    configured: &HashMap<String, String>,
) -> HashMap<OsString, OsString> {
    let mut result = HashMap::new();
    for name in BUSINESS_ENV_ALLOWLIST.iter().chain(SYSTEM_ENV_ALLOWLIST) {
        let key = OsString::from(name);
        if let Some(value) = parent.get(&key).filter(|value| !value.is_empty()) {
            result.insert(key, value.clone());
        }
    }
    for (name, value) in configured {
        if !value.is_empty()
            && BUSINESS_ENV_ALLOWLIST.contains(&name.as_str())
            && name != "PALADIN_RUNTIME_MODE"
        {
            result.insert(OsString::from(name), OsString::from(value));
        }
    }
    result.insert(
        OsString::from("PALADIN_RUNTIME_MODE"),
        OsString::from(match mode {
            RuntimeMode::Dev => "dev",
            RuntimeMode::Packaged => "packaged",
        }),
    );
    if mode == RuntimeMode::Packaged {
        result.insert(
            OsString::from("LOGFIRE_PYDANTIC_RECORD"),
            OsString::from("off"),
        );
    }
    result
}

/// Go values are selected by the Rust-only configuration authority before a
/// server child is spawned.  This deliberately replaces (rather than merges)
/// any ordinary parent-shell Go values.
pub(crate) fn environment_for_process_with_go_snapshot(
    mode: RuntimeMode,
    parent: &HashMap<OsString, OsString>,
    configured: &HashMap<String, String>,
    snapshot: Option<&GoRuntimeSnapshot>,
) -> HashMap<OsString, OsString> {
    let mut result = environment_for_process(mode, parent, configured);
    for name in [
        "PALADIN_DATABASE_URL",
        "PALADIN_REDIS_URL",
        "PALADIN_JWT_SECRET",
    ] {
        result.remove(&OsString::from(name));
    }
    if let Some(snapshot) = snapshot {
        result.insert(
            OsString::from("PALADIN_DATABASE_URL"),
            OsString::from(&snapshot.database_url),
        );
        result.insert(
            OsString::from("PALADIN_REDIS_URL"),
            OsString::from(&snapshot.redis_url),
        );
        result.insert(
            OsString::from("PALADIN_JWT_SECRET"),
            OsString::from(&snapshot.jwt_secret),
        );
    }
    result
}

#[cfg(test)]
mod environment_tests {
    use super::*;

    fn os(value: &str) -> OsString {
        OsString::from(value)
    }

    fn get_env<'a>(env: &'a HashMap<OsString, OsString>, name: &str) -> Option<&'a OsString> {
        env.get(&OsString::from(name))
    }

    #[test]
    fn environment_for_process_forwards_non_empty_paladin_ai_bootstrap_vars() {
        let parent = HashMap::from([
            (os("PALADIN_AI_PROVIDER"), os("openai-compatible")),
            (os("PALADIN_AI_BASE_URL"), os("https://provider.test/v1")),
            (os("PALADIN_AI_API_KEY"), os("paladin-ai-secret")),
            (os("PALADIN_AI_MODEL"), os("provider-model")),
            (os("DEEPSEEK_API_KEY"), os("legacy-secret")),
            (os("OPENAI_API_KEY"), os("openai-secret")),
        ]);
        let configured = HashMap::new();

        let env = environment_for_process(RuntimeMode::Dev, &parent, &configured);

        assert_eq!(
            get_env(&env, "PALADIN_AI_PROVIDER"),
            Some(&os("openai-compatible"))
        );
        assert_eq!(
            get_env(&env, "PALADIN_AI_BASE_URL"),
            Some(&os("https://provider.test/v1"))
        );
        assert_eq!(
            get_env(&env, "PALADIN_AI_API_KEY"),
            Some(&os("paladin-ai-secret"))
        );
        assert_eq!(
            get_env(&env, "PALADIN_AI_MODEL"),
            Some(&os("provider-model"))
        );
        assert!(
            !env.contains_key(&os("DEEPSEEK_API_KEY")),
            "legacy provider-specific keys must not be forwarded"
        );
        assert!(
            !env.contains_key(&os("OPENAI_API_KEY")),
            "generic OpenAI keys must not be forwarded"
        );
    }

    #[test]
    fn environment_for_process_ignores_empty_paladin_ai_values() {
        let parent = HashMap::from([
            (os("PALADIN_AI_PROVIDER"), os("")),
            (os("PALADIN_AI_BASE_URL"), os("")),
            (os("PALADIN_AI_API_KEY"), os("")),
            (os("PALADIN_AI_MODEL"), os("")),
        ]);
        let configured = HashMap::from([
            ("PALADIN_AI_PROVIDER".to_string(), String::new()),
            ("PALADIN_AI_BASE_URL".to_string(), String::new()),
            ("PALADIN_AI_API_KEY".to_string(), String::new()),
            ("PALADIN_AI_MODEL".to_string(), String::new()),
        ]);

        let env = environment_for_process(RuntimeMode::Dev, &parent, &configured);

        for name in [
            "PALADIN_AI_PROVIDER",
            "PALADIN_AI_BASE_URL",
            "PALADIN_AI_API_KEY",
            "PALADIN_AI_MODEL",
        ] {
            assert!(
                !env.contains_key(&OsString::from(name)),
                "empty {name} must not be forwarded"
            );
        }
    }

    #[test]
    fn environment_for_process_allows_configured_paladin_ai_values() {
        let parent = HashMap::new();
        let configured = HashMap::from([
            (
                "PALADIN_AI_PROVIDER".to_string(),
                "openai-compatible".to_string(),
            ),
            (
                "PALADIN_AI_BASE_URL".to_string(),
                "https://configured.test/v1".to_string(),
            ),
            (
                "PALADIN_AI_API_KEY".to_string(),
                "configured-secret".to_string(),
            ),
            (
                "PALADIN_AI_MODEL".to_string(),
                "configured-model".to_string(),
            ),
        ]);

        let env = environment_for_process(RuntimeMode::Packaged, &parent, &configured);

        assert_eq!(
            get_env(&env, "PALADIN_AI_PROVIDER"),
            Some(&os("openai-compatible"))
        );
        assert_eq!(
            get_env(&env, "PALADIN_AI_BASE_URL"),
            Some(&os("https://configured.test/v1"))
        );
        assert_eq!(
            get_env(&env, "PALADIN_AI_API_KEY"),
            Some(&os("configured-secret"))
        );
        assert_eq!(
            get_env(&env, "PALADIN_AI_MODEL"),
            Some(&os("configured-model"))
        );
        assert_eq!(get_env(&env, "PALADIN_RUNTIME_MODE"), Some(&os("packaged")));
    }
}

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LifecycleRequest {
    Stop,
    Restart,
    Shutdown,
}

#[cfg(test)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LifecycleAction {
    RejectExternal,
    RedetectOnly,
    TerminateTrackedChild,
    NoTrackedChild,
}

#[cfg(test)]
pub(crate) fn lifecycle_action(
    owner: ProcessOwner,
    has_tracked_child: bool,
    request: LifecycleRequest,
) -> LifecycleAction {
    if owner == ProcessOwner::External {
        return if request == LifecycleRequest::Restart {
            LifecycleAction::RedetectOnly
        } else {
            LifecycleAction::RejectExternal
        };
    }
    if owner == ProcessOwner::Supervisor && has_tracked_child {
        LifecycleAction::TerminateTrackedChild
    } else {
        LifecycleAction::NoTrackedChild
    }
}

pub(crate) fn augmented_spawn_path(base: Option<OsString>) -> OsString {
    let mut paths: Vec<PathBuf> = base
        .as_ref()
        .map(env::split_paths)
        .into_iter()
        .flatten()
        .collect();

    #[cfg(unix)]
    {
        for candidate in common_unix_dev_tool_paths() {
            if !paths.iter().any(|p| p == &candidate) {
                paths.push(candidate);
            }
        }
    }

    env::join_paths(paths).unwrap_or_else(|_| base.unwrap_or_default())
}

pub(crate) fn spawn_path_for_mode(mode: RuntimeMode, base: Option<OsString>) -> Option<OsString> {
    match mode {
        RuntimeMode::Dev => Some(augmented_spawn_path(base)),
        RuntimeMode::Packaged => None,
    }
}

#[cfg(unix)]
fn common_unix_dev_tool_paths() -> Vec<PathBuf> {
    let mut paths = vec![
        PathBuf::from("/usr/local/go/bin"),
        PathBuf::from("/usr/local/bin"),
        PathBuf::from("/opt/homebrew/bin"),
        PathBuf::from("/opt/homebrew/sbin"),
    ];

    if let Some(home) = env::var_os("HOME") {
        let home = PathBuf::from(home);
        paths.push(home.join(".local/bin"));
        paths.push(home.join(".cargo/bin"));
        paths.push(home.join("go/bin"));
    }

    paths
}

/// 进程运行状态机 — serde lowercase 序列化到前端。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessState {
    /// 首探完成前 / spawn 后 5s 窗口内
    Starting,
    /// /health 或 /healthz 返回 200
    Running,
    /// Go /readyz 非 200 (PG/Redis 挂),仅报降级不重启
    Degraded,
    /// 探针 3 连败,重启中
    Unhealthy,
    /// 启动失败 / 退避耗尽 / 手动 stop
    Stopped,
    /// 端口被占用且配置健康检查失败,supervisor 不能安全接管
    Conflict,
}

/// 进程所有权维度。它和健康状态分开建模,避免把外部服务误当成 supervisor 子进程。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessOwner {
    Supervisor,
    External,
    None,
}

/// 进程健康维度。`Unknown` 用于启动/停止等健康尚未确认的状态。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessHealth {
    Healthy,
    Degraded,
    Failed,
    Unknown,
}

/// 运行时进程名 — 与配置层 `ProcessNameKey` 解耦的运行时枚举。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum ProcessName {
    Agent,
    Server,
}

/// 日志流标识 — Tauri emit `process-log` payload 用。
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum LogStream {
    Stdout,
    Stderr,
}

/// 日志事件 payload — 每行子进程输出脱敏后 emit 一次。
#[derive(Debug, Clone, Serialize)]
pub struct LogChunk {
    /// 进程名 (agent / server)。
    pub process: ProcessName,
    /// stdout 或 stderr。
    pub stream: LogStream,
    /// 已脱敏的行内容。
    pub line: String,
    /// Unix epoch 毫秒时间戳。
    pub ts: i64,
}

/// Apply the security-sensitive log ordering shared by capture and deterministic tests:
/// redact first, then emit/tail, and only then attempt bounded persistence.
pub(crate) fn process_log_line<F>(
    name: ProcessName,
    stream: LogStream,
    raw_line: &str,
    writer: &mut RotatingLineWriter,
    stderr_tail: &mut VecDeque<String>,
    mut emit: F,
) where
    F: FnMut(&LogChunk),
{
    let redacted = redact_log_line(raw_line);
    let chunk = LogChunk {
        process: name,
        stream,
        line: redacted.clone(),
        ts: now_ms(),
    };
    emit(&chunk);

    if stream == LogStream::Stderr {
        if stderr_tail.len() >= STDERR_TAIL_CAPACITY {
            stderr_tail.pop_front();
        }
        stderr_tail.push_back(redacted.clone());
    }

    let persisted = match stream {
        LogStream::Stderr => format!("[stderr] {redacted}\n"),
        LogStream::Stdout => format!("[stdout] {redacted}\n"),
    };
    // Persistence is deliberately best-effort. The writer remains available so a transient
    // rename/open/write failure cannot silence later lines or the process-log event stream.
    let _ = writer.write_line(&persisted);
}

/// 单进程的对外 DTO (get_process_status 命令与 process-status payload 共用)。
#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfoDTO {
    pub state: ProcessState,
    pub owner: ProcessOwner,
    pub health: ProcessHealth,
    pub last_error: Option<String>,
    pub stderr_tail: Option<String>,
    pub last_restart_at: Option<i64>,
    /// Fixed category for UI guidance. Never derive this from an error string.
    pub diagnostic_category: Option<ProcessDiagnosticCategory>,
    /// A saved Go configuration is selected only by a future managed Server spawn.
    pub pending_apply: bool,
    pub allowed_actions: ProcessAllowedActions,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProcessDiagnosticCategory {
    GoConfigurationMissing,
    GoConfigurationInvalid,
    DependencyUnavailable,
    PortConflict,
    SidecarFailed,
}

#[derive(Debug, Clone, Serialize)]
pub struct ProcessAllowedActions {
    pub restart: bool,
    pub stop: bool,
    pub redetect: bool,
}

fn allowed_actions(owner: ProcessOwner) -> ProcessAllowedActions {
    ProcessAllowedActions {
        restart: owner == ProcessOwner::Supervisor,
        stop: owner == ProcessOwner::Supervisor,
        redetect: true,
    }
}

fn diagnostic_for_state(
    name: ProcessName,
    state: ProcessState,
) -> Option<ProcessDiagnosticCategory> {
    match (name, state) {
        (_, ProcessState::Conflict) => Some(ProcessDiagnosticCategory::PortConflict),
        (_, ProcessState::Unhealthy | ProcessState::Stopped) => {
            Some(ProcessDiagnosticCategory::SidecarFailed)
        }
        (ProcessName::Server, ProcessState::Degraded) => {
            Some(ProcessDiagnosticCategory::DependencyUnavailable)
        }
        _ => None,
    }
}

/// `process-status` 事件 payload — 含 `name` 字段让前端区分 agent vs server。
#[derive(Debug, Clone, Serialize)]
pub struct ProcessStatusPayload {
    pub name: ProcessName,
    #[serde(flatten)]
    pub info: ProcessInfoDTO,
}

/// `get_process_status` 命令返回类型 — agent + server 两路状态。
#[derive(Debug, Clone, Serialize)]
pub struct ProcessStatusSnapshot {
    pub agent: ProcessInfoDTO,
    pub server: ProcessInfoDTO,
}

/// `get_runtime_config` 命令返回类型 — D-07 单一 Rust URL 真相源。
#[derive(Debug, Clone, Serialize)]
pub struct RuntimeConfig {
    pub agent_url: String,
    pub server_url: String,
}

/// 单进程运行时状态 (受 `ProcessSlot::state` mutex 保护)。
pub struct ManagedProcess {
    #[allow(dead_code)]
    pub name: ProcessName,
    pub state: ProcessState,
    pub owner: ProcessOwner,
    pub health: ProcessHealth,
    pub pid: Option<u32>,
    pub snapshot: SupervisorSnapshot,
    pub stderr_tail: VecDeque<String>,
    pub spawn_time: Option<Instant>,
    pub last_restart_at: Option<i64>,
    pub last_error: Option<String>,
    pub diagnostic_category: Option<ProcessDiagnosticCategory>,
    pub pending_apply: bool,
}

impl ManagedProcess {
    fn new(name: ProcessName) -> Self {
        Self {
            name,
            state: ProcessState::Starting,
            owner: ProcessOwner::Supervisor,
            health: ProcessHealth::Unknown,
            pid: None,
            snapshot: SupervisorSnapshot::default(),
            stderr_tail: VecDeque::with_capacity(STDERR_TAIL_CAPACITY),
            spawn_time: None,
            last_restart_at: None,
            last_error: None,
            diagnostic_category: None,
            pending_apply: false,
        }
    }
}

fn apply_supervisor_state(mp: &mut ManagedProcess, state: ProcessState) {
    mp.state = state;
    mp.owner = ProcessOwner::Supervisor;
    mp.health = match state {
        ProcessState::Starting => ProcessHealth::Unknown,
        ProcessState::Running => ProcessHealth::Healthy,
        ProcessState::Degraded => ProcessHealth::Degraded,
        ProcessState::Unhealthy => ProcessHealth::Failed,
        ProcessState::Stopped => ProcessHealth::Unknown,
        ProcessState::Conflict => ProcessHealth::Failed,
    };
}

fn apply_external_state(mp: &mut ManagedProcess, state: ProcessState, health: ProcessHealth) {
    mp.state = state;
    mp.owner = ProcessOwner::External;
    mp.health = health;
}

fn apply_none_state(mp: &mut ManagedProcess, state: ProcessState, health: ProcessHealth) {
    mp.state = state;
    mp.owner = ProcessOwner::None;
    mp.health = health;
}

fn diagnostic_fallback_config() -> ProcessConfig {
    let mut processes = HashMap::new();
    processes.insert(
        ProcessNameKey::Agent,
        ProcessEntry {
            cmd: vec!["paladin-config-error".into()],
            cwd: None,
            env: HashMap::new(),
            port: 9876,
            health: HealthConfig {
                liveness: EndpointConfig {
                    path: "/health".into(),
                    expect_status: 200,
                },
                readiness: None,
            },
            startup_grace_secs: 5,
        },
    );
    processes.insert(
        ProcessNameKey::Server,
        ProcessEntry {
            cmd: vec!["paladin-config-error".into()],
            cwd: None,
            env: HashMap::new(),
            port: 9880,
            health: HealthConfig {
                liveness: EndpointConfig {
                    path: "/healthz".into(),
                    expect_status: 200,
                },
                readiness: Some(EndpointConfig {
                    path: "/readyz".into(),
                    expect_status: 200,
                }),
            },
            startup_grace_secs: 5,
        },
    );
    ProcessConfig {
        mode: "dev".into(),
        processes,
        backoff_secs: vec![1, 2, 4, 8, 16],
        max_restarts: 5,
        shutdown_grace_secs: 5,
    }
}

/// 单进程 slot — 状态/子进程 handle/shutdown 旗标 全部 Arc 包装,可跨 task 持有。
///
/// 设计要点:state 与 child 拆为两个 mutex,wait_exit 持 child mutex 等
/// `child.wait()` 时,probe/emit_status 仍可短暂 lock state mutex 更新状态。
pub struct ProcessSlot {
    /// 状态字段 (state, snapshot, stderr_tail, spawn_time, last_error)。
    pub state: Mutex<ManagedProcess>,
    /// 子进程 handle — wait_exit 在此 await,graceful_shutdown 在此 kill。
    pub child: Mutex<Option<Child>>,
    /// shutdown 旗标 — Drop / stop 命令 set true,各 task 看到后退出循环。
    pub shutdown_flag: Arc<AtomicBool>,
    /// restart 串行化锁 — `restart_X` 命令持有此锁期间,其他 restart 调用阻塞
    /// 或返回 in-progress (SPEC Edge R7)。
    pub restart_lock: Mutex<()>,
}

impl ProcessSlot {
    fn new(name: ProcessName) -> Arc<Self> {
        Arc::new(Self {
            state: Mutex::new(ManagedProcess::new(name)),
            child: Mutex::new(None),
            shutdown_flag: Arc::new(AtomicBool::new(false)),
            restart_lock: Mutex::new(()),
        })
    }
}

/// 进程监督器主体 — 在 `setup()` 内 `app.manage` 后调 `start()` 启动两个子进程。
///
/// `Clone` 实现允许 setup 闭包内 `supervisor.clone()` 后 move 到后台 task 调 `start()`,
/// 同时 `app.manage(supervisor)` 持另一份 clone;两份共享 `Arc<ProcessSlot>`,操作同一 slot。
#[derive(Clone)]
pub struct ProcessSupervisor {
    pub agent: Arc<ProcessSlot>,
    pub server: Arc<ProcessSlot>,
    pub config: Arc<ProcessConfig>,
    pub app_handle: AppHandle,
    pub log_dir: PathBuf,
    /// The write-only Go authority is read only when a managed Server child is spawned.
    pub go_config: Option<GoConfigManager>,
}

impl ProcessSupervisor {
    /// 构造 supervisor。不 spawn 子进程;`start()` 才 spawn。
    pub fn new(
        app_handle: AppHandle,
        config: ProcessConfig,
        log_dir: PathBuf,
        go_config: GoConfigManager,
    ) -> Self {
        Self {
            agent: ProcessSlot::new(ProcessName::Agent),
            server: ProcessSlot::new(ProcessName::Server),
            config: Arc::new(config),
            app_handle,
            log_dir,
            go_config: Some(go_config),
        }
    }

    pub fn from_config_error(app_handle: AppHandle, log_dir: PathBuf, message: String) -> Self {
        let supervisor = Self {
            agent: ProcessSlot::new(ProcessName::Agent),
            server: ProcessSlot::new(ProcessName::Server),
            config: Arc::new(diagnostic_fallback_config()),
            app_handle,
            log_dir,
            go_config: None,
        };
        for slot in [&supervisor.agent, &supervisor.server] {
            let mut mp = slot.state.blocking_lock();
            apply_none_state(&mut mp, ProcessState::Stopped, ProcessHealth::Failed);
            mp.last_error = Some(message.clone());
            mp.snapshot.last_error_len = message.len() as u32;
        }
        supervisor
    }

    fn slot_of(&self, name: ProcessName) -> &Arc<ProcessSlot> {
        match name {
            ProcessName::Agent => &self.agent,
            ProcessName::Server => &self.server,
        }
    }

    fn entry_of(&self, name: ProcessName) -> &ProcessEntry {
        let key = match name {
            ProcessName::Agent => ProcessNameKey::Agent,
            ProcessName::Server => ProcessNameKey::Server,
        };
        self.config
            .processes
            .get(&key)
            .expect("ProcessConfig::validate 已保证 processes 含 agent + server,此处 unwrap 安全")
    }

    /// D-07 单一 Rust URL 真相源:从 `processes.json` 端口构造 URL。
    pub fn runtime_config(&self) -> RuntimeConfig {
        let agent_port = self.entry_of(ProcessName::Agent).port;
        let server_port = self.entry_of(ProcessName::Server).port;
        RuntimeConfig {
            agent_url: format!("http://localhost:{agent_port}"),
            server_url: format!("http://localhost:{server_port}"),
        }
    }

    /// `get_process_status` 命令入口 — 首探完成前 `state=Starting`。
    pub async fn status(&self) -> ProcessStatusSnapshot {
        self.reconcile_runtime_health(ProcessName::Agent).await;
        self.reconcile_runtime_health(ProcessName::Server).await;
        let agent = self.snapshot_of(ProcessName::Agent).await;
        let server = self.snapshot_of(ProcessName::Server).await;
        ProcessStatusSnapshot { agent, server }
    }

    async fn reconcile_runtime_health(&self, name: ProcessName) {
        let entry = self.entry_of(name);
        let Some((state, health)) = probe_runtime_health(entry, Duration::from_millis(500)).await
        else {
            return;
        };

        let slot = self.slot_of(name);
        let mut mp = slot.state.lock().await;
        if mp.state == state && mp.health == health {
            return;
        }

        // `get_process_status` 是前端轮询的 Rust 真相源。dev 模式下子进程
        // wrapper/reloader 可能让 slot 停在旧状态；健康端点可达时以运行事实纠偏。
        match mp.owner {
            ProcessOwner::Supervisor => apply_supervisor_state(&mut mp, state),
            ProcessOwner::External => apply_external_state(&mut mp, state, health),
            ProcessOwner::None => apply_external_state(&mut mp, state, health),
        }
        mp.last_error = None;
        mp.snapshot.fail_count = 0;
        if name == ProcessName::Server && state == ProcessState::Degraded {
            mp.diagnostic_category = Some(ProcessDiagnosticCategory::DependencyUnavailable);
        }
    }

    async fn snapshot_of(&self, name: ProcessName) -> ProcessInfoDTO {
        let slot = self.slot_of(name);
        let mp = slot.state.lock().await;
        ProcessInfoDTO {
            state: mp.state,
            owner: mp.owner,
            health: mp.health,
            last_error: mp.last_error.clone(),
            stderr_tail: {
                let s: String = mp
                    .stderr_tail
                    .iter()
                    .cloned()
                    .collect::<Vec<_>>()
                    .join("\n");
                if s.is_empty() {
                    None
                } else {
                    Some(s)
                }
            },
            last_restart_at: mp.last_restart_at,
            diagnostic_category: mp.diagnostic_category,
            pending_apply: mp.pending_apply,
            allowed_actions: allowed_actions(mp.owner),
        }
    }

    /// SPEC Prohibition P2: 每次 state 变化时 emit 含 `last_error` + `stderr_tail` 的 payload。
    ///
    /// 当前内部各 task 都用 free function `emit_status_to`;此方法是面向未来的
    /// pub API (供 commands 或测试入口直接触发 emit),保留 + `#[allow(dead_code)]`。
    #[allow(dead_code)]
    pub async fn emit_status(&self, name: ProcessName, last_error: Option<String>) {
        let slot = self.slot_of(name).clone();
        emit_status_to(&slot, &self.app_handle, name, last_error).await;
    }

    /// SPEC R1 / Edge R9 / Prohibition P1: spawn 子进程。委托给 [`spawn_child_to_slot`],
    /// 让 wait_exit 在 backoff 重启时也能复用同一路径。
    #[allow(dead_code)]
    pub async fn spawn_one(&self, name: ProcessName) -> Result<(), String> {
        let slot = self.slot_of(name).clone();
        spawn_child_to_slot(
            &slot,
            name,
            &self.app_handle,
            &self.config,
            &self.log_dir,
            self.go_config.as_ref(),
        )
        .await
    }

    async fn start_one_runtime(&self, name: ProcessName) -> Result<(), String> {
        let slot = self.slot_of(name).clone();
        let _guard = slot.restart_lock.lock().await;

        if self.config.runtime_mode()? == RuntimeMode::Packaged {
            return spawn_child_to_slot(
                &slot,
                name,
                &self.app_handle,
                &self.config,
                &self.log_dir,
                self.go_config.as_ref(),
            )
            .await;
        }

        match resolve_dev_runtime_path(name, self.entry_of(name)).await? {
            DevRuntimePath::Attach { state, health } => {
                slot.shutdown_flag.store(false, Ordering::Relaxed);
                *slot.child.lock().await = None;
                {
                    let mut mp = slot.state.lock().await;
                    apply_external_state(&mut mp, state, health);
                    mp.pid = None;
                    mp.spawn_time = None;
                    mp.last_error = None;
                    mp.stderr_tail.clear();
                }
                emit_status_to(&slot, &self.app_handle, name, None).await;
                let app_c = self.app_handle.clone();
                let cfg_c = self.config.clone();
                let slot_c = slot.clone();
                tokio::spawn(async move {
                    probe_loop(slot_c, name, app_c, cfg_c).await;
                });
                Ok(())
            }
            DevRuntimePath::Spawn => {
                spawn_child_to_slot(
                    &slot,
                    name,
                    &self.app_handle,
                    &self.config,
                    &self.log_dir,
                    self.go_config.as_ref(),
                )
                .await
            }
            DevRuntimePath::Conflict(message) => {
                {
                    let mut mp = slot.state.lock().await;
                    apply_none_state(&mut mp, ProcessState::Conflict, ProcessHealth::Failed);
                    mp.pid = None;
                    mp.spawn_time = None;
                    mp.last_error = Some(message.clone());
                    mp.diagnostic_category = Some(ProcessDiagnosticCategory::PortConflict);
                }
                emit_status_to(&slot, &self.app_handle, name, Some(message.clone())).await;
                Err(message)
            }
        }
    }

    pub async fn redetect_one(&self, name: ProcessName) -> Result<(), String> {
        self.start_one_runtime(name).await
    }

    /// SPEC 启动顺序 (D-08): **Server 先**,等 /readyz 5s 超时,再 spawn Agent。
    ///
    /// 5s 超时不阻塞 Agent 启动 (Server 在 Degraded 探针后会自恢复,Agent 启动不依赖
    /// Server 立即就绪)。spawn_one 失败立即返回 Err,前端展示 last_error。
    pub async fn start(&self) -> Result<(), String> {
        // 1. Server 先
        let server_result = self.start_one_runtime(ProcessName::Server).await;

        // 2. 等 Server /readyz 5s (若配置了 readiness)
        let server_entry = self.entry_of(ProcessName::Server);
        let readyz_path = server_entry
            .health
            .readiness
            .as_ref()
            .map(|r| r.path.clone());
        let server_is_supervisor_owned = {
            self.slot_of(ProcessName::Server).state.lock().await.owner == ProcessOwner::Supervisor
        };
        if server_is_supervisor_owned {
            if let Some(readyz_path) = readyz_path {
                let readyz_url = format!("http://127.0.0.1:{}{}", server_entry.port, readyz_path);
                let readyz_expect = server_entry
                    .health
                    .readiness
                    .as_ref()
                    .unwrap()
                    .expect_status;
                let client = reqwest::Client::builder()
                    .timeout(Duration::from_millis(900))
                    .build()
                    .map_err(|e| format!("reqwest build 失败: {e}"))?;
                let deadline = Instant::now() + Duration::from_secs(5);
                let mut ok = false;
                while Instant::now() < deadline {
                    if let Ok(resp) = client.get(&readyz_url).send().await {
                        if resp.status().as_u16() == readyz_expect {
                            ok = true;
                            break;
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(200)).await;
                }
                if !ok {
                    // 5s 超时 — 不阻塞 Agent 启动,但记 Server Degraded 状态
                    let slot = self.slot_of(ProcessName::Server).clone();
                    {
                        let mut mp = slot.state.lock().await;
                        let (ns, nsnap) =
                            transition(mp.state, ProcessEvent::ProbeDegraded, &mp.snapshot);
                        apply_supervisor_state(&mut mp, ns);
                        mp.snapshot = nsnap;
                        mp.last_error =
                            Some("启动 5s 内 /readyz 未就绪 (PG/Redis 可能未启动)".to_string());
                        mp.diagnostic_category =
                            Some(ProcessDiagnosticCategory::DependencyUnavailable);
                    }
                    emit_status_to(
                        &slot,
                        &self.app_handle,
                        ProcessName::Server,
                        Some("启动 5s 内 /readyz 未就绪".to_string()),
                    )
                    .await;
                }
            }
        }

        // 3. Agent spawn
        if let Err(e) = self.start_one_runtime(ProcessName::Agent).await {
            return Err(format!("Agent 启动失败: {e}"));
        }
        if let Err(e) = server_result {
            eprintln!("[paladin] Server 启动/附着失败: {e}");
        }
        Ok(())
    }

    /// SPEC 应用关闭路径 — 反向顺序停 (Agent 先停,Server 后停)。
    pub async fn graceful_shutdown_all(&self) {
        self.graceful_shutdown_one(ProcessName::Agent).await;
        self.graceful_shutdown_one(ProcessName::Server).await;
    }

    /// 单进程优雅关闭 — SPEC Prohibition P4 / SPEC Constraints 5s grace。
    pub async fn graceful_shutdown_one(&self, name: ProcessName) {
        let slot = self.slot_of(name).clone();
        graceful_shutdown_slot(&slot, name, &self.app_handle).await;
    }

    /// SPEC Edge R7: 手动 restart_X 命令 — 持 restart_lock,先 graceful_shutdown 再 spawn。
    pub async fn restart_one(&self, name: ProcessName) -> Result<(), String> {
        let slot = self.slot_of(name).clone();
        if slot.state.lock().await.owner == ProcessOwner::External {
            return self.redetect_one(name).await;
        }
        // restart_lock 串行化 — 防止 restart_agent / restart_server / wait_exit 同时触发
        let _guard = slot.restart_lock.lock().await;

        // graceful shutdown 当前 child (若有)
        graceful_shutdown_slot(&slot, name, &self.app_handle).await;

        // SPEC Edge R4: transition(RestartRequested) 清零 snapshot
        {
            let mut mp = slot.state.lock().await;
            let (ns, nsnap) = transition(mp.state, ProcessEvent::RestartRequested, &mp.snapshot);
            apply_supervisor_state(&mut mp, ns);
            mp.snapshot = nsnap;
            mp.last_error = None;
            mp.last_restart_at = Some(now_ms());
        }

        // spawn — 失败时置 Stopped + emit
        let res = spawn_child_to_slot(
            &slot,
            name,
            &self.app_handle,
            &self.config,
            &self.log_dir,
            self.go_config.as_ref(),
        )
        .await;
        if let Err(e) = res {
            let msg = format!("restart spawn 失败: {e}");
            let mut mp = slot.state.lock().await;
            apply_supervisor_state(&mut mp, ProcessState::Stopped);
            mp.last_error = Some(msg.clone());
            mp.diagnostic_category = Some(ProcessDiagnosticCategory::SidecarFailed);
            drop(mp);
            emit_status_to(&slot, &self.app_handle, name, Some(msg)).await;
            return Err(e);
        }
        Ok(())
    }

    /// 用户显式 stop 命令 — transition StopRequested → Stopped。
    pub async fn stop_one(&self, name: ProcessName) -> Result<(), String> {
        let slot = self.slot_of(name).clone();
        if slot.state.lock().await.owner == ProcessOwner::External {
            return Err("external_not_owned: 外部服务由你手动管理，Paladin 不会停止它".into());
        }
        graceful_shutdown_slot(&slot, name, &self.app_handle).await;
        Ok(())
    }
}

impl Drop for ProcessSupervisor {
    /// SPEC 应用关闭 — Drop 兜底:set shutdown_flag 后尝试 block_on graceful_shutdown。
    /// 若已在 tokio runtime 内 (Tauri 关闭时常见),block_in_place 隔离避免 nested panic。
    /// 仍失败时由 [`Command::kill_on_drop(true)`] 兜底 SIGKILL,保证不泄漏 child。
    fn drop(&mut self) {
        if !should_shutdown_on_drop(
            Arc::strong_count(&self.agent),
            Arc::strong_count(&self.server),
        ) {
            return;
        }

        self.agent.shutdown_flag.store(true, Ordering::Relaxed);
        self.server.shutdown_flag.store(true, Ordering::Relaxed);

        if tokio::runtime::Handle::try_current().is_ok() {
            // 已在 runtime 内 — block_in_place 避免嵌套 block_on panic
            tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current().block_on(self.graceful_shutdown_all())
            });
        }
        // 否则无法 graceful,kill_on_drop 兜底
    }
}

pub(crate) fn should_shutdown_on_drop(
    agent_strong_count: usize,
    server_strong_count: usize,
) -> bool {
    agent_strong_count == 1 && server_strong_count == 1
}

/// BoxFuture 类型别名 — 用 Pin<Box<dyn Future + Send>> 打破
/// spawn_child_to_slot ↔ wait_exit 之间的 async fn 类型推断循环 (rustc E0391)。
type SpawnFut<'a> = Pin<Box<dyn Future<Output = Result<(), String>> + Send + 'a>>;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) enum DevRuntimePath {
    Attach {
        state: ProcessState,
        health: ProcessHealth,
    },
    Spawn,
    Conflict(String),
}

pub(crate) async fn resolve_dev_runtime_path(
    name: ProcessName,
    entry: &ProcessEntry,
) -> Result<DevRuntimePath, String> {
    let port = entry.port;
    let liveness_url = format!("http://127.0.0.1:{port}{}", entry.health.liveness.path);
    let client = reqwest::Client::builder()
        .timeout(Duration::from_millis(700))
        .build()
        .map_err(|e| format!("reqwest build 失败: {e}"))?;

    let deadline = Instant::now() + Duration::from_secs(DEV_PREFLIGHT_GRACE_SECS);
    loop {
        let liveness_ok = match client.get(&liveness_url).send().await {
            Ok(resp) => resp.status().as_u16() == entry.health.liveness.expect_status,
            Err(_) => false,
        };

        if liveness_ok {
            if let Some(readiness) = &entry.health.readiness {
                let readiness_url = format!("http://127.0.0.1:{port}{}", readiness.path);
                let readiness_ok = match client.get(&readiness_url).send().await {
                    Ok(resp) => resp.status().as_u16() == readiness.expect_status,
                    Err(_) => false,
                };
                if !readiness_ok {
                    return Ok(DevRuntimePath::Attach {
                        state: ProcessState::Degraded,
                        health: ProcessHealth::Degraded,
                    });
                }
            }
            return Ok(DevRuntimePath::Attach {
                state: ProcessState::Running,
                health: ProcessHealth::Healthy,
            });
        }

        if is_port_available(port) {
            return Ok(DevRuntimePath::Spawn);
        }

        if Instant::now() >= deadline {
            let label = match name {
                ProcessName::Agent => "Agent",
                ProcessName::Server => "Go Server",
            };
            return Ok(DevRuntimePath::Conflict(format!(
                "{label} 端口 {port} 已被占用，但健康检查 {liveness_url} 未通过"
            )));
        }

        tokio::time::sleep(Duration::from_millis(200)).await;
    }
}

async fn probe_runtime_health(
    entry: &ProcessEntry,
    timeout: Duration,
) -> Option<(ProcessState, ProcessHealth)> {
    let port = entry.port;
    let liveness_url = format!("http://127.0.0.1:{port}{}", entry.health.liveness.path);
    let client = reqwest::Client::builder().timeout(timeout).build().ok()?;

    let liveness_ok = match client.get(&liveness_url).send().await {
        Ok(resp) => resp.status().as_u16() == entry.health.liveness.expect_status,
        Err(_) => false,
    };
    if !liveness_ok {
        return None;
    }

    if let Some(readiness) = &entry.health.readiness {
        let readiness_url = format!("http://127.0.0.1:{port}{}", readiness.path);
        let readiness_ok = match client.get(&readiness_url).send().await {
            Ok(resp) => resp.status().as_u16() == readiness.expect_status,
            Err(_) => false,
        };
        if !readiness_ok {
            return Some((ProcessState::Degraded, ProcessHealth::Degraded));
        }
    }

    Some((ProcessState::Running, ProcessHealth::Healthy))
}

/// SPEC R1 / Edge R9 / Prohibition P1: 实际 spawn 逻辑 — free function,可被
/// `ProcessSupervisor::spawn_one` 与 wait_exit (backoff 重启) 共用。
///
/// 步骤:
/// 1. `check_port_or_error` 预检 — 占用时 emit `last_error='端口 N 已被占用'`、不 spawn。
/// 2. `tokio::process::Command::new(&cmd[0]).args(&cmd[1..])` 不走 shell,P1 命令注入面收敛。
/// 3. 设置 `kill_on_drop(true)` 防止 child handle 泄漏成为孤儿进程。
/// 4. take stdout/stderr,启动 capture_lines task (脱敏 + 落盘 + emit)。
/// 5. 启动 probe_loop (10s 周期探针) + wait_exit (区分 SpawnFailed/Crashed + backoff)。
/// 6. state = Starting、spawn_time = now。
pub(crate) fn spawn_child_to_slot<'a>(
    slot: &'a Arc<ProcessSlot>,
    name: ProcessName,
    app: &'a AppHandle,
    config: &'a Arc<ProcessConfig>,
    log_dir: &'a Path,
    go_config: Option<&'a GoConfigManager>,
) -> SpawnFut<'a> {
    Box::pin(async move {
        let entry = match name {
            ProcessName::Agent => config.processes.get(&ProcessNameKey::Agent),
            ProcessName::Server => config.processes.get(&ProcessNameKey::Server),
        }
        .expect("ProcessConfig::validate 已保证 agent+server 都存在");
        let process_name_str = match name {
            ProcessName::Agent => "Agent",
            ProcessName::Server => "Server",
        };

        // SPEC R1 / Edge R9: 端口预检 — 失败时 emit + Err,不 spawn。
        if let Err(e) = check_port_or_error(entry.port, process_name_str) {
            emit_status_to(slot, app, name, Some(e.clone())).await;
            return Err(e);
        }

        // SPEC Prohibition P1: cmd 来自静态 ProcessConfig;Command 默认不走 shell。
        let mut cmd = Command::new(&entry.cmd[0]);
        cmd.args(&entry.cmd[1..]);
        // 相对 cwd 基于 CARGO_MANIFEST_DIR (src-tauri),dev 模式可靠;packaged 模式 Phase 10 改造。
        let base = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
        let cwd = entry
            .cwd
            .as_ref()
            .map(|p| {
                if p.is_absolute() {
                    p.clone()
                } else {
                    base.join(p)
                }
            })
            .unwrap_or_else(|| base.clone());
        cmd.current_dir(&cwd);
        // 子进程不继承开放式 parent env；仅显式业务/系统 allowlist 可进入边界。
        let parent: HashMap<OsString, OsString> = env::vars_os().collect();
        let selected_go_snapshot = if name == ProcessName::Server {
            if let Some(manager) = go_config {
                // A marker is the only path that may select parent-session values. The
                // manager otherwise returns its persisted Rust-only snapshot.
                let environment = GoEnvironment::from_process_env();
                let marker = env::var("PALADIN_GO_SESSION_OVERRIDE").unwrap_or_default();
                manager
                    .runtime_snapshot_for_marked_session(&environment, &marker)
                    .await
                    .ok()
            } else {
                None
            }
        } else {
            None
        };
        let process_env = if name == ProcessName::Server {
            environment_for_process_with_go_snapshot(
                config.runtime_mode()?,
                &parent,
                &entry.env,
                selected_go_snapshot.as_ref(),
            )
        } else {
            environment_for_process(config.runtime_mode()?, &parent, &entry.env)
        };
        cmd.env_clear().envs(process_env);
        if let Some(path) = spawn_path_for_mode(config.runtime_mode()?, env::var_os("PATH")) {
            // GUI/Tauri dev shells may not inherit login-shell PATH. Add common tool dirs so
            // `uv` and `go` can be found without falling back to a shell.
            cmd.env("PATH", path);
        }
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // 防 child 泄漏:若 Child handle drop 时进程仍在跑,tokio 会发 SIGKILL。
            // 注意 graceful_shutdown 仍优先走 SIGTERM + 5s grace 路径,这是兜底。
            .kill_on_drop(true);
        #[cfg(unix)]
        {
            // `go run`/`uv` 会再派生真正的服务进程；独立进程组让 stop/restart
            // 能终止整棵托管进程树，避免留下继续占端口的子进程。
            cmd.process_group(0);
        }

        let mut child = cmd
            .spawn()
            .map_err(|e| format!("spawn {process_name_str} 失败: {e}"))?;

        let stdout: Option<ChildStdout> = child.stdout.take();
        let stderr: Option<ChildStderr> = child.stderr.take();

        // 新 spawn — 重置 shutdown_flag。
        slot.shutdown_flag.store(false, Ordering::Relaxed);

        {
            let mut mp = slot.state.lock().await;
            apply_supervisor_state(&mut mp, ProcessState::Starting);
            mp.pid = child.id();
            mp.spawn_time = Some(Instant::now());
            mp.stderr_tail.clear();
            mp.pending_apply = false;
            mp.diagnostic_category =
                if name == ProcessName::Server && selected_go_snapshot.is_none() {
                    Some(ProcessDiagnosticCategory::GoConfigurationMissing)
                } else {
                    None
                };
            // spawn 成功不立即清 last_error,等首次 ProbeOk 才清 (transition 不动 last_error_len)。
        }

        // 把 child handle 存入 mutex,wait_exit task 会接管。
        *slot.child.lock().await = Some(child);

        // 启动 capture_lines / probe_loop / wait_exit 三个独立 task。
        let log_path = log_dir.join(match name {
            ProcessName::Agent => "paladin-agent.log",
            ProcessName::Server => "paladin-server.log",
        });

        if let Some(stdout) = stdout {
            let app_c = app.clone();
            let flag = slot.shutdown_flag.clone();
            let path = log_path.clone();
            let slot_c = slot.clone();
            tokio::spawn(async move {
                capture_lines(name, LogStream::Stdout, stdout, path, app_c, flag, slot_c).await;
            });
        }
        if let Some(stderr) = stderr {
            let flag = slot.shutdown_flag.clone();
            let slot_c = slot.clone();
            let app_c = app.clone();
            tokio::spawn(async move {
                capture_lines(
                    name,
                    LogStream::Stderr,
                    stderr,
                    log_path.clone(),
                    app_c,
                    flag,
                    slot_c,
                )
                .await;
            });
        }

        // probe_loop — 每 spawn 启动一次,Stopped 后退出 (P3)。
        {
            let app_c = app.clone();
            let cfg_c = config.clone();
            let slot_c = slot.clone();
            tokio::spawn(async move {
                probe_loop(slot_c, name, app_c, cfg_c).await;
            });
        }

        // wait_exit — 接管 child handle,处理 SpawnFailed/Crashed/backoff。
        {
            let slot_c = slot.clone();
            let cfg_c = config.clone();
            let app_c = app.clone();
            let ld = log_dir.to_path_buf();
            let go_config_c = go_config.cloned();
            tokio::spawn(async move {
                wait_exit(slot_c, name, app_c, cfg_c, ld, go_config_c).await;
            });
        }

        // emit Starting 状态 (前端首屏遮罩依赖此事件)。
        emit_status_to(slot, app, name, None).await;

        Ok(())
    })
}

/// 当前 Unix epoch 毫秒时间戳 (LogChunk.ts 字段)。
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

#[cfg(unix)]
enum UnixSignal {
    Terminate,
    Kill,
}

#[cfg(unix)]
fn signal_process_tree(pid: Option<u32>, signal: UnixSignal) {
    let Some(pid) = pid else {
        return;
    };

    use nix::sys::signal::{kill, Signal};
    use nix::unistd::Pid;

    let signal = match signal {
        UnixSignal::Terminate => Signal::SIGTERM,
        UnixSignal::Kill => Signal::SIGKILL,
    };
    let pgid = Pid::from_raw(-(pid as i32));
    if kill(pgid, signal).is_err() {
        let _ = kill(Pid::from_raw(pid as i32), signal);
    }
}

/// SPEC Prohibition P4 / SPEC Constraints 5s grace: 单 slot 优雅关闭。
///
/// 步骤:
/// 1. set `shutdown_flag` — wait_exit / probe_loop / capture_lines 看到 flag 后退出。
/// 2. transition(StopRequested) → Stopped (P3 终态)。
/// 3. take child handle。
/// 4. **Unix**: `nix::sys::signal::kill(pid, SIGTERM)` (D-14);**Windows**: `child.start_kill()`
///    (Job Object 关闭子进程组)。
/// 5. `tokio::time::timeout(5s, child.wait())`;超时 → SIGKILL (Unix) / `child.kill()` (Win)。
/// 6. emit_status 通知前端 state=Stopped。
///
/// 不读 PID 文件、不系统 kill 匹配 (P4):只对 tracked Child handle 操作。
pub(crate) async fn graceful_shutdown_slot(
    slot: &Arc<ProcessSlot>,
    name: ProcessName,
    app: &AppHandle,
) {
    {
        let mp = slot.state.lock().await;
        if mp.owner != ProcessOwner::Supervisor {
            drop(mp);
            emit_status_to(slot, app, name, None).await;
            return;
        }
    }

    // 1. set shutdown_flag
    slot.shutdown_flag.store(true, Ordering::Relaxed);

    // 2. transition Stopped (若已是 Stopped 则幂等)
    {
        let mut mp = slot.state.lock().await;
        let pid = mp.pid;
        let (ns, _) = transition(mp.state, ProcessEvent::StopRequested, &mp.snapshot);
        apply_supervisor_state(&mut mp, ns);
        mp.pid = None;
        drop(mp);
        #[cfg(unix)]
        signal_process_tree(pid, UnixSignal::Terminate);
    }

    // 3. take child
    let child = { slot.child.lock().await.take() };
    let Some(mut child) = child else {
        emit_status_to(slot, app, name, None).await;
        return;
    };

    // 4. 发信号
    let pid = child.id();
    #[cfg(unix)]
    signal_process_tree(pid, UnixSignal::Terminate);
    #[cfg(windows)]
    {
        // D-14 Windows 无 SIGTERM 概念,直接 start_kill (关闭 Job Object 句柄触发子进程组终止)
        let _ = child.start_kill();
    }

    // 5. 等 5s grace
    match tokio::time::timeout(Duration::from_secs(5), child.wait()).await {
        Ok(_) => {}
        Err(_) => {
            // 超时 — 强制 kill
            #[cfg(unix)]
            {
                signal_process_tree(pid, UnixSignal::Kill);
                let _ = child.wait().await;
            }
            #[cfg(windows)]
            {
                let _ = child.kill();
                let _ = child.wait().await;
            }
        }
    }

    emit_status_to(slot, app, name, None).await;
}

/// SPEC Prohibition P2 共用 emit 函数 — 接收 slot 引用,可被 probe_loop / wait_exit /
/// capture_lines / emit_status 共用,避免重复实现。
pub(crate) async fn emit_status_to(
    slot: &Arc<ProcessSlot>,
    app: &AppHandle,
    name: ProcessName,
    last_error: Option<String>,
) {
    let payload = {
        let mut mp = slot.state.lock().await;
        if last_error.is_some() {
            mp.last_error = last_error.clone();
            mp.snapshot.last_error_len = last_error.as_ref().map(|s| s.len() as u32).unwrap_or(0);
        }
        ProcessStatusPayload {
            name,
            info: ProcessInfoDTO {
                state: mp.state,
                owner: mp.owner,
                health: mp.health,
                last_error: mp.last_error.clone(),
                stderr_tail: {
                    let s: String = mp
                        .stderr_tail
                        .iter()
                        .cloned()
                        .collect::<Vec<_>>()
                        .join("\n");
                    if s.is_empty() {
                        None
                    } else {
                        Some(s)
                    }
                },
                last_restart_at: mp.last_restart_at,
                diagnostic_category: mp.diagnostic_category,
                pending_apply: mp.pending_apply,
                allowed_actions: allowed_actions(mp.owner),
            },
        }
    };
    let _ = app.emit("process-status", &payload);
}

// 以下 task 函数在 Task 2 / 3 / 4 / 5 中填充。

/// probe_loop — 10s 周期探针 (SPEC Constraints)。
///
/// 流程:
/// 1. spawn 后等 PROBE_INTERVAL_SECS,然后第一次探针 (D-11 首探延迟由 10s 提供)。
/// 2. reqwest GET liveness endpoint (Agent `/health`,Go `/healthz`)。
/// 3. liveness 200 → 再探 readiness (仅 Server 有,D-05);非 200 → ProbeDegraded (不计 fail)。
/// 4. transition 决策:ProbeOk → Running (清 last_error),ProbeFail 3 连 → Unhealthy。
/// 5. 状态变化才 emit_status;无变化不打扰前端。
/// 6. 退出条件: shutdown_flag 或 state == Stopped (P3 stopped 不自恢复)。
async fn probe_loop(
    slot: Arc<ProcessSlot>,
    name: ProcessName,
    app: AppHandle,
    config: Arc<ProcessConfig>,
) {
    let entry = match name {
        ProcessName::Agent => config.processes.get(&ProcessNameKey::Agent),
        ProcessName::Server => config.processes.get(&ProcessNameKey::Server),
    }
    .expect("ProcessConfig::validate 已保证 agent+server 都存在");

    let port = entry.port;
    let liveness_path = entry.health.liveness.path.clone();
    let liveness_url = format!("http://127.0.0.1:{port}{liveness_path}");
    let liveness_expect = entry.health.liveness.expect_status;
    let readiness = entry.health.readiness.as_ref();
    let readiness_cfg = readiness.map(|r| {
        (
            format!("http://127.0.0.1:{port}{}", r.path),
            r.expect_status,
        )
    });

    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(PROBE_TIMEOUT_SECS))
        .build()
    {
        Ok(c) => c,
        Err(_) => return,
    };

    loop {
        if slot.shutdown_flag.load(Ordering::Relaxed) {
            break;
        }
        tokio::time::sleep(Duration::from_secs(PROBE_INTERVAL_SECS)).await;
        if slot.shutdown_flag.load(Ordering::Relaxed) {
            break;
        }
        {
            let mp = slot.state.lock().await;
            if mp.state == ProcessState::Stopped {
                break;
            }
        }

        // 探 liveness
        let liveness_ok = match client.get(&liveness_url).send().await {
            Ok(resp) => resp.status().as_u16() == liveness_expect,
            Err(_) => false,
        };

        let event = if liveness_ok {
            if let Some((ref ready_url, ready_expect)) = readiness_cfg {
                let ready_ok = match client.get(ready_url).send().await {
                    Ok(resp) => resp.status().as_u16() == ready_expect,
                    Err(_) => false,
                };
                if ready_ok {
                    ProcessEvent::ProbeOk
                } else {
                    // D-05 Server readiness 非 200 (PG/Redis 挂) — 降级,不计 fail_count
                    ProcessEvent::ProbeDegraded
                }
            } else {
                ProcessEvent::ProbeOk
            }
        } else {
            ProcessEvent::ProbeFail
        };

        let (state_changed, last_error_for_emit) = {
            let mut mp = slot.state.lock().await;
            if mp.state == ProcessState::Stopped {
                break;
            }
            let prev = mp.state;
            let (ns, nsnap) = transition(mp.state, event, &mp.snapshot);
            if mp.owner == ProcessOwner::External {
                match ns {
                    ProcessState::Running => {
                        apply_external_state(&mut mp, ProcessState::Running, ProcessHealth::Healthy)
                    }
                    ProcessState::Degraded => apply_external_state(
                        &mut mp,
                        ProcessState::Degraded,
                        ProcessHealth::Degraded,
                    ),
                    ProcessState::Unhealthy => apply_external_state(
                        &mut mp,
                        ProcessState::Unhealthy,
                        ProcessHealth::Failed,
                    ),
                    other => mp.state = other,
                }
            } else {
                apply_supervisor_state(&mut mp, ns);
            }
            mp.snapshot = nsnap;
            // Running 时清 last_error (前端"健康"显示)
            if ns == ProcessState::Running {
                mp.last_error = None;
            }
            mp.diagnostic_category = diagnostic_for_state(name, ns).or(mp.diagnostic_category);
            // emit 策略: Running (清错) / Unhealthy / Degraded 都 emit,以便前端刷新
            let emit = prev != ns || ns == ProcessState::Running;
            (emit, mp.last_error.clone())
        };

        if state_changed {
            emit_status_to(&slot, &app, name, last_error_for_emit).await;
        }
    }
}

/// wait_exit — 接管 child handle,等待退出并按 SPEC R3/R3'/R4/P3 决策。
///
/// 流程:
/// 1. 从 `slot.child` mutex take 出 child handle (释放 mutex)。
/// 2. await `child.wait()`;退出后取 `exit_status.code()`。
/// 3. 读 `spawn_time.elapsed()`:
///    - ≤ STARTUP_GRACE_SECS (5s) → `SpawnFailed` → transition → Stopped,**break 不重启**。
///    - > 5s → `Crashed` → transition → Unhealthy + restart_count+1,走 backoff。
/// 4. backoff: `backoff_delay(restart_count-1, max_restarts)`:
///    - `Some(d)` → `sleep(d)` → `spawn_child_to_slot` (会启动新 wait_exit,本 task break)。
///    - `None` → max_restarts 耗尽,手动转 Stopped + emit,break (P3 不自恢复)。
/// 5. shutdown_flag 期间 child 退出 → 直接 break (不视为崩溃)。
async fn wait_exit(
    slot: Arc<ProcessSlot>,
    name: ProcessName,
    app: AppHandle,
    config: Arc<ProcessConfig>,
    log_dir: PathBuf,
    go_config: Option<GoConfigManager>,
) {
    let process_label = match name {
        ProcessName::Agent => "Agent",
        ProcessName::Server => "Server",
    };
    let entry = match name {
        ProcessName::Agent => config.processes.get(&ProcessNameKey::Agent),
        ProcessName::Server => config.processes.get(&ProcessNameKey::Server),
    }
    .expect("ProcessConfig::validate 已保证 agent+server 都存在");

    // 1. take child
    let mut child = {
        let mut guard = slot.child.lock().await;
        match guard.take() {
            Some(c) => c,
            None => return, // spawn 失败 / 手动 stop — 没有 child 可等
        }
    };

    // 2. wait
    let exit_result = child.wait().await;
    let exit_code = match &exit_result {
        Ok(status) => status.code(),
        Err(_) => None,
    };
    drop(child);

    // shutdown 期间 child 退出 — 不视为崩溃
    if slot.shutdown_flag.load(Ordering::Relaxed) {
        return;
    }

    if let Some((state, health)) = probe_runtime_health(entry, Duration::from_millis(700)).await {
        {
            let mut mp = slot.state.lock().await;
            if mp.owner == ProcessOwner::External {
                apply_external_state(&mut mp, state, health);
            } else {
                apply_supervisor_state(&mut mp, state);
            }
            mp.snapshot.fail_count = 0;
            mp.last_error = None;
        }
        emit_status_to(&slot, &app, name, None).await;
        return;
    }

    // 3. 读 spawn_time,决定事件
    let (event, error_msg) = {
        let mp = slot.state.lock().await;
        if mp.state == ProcessState::Stopped {
            // 已被 stop 命令置 Stopped,不重启
            return;
        }
        let elapsed = mp.spawn_time.map(|t| t.elapsed()).unwrap_or_default();
        let elapsed_secs = elapsed.as_secs_f64();
        let msg = format!("{process_label} 进程退出 (code={exit_code:?}, 运行 {elapsed_secs:.1}s)");
        let ev = if elapsed_secs <= STARTUP_GRACE_SECS {
            ProcessEvent::SpawnFailed {
                exited_after_secs: elapsed_secs,
            }
        } else {
            ProcessEvent::Crashed {
                exited_after_secs: elapsed_secs,
            }
        };
        (ev, msg)
    };

    // 4. transition
    let new_state;
    let new_snap;
    {
        let mut mp = slot.state.lock().await;
        if mp.state == ProcessState::Stopped {
            return;
        }
        let (ns, nsnap) = transition(mp.state, event, &mp.snapshot);
        apply_supervisor_state(&mut mp, ns);
        if ns == ProcessState::Stopped {
            mp.pid = None;
        }
        mp.snapshot = nsnap;
        mp.last_error = Some(error_msg.clone());
        mp.diagnostic_category = Some(ProcessDiagnosticCategory::SidecarFailed);
        new_state = ns;
        new_snap = nsnap;
    }

    emit_status_to(&slot, &app, name, Some(error_msg.clone())).await;

    match new_state {
        ProcessState::Stopped => {
            // SpawnFailed (≤5s) 或前置 backoff 耗尽 — P3 终态,不自恢复
        }
        ProcessState::Unhealthy => {
            // Crashed → 走 backoff 路径
            // restart_count 已被 transition +1;BACKOFF_SEQUENCE_MS 索引 = restart_count - 1
            let attempt_idx = new_snap.restart_count.saturating_sub(1);
            let delay = backoff_delay(attempt_idx, config.max_restarts);
            match delay {
                Some(d) => {
                    tokio::time::sleep(d).await;
                    if slot.shutdown_flag.load(Ordering::Relaxed) {
                        return;
                    }
                    // 重启 — spawn 一个独立 task 调用 spawn_child_to_slot,
                    // 它内部会启动新 wait_exit,本 task 退出。
                    // 用 spawn 隔离避免 wait_exit <-> spawn_child_to_slot 的 Send 推断循环。
                    let slot_c = slot.clone();
                    let app_c = app.clone();
                    let cfg_c = config.clone();
                    let ld = log_dir.clone();
                    tokio::spawn(async move {
                        if let Err(e) = spawn_child_to_slot(
                            &slot_c,
                            name,
                            &app_c,
                            &cfg_c,
                            &ld,
                            go_config.as_ref(),
                        )
                        .await
                        {
                            let fail_msg = format!("退避后重启 spawn 失败: {e}");
                            {
                                let mut mp = slot_c.state.lock().await;
                                apply_supervisor_state(&mut mp, ProcessState::Stopped);
                                mp.pid = None;
                                mp.last_error = Some(fail_msg.clone());
                            }
                            emit_status_to(&slot_c, &app_c, name, Some(fail_msg)).await;
                        }
                    });
                }
                None => {
                    // max_restarts 耗尽 — 手动转 Stopped (P3)
                    let exhaust_msg = format!(
                        "{process_label} 退避 {} 次耗尽,放弃自恢复",
                        config.max_restarts
                    );
                    {
                        let mut mp = slot.state.lock().await;
                        apply_supervisor_state(&mut mp, ProcessState::Stopped);
                        mp.pid = None;
                        mp.last_error = Some(exhaust_msg.clone());
                    }
                    emit_status_to(&slot, &app, name, Some(exhaust_msg)).await;
                }
            }
        }
        _ => {
            // 不应发生 (SpawnFailed→Stopped / Crashed→Unhealthy 是 transition 的硬路径)
        }
    }
}

/// capture_lines — 异步逐行读取子进程 stdout/stderr (SPEC Prohibition P2 / Edge R10)。
///
/// 流程:
/// 1. `tokio::fs::OpenOptions::create+append` 打开 log_path;失败降级为只 emit 不落盘
///    (SPEC Edge R10 logs-dir-not-writable 不阻塞进程)。
/// 2. BufReader::read_line 逐行读;EOF (Ok(0)) 退出 loop。
/// 3. 每行先 [`redact_log_line`] 脱敏 (plan 05 已验证 — Agent 内联 token / path / DSN)。
/// 4. emit `process-log` 事件,LogChunk { process, stream, line, ts }。
/// 5. **stderr** 行追加到 `mp.stderr_tail` (VecDeque 容量 50,LIFO 弹头) — P2 暴露退出原因。
/// 6. 落盘:写失败时把 file 置 None (避免反复失败),不阻塞。
/// 7. shutdown_flag 时退出。
async fn capture_lines<R>(
    name: ProcessName,
    stream: LogStream,
    reader: R,
    log_path: PathBuf,
    app: AppHandle,
    shutdown_flag: Arc<AtomicBool>,
    slot: Arc<ProcessSlot>,
) where
    R: AsyncRead + Unpin + Send + 'static,
{
    let mut buf = BufReader::new(reader);

    let mut writer = RotatingLineWriter::new(log_path, RotationPolicy::default());

    let mut line_buf = String::new();
    loop {
        line_buf.clear();
        match buf.read_line(&mut line_buf).await {
            Ok(0) => break, // EOF — child stdout/stderr 关闭
            Ok(_) => {
                let trimmed = line_buf.trim_end_matches(['\n', '\r']);
                let mut mp = slot.state.lock().await;
                process_log_line(
                    name,
                    stream,
                    trimmed,
                    &mut writer,
                    &mut mp.stderr_tail,
                    |chunk| {
                        let _ = app.emit("process-log", chunk);
                    },
                );
            }
            Err(_) => break,
        }

        if shutdown_flag.load(Ordering::Relaxed) {
            break;
        }
    }
}

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

// Task 1 阶段 probe_loop/wait_exit/capture_lines 是 stub,部分 import + 字段未引用。
// Task 4 完成后清理此 allow,届时所有 import 都会被使用。
#![allow(unused_imports)]
#![allow(dead_code)]

use crate::process::config::{ProcessConfig, ProcessEntry, ProcessNameKey};
use crate::process::log_redact::redact_log_line;
use crate::process::port_probe::check_port_or_error;
use crate::process::state_machine::{
    backoff_delay, transition, ProcessEvent, SupervisorSnapshot, STARTUP_GRACE_SECS,
};
use serde::Serialize;
use std::collections::VecDeque;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncRead, AsyncWriteExt, BufReader};
use tokio::io::AsyncBufReadExt;
use tokio::process::{Child, ChildStderr, ChildStdout, Command};
use tokio::sync::Mutex;

/// 探针节奏: 10s 一次 (SPEC Constraints)。
pub const PROBE_INTERVAL_SECS: u64 = 10;

/// 探针单次请求超时 (防止卡死)。
const PROBE_TIMEOUT_SECS: u64 = 5;

/// stderr_tail VecDeque 容量,保留末尾 N 行 (SPEC Prohibition P2 暴露退出原因)。
const STDERR_TAIL_CAPACITY: usize = 50;

/// 进程运行状态机 — SPEC R7 / Acceptance 锁定的 5 状态,serde lowercase 序列化到前端。
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

/// 单进程的对外 DTO (get_process_status 命令与 process-status payload 共用)。
#[derive(Debug, Clone, Serialize)]
pub struct ProcessInfoDTO {
    pub state: ProcessState,
    pub last_error: Option<String>,
    pub stderr_tail: Option<String>,
    pub last_restart_at: Option<i64>,
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
    pub name: ProcessName,
    pub state: ProcessState,
    pub snapshot: SupervisorSnapshot,
    pub stderr_tail: VecDeque<String>,
    pub spawn_time: Option<Instant>,
    pub last_restart_at: Option<i64>,
    pub last_error: Option<String>,
}

impl ManagedProcess {
    fn new(name: ProcessName) -> Self {
        Self {
            name,
            state: ProcessState::Starting,
            snapshot: SupervisorSnapshot::default(),
            stderr_tail: VecDeque::with_capacity(STDERR_TAIL_CAPACITY),
            spawn_time: None,
            last_restart_at: None,
            last_error: None,
        }
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
pub struct ProcessSupervisor {
    pub agent: Arc<ProcessSlot>,
    pub server: Arc<ProcessSlot>,
    pub config: Arc<ProcessConfig>,
    pub app_handle: AppHandle,
    pub log_dir: PathBuf,
}

impl ProcessSupervisor {
    /// 构造 supervisor。不 spawn 子进程;`start()` 才 spawn。
    pub fn new(app_handle: AppHandle, config: ProcessConfig, log_dir: PathBuf) -> Self {
        Self {
            agent: ProcessSlot::new(ProcessName::Agent),
            server: ProcessSlot::new(ProcessName::Server),
            config: Arc::new(config),
            app_handle,
            log_dir,
        }
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
        self.config.processes.get(&key).expect(
            "ProcessConfig::validate 已保证 processes 含 agent + server,此处 unwrap 安全",
        )
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
        let agent = self.snapshot_of(ProcessName::Agent).await;
        let server = self.snapshot_of(ProcessName::Server).await;
        ProcessStatusSnapshot { agent, server }
    }

    async fn snapshot_of(&self, name: ProcessName) -> ProcessInfoDTO {
        let slot = self.slot_of(name);
        let mp = slot.state.lock().await;
        ProcessInfoDTO {
            state: mp.state,
            last_error: mp.last_error.clone(),
            stderr_tail: {
                let s: String = mp.stderr_tail.iter().cloned().collect::<Vec<_>>().join("\n");
                if s.is_empty() { None } else { Some(s) }
            },
            last_restart_at: mp.last_restart_at,
        }
    }

    /// SPEC Prohibition P2: 每次 state 变化时 emit 含 `last_error` + `stderr_tail` 的 payload。
    pub async fn emit_status(&self, name: ProcessName, last_error: Option<String>) {
        let slot = self.slot_of(name);
        let payload = {
            let mut mp = slot.state.lock().await;
            if last_error.is_some() {
                mp.last_error = last_error.clone();
                mp.snapshot.last_error_len =
                    last_error.as_ref().map(|s| s.len() as u32).unwrap_or(0);
            }
            ProcessStatusPayload {
                name,
                info: ProcessInfoDTO {
                    state: mp.state,
                    last_error: mp.last_error.clone(),
                    stderr_tail: {
                        let s: String =
                            mp.stderr_tail.iter().cloned().collect::<Vec<_>>().join("\n");
                        if s.is_empty() { None } else { Some(s) }
                    },
                    last_restart_at: mp.last_restart_at,
                },
            }
        };
        let _ = self.app_handle.emit("process-status", &payload);
    }

    /// SPEC R1 / Edge R9 / Prohibition P1: spawn 子进程。
    ///
    /// 步骤:
    /// 1. `check_port_or_error` 预检 — 占用时 emit `last_error='端口 N 已被占用'`、不 spawn。
    /// 2. `tokio::process::Command::new(&cmd[0]).args(&cmd[1..])` 不走 shell,P1 命令注入面收敛。
    /// 3. 设置 `kill_on_drop(true)` 防止 child handle 泄漏成为孤儿进程。
    /// 4. take stdout/stderr,启动 capture_lines task (脱敏 + 落盘 + emit)。
    /// 5. 启动 probe_loop (10s 周期探针) + wait_exit (区分 SpawnFailed/Crashed + backoff)。
    /// 6. state = Starting、spawn_time = now。
    pub async fn spawn_one(&self, name: ProcessName) -> Result<(), String> {
        let entry = self.entry_of(name);
        let process_name_str = match name {
            ProcessName::Agent => "Agent",
            ProcessName::Server => "Server",
        };

        // SPEC R1 / Edge R9: 端口预检 — 失败时 emit + Err,不 spawn。
        if let Err(e) = check_port_or_error(entry.port, process_name_str) {
            self.emit_status(name, Some(e.clone())).await;
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
            .map(|p| if p.is_absolute() { p.clone() } else { base.join(p) })
            .unwrap_or_else(|| base.clone());
        cmd.current_dir(&cwd);
        // env 字面透传 (plan 03 已验证字面值不展开)。
        cmd.envs(&entry.env);
        cmd.stdin(Stdio::null())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            // 防 child 泄漏:若 Child handle drop 时进程仍在跑,tokio 会发 SIGKILL。
            // 注意 graceful_shutdown 仍优先走 SIGTERM + 5s grace 路径,这是兜底。
            .kill_on_drop(true);

        let mut child = cmd.spawn().map_err(|e| {
            let msg = format!("spawn {process_name_str} 失败: {e}");
            // 同步 emit 在 await 点之前不太合适,这里仅返回 Err,调用方负责 emit。
            msg
        })?;

        let stdout: Option<ChildStdout> = child.stdout.take();
        let stderr: Option<ChildStderr> = child.stderr.take();

        let slot = self.slot_of(name).clone();
        // 新 spawn — 重置 shutdown_flag。
        slot.shutdown_flag.store(false, Ordering::Relaxed);

        {
            let mut mp = slot.state.lock().await;
            mp.state = ProcessState::Starting;
            mp.spawn_time = Some(Instant::now());
            mp.stderr_tail.clear();
            // spawn 成功不立即清 last_error,等首次 ProbeOk 才清 (transition 不动 last_error_len)。
        }

        // 把 child handle 存入 mutex,wait_exit task 会接管。
        *slot.child.lock().await = Some(child);

        // 启动 capture_lines / probe_loop / wait_exit 三个独立 task。
        let log_path = self.log_dir.join(match name {
            ProcessName::Agent => "paladin-agent.log",
            ProcessName::Server => "paladin-server.log",
        });
        let app = self.app_handle.clone();
        let config = self.config.clone();
        let log_dir = self.log_dir.clone();

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
                capture_lines(name, LogStream::Stderr, stderr, log_path, app_c, flag, slot_c)
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
            let ld = log_dir.clone();
            tokio::spawn(async move {
                wait_exit(slot_c, name, app_c, cfg_c, ld).await;
            });
        }

        // emit Starting 状态 (前端首屏遮罩依赖此事件)。
        self.emit_status(name, None).await;

        Ok(())
    }
}

/// 当前 Unix epoch 毫秒时间戳 (LogChunk.ts 字段)。
fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

// 以下三个 task 在 Task 2 / 3 / 4 / 5 中填充。本 Task 1 仅留 stub 让 spawn_one 编译通过。
// stub 期间 unused imports 由 module-level `#[allow(unused_imports)]` 抑制,Task 4 完成后移除。

/// probe_loop stub — Task 2 实现 10s 周期探针 + transition + emit。
async fn probe_loop(
    _slot: Arc<ProcessSlot>,
    _name: ProcessName,
    _app: AppHandle,
    _config: Arc<ProcessConfig>,
) {
    // Task 2 填充
}

/// wait_exit stub — Task 3 实现 SpawnFailed/Crashed 区分 + backoff 重启。
async fn wait_exit(
    _slot: Arc<ProcessSlot>,
    _name: ProcessName,
    _app: AppHandle,
    _config: Arc<ProcessConfig>,
    _log_dir: PathBuf,
) {
    // Task 3 填充
}

/// capture_lines stub — Task 4 实现 redact + append + emit + stderr_tail。
async fn capture_lines<R>(
    _name: ProcessName,
    _stream: LogStream,
    _reader: R,
    _log_path: PathBuf,
    _app: AppHandle,
    _shutdown_flag: Arc<AtomicBool>,
    _slot: Arc<ProcessSlot>,
) where
    R: AsyncRead + Unpin + Send + 'static,
{
    // Task 4 填充
}

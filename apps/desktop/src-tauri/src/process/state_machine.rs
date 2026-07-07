//! 进程状态机纯函数模块 (plan 07.3-02)。
//!
//! 把 supervisor 的「状态决策」剥离为零 I/O 的纯函数,使得 SPEC Acceptance +
//! Edge Coverage R2/R3/R4 + Prohibition P3 的全部硬约束可在 `cargo test` 中
//! 毫秒级密集验证。supervisor (plan 07.3-06) 调用 [`transition`] 与
//! [`backoff_delay`] 即可获得已验证的决策内核,自身只负责并发 / I/O / Tauri 集成。
//!
//! 设计要点:
//! - 事件类型即语义:`SpawnFailed` 表示 supervisor 已判定为启动失败 (≤5s exit),
//!   `Crashed` 表示运行崩溃 (>5s exit)。transition 不再二次判定 `exited_after_secs`,
//!   只按 event 类型路由,符合 PLAN implementation 描述(supervisor 决定 event)。
//! - [`SupervisorSnapshot`] 全字段 `u32` 以支持 `Copy + Eq`,使 transition 返回
//!   新 snapshot 而非 mutate,supervisor 调用层无并发顾虑。

// 模块的 pub 项在 plan 07.3-06 supervisor 集成前仅被测试调用,与 plan 01
// supervisor.rs 的 `#[allow(dead_code)] pub struct ProcessSupervisor` 同款
// "骨架先行"模式 —— 集成后 warning 自然消失。
#![allow(dead_code)]

use crate::process::supervisor::{ProcessHealth, ProcessOwner};
use crate::process::ProcessState;
use std::time::Duration;

/// SPEC Constraints (继承自 Phase 7a): 崩溃重启退避序列 (毫秒)。
///
/// 锁定为 `[1000, 2000, 4000, 8000, 16000]`,最多 5 次。第 N 次重启前等待
/// `BACKOFF_SEQUENCE_MS[N-1]` 毫秒;耗尽 (attempt_idx >= 5) 由 supervisor
/// 进入 Stopped 终态等待手动 restart。
pub const BACKOFF_SEQUENCE_MS: [u64; 5] = [1000, 2000, 4000, 8000, 16000];

/// SPEC Acceptance: 连续 3 次探针失败触发重启 (R2)。
pub const PROBE_FAIL_THRESHOLD: u32 = 3;

/// SPEC Acceptance: 启动 grace 窗口 (秒,边界含 5.0)。退出时刻 ≤ 此值视为启动失败。
pub const STARTUP_GRACE_SECS: f64 = 5.0;

/// 状态机输入事件。`exited_after_secs` 用于审计 / 日志,transition 不再据此
/// 二次判分(supervisor 层在 spawn 后 5s 内 exit 转 `SpawnFailed`,其后转 `Crashed`)。
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum ProcessEvent {
    /// spawn() 已派发但首探未完成 (信息事件,当前状态保持)
    SpawnStarted,
    /// 健康探针返回 200 (Agent /health 或 Go /healthz)
    ProbeOk,
    /// 健康探针非 200 / 网络异常 → 计入 [`PROBE_FAIL_THRESHOLD`] 阈值
    ProbeFail,
    /// Go /readyz 非 200 (PG/Redis 挂) → 仅 Degraded,不累加 fail_count,不重启
    ProbeDegraded,
    /// 子进程退出且 supervisor 判定为运行崩溃 (exit 时刻 > [`STARTUP_GRACE_SECS`])
    Crashed { exited_after_secs: f64 },
    /// 子进程退出且 supervisor 判定为启动失败 (exit 时刻 ≤ [`STARTUP_GRACE_SECS`])
    SpawnFailed { exited_after_secs: f64 },
    /// 用户显式 restart 命令 — 清零所有计数器并回到 Starting
    RestartRequested,
    /// supervisor 退避定时器的一次 tick,`attempt` 为本次退避序号 (0-based)
    BackoffTick { attempt: u32 },
    /// 用户显式 stop 命令 / 应用关闭 — 任意状态直接 → Stopped
    StopRequested,
}

/// supervisor 的可观察快照 — transition 返回新值而非 mutate,便于纯函数测试。
///
/// `last_error_len` 替代 `Option<String>` 使结构 `Copy + Eq`;supervisor 实际
/// 退出原因文本保留在自身日志层,这里只暴露长度给前端遥测。
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
pub struct SupervisorSnapshot {
    /// 当前连续探针失败次数,达到 [`PROBE_FAIL_THRESHOLD`] 触发重启并清零
    pub fail_count: u32,
    /// 累计 backoff 重启次数,达 [`BACKOFF_SEQUENCE_MS`] 长度后 supervisor 转 Stopped
    pub restart_count: u32,
    /// 最近一次退出原因文本长度 (前端遥测用)
    pub last_error_len: u32,
}

/// 状态机纯函数: 输入 (current, event, snapshot) → (new_state, new_snapshot)。
///
/// SPEC 行为契约:
/// - **R2**: `ProbeFail` 累加 `fail_count`;达 3 连败 → `Unhealthy` + `restart_count + 1` + `fail_count = 0`
/// - **R2':** `ProbeDegraded` (Go /readyz 非 200) → `Degraded`,**不**改 `fail_count`,不重启
/// - **R3**: `SpawnFailed` (≤5s exit) → `Stopped` 直接,**不**消费 backoff 槽位
/// - **R3'**: `Crashed` (>5s exit) → `Unhealthy` + `restart_count + 1`,进入 backoff 路径
/// - **R4**: `backoff_delay` 退避序列 1/2/4/8/16s,attempt_idx ≥ max_restarts 或 ≥ 5 → `None`
/// - **P3**: `Stopped` 终态除 `RestartRequested` 外**不**被任何事件(含 `BackoffTick`)唤醒
/// - **Edge R4**: `RestartRequested` 在任意状态都返回 `Starting` 并把 snapshot 清零
pub fn transition(
    current: ProcessState,
    event: ProcessEvent,
    snap: &SupervisorSnapshot,
) -> (ProcessState, SupervisorSnapshot) {
    use ProcessEvent::*;
    use ProcessState::*;

    // P3: Stopped 是终态,只有显式 RestartRequested 才能脱离。
    // 后台 BackoffTick / 残留探针事件绝不能唤醒 Stopped 进程。
    if current == Stopped {
        return match event {
            RestartRequested => (Starting, SupervisorSnapshot::default()),
            _ => (Stopped, *snap),
        };
    }

    match (current, event) {
        // 用户显式 stop — 任意状态直接 → Stopped,snapshot 透传
        (_, StopRequested) => (Stopped, *snap),

        // 用户显式 restart — 任意状态回到 Starting 并清零所有计数器
        (_, RestartRequested) => (Starting, SupervisorSnapshot::default()),

        // 健康探针通过 → Running,清零 fail_count (restart_count 保留用于累计遥测)
        (_, ProbeOk) => (
            Running,
            SupervisorSnapshot {
                fail_count: 0,
                restart_count: snap.restart_count,
                last_error_len: snap.last_error_len,
            },
        ),

        // 健康探针失败 — 累加 fail_count,达阈值触发重启
        (state, ProbeFail) => {
            let new_fail = snap.fail_count.saturating_add(1);
            if new_fail >= PROBE_FAIL_THRESHOLD {
                (
                    Unhealthy,
                    SupervisorSnapshot {
                        fail_count: 0,
                        restart_count: snap.restart_count.saturating_add(1),
                        last_error_len: snap.last_error_len,
                    },
                )
            } else {
                (
                    state,
                    SupervisorSnapshot {
                        fail_count: new_fail,
                        restart_count: snap.restart_count,
                        last_error_len: snap.last_error_len,
                    },
                )
            }
        }

        // Go /readyz 非 200 — 仅 Degraded,不累加 fail_count,不重启
        (_, ProbeDegraded) => (Degraded, *snap),

        // 启动失败 (≤5s exit) — Stopped 直接,不消费 backoff 槽位 (restart_count 不变)
        (_, SpawnFailed { .. }) => (
            Stopped,
            SupervisorSnapshot {
                fail_count: 0,
                restart_count: snap.restart_count,
                last_error_len: snap.last_error_len,
            },
        ),

        // 运行崩溃 (>5s exit) — Unhealthy + 消费一个 backoff 槽位
        (_, Crashed { .. }) => (
            Unhealthy,
            SupervisorSnapshot {
                fail_count: 0,
                restart_count: snap.restart_count.saturating_add(1),
                last_error_len: snap.last_error_len,
            },
        ),

        // 退避定时器 tick — Unhealthy 状态下耗尽 (>= 5 次) → Stopped 终态
        (Unhealthy, BackoffTick { attempt }) if attempt >= BACKOFF_SEQUENCE_MS.len() as u32 => {
            (Stopped, *snap)
        }

        // 其它组合 (含 SpawnStarted / Unhealthy 内未耗尽的 BackoffTick 等) 保持当前
        _ => (current, *snap),
    }
}

/// 退避序列查询: 返回第 `attempt_idx` 次重启应等待的 [`Duration`]。
///
/// - `attempt_idx < min(max_restarts, BACKOFF_SEQUENCE_MS.len())` → `Some(BACKOFF_SEQUENCE_MS[attempt_idx])`
/// - 否则返回 `None`,supervisor 据此转 Stopped 终态 (SPEC R4 退避耗尽)
pub fn backoff_delay(attempt_idx: u32, max_restarts: u32) -> Option<Duration> {
    if attempt_idx >= max_restarts {
        return None;
    }
    let idx = attempt_idx as usize;
    if idx >= BACKOFF_SEQUENCE_MS.len() {
        return None;
    }
    Some(Duration::from_millis(BACKOFF_SEQUENCE_MS[idx]))
}

/// 可观察运行时三元组。构造函数是 tuple 合法性边界。
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct RuntimeStatusTuple {
    pub state: ProcessState,
    pub owner: ProcessOwner,
    pub health: ProcessHealth,
}

impl RuntimeStatusTuple {
    pub fn new(
        state: ProcessState,
        owner: ProcessOwner,
        health: ProcessHealth,
    ) -> Result<Self, String> {
        if is_legal_runtime_tuple(state, owner, health) {
            Ok(Self {
                state,
                owner,
                health,
            })
        } else {
            Err(format!(
                "invalid runtime tuple: state={state:?}, owner={owner:?}, health={health:?}"
            ))
        }
    }
}

/// Phase 07.4 D-13 锁定的合法 `state/owner/health` 表。
pub fn is_legal_runtime_tuple(
    state: ProcessState,
    owner: ProcessOwner,
    health: ProcessHealth,
) -> bool {
    use ProcessOwner::*;

    matches!(
        (state, owner, health),
        (ProcessState::Starting, Supervisor, ProcessHealth::Unknown)
            | (ProcessState::Running, Supervisor, ProcessHealth::Healthy)
            | (ProcessState::Running, External, ProcessHealth::Healthy)
            | (ProcessState::Degraded, Supervisor, ProcessHealth::Degraded)
            | (ProcessState::Degraded, External, ProcessHealth::Degraded)
            | (ProcessState::Unhealthy, Supervisor, ProcessHealth::Failed)
            | (ProcessState::Unhealthy, External, ProcessHealth::Failed)
            | (ProcessState::Stopped, Supervisor, ProcessHealth::Unknown)
            | (ProcessState::Stopped, Supervisor, ProcessHealth::Failed)
            | (ProcessState::Stopped, None, ProcessHealth::Unknown)
            | (ProcessState::Stopped, None, ProcessHealth::Failed)
            | (ProcessState::Conflict, None, ProcessHealth::Failed)
    )
}

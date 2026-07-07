//! ProcessState 状态机纯函数单元测试 (plan 07.3-02, RED → GREEN → REFACTOR)。
//!
//! 覆盖 SPEC Acceptance + Edge Coverage R2/R3/R4 + Prohibition P3 的全部硬约束：
//! - R2 健康探针 3 连败阈值 → Unhealthy
//! - R3 启动失败 (≤5s exit) → Stopped 直接,不走退避;运行崩溃 (>5s exit) → Unhealthy 进入 backoff
//! - R4 退避序列 [1s,2s,4s,8s,16s] 最多 5 次,耗尽返回 None
//! - P3 Stopped 终态不自恢复 (BackoffTick 不唤醒)
//! - 手动 RestartRequested 在任意状态清零 fail_count/restart_count 并返回 Starting

use crate::process::state_machine::{
    backoff_delay, is_legal_runtime_tuple, transition, ProcessEvent, RuntimeStatusTuple,
    SupervisorSnapshot, BACKOFF_SEQUENCE_MS, PROBE_FAIL_THRESHOLD, STARTUP_GRACE_SECS,
};
use crate::process::supervisor::{ProcessHealth, ProcessOwner};
use crate::process::ProcessState;
use std::time::Duration;

// ────────────────────────────── ProbeOk ──────────────────────────────

#[test]
fn test_probe_ok_starting_to_running() {
    let snap = SupervisorSnapshot::default();
    let (new_state, new_snap) = transition(ProcessState::Starting, ProcessEvent::ProbeOk, &snap);
    assert_eq!(new_state, ProcessState::Running);
    assert_eq!(new_snap.fail_count, 0);
}

// ───────────────────────── ProbeFail 阈值 ─────────────────────────

#[test]
fn test_probe_fail_threshold_3_consecutive() {
    let snap = SupervisorSnapshot::default();
    let (s1, snap1) = transition(ProcessState::Running, ProcessEvent::ProbeFail, &snap);
    assert_eq!(s1, ProcessState::Running);
    assert_eq!(snap1.fail_count, 1);

    let (s2, snap2) = transition(s1, ProcessEvent::ProbeFail, &snap1);
    assert_eq!(s2, ProcessState::Running);
    assert_eq!(snap2.fail_count, 2);

    let (s3, snap3) = transition(s2, ProcessEvent::ProbeFail, &snap2);
    assert_eq!(s3, ProcessState::Unhealthy);
    assert_eq!(snap3.fail_count, 0);
    assert_eq!(snap3.restart_count, 1);
}

#[test]
fn test_probe_fail_2_stays_running() {
    let snap = SupervisorSnapshot::default();
    let (s1, snap1) = transition(ProcessState::Running, ProcessEvent::ProbeFail, &snap);
    let (s2, snap2) = transition(s1, ProcessEvent::ProbeFail, &snap1);
    assert_eq!(s2, ProcessState::Running);
    assert_eq!(snap2.fail_count, 2);
    assert_eq!(snap2.restart_count, 0);
}

// ──────────────────────── ProbeDegraded 语义 ────────────────────────

#[test]
fn test_probe_degraded_no_fail_count_increment() {
    let snap = SupervisorSnapshot {
        fail_count: 1,
        restart_count: 0,
        last_error_len: 0,
    };
    let (new_state, new_snap) =
        transition(ProcessState::Running, ProcessEvent::ProbeDegraded, &snap);
    assert_eq!(new_state, ProcessState::Degraded);
    assert_eq!(
        new_snap.fail_count, 1,
        "ProbeDegraded MUST NOT bump fail_count"
    );
}

#[test]
fn test_degraded_to_running_on_probe_ok() {
    let snap = SupervisorSnapshot {
        fail_count: 2,
        restart_count: 0,
        last_error_len: 0,
    };
    let (new_state, new_snap) = transition(ProcessState::Degraded, ProcessEvent::ProbeOk, &snap);
    assert_eq!(new_state, ProcessState::Running);
    assert_eq!(new_snap.fail_count, 0);
}

// ──────────────── SpawnFailed (≤5s) vs Crashed (>5s) ────────────────

#[test]
fn test_spawn_failed_within_grace_goes_stopped() {
    let snap = SupervisorSnapshot::default();
    let (new_state, new_snap) = transition(
        ProcessState::Starting,
        ProcessEvent::SpawnFailed {
            exited_after_secs: 4.9,
        },
        &snap,
    );
    assert_eq!(new_state, ProcessState::Stopped);
    assert_eq!(
        new_snap.restart_count, 0,
        "spawn failure MUST NOT consume a backoff slot"
    );
}

#[test]
fn test_spawn_failed_at_grace_boundary_goes_stopped() {
    let snap = SupervisorSnapshot::default();
    let (new_state, _new_snap) = transition(
        ProcessState::Starting,
        ProcessEvent::SpawnFailed {
            exited_after_secs: STARTUP_GRACE_SECS,
        },
        &snap,
    );
    assert_eq!(
        new_state,
        ProcessState::Stopped,
        "boundary 5.0s inclusive → startup failure"
    );
}

#[test]
fn test_crashed_after_grace_triggers_backoff() {
    let snap = SupervisorSnapshot::default();
    let (new_state, new_snap) = transition(
        ProcessState::Running,
        ProcessEvent::Crashed {
            exited_after_secs: 10.0,
        },
        &snap,
    );
    assert_eq!(new_state, ProcessState::Unhealthy);
    assert_eq!(new_snap.restart_count, 1);
    assert_eq!(new_snap.fail_count, 0);
}

// ─────────────────────── Backoff 序列 5 步 + 耗尽 ───────────────────────

#[test]
fn test_backoff_sequence_all_5_steps() {
    assert_eq!(backoff_delay(0, 5), Some(Duration::from_millis(1000)));
    assert_eq!(backoff_delay(1, 5), Some(Duration::from_millis(2000)));
    assert_eq!(backoff_delay(2, 5), Some(Duration::from_millis(4000)));
    assert_eq!(backoff_delay(3, 5), Some(Duration::from_millis(8000)));
    assert_eq!(backoff_delay(4, 5), Some(Duration::from_millis(16000)));
    assert_eq!(BACKOFF_SEQUENCE_MS, [1000, 2000, 4000, 8000, 16000]);
}

#[test]
fn test_backoff_exhausted_returns_none() {
    assert_eq!(backoff_delay(5, 5), None);
}

// ──────────────────────── RestartRequested 清零 ────────────────────────

#[test]
fn test_manual_restart_clears_counters() {
    let snap = SupervisorSnapshot {
        fail_count: 5,
        restart_count: 3,
        last_error_len: 16,
    };
    let (new_state, new_snap) =
        transition(ProcessState::Stopped, ProcessEvent::RestartRequested, &snap);
    assert_eq!(new_state, ProcessState::Starting);
    assert_eq!(new_snap.fail_count, 0);
    assert_eq!(new_snap.restart_count, 0);
}

// ───────────────── P3: Stopped 不被后台定时器唤醒 ─────────────────

#[test]
fn test_stopped_ignores_backoff_tick() {
    let snap = SupervisorSnapshot::default();
    let (new_state, _new_snap) = transition(
        ProcessState::Stopped,
        ProcessEvent::BackoffTick { attempt: 100 },
        &snap,
    );
    assert_eq!(new_state, ProcessState::Stopped);
}

// ───────────────── StopRequested 从任意状态 → Stopped ─────────────────

#[test]
fn test_stop_requested_from_any_state() {
    let snap = SupervisorSnapshot::default();
    for state in [
        ProcessState::Starting,
        ProcessState::Running,
        ProcessState::Degraded,
        ProcessState::Unhealthy,
    ] {
        let (new_state, _) = transition(state, ProcessEvent::StopRequested, &snap);
        assert_eq!(
            new_state,
            ProcessState::Stopped,
            "StopRequested from {:?} must reach Stopped",
            state
        );
    }
}

// ───────────────────── 常量值与 SPEC 一致性校验 ─────────────────────

#[test]
fn test_spec_constants_locked() {
    assert_eq!(PROBE_FAIL_THRESHOLD, 3, "SPEC: 3 连败触发重启");
    assert_eq!(STARTUP_GRACE_SECS, 5.0, "SPEC: 启动 grace 5s 含边界");
    assert_eq!(BACKOFF_SEQUENCE_MS.len(), 5, "SPEC: 退避最多 5 次");
}

// ─────────────────────── Phase 07.4 runtime tuple ───────────────────────

#[test]
fn runtime_tuple_accepts_locked_valid_combinations() {
    use ProcessOwner::*;

    let valid = [
        (ProcessState::Starting, Supervisor, ProcessHealth::Unknown),
        (ProcessState::Running, Supervisor, ProcessHealth::Healthy),
        (ProcessState::Running, External, ProcessHealth::Healthy),
        (ProcessState::Degraded, Supervisor, ProcessHealth::Degraded),
        (ProcessState::Degraded, External, ProcessHealth::Degraded),
        (ProcessState::Unhealthy, Supervisor, ProcessHealth::Failed),
        (ProcessState::Unhealthy, External, ProcessHealth::Failed),
        (ProcessState::Stopped, Supervisor, ProcessHealth::Unknown),
        (ProcessState::Stopped, Supervisor, ProcessHealth::Failed),
        (ProcessState::Stopped, None, ProcessHealth::Unknown),
        (ProcessState::Stopped, None, ProcessHealth::Failed),
        (ProcessState::Conflict, None, ProcessHealth::Failed),
    ];

    for (state, owner, health) in valid {
        assert!(
            is_legal_runtime_tuple(state, owner, health),
            "{state:?}/{owner:?}/{health:?} should be valid"
        );
        assert!(
            RuntimeStatusTuple::new(state, owner, health).is_ok(),
            "constructor should accept {state:?}/{owner:?}/{health:?}"
        );
    }
}

#[test]
fn runtime_tuple_rejects_invalid_ownership_combinations() {
    use ProcessOwner::*;

    let invalid = [
        (ProcessState::Conflict, Supervisor, ProcessHealth::Healthy),
        (ProcessState::Conflict, External, ProcessHealth::Failed),
        (ProcessState::Conflict, None, ProcessHealth::Healthy),
        (ProcessState::Running, None, ProcessHealth::Healthy),
        (ProcessState::Starting, External, ProcessHealth::Unknown),
        (ProcessState::Degraded, None, ProcessHealth::Degraded),
        (ProcessState::Unhealthy, None, ProcessHealth::Failed),
    ];

    for (state, owner, health) in invalid {
        assert!(
            !is_legal_runtime_tuple(state, owner, health),
            "{state:?}/{owner:?}/{health:?} should be invalid"
        );
        assert!(
            RuntimeStatusTuple::new(state, owner, health).is_err(),
            "constructor should reject {state:?}/{owner:?}/{health:?}"
        );
    }
}

#[test]
fn runtime_tuple_enums_serialize_lowercase_for_frontend_dto() {
    assert_eq!(
        serde_json::to_string(&ProcessState::Conflict).expect("serialize state"),
        r#""conflict""#
    );
    assert_eq!(
        serde_json::to_string(&ProcessOwner::Supervisor).expect("serialize owner"),
        r#""supervisor""#
    );
    assert_eq!(
        serde_json::to_string(&ProcessOwner::External).expect("serialize owner"),
        r#""external""#
    );
    assert_eq!(
        serde_json::to_string(&ProcessOwner::None).expect("serialize owner"),
        r#""none""#
    );
    assert_eq!(
        serde_json::to_string(&ProcessHealth::Healthy).expect("serialize health"),
        r#""healthy""#
    );
    assert_eq!(
        serde_json::to_string(&ProcessHealth::Degraded).expect("serialize health"),
        r#""degraded""#
    );
    assert_eq!(
        serde_json::to_string(&ProcessHealth::Failed).expect("serialize health"),
        r#""failed""#
    );
    assert_eq!(
        serde_json::to_string(&ProcessHealth::Unknown).expect("serialize health"),
        r#""unknown""#
    );
}

// ═══════════════════════════════════════════════════════════════════════
// REFACTOR 阶段 held-out 边界测试 (task 07.3-02-03)
// ═══════════════════════════════════════════════════════════════════════

/// 防止「ProbeFail 在 Degraded 状态下错误清零 fail_count」的回归 —
/// Degraded 是 Go /readyz 信号,不应影响 liveness fail_count 累加语义。
#[test]
fn test_probe_fail_from_degraded_increments_fail_count() {
    let snap = SupervisorSnapshot {
        fail_count: 2,
        restart_count: 0,
        last_error_len: 0,
    };
    let (new_state, new_snap) = transition(ProcessState::Degraded, ProcessEvent::ProbeFail, &snap);
    assert_eq!(
        new_state,
        ProcessState::Unhealthy,
        "third ProbeFail from Degraded must trip"
    );
    assert_eq!(new_snap.fail_count, 0);
    assert_eq!(new_snap.restart_count, 1);
}

/// backoff_delay 的 attempt_idx vs max_restarts 边界:
/// - attempt_idx == max_restarts - 1 → 最后一次 Some
/// - attempt_idx == max_restarts      → None (耗尽)
#[test]
fn test_backoff_at_max_restarts_boundary() {
    assert_eq!(
        backoff_delay(4, 5),
        Some(Duration::from_millis(16000)),
        "attempt_idx == max_restarts - 1 仍属于有效窗口"
    );
    assert_eq!(
        backoff_delay(5, 5),
        None,
        "attempt_idx == max_restarts → 耗尽"
    );
    // max_restarts 小于序列长度时以 max_restarts 为准
    assert_eq!(backoff_delay(2, 3), Some(Duration::from_millis(4000)));
    assert_eq!(backoff_delay(3, 3), None);
}

/// SPEC Prohibition P3: Stopped 终态对探针失败免疫 — 后台定时器/僵尸事件不可唤醒。
#[test]
fn test_stopped_ignores_probe_fail() {
    let snap = SupervisorSnapshot {
        fail_count: 0,
        restart_count: 2,
        last_error_len: 4,
    };
    let (new_state, new_snap) = transition(ProcessState::Stopped, ProcessEvent::ProbeFail, &snap);
    assert_eq!(new_state, ProcessState::Stopped);
    assert_eq!(
        new_snap.fail_count, 0,
        "ProbeFail MUST NOT bump fail_count on Stopped"
    );
    assert_eq!(new_snap.restart_count, 2);
}

/// SPEC Prohibition P3 + Edge R4: Stopped 必须显式 RestartRequested 才能脱离,
/// ProbeOk (即使健康端点恢复了) 也不可自动复活。
#[test]
fn test_stopped_ignores_probe_ok() {
    let snap = SupervisorSnapshot::default();
    let (new_state, _new_snap) = transition(ProcessState::Stopped, ProcessEvent::ProbeOk, &snap);
    assert_eq!(
        new_state,
        ProcessState::Stopped,
        "ProbeOk on Stopped MUST NOT auto-recover; only RestartRequested can"
    );
}

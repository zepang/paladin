//! ProcessState 状态机纯函数单元测试 (plan 07.3-02, RED → GREEN → REFACTOR)。
//!
//! 覆盖 SPEC Acceptance + Edge Coverage R2/R3/R4 + Prohibition P3 的全部硬约束：
//! - R2 健康探针 3 连败阈值 → Unhealthy
//! - R3 启动失败 (≤5s exit) → Stopped 直接,不走退避;运行崩溃 (>5s exit) → Unhealthy 进入 backoff
//! - R4 退避序列 [1s,2s,4s,8s,16s] 最多 5 次,耗尽返回 None
//! - P3 Stopped 终态不自恢复 (BackoffTick 不唤醒)
//! - 手动 RestartRequested 在任意状态清零 fail_count/restart_count 并返回 Starting

use crate::process::ProcessState;
use crate::process::state_machine::{
    BACKOFF_SEQUENCE_MS, PROBE_FAIL_THRESHOLD, STARTUP_GRACE_SECS, SupervisorSnapshot, backoff_delay,
    transition, ProcessEvent,
};
use std::time::Duration;

// ────────────────────────────── ProbeOk ──────────────────────────────

#[test]
fn test_probe_ok_starting_to_running() {
    let snap = SupervisorSnapshot::default();
    let (new_state, new_snap) =
        transition(ProcessState::Starting, ProcessEvent::ProbeOk, &snap);
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
    assert_eq!(new_snap.fail_count, 1, "ProbeDegraded MUST NOT bump fail_count");
}

#[test]
fn test_degraded_to_running_on_probe_ok() {
    let snap = SupervisorSnapshot {
        fail_count: 2,
        restart_count: 0,
        last_error_len: 0,
    };
    let (new_state, new_snap) =
        transition(ProcessState::Degraded, ProcessEvent::ProbeOk, &snap);
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
    assert_eq!(new_snap.restart_count, 0, "spawn failure MUST NOT consume a backoff slot");
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
    assert_eq!(new_state, ProcessState::Stopped, "boundary 5.0s inclusive → startup failure");
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

---
phase: 10-packaging
plan: "04"
subsystem: desktop-process-supervisor
tags: [rust, tauri, logging, rotation, redaction, tdd]
requires:
  - phase: 07.3-sidecar-process-management
    provides: sidecar capture_lines、process-log 事件与日志脱敏
provides:
  - 10 MiB 阈值、active + 4 archives 的完整行日志轮转
  - redact→emit→stderr_tail→persist/rotate 的安全日志顺序
  - 磁盘故障后事件连续且 writer 可重试的故障隔离
affects: [10-packaging, installed-app-uat, sidecar-diagnostics]
tech-stack:
  added: []
  patterns: [injectable rotation policy, best-effort persistence after event emission]
key-files:
  created:
    - apps/desktop/src-tauri/src/process/log_rotate.rs
    - apps/desktop/src-tauri/src/process/log_rotate_tests.rs
  modified:
    - apps/desktop/src-tauri/src/process/mod.rs
    - apps/desktop/src-tauri/src/process/supervisor.rs
    - apps/desktop/src-tauri/src/process/supervisor_tests.rs
key-decisions:
  - "轮转仅在写入完整脱敏行之前发生，单条超大行保持完整。"
  - "持久化错误不关闭 writer；process-log 先 emit，后续行继续尝试落盘。"
patterns-established:
  - "日志安全顺序：redact → emit → stderr_tail → persist/rotate。"
  - "生产策略固定 10 MiB × 5，测试通过小阈值 RotationPolicy 确定性覆盖边界。"
requirements-completed: [PKG-03]
coverage:
  - id: D1
    description: "完整行日志在 10 MiB 阈值轮转，并最多保留 active + 4 archives。"
    requirement: PKG-03
    verification:
      - kind: unit
        ref: "apps/desktop/src-tauri/src/process/log_rotate_tests.rs#keeps_complete_lines_and_rotates_before_exceeding_threshold"
        status: pass
      - kind: unit
        ref: "apps/desktop/src-tauri/src/process/log_rotate_tests.rs#retains_active_plus_four_archives_and_preserves_newest_first_order"
        status: pass
    human_judgment: false
  - id: D2
    description: "secret 在事件、stderr tail 与磁盘落盘前均脱敏。"
    requirement: PKG-03
    verification:
      - kind: integration
        ref: "apps/desktop/src-tauri/src/process/supervisor_tests.rs#test_process_log_line_redacts_before_event_tail_and_disk"
        status: pass
    human_judgment: false
  - id: D3
    description: "磁盘打开/写入失败不影响 process-log 事件连续，且后续写入可恢复。"
    requirement: PKG-03
    verification:
      - kind: integration
        ref: "apps/desktop/src-tauri/src/process/supervisor_tests.rs#test_process_log_line_keeps_emitting_after_persistence_failure"
        status: pass
      - kind: unit
        ref: "apps/desktop/src-tauri/src/process/log_rotate_tests.rs#write_failure_is_reported_and_a_later_attempt_can_recover"
        status: pass
    human_judgment: false
duration: 4min
completed: 2026-07-11
status: complete
---

# Phase 10 Plan 04: Bounded Sidecar Log Rotation Summary

**Rust supervisor 现已用 10 MiB × 5 的完整行轮转持久化 sidecar 日志，同时保证 secret 先脱敏、UI 事件不受磁盘故障影响。**

## Performance

- **Duration:** 4 min
- **Started:** 2026-07-11T09:52:56Z
- **Completed:** 2026-07-11T09:56:18Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- 实现可注入策略的 `RotatingLineWriter`，生产默认 10 MiB、总计 5 个文件，并保持每行原子完整。
- 将 supervisor 日志路径锁定为 `redact → emit → stderr_tail → persist/rotate`，磁盘永不接触原始 secret。
- 以故障注入证明写盘失败后事件仍连续、stderr tail 语义不变，并可在后续行恢复持久化。

## Task Commits

1. **Task 1 RED: bounded line writer tests** - `147c2ca` (test)
2. **Task 1 GREEN: bounded complete-line rotation** - `7101e19` (feat)
3. **Task 2 RED: capture continuity tests** - `8e7355d` (test)
4. **Task 2 GREEN: capture_lines rotation wiring** - `e6bdbb9` (feat)

## TDD Gate Compliance

- Task 1: RED `147c2ca`（缺少 `log_rotate` 模块导致编译失败）→ GREEN `7101e19`（3/3 rotation tests pass）。
- Task 2: RED `8e7355d`（缺少 `process_log_line` 导致编译失败）→ GREEN `e6bdbb9`（2/2 integration-style tests pass）。
- Final gate: `cargo test process:: --lib` 77/77 pass；`cargo test` 77/77 pass。

## Files Created/Modified

- `apps/desktop/src-tauri/src/process/log_rotate.rs` - 有界完整行轮转 writer 与生产策略常量。
- `apps/desktop/src-tauri/src/process/log_rotate_tests.rs` - 阈值、归档淘汰、顺序、失败恢复测试。
- `apps/desktop/src-tauri/src/process/mod.rs` - 注册轮转模块及测试模块。
- `apps/desktop/src-tauri/src/process/supervisor.rs` - capture_lines 接入安全顺序与 best-effort 轮转落盘。
- `apps/desktop/src-tauri/src/process/supervisor_tests.rs` - 脱敏落盘和磁盘故障事件连续性测试。

## Decisions Made

- 当单条完整行自身大于阈值时不拆行；它独占 active 文件，下一条写入前再轮转。
- 持久化错误被视为低优先诊断路径，writer 保持可用以允许瞬态故障恢复。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- PLAN 中 `cargo test process:: --lib log -- --nocapture` 含两个位置过滤参数，Cargo 拒绝第二个参数；使用语义更强的 `cargo test process:: --lib -- --nocapture` 完成 77 项 process 测试验证。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

日志轮转与故障隔离已自动验证，可供 installed-app UAT 与平台 release honesty 计划使用；没有阻塞项。

---
*Phase: 10-packaging*
*Completed: 2026-07-11*

---
phase: 10-packaging
plan: "03"
subsystem: packaging
tags: [rust, python, go, sidecar, environment, dotenv, security]
status: complete
requires:
  - phase: 10-packaging
    plan: "02"
    provides: validated packaged process config and resolved sidecar executables
provides:
  - explicit business and system environment allowlists for sidecars
  - supervisor-forced PALADIN_RUNTIME_MODE marker
  - packaged dotenv prohibition in Python and Go
  - ownership-safe external lifecycle behavior
affects: [10-06, 10-09, packaged-uat]
tech-stack:
  added: []
  patterns: [env_clear plus explicit allowlist, forced internal runtime marker, shared dotenv policy]
key-files:
  created:
    - apps/agent/tests/test_cli.py
    - apps/server/cmd/server/main_test.go
  modified:
    - apps/desktop/src-tauri/src/process/supervisor.rs
    - apps/desktop/src-tauri/src/process/supervisor_tests.rs
    - apps/agent/src/server/cli.py
    - apps/agent/src/server/main.py
    - apps/server/cmd/server/main.go
key-decisions:
  - "Sidecars start from env_clear and receive only non-empty explicit business/system variables."
  - "The supervisor always overwrites PALADIN_RUNTIME_MODE from validated runtime config."
  - "External restart means redetection only; stop and shutdown never terminate external processes."
patterns-established:
  - "Packaged boundary: supervisor marker controls dotenv policy in both sidecars."
requirements-completed: [PKG-01, PKG-02]
coverage:
  - id: D1
    description: "Packaged sidecars receive only explicit non-empty environment values and a forced runtime marker."
    requirement: PKG-01
    verification:
      - kind: unit
        ref: "cargo test process:: --lib"
        status: pass
    human_judgment: false
  - id: D2
    description: "External lifecycle operations never terminate unowned processes."
    requirement: PKG-02
    verification:
      - kind: unit
        ref: "cargo test lifecycle_owner --lib"
        status: pass
    human_judgment: false
  - id: D3
    description: "Python and Go ignore dotenv in packaged mode while preserving dev convenience."
    requirement: PKG-01
    verification:
      - kind: unit
        ref: "uv run pytest tests/test_cli.py -q"
        status: pass
      - kind: unit
        ref: "go test ./cmd/server ./internal/config"
        status: pass
    human_judgment: false
duration: 8 min
completed: 2026-07-11
---

# Phase 10 Plan 03: Packaged Environment Boundary Summary

**Rust supervisor 以 env-clear allowlist 强制 packaged marker，Python 与 Go sidecar 均无法通过工作目录 `.env` 绕过安装态配置边界。**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-07-11T10:24:54Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments

- 子进程启动先清空继承环境，再仅转发非空的业务配置、home/temp、locale 与 TLS 证书发现变量。
- `PALADIN_RUNTIME_MODE` 始终由验证后的 Rust runtime mode 强制写入，父进程或 config 同名值无法覆盖。
- external owner 的 stop/shutdown 明确拒绝，restart 只重新探测；supervisor owner 仍仅操作 tracked child。
- Python CLI、Uvicorn 模块导入与 Go main 在 packaged 模式全部跳过 dotenv，dev 便利保持不变。

## Task Commits

1. **Task 1 RED: packaged lifecycle contracts** — `48dfd48` (test)
2. **Task 1 GREEN: sidecar environment and ownership boundary** — `69cffcd` (feat)
3. **Task 2 RED: packaged dotenv boundaries** — `e3e0149` (test)
4. **Task 2 GREEN: disable packaged dotenv** — `21f22c1` (feat)

## Verification

- `cargo test process:: --lib` — PASS（87/87）
- 精确 lifecycle 列表门 — PASS（四个且仅四个 `lifecycle_owner_*` 测试）
- `uv run pytest tests/test_cli.py -q` — PASS（3/3）
- `go test ./cmd/server ./internal/config` — PASS

## Decisions Made

- allowlist 值为空时视为缺失，不向 sidecar 注入空配置。
- 配置文件中的环境项也必须落在业务 allowlist 内；runtime marker 永远不接受配置覆盖。
- Python dotenv 策略由 CLI helper 共享给实际服务模块，避免 Uvicorn 导入阶段二次加载。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] 封住 Python 服务模块二次 dotenv 加载**
- **Found during:** Task 2
- **Issue:** 仅修改 CLI 仍会在 Uvicorn 导入 `src.server.main` 时再次执行 `load_dotenv`，可绕过 packaged 边界。
- **Fix:** 将 dotenv policy 共享给 CLI 与服务模块，两条入口统一按 runtime marker 决策。
- **Files modified:** `apps/agent/src/server/cli.py`, `apps/agent/src/server/main.py`, `apps/agent/tests/test_cli.py`
- **Verification:** `uv run pytest tests/test_cli.py -q`
- **Committed in:** `21f22c1`

**Total deviations:** 1 auto-fixed（1 missing critical）。该修复是 D-11 完整安全闭环所必需，无产品范围扩张。

## Issues Encountered

None.

## Known Stubs

None.

## Security Notes

- 新增的 trust-boundary 变化正对应计划 threat register：继承环境信息泄露、marker 篡改和 dotenv 提权均已缓解。
- 错误路径只报告缺失变量名；本计划未新增任何配置值日志。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- macOS installed-app UAT 可验证真实 supervisor-forwarded 环境与缺失依赖 degraded 行为。
- Windows build 可消费相同 packaged marker；真实 Windows UAT 仍按 Phase 10 决策延后。

## Self-Check: PASSED

- 两个新增测试文件与五个修改文件均存在。
- `48dfd48`、`69cffcd`、`e3e0149`、`21f22c1` 均存在于 git 历史。
- 三语言计划级验证全部通过，无阻塞 stub。

---
*Phase: 10-packaging*
*Completed: 2026-07-11*

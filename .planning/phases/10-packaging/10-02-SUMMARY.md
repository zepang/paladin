---
phase: 10-packaging
plan: "02"
subsystem: packaging
tags: [tauri, sidecar, resources, rust, security]
status: complete
requires:
  - phase: 10-packaging
    plan: "01"
    provides: target-triple Agent and Server sidecar staging
provides:
  - separate validated packaged process configuration
  - Tauri externalBin and packaged config resource declarations
  - deterministic installed config and executable lookup
affects: [10-03, 10-05, 10-06, 10-09]
tech-stack:
  added: []
  patterns: [canonical installed-resource lookup, fail-closed release bootstrap, locked logical sidecar names]
key-files:
  created:
    - apps/desktop/src-tauri/processes.packaged.json
  modified:
    - apps/desktop/src-tauri/tauri.conf.json
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/src/process/config.rs
    - apps/desktop/src-tauri/src/process/config_tests.rs
key-decisions:
  - "Debug builds retain repository processes.json; release builds require processes.packaged.json from Tauri resource_dir."
  - "Packaged executable resolution accepts only the two locked logical names and canonical installed paths."
patterns-established:
  - "Installed lookup: select config by build mode, canonicalize inside its trusted root, and never fall back from packaged to dev."
requirements-completed: [PKG-01, PKG-02]
coverage:
  - id: D1
    description: "Packaged config is loaded only from installed resources while dev retains processes.json."
    requirement: PKG-01
    verification:
      - kind: unit
        ref: "cargo test process::config --lib"
        status: pass
    human_judgment: false
  - id: D2
    description: "Both locked sidecars resolve target-triple and Windows .exe filenames without PATH or source fallback."
    requirement: PKG-02
    verification:
      - kind: unit
        ref: "cargo test process::config --lib"
        status: pass
      - kind: other
        ref: "cargo check"
        status: pass
    human_judgment: false
  - id: D3
    description: "Tauri bundle declares packaged config plus Agent and Server external binaries."
    requirement: PKG-01
    verification:
      - kind: other
        ref: "tauri.conf.json bundle JSON inspection"
        status: pass
    human_judgment: false
duration: 8 min
completed: 2026-07-11
---

# Phase 10 Plan 02: Packaged Resource Wiring Summary

**独立 packaged 配置、两种 Tauri sidecar 与 canonical installed-resource lookup 已接线，release 启动不再依赖源码配置或 PATH。**

## Performance

- **Duration:** 8 min
- **Started:** 2026-07-11T10:17:04Z
- **Completed:** 2026-07-11T10:25:00Z
- **Tasks:** 2
- **Files modified:** 5

## Accomplishments

- 新增保持 `cmd: string[]` schema 的 `processes.packaged.json`，使用锁定逻辑名和 `cwd: null`。
- Tauri bundle 同时声明 packaged config resource 与两个 `externalBin` sidecar。
- release setup 从真实 `resource_dir` 加载 packaged config，并将逻辑命令解析为 canonical installed executable path。
- helper 测试覆盖 dev 保持不变、缺失资源 fail-closed、target triple、Windows `.exe`、未知名称和路径越界输入。

## Task Commits

1. **Task 1 RED: packaged resource lookup contracts** — `1978770` (test)
2. **Task 1 GREEN: packaged config and executable resolution** — `c909be3` (feat)
3. **Task 2: Tauri bundle resources and setup wiring** — `f31cfcb` (feat)

## Files Created/Modified

- `apps/desktop/src-tauri/processes.packaged.json` — packaged supervisor configuration with locked logical commands.
- `apps/desktop/src-tauri/tauri.conf.json` — declares packaged config resource and both external binaries.
- `apps/desktop/src-tauri/src/lib.rs` — selects installed config and resolves executable paths during release setup.
- `apps/desktop/src-tauri/src/process/config.rs` — canonical config/executable lookup helpers.
- `apps/desktop/src-tauri/src/process/config_tests.rs` — lookup, platform suffix, missing-file, and unsafe-name contracts.

## Decisions Made

- 使用 `cfg!(debug_assertions)` 保持开发构建读取仓库 `processes.json`，release 构建只允许安装资源配置。
- sidecar 解析仅接受 `paladin-agent-sidecar` 与 `paladin-server-sidecar`，并在启动前转为 canonical absolute path。
- 兼容 Tauri staging 的 target-triple 文件名和安装布局中的无 triple 逻辑名；Windows 两种形式均要求 `.exe`。

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## Known Stubs

None.

## Security Notes

- packaged config 缺失时进入现有诊断 supervisor，绝不回退到 `CARGO_MANIFEST_DIR`。
- executable logical name 使用固定 allowlist；target triple 只允许字母数字、连字符和下划线。
- 所有解析结果 canonicalize 后必须位于所提供的 installed executable/resource root 内；无 PATH 或 shell fallback。

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 10-03 可在已确定的 packaged spawn 路径上接入环境 allowlist。
- 10-05/10-06 可消费相同 externalBin 配置生成 Windows/macOS 安装产物。
- installed-app UAT 尚由后续计划执行；本计划不声称任何平台 release-ready。

## Self-Check: PASSED

- `processes.packaged.json` 已存在，Tauri bundle 两条 key link 均可由 source scan 定位。
- `1978770`、`c909be3`、`f31cfcb` 均存在于 git log。
- `cargo test process:: --lib` 82/82 通过，`cargo check` 通过，bundle JSON inspection 通过。

---
*Phase: 10-packaging*
*Completed: 2026-07-11*

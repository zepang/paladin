---
phase: 10-packaging
plan: "01"
subsystem: packaging
tags: [release, pyinstaller, go, tauri, sidecar]
status: complete
requires: []
provides:
  - single shell-free release orchestration entrypoint
  - PyInstaller Agent and native Go Server sidecar builds
  - target-triple sidecar staging and fail-closed input audit
affects: [10-02, 10-03, 10-05, 10-09]
tech-stack:
  added: [PyInstaller]
  patterns: [explicit argv spawn, dependency-injected orchestration, target-triple staging]
key-files:
  created:
    - apps/desktop/scripts/release.mjs
    - apps/desktop/scripts/release.test.mjs
    - apps/agent/paladin-agent-sidecar.spec
  modified:
    - .planning/phases/10-packaging/10-VALIDATION.md
    - apps/agent/pyproject.toml
    - apps/desktop/package.json
    - package.json
    - .gitignore
decisions:
  - "Release children are invoked only with explicit argv and shell:false."
  - "Generated target binaries live in ignored staging paths and are rebuilt from repository source."
metrics:
  duration: 8 min
  completed: 2026-07-11
---

# Phase 10 Plan 01: Release Sidecar Pipeline Summary

单一 package-manager release 入口现可按 Agent → Server → audit/verify → Tauri 顺序生成并校验 target-triple 原生 sidecar，且 `.env` 输入会在打包前 fail-closed。

## Performance

- **Duration:** 8 min
- **Tasks:** 3
- **Files changed:** 8

## Accomplishments

- 将当前 22 个 Phase 10 task gate、依赖顺序和 macOS-only installed-app blocking 语义锁定到 Validation 合同。
- 以 RED→GREEN 测试证明 release 顺序、缺失 sidecar 阻断、`.env` 输入审计及 Windows `.exe`/target-triple 命名。
- 使用 PyInstaller spec 构建 Python Agent，使用 `go build` 构建 Server，并将两个产物 staging 为 Tauri sidecar 名称。
- 根目录与 desktop package scripts 均提供短委托入口；所有子命令使用 `shell:false` 和显式 argv。

## Task Commits

1. **T0 — Validation 合同** — `f2dd140`
2. **T1 RED — release orchestration 合约测试** — `8247895`
3. **T1 GREEN — release orchestration 实现** — `2b48526`
4. **T2 — 真实 sidecar build/staging 与 package 入口** — `d4deb65`

## Verification

- `node --test apps/desktop/scripts/release.test.mjs` — PASS（4/4）
- `pnpm release -- --sidecars-only --target current --verify` — PASS
- 当前平台 `aarch64-apple-darwin` Agent/Server staging binaries 均为 Mach-O arm64 executable。
- staged Agent executable `--help` — PASS，无需 `uv` 作为运行时命令。
- release/spec/package 入口 schema/migration source scan — PASS，无 schema push。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical Functionality] 固定 PyInstaller 构建依赖**
- **Found during:** T2
- **Issue:** 仓库未声明 PyInstaller，统一 release 入口无法从干净环境复现 Agent 构建。
- **Fix:** 在 Agent dev dependency group 中固定 `pyinstaller>=6.0,<7`。
- **Files modified:** `apps/agent/pyproject.toml`
- **Verification:** `uv lock` 解析成功，release 实构建使用 PyInstaller 6.21.0 完成。
- **Commit:** `d4deb65`

**2. [Rule 3 - Blocking Issue] 修正 pnpm 参数分隔与生成物状态**
- **Found during:** T2
- **Issue:** 根脚本重复 `--` 会把分隔符传入 release parser；构建目录与 staging binaries 会污染工作树状态。
- **Fix:** 根脚本直接委托 desktop release，parser 安全忽略 pnpm 分隔符，并将可再生输出加入 `.gitignore`。
- **Files modified:** `package.json`, `apps/desktop/scripts/release.mjs`, `.gitignore`
- **Verification:** 计划指定的 `pnpm release -- --sidecars-only --target current --verify` 原样通过，任务提交后仅保留预先存在的 STATE 修改。
- **Commit:** `d4deb65`

**Total deviations:** 2 auto-fixed（1 missing critical，1 blocking）。不改变计划架构或发布状态语义。

## Known Stubs

None.

## Security Notes

- `.env` 审计只报告相对文件路径，不读取或输出 secret 值。
- release 子进程固定使用 `shell:false`；无命令字符串拼接。
- 审计发生在 Tauri 调用之前，缺失产物或被禁止输入会阻断后续步骤。

## Decisions Made

- Release children are invoked only with explicit argv and `shell:false`.
- Generated target binaries remain ignored build outputs and are regenerated from repository source.

## Next Phase Readiness

- 10-02 可消费 `apps/desktop/src-tauri/binaries/<logical-name>-<target-triple>[.exe]` 接入 `externalBin` 和 installed resource lookup。
- Windows native buildability 仍待 10-05；本计划未声称 installed UAT 或 release-ready。

## Self-Check: PASSED

- 三个关键创建文件存在。
- 四个 task/TDD commits 均可从 git log 定位。
- 计划级 Node tests 与 sidecars-only 当前平台实构建均通过。

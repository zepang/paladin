# Phase 10 Packaging - Pattern Mapping

## Scope Notes

- 已按要求读取：
  - `.planning/phases/10-packaging/10-CONTEXT.md`
  - `.planning/phases/10-packaging/10-RESEARCH.md`
  - `.planning/phases/10-packaging/10-SPEC.md`
  - `.planning/phases/10-packaging/10-UI-SPEC.md`
  - `.planning/phases/10-packaging/10-VALIDATION.md`
- 工作区根目录下未发现 `./AGENTS.md`。
- 本文只回答一件事：Phase 10 新文件/改文件时，应该复制哪些现有代码模式。

## Explicit / Implicit File Set From Context + Research

### Explicitly named implementation surfaces

1. `apps/desktop/src-tauri/tauri.conf.json`
2. `apps/desktop/src-tauri/processes.json`
3. `apps/desktop/src-tauri/src/lib.rs`
4. `apps/desktop/src-tauri/src/process/config.rs`
5. `apps/desktop/src-tauri/src/process/supervisor.rs`
6. `apps/desktop/src-tauri/src/process/log_redact.rs`
7. `apps/desktop/scripts/tauri-cli.mjs`
8. `apps/desktop/package.json`
9. `package.json`
10. `apps/agent/pyproject.toml`
11. `apps/agent/src/server/cli.py`
12. `apps/server/cmd/server/main.go`
13. docs / README / UAT artifact candidate
14. `apps/desktop/src/components/StartupMask.tsx`
15. `apps/desktop/src/components/StatusBar/ProcessLight.tsx`
16. `apps/desktop/src/components/panel/LogsPanel.tsx`
17. `apps/desktop/src/stores/process.ts`

### Implicitly required companion files

1. `apps/desktop/src-tauri/src/process/config_tests.rs`
2. `apps/desktop/src-tauri/src/process/supervisor_tests.rs`
3. `apps/desktop/src-tauri/src/process/log_redact_tests.rs`
4. `apps/desktop/src-tauri/src/process/mod.rs`
5. `apps/server/internal/config/config.go`
6. `apps/server/internal/http/handler/health_test.go`
7. `apps/desktop/src/main.tsx`
8. `docs/supervisor-startup-chain.md`
9. potential new packaged config file, most likely `apps/desktop/src-tauri/processes.packaged.json`
10. potential new packaging doc / UAT evidence file under `docs/` or `.planning/phases/10-packaging/`

## Global Repository Patterns To Reuse

### Rust process-runtime pattern

- Single truth source lives in Rust config + supervisor, not frontend:
  - `apps/desktop/src-tauri/src/lib.rs:94-123`
  - `apps/desktop/src-tauri/src/process/supervisor.rs:397-405`
  - `apps/desktop/src/stores/process.ts:67-97`
- Validation-first load path:
  - `apps/desktop/src-tauri/src/process/config.rs:131-200`
- Diagnostic fallback instead of silent failure:
  - `apps/desktop/src-tauri/src/lib.rs:105-123`
  - `apps/desktop/src-tauri/src/process/supervisor.rs:268-314`
  - `apps/desktop/src-tauri/src/process/supervisor.rs:368-377`
- Free-function helpers + focused unit tests:
  - module registration in `apps/desktop/src-tauri/src/process/mod.rs:8-30`

### Frontend diagnostic pattern

- Frontend consumes emitted status/log events and small invoke APIs; it does not infer runtime state itself:
  - `apps/desktop/src/main.tsx:14-24`
  - `apps/desktop/src/stores/process.ts:59-97`
  - `apps/desktop/src/components/StartupMask.tsx:117-167`
  - `apps/desktop/src/components/StatusBar/ProcessLight.tsx:39-104`
  - `apps/desktop/src/components/panel/LogsPanel.tsx:50-66`

### Script pattern

- Node wrapper scripts use `spawn(..., { shell: false, stdio: 'inherit', env: process.env })` and explicit signal handling:
  - `apps/desktop/scripts/tauri-cli.mjs:11-42`
- Package entrypoints are thin; actual logic lives in dedicated script files:
  - `apps/desktop/package.json:6-12`

### Docs pattern

- Existing runtime doc explains chain as source-of-truth -> runtime orchestration -> emitted status -> UI:
  - `docs/supervisor-startup-chain.md:7-20`
  - `docs/supervisor-startup-chain.md:43-57`
  - `docs/supervisor-startup-chain.md:151-200`

## File-by-File Mapping

### 1. `apps/desktop/src-tauri/tauri.conf.json`

- Role: bundle/build manifest.
- Data flow:
  - package-manager script -> Tauri CLI -> bundle config -> installed app resources / external binaries.
- Closest analog:
  - existing minimal bundle block in `apps/desktop/src-tauri/tauri.conf.json:29-39`
  - keep same JSON style and nesting under `bundle`.
- Copy these patterns:
  - Keep flat JSON object style used by current Tauri config.
  - Extend existing `bundle` object rather than introducing parallel top-level packaging config.
  - Preserve `build.beforeBuildCommand` / `frontendDist` pattern from `apps/desktop/src-tauri/tauri.conf.json:6-11`.
- Validation/testing pattern:
  - This repo currently validates build wiring through scripts, not JSON schema tests.
  - Planner should pair changes here with script-level artifact checks described in `10-VALIDATION.md`.

### 2. `apps/desktop/src-tauri/processes.packaged.json` (implicit likely new file)

- Role: packaged runtime config truth source.
- Data flow:
  - bundled resource -> `lib.rs` packaged config lookup -> `ProcessConfig::load_from_path` -> `ProcessSupervisor`.
- Closest analog:
  - `apps/desktop/src-tauri/processes.json:1-29`
  - packaged accepted shapes in `apps/desktop/src-tauri/src/process/config_tests.rs:278-297`
- Copy these patterns:
  - Keep exact schema shape from dev config: `mode`, `processes`, `backoff_secs`, `max_restarts`, `shutdown_grace_secs`.
  - Keep `cmd: string[]`, never shell string:
    - schema enforced by `apps/desktop/src-tauri/src/process/config.rs:39-48`
    - serde/type rejection covered by `apps/desktop/src-tauri/src/process/config_tests.rs:138-156`
  - Packaged commands should mirror tested accepted form:
    - agent `["paladin-agent-sidecar", "serve"]`
    - server `["paladin-server-sidecar"]`
    - see `apps/desktop/src-tauri/src/process/config_tests.rs:278-297`
  - Prefer `cwd: null` in packaged mode, matching accepted tests at `apps/desktop/src-tauri/src/process/config_tests.rs:278-297`.
- Error handling / validation pattern:
  - rely on `ProcessConfig::load_from_path` + `validate()` rather than ad hoc validation.
- Tests to copy:
  - add new loader/lookup tests adjacent to:
    - `apps/desktop/src-tauri/src/process/config_tests.rs:299-369`

### 3. `apps/desktop/src-tauri/src/lib.rs`

- Role: runtime bootstrapper.
- Data flow:
  - app startup -> resolve config path + log dir -> load config -> build supervisor -> background `start()`.
- Closest analog:
  - entire setup path in `apps/desktop/src-tauri/src/lib.rs:90-137`
- Copy these patterns:
  - imports: keep `use std::path::PathBuf;` and Tauri `AppHandle, Manager` style from `apps/desktop/src-tauri/src/lib.rs:1-6`.
  - Construct runtime dependencies in `setup()` and immediately `app.manage(...)`.
  - Keep tuple-return fallback style:
    - success path builds real supervisor
    - failure path builds `from_config_error(...)`
    - `apps/desktop/src-tauri/src/lib.rs:105-123`
  - Keep log-dir resolution pattern:
    - preferred Tauri path
    - fallback local path
    - `apps/desktop/src-tauri/src/lib.rs:97-103`
- Error handling pattern:
  - Fail closed into diagnostic mode instead of panicking on config load:
    - `apps/desktop/src-tauri/src/lib.rs:110-123`
  - Background start errors only log, do not crash UI:
    - `apps/desktop/src-tauri/src/lib.rs:131-136`
- Tests/verification to pair:
  - no direct `lib.rs` tests exist; behavior is indirectly locked by `config_tests` and `supervisor_tests`.
  - New packaged config path resolution should therefore get a pure helper and helper tests, not a UI-only manual check.

### 4. `apps/desktop/src-tauri/src/process/config.rs`

- Role: schema + runtime-mode validation boundary.
- Data flow:
  - config file bytes -> serde structs -> `validate()` -> supervisor consumers.
- Closest analog:
  - `apps/desktop/src-tauri/src/process/config.rs:17-240`
- Copy these patterns:
  - imports and type layout:
    - `serde::{Deserialize, Serialize}` + `HashMap` + `Path/PathBuf`
    - `apps/desktop/src-tauri/src/process/config.rs:17-20`
  - typed runtime meaning over string schema stability:
    - `RuntimeMode` pattern in `apps/desktop/src-tauri/src/process/config.rs:31-37`
  - explicit error enum with 4 disjoint cases:
    - `ConfigError` in `apps/desktop/src-tauri/src/process/config.rs:72-87`
  - loader delegates all business rules to `validate()`:
    - `apps/desktop/src-tauri/src/process/config.rs:137-145`
  - packaged-only validation stays in focused helper:
    - `validate_packaged_entry(...)` in `apps/desktop/src-tauri/src/process/config.rs:213-229`
- Error handling pattern:
  - human-readable strings returned from `validate()`, then wrapped by `ConfigError::InvalidSchema`:
    - `apps/desktop/src-tauri/src/process/config.rs:148-153`
- Validation/test pattern to copy exactly:
  - write JSON fixture string -> `write_temp_config()` -> `ProcessConfig::load_from_path(...)` -> assert specific error class/message
  - helper setup pattern:
    - `apps/desktop/src-tauri/src/process/config_tests.rs:21-30`
  - packaged mode tests:
    - invalid mode `:299-306`
    - reject `uv` `:308-323`
    - reject `go` `:325-340`
    - reject repo-relative cwd `:342-360`
    - accept sidecar command shape `:363-369`

### 5. `apps/desktop/src-tauri/src/process/supervisor.rs`

- Role: runtime orchestrator for spawn / probe / log / shutdown.
- Data flow:
  - validated config -> preflight/spawn -> stdout/stderr capture -> emit status/log -> frontend.
- Closest analogs by concern:
  - PATH/runtime mode split: `apps/desktop/src-tauri/src/process/supervisor.rs:66-91`
  - diagnostic fallback config: `apps/desktop/src-tauri/src/process/supervisor.rs:268-314`
  - spawn path: `apps/desktop/src-tauri/src/process/supervisor.rs:813-930`
  - log capture: `apps/desktop/src-tauri/src/process/supervisor.rs:1404-1483`
- Copy these patterns:
  - Keep helper-first structure. New packaged path lookup or rotation logic should be extracted into small helpers, not buried inline.
  - Preserve `Command::new(&entry.cmd[0]).args(&entry.cmd[1..])` no-shell pattern:
    - `apps/desktop/src-tauri/src/process/supervisor.rs:837-839`
  - Preserve runtime-mode PATH split:
    - `spawn_path_for_mode(...)` in `apps/desktop/src-tauri/src/process/supervisor.rs:86-91`
  - Preserve current graceful degradation:
    - port preflight emits status and returns error, `:831-835`
    - file logging failure should not block runtime, `:1428-1434`, `:1465-1473`
  - Preserve emission order around logs:
    - redact -> emit -> stderr tail -> file persistence
    - `apps/desktop/src-tauri/src/process/supervisor.rs:1442-1473`
- Error handling pattern:
  - String-based user-visible errors are normal in this module; follow existing style like:
    - `spawn {process_name} 失败: ...` at `apps/desktop/src-tauri/src/process/supervisor.rs:874-876`
  - Packaged path lookup failures should surface through same `last_error`/diagnostic pipeline, not separate panic/log-only path.
- Validation/test pattern to copy:
  - pure helper tests in `apps/desktop/src-tauri/src/process/supervisor_tests.rs`
  - table-ish targeted assertions for mode-specific behavior:
    - `spawn_path_for_mode` `:34-44`
    - dev attach healthy/degraded/conflict `:78-136`
  - For new packaged lookup helper, add helper-level tests here instead of integration-only tests.
  - For log rotation, add deterministic file tests near this module, reusing temp-path and fake I/O style from Rust tests elsewhere.

### 6. `apps/desktop/src-tauri/src/process/log_redact.rs`

- Role: pure single-line redaction helper.
- Data flow:
  - raw sidecar line -> `redact_log_line(...)` -> emitted/persisted line.
- Closest analog:
  - `apps/desktop/src-tauri/src/process/log_redact.rs:20-68`
- Copy these patterns:
  - `LazyLock<Regex>` statics per secret family.
  - sequential `replace_all(...).into_owned()` pipeline in `apps/desktop/src-tauri/src/process/log_redact.rs:52-68`
  - keep this module pure; no file system / tokio / Tauri state.
- Error handling pattern:
  - regexes are compile-time literals and use `.unwrap()` at static init; follow same pattern only for fixed patterns.
- Tests to copy:
  - very focused one-case-per-secret tests:
    - `apps/desktop/src-tauri/src/process/log_redact_tests.rs:14-84`
  - long-line and metacharacter safety:
    - `apps/desktop/src-tauri/src/process/log_redact_tests.rs:183-219`
- Packaging implication:
  - if rotation introduces a helper that touches bytes or file chunks, planner should keep redaction before disk write and reuse `redact_log_line`, not add a second sanitizer.

### 7. `apps/desktop/src-tauri/src/process/mod.rs`

- Role: module wiring and test registration.
- Data flow:
  - compile-time module tree.
- Closest analog:
  - `apps/desktop/src-tauri/src/process/mod.rs:8-30`
- Copy these patterns:
  - any new Rust process helper for packaged path resolution or log rotation should be declared here and get its own `*_tests` module under `#[cfg(test)]`.

### 8. `apps/desktop/scripts/tauri-cli.mjs`

- Role: Node wrapper around Tauri CLI.
- Data flow:
  - `pnpm tauri ...` -> `node scripts/tauri-cli.mjs` -> child Tauri process -> signal/cleanup.
- Closest analog:
  - `apps/desktop/scripts/tauri-cli.mjs:1-168`
- Copy these patterns:
  - imports from `node:child_process` only:
    - `execFileSync, spawn` in `:1`
  - platform branch for executable name:
    - `tauri.cmd` vs `tauri` in `:3`
  - forward args transparently:
    - `process.argv.slice(2)` in `:4`
  - `spawn(..., { stdio: 'inherit', env: process.env, shell: false })` in `:11-15`
  - explicit `SIGINT`/`SIGTERM` forwarding and unified cleanup exit path in `:22-52`
- Error handling pattern:
  - print `error.message` and exit `1` on child startup failure:
    - `:17-20`
  - catch-and-ignore cleanup failures for best-effort teardown:
    - `:73-75`, `:107-113`, `:119-126`, `:133-142`
- Packaging script recommendation:
  - a release script candidate should look like this file structurally: thin CLI wrapper, platform-aware executable selection, no shell strings, early non-zero exit on missing artifacts.

### 9. `apps/desktop/package.json`

- Role: desktop package entrypoint surface.
- Data flow:
  - contributor command -> node wrapper / vite / vitest.
- Closest analog:
  - `apps/desktop/package.json:6-12`
- Copy these patterns:
  - keep scripts short and delegating:
    - `"tauri": "node ./scripts/tauri-cli.mjs"`
  - add packaging/release entrypoint here if desktop owns the orchestration.
- Validation pattern:
  - existing tests exposed as `"test": "vitest"`; match this style for any new verification script name.

### 10. `package.json`

- Role: repo-root entrypoint surface.
- Data flow:
  - contributor one-shot command -> workspace-level orchestration.
- Closest analog:
  - current root scripts are intentionally tiny in `package.json:5-9`
- Copy these patterns:
  - if root gets the single documented release command, keep it as one-liner delegating into app-level scripts.
  - do not place multi-line shell logic directly in `package.json`.

### 11. `apps/agent/pyproject.toml`

- Role: Python packaging metadata and script registration.
- Data flow:
  - Python build config -> script entrypoints -> packaging build tool.
- Closest analog:
  - `apps/agent/pyproject.toml:1-35`
- Copy these patterns:
  - preserve `[project.scripts]` entrypoint style:
    - `paladin-agent = "src.server.cli:main"` at `:21-23`
  - preserve hatchling-based metadata layout.
  - if adding PyInstaller-related dependencies/config indirection, keep pyproject minimal and point the actual build logic to a dedicated spec/script file.
- Validation/testing pattern:
  - no PyInstaller repo pattern exists yet; closest stable boundary is the CLI entrypoint name in `[project.scripts]`.

### 12. `apps/agent/src/server/cli.py`

- Role: Python sidecar entrypoint.
- Data flow:
  - packaged executable -> `main()` -> env setup -> argparse -> `run_serve(...)`.
- Closest analog:
  - `apps/agent/src/server/cli.py:30-209`
- Copy these patterns:
  - top-level structure:
    - `setup_environment()` in `:30-37`
    - `run_serve(...)` in `:145-168`
    - `main()` dispatch in `:173-209`
  - packaged sidecar should preserve `serve` subcommand contract because packaged config already expects it:
    - parser subcommand setup in `:186-195`
  - stdout startup banner pattern:
    - `run_serve()` prints URLs in `:155-160`
- Error handling pattern:
  - fast-fail on missing required env with explicit message:
    - `DEEPSEEK_API_KEY` check in `:199-203`
  - planner should assume this behavior remains user-visible in packaged logs/UI.
- Validation pattern:
  - no direct tests here were inspected; planner should treat CLI contract as externally consumed by packaged config and PyInstaller entrypoint.

### 13. `apps/server/cmd/server/main.go`

- Role: Go sidecar entrypoint.
- Data flow:
  - compiled binary -> env load -> config load -> DB/Redis init -> HTTP server with `/healthz` and `/readyz`.
- Closest analog:
  - `apps/server/cmd/server/main.go:23-81`
  - config hard requirements in `apps/server/internal/config/config.go:37-114`
- Copy these patterns:
  - keep `godotenv.Load()` non-fatal pattern if packaging still supports local env file:
    - `apps/server/cmd/server/main.go:24-26`
  - keep `config.Load()` fatal when required env missing:
    - `:28-31`
  - keep stdout banner with service URL and health URL:
    - `:63-69`
- Error handling pattern:
  - startup failures are fatal, not deferred.
  - packaged docs/UAT must reflect this because Go readiness depends on PG/Redis/JWT env.
- Tests to cite:
  - readiness semantics are already locked in `apps/server/internal/http/handler/health_test.go:54-129`

### 14. `apps/desktop/src/stores/process.ts`

- Role: frontend status truth cache.
- Data flow:
  - `get_process_status` snapshot + `process-status` events -> Zustand store -> UI selectors.
- Closest analog:
  - `apps/desktop/src/stores/process.ts:47-97`
- Copy these patterns:
  - keep `initial` fallback shape in `:38-45`
  - one-shot bootstrap + periodic reconcile in `:76-97`
  - patch-based state updates in `:47-53`
- Error handling pattern:
  - frontend warns to console and stays in default state instead of exploding:
    - `:82-91`
- Packaging implication:
  - packaged-mode wording changes should stay in UI components; store should remain transport-shaped.

### 15. `apps/desktop/src/components/StartupMask.tsx`

- Role: blocking Agent startup/error surface.
- Data flow:
  - process store Agent status -> classification -> compact diagnostic card.
- Closest analog:
  - card shell `apps/desktop/src/components/StartupMask.tsx:49-115`
  - classification helper `:117-167`
  - state branches `:169-261`
- Copy these patterns:
  - retain single-card status panel hierarchy from `:62-113`
  - retain `classifyFailure(...)` string-classifier pattern for runtime diagnostics:
    - `:117-167`
  - keep one primary action button only:
    - conflict branch `:218-236`
    - stopped branch `:239-258`
- Error handling/copy pattern:
  - current copy is developer-path-heavy for packaged mode:
    - e.g. `src-tauri/processes.json` mention at `:119-124`
  - planner should modify packaged wording here, but reuse existing classifier shape rather than new component architecture.
- Frontend test analog:
  - no direct tests yet; nearest component-test style is RTL + mocked dependencies from:
    - `apps/desktop/src/components/__tests__/Titlebar.test.tsx:6-58`
    - `apps/desktop/src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx:87-154`

### 16. `apps/desktop/src/components/StatusBar/ProcessLight.tsx`

- Role: non-blocking runtime status + actions popover.
- Data flow:
  - process store per-service snapshot -> status pill + popover controls.
- Closest analog:
  - `apps/desktop/src/components/StatusBar/ProcessLight.tsx:8-104`
- Copy these patterns:
  - static text maps:
    - `DOT_CLASS`, `TEXT`, `OWNER_TEXT`, `HEALTH_TEXT` in `:8-37`
  - display text composition:
    - `displayText` in `:44-47`
  - actions via `invoke(...)` strings in `:83-99`
- Error handling/copy pattern:
  - `owner=external` disables stop/restart and shows explanatory text:
    - `:43`, `:70-74`, `:84-90`
  - packaged Go degraded messaging should be added in this same compact popover style, not a new panel.
- Frontend test analog:
  - follow mocked-Tauri-button-click patterns from existing component tests if tests are added.

### 17. `apps/desktop/src/components/panel/LogsPanel.tsx`

- Role: live log viewer.
- Data flow:
  - `process-log` events -> in-memory buffers -> active tab render.
- Closest analog:
  - `apps/desktop/src/components/panel/LogsPanel.tsx:20-115`
- Copy these patterns:
  - event subscription in `useEffect`:
    - `:50-66`
  - fixed in-memory bounded buffer:
    - `MAX_LINES` and truncation at `:29`, `:55-58`
  - rotation is intentionally invisible to UI; current component architecture already supports that because it only consumes emitted lines.
- Error handling pattern:
  - no file names, no disk state, no config reads:
    - security note at `:12-15`
  - keep this surface event-only.
- Frontend test analog:
  - RTL render + synthetic event mocking, following component test style above.

### 18. docs / README / UAT artifact candidate

- Role: release honesty + install/UAT evidence.
- Data flow:
  - built artifact + installed-app observations -> written evidence/status doc -> planner/user truth source.
- Closest analog:
  - `docs/supervisor-startup-chain.md:43-57` for explanatory runtime doc style
  - `.planning/STATE.md:62-65,93-94` for explicit deferred-UAT / next-step wording
- Copy these patterns:
  - write concrete runtime chain and failure surfaces, not marketing copy.
  - use explicit status wording similar to STATE entries: what is done, what is deferred, what is not release-ready.
  - tie docs to actual paths and probes (`/health`, `/healthz`, `/readyz`) already used in:
    - `apps/agent/src/server/cli.py:155-160`
    - `apps/server/cmd/server/main.go:64-69`
    - `apps/server/internal/http/handler/health_test.go:54-129`

## Best Analog Matrix By Intended Change

1. Packaged config file creation:
   - analog: `apps/desktop/src-tauri/processes.json:1-29`
   - tests: `apps/desktop/src-tauri/src/process/config_tests.rs:263-369`

2. Packaged config path lookup in Rust:
   - analog: `apps/desktop/src-tauri/src/lib.rs:94-123`
   - helper/test style: `apps/desktop/src-tauri/src/process/config.rs:131-145` plus `config_tests.rs:21-30`

3. Packaged sidecar executable path resolution:
   - analog: runtime-mode helper split in `apps/desktop/src-tauri/src/process/supervisor.rs:66-91`
   - spawn call site to adapt: `apps/desktop/src-tauri/src/process/supervisor.rs:837-876`
   - tests: `apps/desktop/src-tauri/src/process/supervisor_tests.rs:34-44`

4. Log rotation:
   - analog: `capture_lines(...)` in `apps/desktop/src-tauri/src/process/supervisor.rs:1404-1483`
   - redaction helper reuse: `apps/desktop/src-tauri/src/process/log_redact.rs:52-68`
   - test granularity to mirror: `log_redact_tests.rs:14-219`

5. Release orchestration script:
   - analog: `apps/desktop/scripts/tauri-cli.mjs:1-168`
   - entrypoint exposure: `apps/desktop/package.json:6-12`, `package.json:5-9`

6. Packaged diagnostics copy updates:
   - analog: `apps/desktop/src/components/StartupMask.tsx:117-167`
   - supporting non-blocking surface: `apps/desktop/src/components/StatusBar/ProcessLight.tsx:64-100`

7. Documentation/UAT artifact:
   - analog: `docs/supervisor-startup-chain.md:1-246`
   - release honesty phrasing baseline: `.planning/STATE.md:62-65,93-94`

## Test Pattern Summary

- Rust config tests:
  - fixture string builders + temp file writes + `load_from_path(...)`
  - see `apps/desktop/src-tauri/src/process/config_tests.rs:21-30`, `:263-369`
- Rust supervisor tests:
  - pure helper tests and tiny fake HTTP server harness
  - see `apps/desktop/src-tauri/src/process/supervisor_tests.rs:16-44`, `:78-180`
- Rust redaction tests:
  - one invariant per test, long-line edge coverage
  - see `apps/desktop/src-tauri/src/process/log_redact_tests.rs:14-219`
- Frontend tests:
  - Vitest + RTL + `vi.mock(...)`
  - see `apps/desktop/src/components/__tests__/Titlebar.test.tsx:6-58`
  - see `apps/desktop/src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx:32-50`, `:87-154`
- Go readiness tests:
  - HTTP handler black-box tests with fake pingers
  - see `apps/server/internal/http/handler/health_test.go:26-129`

## Planner Guidance

1. 新增 packaged config 时，优先复制 `processes.json` 结构和 `config_tests.rs` 的 packaged fixture，而不是发明第二套 schema。
2. 改 `lib.rs` / `supervisor.rs` 时，优先抽 helper 并给 helper 写 Rust 单测，保持现有 “纯 helper + 薄 setup/spawn orchestration” 风格。
3. 做日志轮转时，把逻辑放在 `capture_lines` 的磁盘写入支路附近，但保留现有顺序：`redact -> emit -> stderr_tail -> persist/rotate`。
4. 做 UI 文案调整时，只改现有 `StartupMask` / `ProcessLight` 的分类与 copy，不新增新的产品级界面。
5. 做 release orchestration 时，脚本层模仿 `tauri-cli.mjs` 的 non-shell、显式 exit code、平台分支风格；`package.json` 只保留短入口。
6. 做 UAT / packaging 文档时，模仿 `docs/supervisor-startup-chain.md` 的工程说明文风，并像 `.planning/STATE.md` 一样明确写出“已验证 / 未验证 / not release-ready”。

## PATTERN MAPPING COMPLETE.

# Phase 10: Packaging - Research
**Researched:** 2026-07-07
**Domain:** Desktop packaging, bundled sidecars, installed-app UAT, bounded logs
**Confidence:** MEDIUM

## User Constraints

- Phase 10 只交付 macOS `.dmg` 与 Windows `.msi` 的本地可安装包；Linux 不是 blocking target。[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [CITED: .planning/phases/10-packaging/10-SPEC.md]
- 必须使用 Tauri `externalBin` 风格或等价的 bundled-resource 布局来放 sidecar；sidecar 名称锁定为 `paladin-agent-sidecar` 与 `paladin-server-sidecar`。[CITED: .planning/phases/10-packaging/10-CONTEXT.md]
- packaged runtime 必须由 Rust supervisor 托管，不能依赖 dev PATH augmentation、`uv`、`go`、repo-relative cwd、login shell。[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [CITED: .planning/phases/10-packaging/10-SPEC.md]
- 必须保留 `cmd: string[]` schema；不能引入 `dev_cmd` / `packaged_cmd` / `binary` 替代字段。[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [CITED: .planning/phases/10-packaging/10-SPEC.md]
- dev `apps/desktop/src-tauri/processes.json` 要保留；packaged config 需要单独提供或生成，并被安装后的 app 加载。[CITED: .planning/phases/10-packaging/10-CONTEXT.md]
- Python Agent 打包工具锁定为 PyInstaller；Go Server 需要编译成平台可执行文件。[CITED: .planning/phases/10-packaging/10-SPEC.md]
- Phase 10 必须关闭 07.3 / 07.4 遗留的 packaged/platform UAT，且 macOS/Windows 都要做真实 installed-app UAT。[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [CITED: .planning/STATE.md]
- Go `/readyz` 的 passing path 依赖 PostgreSQL 与 Redis 可用；缺失时 Go 可 degraded，但不能阻塞 Agent 启动。[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [CITED: .planning/phases/10-packaging/10-SPEC.md] [VERIFIED: codebase]
- packaged sidecar 日志必须做 10 MB x 5 保留策略；轮转发生在脱敏之后，不能中断 `process-log` UI 事件流，也不能泄露 secrets。[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [CITED: .planning/phases/10-packaging/10-SPEC.md]
- 若任一平台没有通过 installed-app UAT，文档与 phase 输出必须明确标记 not release-ready。[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [CITED: .planning/phases/10-packaging/10-SPEC.md]
- Deferred ideas: none。研究不应扩展到签名、公证、自动更新、Linux blocking、schema 重做、sidecar 业务重构。[CITED: .planning/phases/10-packaging/10-CONTEXT.md]

## Summary

Plan 必须把 Phase 10 拆成五条主线，并且按依赖顺序推进：

1. 先产出两个 sidecar binary：PyInstaller 的 `paladin-agent-sidecar` 与 Go build 的 `paladin-server-sidecar`。[CITED: .planning/phases/10-packaging/10-SPEC.md]
2. 再把 sidecar binary 与 packaged `processes.json` 接入 Tauri bundle：binary 用 `externalBin`，config 用 `resources` 或等价 bundle resource 方案。[CITED: https://v2.tauri.app/develop/sidecar/] [CITED: https://v2.tauri.app/develop/resources/]
3. 然后改 Rust packaged path resolution：配置文件和 sidecar path 都从 installed app 的 resource/executable 上下文解析，不能再依赖 `CARGO_MANIFEST_DIR`。[VERIFIED: codebase] [CITED: https://docs.rs/tauri-utils/latest/tauri_utils/platform/fn.resource_dir.html]
4. 接着补 packaged-mode logging hardening：在 `capture_lines` 附近做“先脱敏、再按完整行写入、满 10 MB 时 rotate、emit 始终不中断”。[VERIFIED: codebase] [CITED: .planning/phases/10-packaging/10-SPEC.md]
5. 最后做真实安装包 UAT 与用户文档，且文档必须诚实反映哪些平台已经过安装验证、哪些没有。[CITED: .planning/phases/10-packaging/10-SPEC.md] [CITED: .planning/STATE.md]

结论上，最稳妥的 packaged layout 是：

- `bundle.externalBin`: 放两个 sidecar executable。[CITED: https://v2.tauri.app/develop/sidecar/]
- `bundle.resources`: 放 packaged `processes.json`（以及仅在 sidecar 运行必需时才放额外数据文件）。[CITED: https://v2.tauri.app/develop/resources/]
- Rust runtime:
  - sidecar binary path 从 bundle/executable 语义解析；
  - packaged config path 从 resource dir 解析；
  - logs 继续写 app log dir，不写到 resource dir。[VERIFIED: codebase] [CITED: https://v2.tauri.app/reference/javascript/api/namespacepath/]

## Standard Stack

- Desktop bundler: Tauri 2 bundle system，macOS 目标产物为 `.dmg`，Windows 为 `.msi`。[CITED: .planning/phases/10-packaging/10-SPEC.md] [VERIFIED: codebase]
- Sidecar bundling:
  - use `bundle.externalBin` for executable sidecars.[CITED: https://v2.tauri.app/develop/sidecar/]
  - use `bundle.resources` for packaged config files such as `processes.packaged.json`.[CITED: https://v2.tauri.app/develop/resources/]
- Python sidecar:
  - use PyInstaller spec-driven build, not ad hoc shell glue, so hidden imports / datas can be versioned if needed.[CITED: https://pyinstaller.org/en/stable/spec-files.html]
  - prefer one-folder output for the first packaging phase unless one-file is proven necessary; PyInstaller docs say default spec builds a dist directory, while `--onefile` is a separate mode.[CITED: https://pyinstaller.org/en/stable/man/pyi-makespec.html] [ASSUMED]
- Go sidecar:
  - use `go build` with explicit output name via `-o`, producing `paladin-server-sidecar` plus platform extension as required by the build OS.[CITED: https://pkg.go.dev/cmd/go] [ASSUMED]
- Release orchestration:
  - add a single package-manager entrypoint at repo root or desktop package level that runs: build agent sidecar -> build server sidecar -> build desktop installer.[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [VERIFIED: codebase]

## Architecture Patterns

1. Separate dev config from packaged config.
   - Keep current `src-tauri/processes.json` as dev-only.[CITED: .planning/phases/10-packaging/10-CONTEXT.md] [VERIFIED: codebase]
   - Add `processes.packaged.json` or generate it into a release staging directory.
   - Plan must make Rust choose config path by runtime mode, not by mutating one file in place.

2. Treat binary location and config location as two different resolution problems.
   - `externalBin` is for executables.[CITED: https://v2.tauri.app/develop/sidecar/]
   - `resources` is for JSON/config payloads.[CITED: https://v2.tauri.app/develop/resources/]
   - Do not try to smuggle packaged `processes.json` through `externalBin`.

3. Preserve `cmd: string[]` by resolving only argv[0].
   - Packaged config should still look like `["paladin-agent-sidecar", "serve"]` and `["paladin-server-sidecar"]` because validation tests already accept that shape.[VERIFIED: codebase]
   - Rust packaged spawn path should translate argv[0] from a logical sidecar name to an installed absolute path before `Command::new(...)`.
   - Planner should not rewrite the rest of the argv array.

4. Move packaged path resolution behind a small runtime adapter.
   - Current spawn path uses `CARGO_MANIFEST_DIR` for cwd resolution, which is explicitly marked in code as Phase 10 work.[VERIFIED: codebase]
   - Plan should introduce one helper responsible for:
     - packaged config path lookup,
     - packaged sidecar executable lookup,
     - packaged cwd policy (`None` or app-local writable dir, but never repo-relative).[VERIFIED: codebase] [ASSUMED]

5. Rotate on disk write path, not on event path.
   - `capture_lines` already emits `process-log` before writing to file.[VERIFIED: codebase]
   - Keep that ordering: redact -> emit -> append/rotate on disk.
   - If rotate/write fails, degrade only file logging and preserve UI event flow.

6. UAT should be installer-centric, not repo-centric.
   - Build installer.
   - Install app.
   - Launch installed app outside repo cwd assumptions.
   - Verify Agent liveness, Go liveness, Go readiness with PG/Redis up, and degraded path with PG/Redis down.[CITED: .planning/phases/10-packaging/10-SPEC.md]

## Don't Hand-Roll

- Do not invent a custom sidecar manifest format; use Tauri `externalBin` and `resources` as intended.[CITED: https://v2.tauri.app/develop/sidecar/] [CITED: https://v2.tauri.app/develop/resources/]
- Do not replace `cmd: string[]` with a bespoke packaged schema; SPEC forbids it.[CITED: .planning/phases/10-packaging/10-SPEC.md]
- Do not use shell command strings for packaged sidecars; current config/schema intentionally avoids shell interpretation.[VERIFIED: codebase]
- Do not keep packaged config under `CARGO_MANIFEST_DIR`; that is source-tree state, not installed-app state.[VERIFIED: codebase]
- Do not hand-roll a log streaming queue separate from `capture_lines`; the existing function is already the single line-oriented choke point for redact + emit + persist.[VERIFIED: codebase]
- Do not claim release-ready based only on `tauri build`; SPEC requires installed-app UAT evidence.[CITED: .planning/phases/10-packaging/10-SPEC.md]

## Common Pitfalls

- Pitfall: packaging binary but forgetting packaged config.
  - Current app always loads `src-tauri/processes.json` in setup.[VERIFIED: codebase]
  - Installed app would still point at dev `uv` / `go run` commands unless planner explicitly changes config lookup.

- Pitfall: using `cwd` from dev config in packaged mode.
  - Validation already rejects repo-relative packaged cwd, but spawn code still resolves relative cwd against `CARGO_MANIFEST_DIR`.[VERIFIED: codebase]
  - Plan must ensure packaged entries either use `cwd: null` or a packaged-safe writable directory.

- Pitfall: using one-file PyInstaller without validating runtime assets.
  - Agent code loads `.env`, configs, prompts, and workspace-relative files from project-root assumptions in CLI paths.[VERIFIED: codebase]
  - Planner must verify whether sidecar `serve` path needs bundled data/config relocation or whether runtime env injection from desktop is sufficient.[VERIFIED: codebase]

- Pitfall: assuming Go sidecar can pass `/readyz` in a clean machine.
  - `config.Load()` hard-requires `PALADIN_DATABASE_URL`, `PALADIN_REDIS_URL`, and a sufficiently long `PALADIN_JWT_SECRET`; DB/Redis clients are created at startup.[VERIFIED: codebase]
  - Installed UAT must pre-seed env/config for passing path.

- Pitfall: rotating before redact or mid-line.
  - Requirement explicitly forbids raw secrets and split lines.[CITED: .planning/phases/10-packaging/10-SPEC.md]
  - Current `capture_lines` is line-based, so planner should preserve line granularity rather than switch to byte-chunk rotation.[VERIFIED: codebase]

- Pitfall: writing logs into app resources.
  - Resource dir is inside the app bundle on macOS and adjacent to exe on Windows; it is for bundled artifacts, not mutable logs.[CITED: https://docs.rs/tauri-utils/latest/tauri_utils/platform/fn.resource_dir.html] [CITED: https://v2.tauri.app/reference/javascript/api/namespacepath/]

- Pitfall: documentation overstating Windows support.
  - Today there is no recorded `.msi` artifact or installed Windows UAT evidence in repo state.[CITED: .planning/STATE.md] [CITED: .planning/phases/10-packaging/10-SPEC.md]

## Codebase Findings

- Tauri config currently enables bundling but has no `bundle.externalBin` and no `bundle.resources` entries yet.[VERIFIED: codebase]
- Dev process config is still `mode: "dev"` and still uses `["uv", "run", "paladin-agent", "serve", "--dev"]` plus `["go", "run", "./cmd/server"]` with repo-relative cwd.[VERIFIED: codebase]
- `ProcessConfig::validate()` already enforces packaged-mode rejection of `uv`, `go`, and repo-relative dev cwd, and tests already bless `paladin-agent-sidecar` / `paladin-server-sidecar` command shapes.[VERIFIED: codebase]
- `lib.rs` currently loads config from `PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("processes.json")`; this must change for installed apps.[VERIFIED: codebase]
- `spawn_child_to_slot()` resolves relative cwd against `CARGO_MANIFEST_DIR` and only skips PATH augmentation in packaged mode; packaged executable path resolution is not implemented yet.[VERIFIED: codebase]
- `capture_lines()` currently opens one append-only log file per service (`paladin-agent.log`, `paladin-server.log`), emits `process-log`, stores stderr tail, and degrades gracefully if file writes fail; there is no rotation yet.[VERIFIED: codebase]
- `log_dir` currently comes from `app.path().app_log_dir()` with fallback to `src-tauri/logs`.[VERIFIED: codebase]
- `tauri-cli.mjs` only wraps `tauri` CLI and dev-sidecar cleanup for `dev`; there is no release orchestration for sidecar builds.[VERIFIED: codebase]
- Root `package.json` has no release/build orchestration at all; desktop `package.json` only exposes `tauri` wrapper, `build`, `dev`, and tests.[VERIFIED: codebase]
- Agent packaging surface:
  - Python entrypoint is `src.server.cli:main` via `paladin-agent` script.[VERIFIED: codebase]
  - `serve` subcommand is the HTTP entrypoint and exits immediately when `DEEPSEEK_API_KEY` is missing.[VERIFIED: codebase]
- Server packaging surface:
  - Go main loads `.env` non-fatally, then requires env-backed config and immediately opens Postgres/Redis at startup.[VERIFIED: codebase]
  - `/healthz` is liveness; `/readyz` returns 503 when PG or Redis ping fails.[VERIFIED: codebase]

## Security Considerations

- Config loading:
  - Plan must treat bundled packaged config as trusted build output, not user-editable shell text.
  - Retain `Vec<String>` argv semantics to avoid shell injection.[VERIFIED: codebase]

- Secret exposure:
  - Existing log redaction covers `DEEPSEEK_API_KEY`, `JWT_SECRET`, `PALADIN_JWT_SECRET`, Bearer tokens, and password-like fields.[VERIFIED: codebase]
  - Plan must extend tests around rotation to prove redaction still occurs before persisted bytes are written.[CITED: .planning/phases/10-packaging/10-SPEC.md] [VERIFIED: codebase]
  - Docs must not paste real `.env` examples with live-like secrets.[CITED: .planning/phases/10-packaging/10-SPEC.md]

- Process control:
  - Stop/restart/shutdown already protect external processes by owner semantics; packaged work must preserve “tracked child handles only” and must not regress to PID/port kill heuristics.[CITED: .planning/phases/07.4-sidecar-runtime-mode/07.4-CONTEXT.md] [VERIFIED: codebase]

- Writable paths:
  - Sidecars should not need write access inside app bundle/resources.
  - Any generated runtime state should go to app-local writable directories, not next to signed/bundled assets.[ASSUMED]

- Supply-chain clarity:
  - PyInstaller bundle contents and Go binary must be produced locally by the repo’s own source, from one documented command.
  - Release docs should state that Phase 10 excludes code signing/notarization/auto-update so users understand the trust boundary.[CITED: .planning/phases/10-packaging/10-SPEC.md]

## Validation Architecture

Plan should define four validation layers:

1. Build artifact validation
   - Assert sidecar outputs exist before `tauri build`.
   - Assert macOS build produces `.dmg`; Windows build produces `.msi`.[CITED: .planning/phases/10-packaging/10-SPEC.md]

2. Rust automated validation
   - Add config-path tests for packaged lookup.
   - Add spawn-path tests for sidecar name -> installed absolute path resolution.
   - Add log rotation tests proving:
     - 10 MB threshold,
     - max 5 retained files,
     - complete-line preservation,
     - emit path unaffected by rotate failure.[CITED: .planning/phases/10-packaging/10-SPEC.md] [VERIFIED: codebase]

3. Installed-app UAT matrix
   - macOS installed app, PG+Redis available:
     - Agent `/health` green,
     - Go `/healthz` green,
     - Go `/readyz` green.[CITED: .planning/phases/10-packaging/10-SPEC.md]
   - macOS installed app, PG/Redis unavailable:
     - Agent startup usable,
     - Go shown degraded/non-blocking.[CITED: .planning/phases/10-packaging/10-CONTEXT.md]
   - Windows installed app: same two scenarios.[CITED: .planning/phases/10-packaging/10-SPEC.md]

4. Documentation validation
   - Docs must include install steps, first launch expectations, log paths, config failure behavior, sidecar failure behavior, UAT status, and release honesty status.[CITED: .planning/phases/10-packaging/10-SPEC.md]

Recommended evidence artifacts:

- `VALIDATION.md` or phase-local UAT notes with exact build date, OS version, installer filename, dependency state, and screenshots/log snippets.[ASSUMED]
- Explicit “not release-ready” note if Windows or macOS UAT is missing or degraded.[CITED: .planning/phases/10-packaging/10-SPEC.md]

## Package Legitimacy Audit

Current repo is not yet legitimate to call “packaged release-ready” for any platform:

- No checked-in release orchestration command exists.[VERIFIED: codebase]
- No Tauri `externalBin` config exists.[VERIFIED: codebase]
- No packaged `processes.json` resource lookup exists.[VERIFIED: codebase]
- Rust packaged spawn path still assumes source-tree base paths in critical places.[VERIFIED: codebase]
- No `.dmg` / `.msi` UAT evidence is recorded in state.[CITED: .planning/STATE.md]
- No user-facing packaging/install/troubleshooting doc for installed app behavior is present in phase materials.[CITED: .planning/phases/10-packaging/10-SPEC.md] [ASSUMED]

Therefore Phase 10 planner must explicitly treat “artifact exists” and “installed app validated” as separate done criteria. A successful `tauri build` alone is insufficient.[CITED: .planning/phases/10-packaging/10-SPEC.md]

## Planner Recommendations

1. Use a staged release pipeline.
   - Wave 1: agent sidecar build.
   - Wave 2: server sidecar build.
   - Wave 3: Tauri bundle/resource wiring + packaged config lookup.
   - Wave 4: supervisor packaged path resolution + log rotation.
   - Wave 5: installer UAT + docs.

2. Choose packaged config as a separate file, not in-place mutation.
   - Recommended: commit `apps/desktop/src-tauri/processes.packaged.json` and bundle it as a resource.
   - Rust packaged mode should load that resource file explicitly.
   - Reason: simplest audit trail, easiest tests, no build-time JSON templating required unless env substitution becomes necessary.[VERIFIED: codebase] [ASSUMED]

3. Keep packaged `cmd: string[]` logical, but resolve paths in Rust.
   - Recommended packaged config:
     - agent: `["paladin-agent-sidecar", "serve"]`
     - server: `["paladin-server-sidecar"]`
   - Rust should map argv[0] to installed absolute path and pass through the remaining args unchanged.[VERIFIED: codebase]

4. Prefer `cwd: null` for packaged sidecars unless a concrete writable cwd requirement is proven.
   - Current packaged validation already permits null.
   - This avoids accidental source-tree assumptions and reduces bundle path complexity.[VERIFIED: codebase]

5. Put packaged config in `bundle.resources`, not beside source files.
   - Load via resource-dir-aware resolution in Rust.
   - Keep logs in `app_log_dir`.
   - Do not mix mutable and immutable assets.[CITED: https://v2.tauri.app/develop/resources/] [VERIFIED: codebase]

6. Plan for platform-specific output naming in the build scripts, but keep logical sidecar names stable in config.
   - The binary artifact names on disk may need platform suffix/extension during build/bundle integration.[CITED: https://v2.tauri.app/develop/sidecar/] [ASSUMED]
   - Planner should normalize this in the release build layer, not in runtime config schema.

7. For PyInstaller, plan a spec file rather than only raw CLI flags.
   - This is the most maintainable place to pin entry script, output name, and future datas/hiddenimports if packaging fails on CI or Windows.[CITED: https://pyinstaller.org/en/stable/spec-files.html]

8. Treat env injection as a first-class packaging concern.
   - Agent sidecar currently fails fast without `DEEPSEEK_API_KEY`.[VERIFIED: codebase]
   - Server sidecar currently fails fast without DB/Redis/JWT envs.[VERIFIED: codebase]
   - Plan must specify where installed app gets these values, how failure is surfaced, and how docs explain degraded vs blocking cases.

9. Make log rotation tests deterministic.
   - Introduce a small file-rotation helper with injectable max-bytes threshold in tests.
   - Test by writing synthetic full lines; assert retained file count and ordered content after rotation.[ASSUMED]

10. Require release honesty in docs.
   - Include a short status table:
     - macOS installer built? installed UAT passed?
     - Windows installer built? installed UAT passed?
     - PG/Redis-ready path tested?
     - degraded path tested?
   - This directly satisfies PKG-03 and the “not release-ready unless UAT passed” prohibition.[CITED: .planning/REQUIREMENTS.md] [CITED: .planning/phases/10-packaging/10-SPEC.md]

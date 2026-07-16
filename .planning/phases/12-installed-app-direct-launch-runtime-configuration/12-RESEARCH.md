# Phase 12: Installed App Direct Launch Runtime Configuration - Research

**Researched:** 2026-07-16  
**Domain:** Tauri installed-app runtime configuration, sidecar supervision, degraded Go readiness, and cross-platform launcher evidence  
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

### Go Configuration Entry and Secret Boundary
- **D-01:** Add a dedicated `Go 服务` settings view to the existing right panel, alongside rather than inside AI Provider settings.
- **D-02:** DB URL, Redis URL, and JWT secret are write-only. UI/read APIs show only configured state and a fixed masked fingerprint; replacement requires re-entry and never returns raw values.
- **D-03:** Saving Go configuration and testing/retrying readiness are separate actions. Offline or temporarily unavailable endpoints may be saved, with test results reported independently.
- **D-04:** Retain the Phase 11 local protected app-data and redaction boundary. Do not add Stronghold/vault or OS keychain integration in this phase.

### Bootstrap and Runtime Precedence
- **D-05:** When persisted Go configuration is empty, import an environment configuration only when the complete DB/Redis/JWT set is valid; persist the imported values once and do not automatically replace subsequent user-managed configuration.
- **D-06:** A partial or invalid environment set must not create a partial local configuration. Keep Go degraded and identify each missing or invalid field in diagnostics.
- **D-07:** With an explicit development, CI, or UAT marker, a wrapper may inject a session-only environment override even when local configuration exists. It applies only to that launched process and must not be persisted.
- **D-08:** Clearing local Go configuration enters an unconfigured degraded state. Do not silently re-import environment variables; provide an explicit `从环境变量导入` action.

### Direct-launch Evidence and Platform Status
- **D-09:** macOS installed-app UAT installs the DMG to `/Applications` and launches `Paladin.app` by Finder double-click; wrapper, terminal launch, and direct execution of the bundle binary are not primary evidence.
- **D-10:** macOS UAT covers: no AI/Go config with usable Agent/UI and separated prompts; AI available with Go missing; and persisted Go configuration read by a direct launch and used to start packaged sidecars.
- **D-11:** Windows/Linux receive repeatable CI/automation verification with clean environments, temporary app-data paths, packaged resources, configuration resolution, sidecar launch, and status classification. Their real installed-app manual UAT remains an explicit platform-environment todo and they remain non-release-ready.
- **D-12:** Commit structured, secret-free validation evidence: version/commit, artifact manifest or hash, launch entry point, scenario outcomes, diagnostic class, and outstanding UAT status. Do not record DSNs, JWTs, API keys, or raw secret-bearing logs.

### the agent's Discretion
- Choose exact DTOs, command names, file names, and masked fingerprint format while preserving Rust/Tauri ownership, write-only secrets, and no secret leakage.
- Choose the exact test harnesses and platform-specific launcher simulation details while meeting the locked evidence standard.

### Deferred Ideas (OUT OF SCOPE)
- Integrating OS Keychain/Credential Manager/Secret Service or an encrypted vault for Go secrets — security-hardening phase.
- Bundling, automatically installing, or making PostgreSQL/Redis mandatory for local desktop operation — outside this optional Go-service phase.
- Windows Start Menu/Explorer and Linux AppImage/.desktop/deb manual installed-app UAT — platform-environment todo; do not claim release-ready before completion.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|---|---|---|
| SDC-01 | Tauri sidecar 配置，管理 Python Agent 子进程 | 保持 `ProcessSupervisor` 对 packaged Agent 的所有权；Go 配置故障不得改变 Agent 启动门槛。 [VERIFIED: codebase] |
| SDC-02 | Tauri sidecar 配置，管理 Go Server 子进程 | 让 Rust 从 app-data 解析 Go session env，再通过已有 allowlist/`env_clear` 启动 packaged Go sidecar。 [VERIFIED: codebase] |
| SDC-03 | Sidecar 健康检查与自动重启 | 复用 `/healthz` liveness、`/readyz` readiness、degraded tuple 与 retry；将字段级配置诊断加入而非把 Go 降级升级成 Agent 故障。 [VERIFIED: codebase] |
| PKG-01 | macOS 打包（.dmg） | Finder 双击 `/Applications/Paladin.app` 是唯一 primary installed-app UAT entry point；DMG hash、commit、结果须写入无秘密证据。 [CITED: 12-CONTEXT.md] |
| PKG-02 | Windows 打包（.msi） | Windows 只做 clean-environment automation；人工 Start Menu/Explorer UAT 继续是 non-release-ready 待办。 [CITED: 12-CONTEXT.md] |
| PKG-03 | README + 项目文档 | 删除“wrapper 是普通安装态唯一入口”的描述，明确 GUI 直启、wrapper 诊断/UAT、平台验证和 release-ready 的区别。 [VERIFIED: codebase] [CITED: 12-CONTEXT.md] |
</phase_requirements>

## Summary

当前 packaged runtime 已经具备正确的执行边界：Tauri setup 从 `app_data_dir()` 建立 AI 配置管理器、从 installed resource 读取 packaged process config、从 `app_log_dir()` 落日志；`ProcessSupervisor` 对每个 sidecar 使用 `env_clear()`，只重新注入显式 allowlist，并强制 `PALADIN_RUNTIME_MODE=packaged`。Go 已支持 packaged 模式下缺 DB/Redis/JWT 的 health-only degraded server：`/healthz` 仍为 200，`/readyz` 以 503 给出非敏感依赖状态，且 Agent 仍会启动。 [VERIFIED: codebase]

因此第 12 阶段不应改变 bundle 布局、重新实现 sidecar runner、安装 PostgreSQL/Redis，或引入新依赖。应以 Phase 11 的 `AiProviderConfigManager` 模式新增 **desktop-owned Go config manager**：metadata 与 secrets 分开、串行写入与原子替换、masked read model、one-time bootstrap marker。它应产生只供 supervisor 本次 spawn 使用的完整 Go 环境快照，并在显式 dev/CI/UAT marker 下接受一次性 session override；正常 Finder/Start Menu/Linux launcher 直启只读取 app-data，因此不依赖 interactive shell。 [VERIFIED: codebase] [CITED: 12-CONTEXT.md]

**Primary recommendation:** 以 Rust/Tauri app-data Go configuration manager 为唯一持久化权威，将其完整快照注入 `environment_for_process`；让 Go 继续只从 env 读取本进程配置并保留其 liveness/readiness 降级契约，同时以平台特定的直接 launcher 测试与无秘密证据验证该边界。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|---|---|---|---|
| Go DB/Redis/JWT 持久化、bootstrap、清除与遮罩 readback | Desktop Rust / Tauri | Browser React | 机密不能交给前端持久化；Tauri 已是 app-data 与 runtime authority。 [VERIFIED: codebase] |
| Go form、保存/测试分离、导入 CTA、字段级诊断 | Browser / React | Desktop Rust commands | UI 只持有输入和 masked DTO；Rust command 执行保存/导入/测试。 [CITED: 12-CONTEXT.md] [VERIFIED: codebase] |
| Go sidecar 的 session env、spawn、探针、状态元组与日志 | Desktop Rust / Tauri | Go server | supervisor 已拥有 `env_clear`、allowlist、liveness/readiness 与 child lifecycle。 [VERIFIED: codebase] |
| DB/Redis/JWT 解析与 `/healthz`、`/readyz` 诊断 | Go backend | Desktop Rust status surface | Go 最了解其配置验证和依赖连通性；Rust 将结构化结果映射到 UI。 [VERIFIED: codebase] |
| installed resource/sidecar path | Tauri bundle/runtime | CI automation | bundle resources 是只读输入；Tauri 官方 API 用于解析安装后路径，不能从 repo 推导。 [CITED: https://v2.tauri.app/develop/resources/] [CITED: https://v2.tauri.app/develop/sidecar/] |
| macOS Finder UAT 与 Windows/Linux automated verification evidence | Platform launcher harness | CI/release docs | GUI 入口的真实性属于平台 harness；同一 structured schema 表示证据和未完成状态。 [CITED: 12-CONTEXT.md] |

## Standard Stack

### Core

| Library / Layer | Version | Purpose | Why Standard |
|---|---:|---|---|
| Tauri | `2`（现有） | app-data/log paths、managed state、commands、packaged resource resolution | 现有桌面 runtime authority；官方支持 bundle resource resolver。 [VERIFIED: codebase] [CITED: https://v2.tauri.app/develop/resources/] |
| Rust `serde_json` + `tokio::sync::Mutex` | 现有 Cargo deps | Go config metadata/secrets JSON、serialized writes | Phase 11 已以此实现 provider persistence；本阶段不需要新的 storage crate。 [VERIFIED: codebase] |
| Rust `reqwest` | `0.12`（现有） | readiness test/retry 与 Go endpoint 探测 | supervisor 已用它探 `/healthz`、`/readyz`。 [VERIFIED: codebase] |
| React 19 + Zustand 5 + existing shadcn primitives | 现有 | Go 服务右侧面板、masked status/CTA | 保持现有 RightPanel/store/UI pattern，避免第三方 form library。 [VERIFIED: codebase] |
| Go standard library HTTP + current config package | 现有 | env validation、health-only degraded server、readiness JSON | Go process 已在 packaged 模式实现 dotenv 禁用与 degraded contract。 [VERIFIED: codebase] |

### Supporting

| Library / Layer | Version | Purpose | When to Use |
|---|---:|---|---|
| existing `regex` redactor | `1`（现有） | 覆盖 DSN、Redis URL、`PALADIN_JWT_SECRET` 的日志/diagnostic redaction | 在任一 UI event、tail、disk log、test evidence 前统一处理。 [VERIFIED: codebase] |
| Vitest 4 / Rust lib tests / Go tests | 现有 | config precedence、masked DTO、sidecar env、diagnostic category | 每个纯函数、command seam 与 packaged runtime contract。 [VERIFIED: codebase] |
| existing release scripts and shell harnesses | 现有 | artifact manifest、clean-env direct-launch automation 与 secret scans | Windows/Linux automation 和 macOS UAT evidence generation。 [VERIFIED: codebase] |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|---|---|---|
| app-data JSON split metadata/secrets | SQLite | 对三个固定 secret 的本地配置过重，且会偏离 Phase 11 已验证的 serial write/masking convention。 [VERIFIED: codebase] |
| desktop-owned config snapshot | Go server writes its own config file | 违反既有 Rust/Tauri app-data authority，并把 secret persistence/diagnostics 分散到 sidecar。 [CITED: 12-CONTEXT.md] |
| inherited shell env for normal launch | macOS/Windows/Linux launcher-specific env files | GUI launcher 的环境不稳定且无法统一，D-05--D-08 已锁定 app-data 优先。 [CITED: 12-CONTEXT.md] |

**Installation:** 无。此阶段不得新增外部包；现有依赖和项目内 harness 足够。 [VERIFIED: codebase]

## Package Legitimacy Audit

不适用：本阶段不安装外部 package；无需运行 package legitimacy gate。 [VERIFIED: codebase]

## Architecture Patterns

### System Architecture Diagram

```text
Finder / Start Menu / Linux desktop launcher
                    |
                    v
          installed Paladin application
                    |
                    +--> Tauri app-data GoConfigManager
                    |       |-- masked metadata readback --> React Go 服务 view
                    |       |-- secrets (write-only) ------> runtime snapshot
                    |       |-- empty + explicit import --> complete valid env only
                    |
                    +--> ProcessSupervisor
                            |-- env_clear + system allowlist
                            |-- normal: persisted snapshot
                            |-- dev/CI/UAT marker: session override only
                            v
                       packaged Go sidecar
                            |-- /healthz (liveness)
                            +-- /readyz (DB/Redis/JWT readiness)
                                      |
                 Running / Degraded / Failure diagnostic categories
                                      v
                   StatusBar + Go 服务 view + redacted app logs
```

### Recommended Project Structure

```text
apps/desktop/src-tauri/src/
├── go_service/
│   ├── types.rs       # input, persisted, masked, snapshot, readiness DTOs
│   ├── storage.rs     # metadata/secrets paths, atomic writes, serialized access
│   ├── bootstrap.rs   # complete-valid one-time env import + explicit import action
│   └── mod.rs         # Tauri commands, supervisor integration, readiness test
├── process/
│   ├── supervisor.rs  # config-source precedence -> per-spawn env construction
│   └── log_redact.rs  # DSN/Redis/JWT aliases and values redacted
└── lib.rs             # manager registration and command registration

apps/desktop/src/
├── components/provider/GoServicePanel.tsx  # dedicated right-panel view
├── stores/goService.ts                      # masked data, save/test/import/clear actions
└── lib/tauri-commands.ts                    # typed invoke wrappers
```

### Pattern 1: Desktop-owned, write-only Go configuration

**What:** mirror Phase 11's manager shape but use one Go service record: metadata may expose `configured`, provenance, readiness, and a fixed fingerprint; secrets file holds DB URL, Redis URL, JWT secret and is never returned from a read command. [VERIFIED: codebase] [CITED: 12-CONTEXT.md]  
**When to use:** all normal GUI launch, save, clear, readback, and supervisor spawn paths.  
**Implementation guidance:** reuse a per-manager `Mutex`, temp-file-plus-rename writes, `load_masked_config()`, and a separate `runtime_snapshot()` that is only called in Rust. Validate all three input strings (including JWT minimum) before a bootstrap import; a user save may persist endpoint data even while connection testing later fails, per D-03. [VERIFIED: codebase] [CITED: 12-CONTEXT.md]

### Pattern 2: Explicit precedence and one-shot override

**What:** resolve a `GoRuntimeSource` once per sidecar spawn: `session_override` only when a dedicated dev/CI/UAT marker is true; otherwise `persisted`; if no persisted config, optional explicit first bootstrap/import may use a complete valid env set; empty/cleared local state stays degraded. [CITED: 12-CONTEXT.md]  
**When to use:** startup, Go-sidecar restart, and explicit import.  
**Anti-corruption rule:** never merge persisted and env fields. A source is accepted only as a full validated triple, so no user or environment value leaks across precedence boundaries. [CITED: 12-CONTEXT.md]

### Pattern 3: Preserve Go liveness/readiness separation

**What:** keep `ProcessState::Running` for successful `/healthz`; use `Degraded` for non-200 `/readyz` without restart; retain Agent startup even when Go is degraded. [VERIFIED: codebase]  
**When to use:** missing/invalid config, endpoint downtime, DB/Redis outage, and recovery retry.  
**Implementation guidance:** extend diagnostic classification to distinguish `go-unconfigured`, `go-invalid-{field}`, `go-dependency-unavailable`, `go-port-conflict`, `go-sidecar-failed`, and `go-readiness-failed`; never infer these from UI strings. The precise DTO labels are discretionary. [CITED: 12-CONTEXT.md] [VERIFIED: codebase]

### Pattern 4: Launcher class is evidence, not configuration source

**What:** direct launcher tests must execute the installed artifact with clean environment and isolated app-data; wrapper tests remain only a marked session-override diagnostic/UAT path. [CITED: 12-CONTEXT.md]  
**When to use:** platform gates and documentation.  
**Implementation guidance:** macOS primary harness needs a real DMG installation to `/Applications` plus Finder double-click human action; it may collect a redacted, structured result after launch. Windows/Linux tests must call their packaged launcher artifact or simulation under clean env and temporary app-data, but emit `manual_uat: pending` and `release_ready: false`. [CITED: 12-CONTEXT.md]

### Anti-Patterns to Avoid

- **Reading Go env directly inside Go config persistence:** bypasses user-controlled app-data and makes GUI launches shell-dependent. [CITED: 12-CONTEXT.md]
- **Persisting a partial bootstrap:** violates D-06 and creates ambiguous recovery behavior. [CITED: 12-CONTEXT.md]
- **Using raw stdout/stderr or DTO debug output as diagnostics:** DSNs and secrets can appear in values; route all output through redaction and structured classes. [VERIFIED: codebase] [CITED: 12-CONTEXT.md]
- **Treating a successful CI bundle as manual installed-app UAT:** prohibited by D-11/D-12; retain platform status distinction. [CITED: 12-CONTEXT.md]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---|---|---|---|
| installed resource path | path arithmetic from repo cwd or executable names | Tauri `PathResolver` / existing packaged resource resolver | Tauri resource layout is platform-specific and its official API resolves bundle resources. [CITED: https://v2.tauri.app/develop/resources/] |
| sidecar artifact naming | custom cross-platform binary locator | Tauri `externalBin` target-triple bundle convention plus existing `resolve_packaged_executable` | external binaries require target-specific names; project already validates logical sidecar names. [CITED: https://v2.tauri.app/develop/sidecar/] [VERIFIED: codebase] |
| child lifecycle and probing | new Go-specific runner | `ProcessSupervisor` / `RuntimeStatusTuple` / existing commands | avoids separate ownership, retry, port, and log semantics. [VERIFIED: codebase] |
| local config persistence | frontend localStorage or Go-owned file | Phase 11-style Tauri manager | preserves write-only secrets and serial write boundary. [VERIFIED: codebase] |
| log sanitization | per-panel string replacement | central `redact_log_line()` before event/tail/disk | one choke point is auditable and already exercised by supervisor. [VERIFIED: codebase] |

**Key insight:** only configuration *resolution* is new; sidecar packaging, lifecycle, readiness and app-data conventions already exist. Planning should add a narrow Go manager plus seams into the existing supervisor instead of forked launch modes.

## Runtime State Inventory

| Category | Items Found | Action Required |
|---|---|---|
| Stored data | AI provider metadata/secrets are already in app-data; no Go configuration file is present. [VERIFIED: codebase] | Add a new Go metadata/secrets pair; do not modify AI provider records or bundled resources. |
| Live service config | PostgreSQL and Redis are external runtime dependencies, not app-managed services. [CITED: 12-CONTEXT.md] | Test their availability independently; never provision them from the desktop app. |
| OS-registered state | Existing Tauri packaging provides macOS/Windows bundle artifacts; Phase 12 has no migration of scheduler/launchd/systemd state. [VERIFIED: codebase] | Produce launcher-specific evidence only; do not claim Windows/Linux manual UAT. |
| Secrets/env vars | `PALADIN_DATABASE_URL`, `PALADIN_REDIS_URL`, `PALADIN_JWT_SECRET` are currently supervisor allowlisted and Go reads them from env. [VERIFIED: codebase] | Add write-only app-data source, complete-set validation, explicit marker-bound override, and broader redaction. |
| Build artifacts | packaged config/resources and sidecar binaries are read-only bundle inputs; README and packaging docs still prescribe wrapper-first macOS startup. [VERIFIED: codebase] | Keep bundle inputs immutable; update docs and validation evidence to direct-launch-first language. |

## Common Pitfalls

### Pitfall 1: Precedence turns into silent configuration resurrection
**What goes wrong:** after user clears saved Go config, startup auto-imports old environment values and appears configured again.  
**Why it happens:** bootstrap is run unconditionally, as Phase 11's first-run helper currently is for AI provider. [VERIFIED: codebase]  
**How to avoid:** record explicit user-cleared/local-state provenance; automatic import only occurs for genuinely empty first-run state, while clear requires an explicit import command. [CITED: 12-CONTEXT.md]  
**Warning signs:** a clear → restart test reports a non-empty runtime snapshot without explicit import.

### Pitfall 2: Session overrides contaminate persistent authority
**What goes wrong:** UAT wrapper env values are saved to app-data or silently outrank user settings in a normal GUI launch.  
**Why it happens:** parent env is already merged into `environment_for_process`. [VERIFIED: codebase]  
**How to avoid:** model session override separately, require the explicit marker, and never call persistence writes for it. [CITED: 12-CONTEXT.md]  
**Warning signs:** test app-data contains a value supplied only by test wrapper env.

### Pitfall 3: Secret leakage through “helpful” Go diagnostics
**What goes wrong:** DSN/Redis URL/JWT appears in a Tauri error, browser console, status event, log tail, evidence JSON, screenshot, or Go error string.  
**Why it happens:** existing redactor recognizes JWT/password/API-key patterns but does not establish a complete DSN/Redis-value contract. [VERIFIED: codebase]  
**How to avoid:** use field identifiers and fixed fingerprints in DTOs; add DSN/Redis aliases to the central redactor; run sentinel scans over evidence and logs. [CITED: 12-CONTEXT.md]  
**Warning signs:** any test asserts an entire submitted secret/URL rather than an opaque fingerprint.

### Pitfall 4: Go degraded blocks the product
**What goes wrong:** a missing DB/Redis/JWT causes the startup mask or UI to treat Agent as unavailable.  
**Why it happens:** liveness and readiness states are collapsed into a single boolean.  
**How to avoid:** retain the existing `/healthz` 200 + `/readyz` 503 semantics, Agent startup sequence, and separate status channels. [VERIFIED: codebase]  
**Warning signs:** a no-Go-config test cannot use Agent/UI.

### Pitfall 5: Platform evidence overclaims
**What goes wrong:** CI invokes a binary directly, then docs call Windows/Linux installed-app UAT or release-ready.  
**Why it happens:** artifact buildability, automated launcher verification, and human installed-app UAT are recorded in one status field.  
**How to avoid:** schema must store `verification_kind`, `launch_entry_point`, `manual_uat_status`, and `release_ready`; D-11 fixes Windows/Linux manual UAT as pending. [CITED: 12-CONTEXT.md]

## Code Examples

### Source selection must be complete and non-merging

```rust
// Source: Phase 12 D-05..D-08 and existing environment_for_process boundary.
fn resolve_go_snapshot(
    persisted: Option<GoRuntimeSnapshot>,
    env: GoRuntimeSnapshot,
    session_override_allowed: bool,
) -> GoConfigSource {
    if session_override_allowed && env.is_complete_and_valid() {
        return GoConfigSource::SessionOverride(env); // never persisted
    }
    if let Some(saved) = persisted.filter(GoRuntimeSnapshot::is_complete_and_valid) {
        return GoConfigSource::Persisted(saved);
    }
    GoConfigSource::Unconfigured(env.field_diagnostics())
}
```

### Spawn from an explicit effective environment

```rust
// Source: apps/desktop/src-tauri/src/process/supervisor.rs (existing env_clear pattern).
let mut command = tokio::process::Command::new(&entry.cmd[0]);
command.args(&entry.cmd[1..]);
let parent = std::env::vars_os().collect();
let effective = go_manager.environment_for_spawn(parent, runtime_mode, session_marker).await?;
command.env_clear().envs(effective);
```

The implementation must preserve the existing `PALADIN_RUNTIME_MODE` overwrite and must not expose `effective` in debug/UI output. [VERIFIED: codebase]

### Structured, secret-free evidence record

```json
{
  "schema_version": 1,
  "commit": "<commit-sha>",
  "artifact": { "name": "Paladin.dmg", "sha256": "<hash>" },
  "platform": "macos",
  "launch_entry_point": "Finder double-click /Applications/Paladin.app",
  "scenario": "persisted-go-config-direct-launch",
  "outcome": {
    "agent": "running",
    "ai_readiness": "available",
    "go_readiness": "running"
  },
  "manual_uat_status": "passed",
  "release_ready": true
}
```

This is a schema illustration, not a new dependency; no value-bearing config fields, log lines, DSNs, keys, or JWTs belong in the record. [CITED: 12-CONTEXT.md]

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| wrapper/environment is the macOS normal-start instruction | direct launcher with app-data authority; wrapper becomes diagnostic/UAT-only | Phase 12 decision | Finder/Start Menu/Linux launcher no longer relies on interactive shell inheritance. [CITED: 12-CONTEXT.md] |
| AI provider needs startup env | app-data provider manager with masked readback and one-time bootstrap | Phase 11 | Reuse its persistence/security pattern for optional Go config. [VERIFIED: 11-VERIFICATION.md] |
| packaged Go config only comes from parent env | persisted Go snapshot normally supplies the supervisor's per-process env | Phase 12 plan target | enables direct launch while preserving Go's env-based config API. [CITED: 12-CONTEXT.md] |

**Deprecated/outdated:** README and `docs/packaging.md` wrapper-first text is incompatible with D-09 and must be removed or relabeled as explicit diagnostic/UAT tooling. [VERIFIED: codebase] [CITED: 12-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|---|---|---|
| A1 | The exact right-panel/store file names can be extended without a broad rename. | Recommended Project Structure | Low; planner must locate current component paths before implementation. |
| A2 | A fixed fingerprint can be derived locally without adding a crypto dependency. | Pattern 1 | Medium; choose an existing standard-library-compatible stable non-secret display scheme and verify it cannot reveal values. |

All other design constraints above come from locked context, existing code, or official Tauri documentation.

## Open Questions (RESOLVED)

1. **Which marker authorizes a session-only override?**
   - **Resolved decision:** use the non-secret, fail-closed `PALADIN_RUNTIME_CONFIG_OVERRIDE=1` marker. It is honored only by development/CI/UAT harness paths, authorizes a complete session override for one spawned child, and never writes app-data. An ordinary inherited parent environment has no override authority. This closes D-07 through the precedence and non-persistence contracts in Plans 12-01 Task 1, 12-02 Task 2, and 12-03 Task 1. [CITED: 12-CONTEXT.md]
2. **How does saved configuration affect an already-running Go process?**
   - **Resolved decision:** D-03 uses explicit save/retry/managed-restart semantics. Save persists a validated configuration and reports pending apply; retry only probes the current process and does not mutate its environment; a Paladin-managed restart stops and respawns the child using the saved snapshot; an externally owned process cannot be restarted by Paladin and must be restarted outside Paladin before re-detection. This closes the behavior through Plans 12-04 Task 1, 12-05 Task 1, and 12-06 Task 1 without claiming an immediate live-environment mutation. [CITED: 12-CONTEXT.md]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|---|---|---:|---|---|
| Node.js | frontend/release and harnesses | ✓ | `v22.22.3` | — |
| pnpm | desktop tests/release scripts | ✓ | `11.5.2` | — |
| Rust/Cargo | Tauri/Rust tests | ✓ | `cargo 1.96.0` | — |
| Go | Go config/server tests | ✓ | `go1.26.4 darwin/arm64` | — |
| uv | Agent tests | ✓ | `0.7.5` | — |
| Docker | optional PG/Redis integration scenarios | ✓ | `28.4.0` | existing external services may be used instead |
| PostgreSQL CLI/server | live Go-ready integration scenario | ✗ | — | test missing/degraded automation; provision externally for ready scenario |
| Redis CLI/server | live Go-ready integration scenario | ✗ | — | test missing/degraded automation; provision externally for ready scenario |

**Missing dependencies with no fallback:** none for code/config implementation.  
**Missing dependencies with fallback:** local PostgreSQL/Redis; direct-launch ready scenario can use Podman/Docker or a pre-provisioned external test service, while missing-dependency behavior remains fully testable. [VERIFIED: environment probe]

## Validation Architecture

### Test Framework

| Property | Value |
|---|---|
| Rust | `cargo test --lib` from `apps/desktop/src-tauri` |
| Frontend | `pnpm --filter @paladin/desktop test --run ...` |
| Go | `go test ./...` from `apps/server` |
| Agent | `uv run pytest` from `apps/agent` |
| Quick run command | focused Rust + Go config tests and focused Vitest store/panel tests |
| Full suite command | existing Phase 11/10 full desktop, Rust, Go, Agent, release/secret-scan gates |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| SDC-01 | no Go config still starts Agent/UI | Rust integration + frontend state | `cargo test --lib process::`; focused Vitest | Partial — add Phase 12 focused cases |
| SDC-02 | persisted complete Go config enters spawn env; values never read back | Rust unit/command integration | `cargo test --lib go_service:: process::` | ❌ Wave 0 |
| SDC-03 | missing/invalid/dependency outage maps to degraded and retry succeeds after recovery | Rust + Go endpoint tests | `cargo test --lib`; `go test ./...` | Partial — add field-class cases |
| PKG-01 | installed DMG Finder direct launch runs three locked scenarios | manual UAT + structured evidence | artifact/hash checks plus human Finder action | ❌ Wave 0 evidence harness |
| PKG-02 | clean-env packaged resource/config/sidecar simulation | CI/platform automation | platform harness command defined by plan | ❌ Wave 0 |
| PKG-03 | docs are direct-launch honest and evidence contains no secrets | source/secret scan | existing release scan plus focused grep/script | Partial — update assertions |

### Sampling Rate

- **Per task commit:** focused tests for changed tier plus secret sentinel assertion.
- **Per wave merge:** Rust lib tests, focused Vitest, Go tests, and relevant script/harness test.
- **Phase gate:** full existing suites green; macOS Finder UAT evidence complete; Windows/Linux automation evidence committed with manual UAT pending/non-release-ready.

### Wave 0 Gaps

- [ ] Rust Go-service manager test module: validation, serialized save, masked readback, clear/import provenance and session-override precedence.
- [ ] Supervisor environment tests proving persisted values replace parent values only in normal mode, ordinary parent env cannot override, and marker-bound session override is nonpersistent.
- [ ] Go test for structured, field-only invalid/missing readiness diagnostics without secret reflection.
- [ ] Vitest store/panel tests for write-only inputs, masked display, save/test separation, import/clear CTA, and Agent-vs-Go status separation.
- [ ] Secret-free evidence schema validator/scanner plus macOS Finder UAT recorder and Windows/Linux clean-env automated harnesses.

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---|---|---|
| V2 Authentication | Yes | JWT secret write-only storage; minimum-length validation remains Go-side. [VERIFIED: codebase] |
| V3 Session Management | Yes | Do not log/reveal JWT values; session override is explicit and process-only. [CITED: 12-CONTEXT.md] |
| V4 Access Control | Yes | Tauri command boundary permits only typed masked reads; raw runtime snapshot stays Rust-private. [CITED: 12-CONTEXT.md] |
| V5 Input Validation | Yes | Validate complete DB/Redis/JWT set and field-specific errors before bootstrap/import; no partial persistence. [CITED: 12-CONTEXT.md] |
| V6 Cryptography | Limited | Do not add custom encryption or vault; deferred OS-keychain/vault scope remains excluded. [CITED: 12-CONTEXT.md] |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---|---|---|
| DSN/JWT appears in logs, UI, evidence, or error strings | Information Disclosure | central redaction, masked DTOs, opaque diagnostics, post-run sentinel scan. [VERIFIED: codebase] |
| Parent env silently replaces saved config | Tampering | precedence resolver, explicit marker, complete-set validation, nonpersistent override test. [CITED: 12-CONTEXT.md] |
| UI reads raw secret after save | Information Disclosure | write-only input contract and Rust-only runtime snapshot. [CITED: 12-CONTEXT.md] |
| sidecar inherits unexpected GUI/system environment | Elevation of Privilege / Information Disclosure | retain `env_clear` and explicit business/system allowlists. [VERIFIED: codebase] |
| Go DB outage disables AI product | Denial of Service | preserve independent Agent liveness and non-blocking Go degraded state. [VERIFIED: codebase] |

## Sources

### Primary (HIGH confidence)
- `apps/desktop/src-tauri/src/lib.rs`, `process/supervisor.rs`, `process/log_redact.rs`, and `ai_provider/*` — current app-data, env, spawn, sidecar, and redaction behavior. [VERIFIED: codebase]
- `apps/server/cmd/server/main.go`, `apps/server/internal/config/config.go`, and their tests — packaged dotenv prohibition, validation, health-only degraded server, `/healthz`/`/readyz` contract. [VERIFIED: codebase]
- `12-CONTEXT.md` — locked scope, precedence, security, UAT and evidence decisions. [CITED: 12-CONTEXT.md]

### Secondary (MEDIUM confidence)
- https://v2.tauri.app/develop/resources/ — bundled-resource placement and official resolver APIs. [CITED: https://v2.tauri.app/develop/resources/]
- https://v2.tauri.app/develop/sidecar/ — external binary target-triple naming and sidecar bundle behavior. [CITED: https://v2.tauri.app/develop/sidecar/]

### Tertiary (LOW confidence)
- None beyond A1/A2 in the Assumptions Log.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all recommended components are existing, versioned project dependencies; no package recommendation.
- Architecture: HIGH — driven by locked decisions and current code seams.
- Pitfalls: HIGH — derived from current wrapper-first docs/env merging and locked direct-launch constraints.

**Research date:** 2026-07-16  
**Valid until:** 2026-08-15 (recheck Tauri documentation only if dependency versions or bundle layout changes)

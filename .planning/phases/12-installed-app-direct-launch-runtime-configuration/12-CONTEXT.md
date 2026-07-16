# Phase 12: Installed App Direct Launch Runtime Configuration - Context

**Gathered:** 2026-07-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 12 makes the installed Paladin app launch directly from system launcher entry points without a repository wrapper, while configuring the optional Go business sidecar through persistent app data. Missing Go configuration or dependencies must produce actionable degraded readiness without blocking the Agent or desktop UI. This phase does not bundle PostgreSQL/Redis, make Go a prerequisite for AI chat, or complete Windows/Linux manual installed-app UAT.

</domain>

<decisions>
## Implementation Decisions

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

### Folded Todos
- `installed-app-direct-launch-runtime-config.md` — Original direct-launch requirement. Its wrapper independence, Go configuration, degraded readiness, launcher, and documentation goals are fully folded into this phase.

### the agent's Discretion
- Choose exact DTOs, command names, file names, and masked fingerprint format while preserving Rust/Tauri ownership, write-only secrets, and no secret leakage.
- Choose the exact test harnesses and platform-specific launcher simulation details while meeting the locked evidence standard.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Scope and Prior Decisions
- `.planning/ROADMAP.md` — Phase 12 goal, expected behavior, acceptance draft, and architecture notes.
- `.planning/REQUIREMENTS.md` — Desktop, sidecar, packaging, Go business-service, and out-of-scope context.
- `.planning/STATE.md` — Current phase, existing runtime constraints, packaging decisions, and direct-launch motivation.
- `.planning/todos/pending/installed-app-direct-launch-runtime-config.md` — Folded source todo and original problem statement.
- `.planning/phases/11-desktop-ai-provider-configuration/11-CONTEXT.md` — Desktop app-data authority, bootstrap conventions, redaction, and AI-vs-Go readiness separation.
- `.planning/phases/10-packaging/10-CONTEXT.md` — Packaged resource boundary, sidecar ownership, explicit environment forwarding, and Go-degraded semantics.
- `.planning/phases/10.1-macos-linux-packaging-workflows/10.1-CONTEXT.md` — macOS/Linux packaging buildability versus installed-app UAT/release-readiness terminology.
- `.planning/phases/07.4-sidecar-runtime-mode/07.4-CONTEXT.md` — Runtime mode and sidecar ownership/health model.

### Active Runtime and Configuration Surfaces
- `apps/desktop/src-tauri/src/process/supervisor.rs` — Sidecar spawning, allowlisted environment forwarding, runtime config, readiness diagnostics, and ownership lifecycle.
- `apps/desktop/src-tauri/src/process/commands.rs` — Existing Tauri runtime/config command pattern.
- `apps/desktop/src-tauri/src/ai_provider/storage.rs` — App-data configuration manager, serialized writes, JSON persistence, and masking pattern to reuse for Go configuration.
- `apps/desktop/src-tauri/src/ai_provider/mod.rs` — Tauri command and manager-integration pattern.
- `apps/desktop/src-tauri/src/process/log_redact.rs` — Secret-redaction boundary to extend for Go configuration values.
- `apps/desktop/src-tauri/src/process/state_machine.rs` — Process state/owner/health tuple semantics.
- `apps/server/cmd/server/main.go` — Go config validation, degraded startup, `/healthz`, and `/readyz` diagnostic output.
- `apps/server/cmd/server/main_test.go` — Packaged-mode dotenv prohibition and dev-mode convenience tests.
- `apps/server/.env.example` — Existing Go configuration names and validation expectations.

### Launch, Documentation, and Evidence Surfaces
- `scripts/launch-paladin-macos.sh` — Wrapper that must remain diagnostic/UAT-only, not normal installed-app dependency.
- `scripts/test-launch-paladin-macos.sh` — Existing launch-wrapper test harness to preserve for explicit UAT overrides.
- `README.md` — Current incorrect wrapper-first installed-app instructions and Go readiness troubleshooting to correct.
- `docs/packaging.md` — Packaging terminology and release-readiness documentation to make honest.
- `docs/supervisor-startup-chain.md` — Current Agent/Go startup and degraded-readiness behavior.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `AiProviderConfigManager`: app-data paths, write serialization, persisted metadata/secrets separation, masked readback, bootstrap, and tests establish the closest reusable configuration pattern.
- `ProcessSupervisor`: already validates runtime mode, clears inherited environments, forwards only allowlisted values, starts packaged sidecars, and probes readiness.
- `RuntimeStatusTuple`, process status events, and `ProcessLight`: reusable distinction between process liveness and readiness/degraded state.
- `RightPanel`: existing multi-view shell is the correct location for a dedicated Go service configuration view.
- `redact_log_line()`: pure redaction path and tests to extend for Go secrets.

### Established Patterns
- Rust/Tauri owns desktop runtime coordination and mutable app-data state; packaged resources are read-only inputs.
- Agent readiness is independent from Go readiness. Go can remain degraded while the Agent and UI continue.
- Packaged Go mode ignores repository dotenv; dev mode retains dotenv convenience.
- Sidecars receive only explicit allowlisted configuration after `env_clear`, so GUI launcher behavior must not rely on inherited interactive-shell values.

### Integration Points
- Add a Go configuration manager/commands next to the AI provider configuration manager and connect it to `ProcessSupervisor` environment construction.
- Extend the right panel and status/diagnostic surfaces with Go configuration entry, source/status visibility, test/retry, and field-specific failure guidance.
- Update Go startup/config loading to accept the desktop-owned resolved session values while keeping packaged dotenv disabled.
- Extend direct-launch and configuration tests across Rust, frontend, Go, scripts, release packaging checks, and secret scans.

</code_context>

<specifics>
## Specific Ideas

- Go is optional enhancement for auth, RBAC, audit, quota, and WebSocket features; it must not prevent AI chat from starting.
- Direct-launch diagnostics must distinguish AI provider state from Go DB/Redis/JWT configuration, sidecar failure, port conflict, and health/readiness failure.
- Product language must distinguish buildability, automated direct-launch verification, completed manual installed-app UAT, and release-ready status.

</specifics>

<deferred>
## Deferred Ideas

- Integrating OS Keychain/Credential Manager/Secret Service or an encrypted vault for Go secrets — security-hardening phase.
- Bundling, automatically installing, or making PostgreSQL/Redis mandatory for local desktop operation — outside this optional Go-service phase.
- Windows Start Menu/Explorer and Linux AppImage/.desktop/deb manual installed-app UAT — platform-environment todo; do not claim release-ready before completion.

### Reviewed Todos (not folded)
- `refactor-app-tsx-layout.md` — chat/workspace layout work, unrelated to installed-app runtime configuration.
- `integrate-conversation-list.md` — conversation-sidebar feature, unrelated to this phase.
- `implement-resizable-sidebar.md` — sidebar ergonomics work, unrelated to this phase.

</deferred>

---

*Phase: 12-installed-app-direct-launch-runtime-configuration*
*Context gathered: 2026-07-16*

# Phase 10: Packaging - Context

**Gathered:** 2026-07-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 10 delivers distributable macOS and Windows desktop installers for Paladin. The installed app must launch with bundled Python Agent and Go Server sidecars, close the deferred packaged/platform UAT from Phase 07.3 and Phase 07.4, keep packaged sidecar logs bounded, and document first-run expectations for users.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `10-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `10-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- macOS `.dmg` build and installed-app UAT.
- Windows `.msi` build and installed-app UAT.
- PyInstaller-based Python Agent sidecar executable named `paladin-agent-sidecar`.
- Go Server sidecar executable named `paladin-server-sidecar`.
- Packaged-mode process supervision using real sidecar binaries rather than dev commands.
- UAT closure for 07.3/07.4 packaged and cross-platform deferred items on macOS and Windows.
- Log rotation for packaged sidecar logs.
- User installation and first-run documentation.

**Out of scope (from SPEC.md):**
- Code signing, notarization, and auto-update distribution.
- Public release hosting or update channels.
- Linux as a blocking packaging target.
- Replacing the existing `cmd: string[]` process config schema.
- Reworking Agent or Go Server product behavior beyond what is needed for packaged startup.
- Desktop admin UI for Phase 9 systems.

</spec_lock>

<decisions>
## Implementation Decisions

### Sidecar Bundle Layout
- **D-01:** Use the Tauri `externalBin` style or an equivalent bundled-resource layout for the packaged sidecars.
- **D-02:** Build artifacts must use the locked executable names `paladin-agent-sidecar` and `paladin-server-sidecar`; packaged Rust runtime should resolve them from the installed app resource or sidecar location rather than from source-tree paths.
- **D-03:** The packaged runtime must remain supervisor-owned and must not use dev PATH augmentation, `uv`, `go`, repo-relative cwd, or a login shell.

### Build Chain
- **D-04:** Provide one release-oriented orchestration path that runs PyInstaller, Go build, and Tauri build in sequence.
- **D-05:** Expose that orchestration through the existing package-manager entrypoint pattern so contributors can run a single documented command rather than manually stitching subproject commands together.
- **D-06:** The build chain should produce or verify both sidecar binaries before invoking the Tauri installer build; missing sidecars should fail the build early.

### Packaged Process Config
- **D-07:** Keep the existing dev `apps/desktop/src-tauri/processes.json` for development.
- **D-08:** Add or generate a packaged process config for the bundle. The schema remains the existing `cmd: string[]`; do not introduce `dev_cmd`, `packaged_cmd`, or a replacement binary field.
- **D-09:** The packaged config should be included in the installed app bundle and loaded by packaged runtime. Rust validation must continue rejecting `uv`, `go`, and repo-relative dev cwd values.

### Installed UAT
- **D-10:** macOS and Windows both require real installed-app UAT: build installer, install app, launch installed app, and record Agent/Server sidecar behavior.
- **D-11:** PostgreSQL and Redis are UAT prerequisites for the passing Go `/readyz` path. The UAT record must also cover the unavailable-dependencies path where Go is degraded but Agent startup remains usable.
- **D-12:** Podman/local services are acceptable as the documented PG/Redis setup for UAT. The important evidence is installed-app behavior, not the particular local dependency runner.
- **D-13:** Any platform without passing installed-app UAT must be documented as not release-ready for this phase.

### Packaged Log Rotation
- **D-14:** Implement the 10 MB x 5 retained-file policy inside the Rust supervisor log persistence path around `capture_lines`.
- **D-15:** Rotation must happen after line-level redaction and must preserve complete lines; no raw secrets, tokens, or environment values may appear in logs, UI diagnostics, or documentation examples.
- **D-16:** Rotation must not interrupt `process-log` event emission to the Logs panel. If file rotation fails, the existing "emit continues even when disk logging degrades" behavior should be preserved.

### Agent Discretion
- Planner may choose exact script filenames, output directories, and config generation mechanics as long as the decisions above and `10-SPEC.md` are satisfied.
- Planner may choose whether the packaged config is checked into source, generated from a template, or copied from a release config, provided the installed app loads packaged mode and validation covers both valid and invalid cases.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked Scope
- `.planning/phases/10-packaging/10-SPEC.md` - Locked Phase 10 requirements, acceptance criteria, boundaries, edge coverage, and prohibitions.
- `.planning/ROADMAP.md` - Phase 10 goal and PKG-01~03 roadmap scope.
- `.planning/REQUIREMENTS.md` - PKG-01 macOS package, PKG-02 Windows package, and PKG-03 documentation traceability.
- `.planning/STATE.md` - Current project state and deferred packaged/platform UAT items from Phase 07.3 and Phase 07.4.

### Prior Sidecar Decisions
- `.planning/notes/sidecar-runtime-mode.md` - Hybrid dev mode and packaged supervisor-owned sidecar direction.
- `.planning/phases/07.4-sidecar-runtime-mode/07.4-CONTEXT.md` - Runtime mode decisions: packaged mode is dev-tool-free, external processes are never killed, and packaged binaries remain Phase 10 scope.
- `.planning/phases/07.3-sidecar-process-management/07.3-CONTEXT.md` - Existing ProcessSupervisor, logging, status, and frontend process-management context.

### Active Implementation Surfaces
- `apps/desktop/src-tauri/tauri.conf.json` - Existing Tauri bundle configuration.
- `apps/desktop/src-tauri/processes.json` - Current dev process config.
- `apps/desktop/src-tauri/src/process/config.rs` - Process config schema and packaged validation.
- `apps/desktop/src-tauri/src/process/supervisor.rs` - Spawn path, runtime ownership, log capture, and process lifecycle behavior.
- `apps/desktop/src-tauri/src/process/log_redact.rs` - Existing log redaction utility.
- `apps/desktop/scripts/tauri-cli.mjs` - Existing package-script wrapper around Tauri CLI and dev sidecar cleanup.
- `apps/agent/pyproject.toml` - Agent package metadata and console scripts.
- `apps/agent/src/server/cli.py` - Agent HTTP server CLI entrypoint.
- `apps/server/go.mod` - Go module metadata.
- `apps/server/cmd/server/main.go` - Go Server executable entrypoint and readiness dependencies.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProcessConfig::load_from_path` and `ProcessConfig::validate` already load the `processes.json` schema and enforce runtime-mode constraints.
- Packaged validation tests already define accepted sidecar command shapes using `paladin-agent-sidecar` and `paladin-server-sidecar`.
- `ProcessSupervisor::spawn_child_to_slot` already centralizes command spawning, cwd resolution, env passing, stdout/stderr capture, health probing, and ownership state.
- `spawn_path_for_mode` already separates dev PATH augmentation from packaged runtime.
- `capture_lines` already emits live `process-log` events, redacts each line, appends to per-service logs, and degrades gracefully when file logging fails.
- `redact_log_line` and its tests cover API keys, JWT secrets, bearer tokens, password-like values, multiple secrets, JSON password forms, long lines, and case-insensitive matching.

### Established Patterns
- Rust owns the process URL truth source; frontend should continue consuming status/log events rather than hardcoding sidecar URLs.
- Process config commands remain argument arrays, not shell command strings.
- Packaged mode is supervisor-owned. Dev mode may attach external services, but packaged lifecycle actions must only target tracked child handles.
- Config load or validation failure is surfaced through the diagnostic fallback supervisor rather than hidden in stderr.
- Agent liveness gates the main workspace; Go readiness may degrade without blocking Agent startup.

### Integration Points
- `apps/desktop/src-tauri/tauri.conf.json` needs bundle/resource/sidecar configuration for packaged binaries and installers.
- `apps/desktop/package.json` and/or root `package.json` need a release command that orchestrates sidecar builds and Tauri packaging.
- `apps/agent` needs PyInstaller configuration or scripts to produce `paladin-agent-sidecar`.
- `apps/server` needs a release build target producing `paladin-server-sidecar`.
- `apps/desktop/src-tauri/src/lib.rs` currently loads `processes.json` from `CARGO_MANIFEST_DIR`; packaged runtime needs a bundle-aware config lookup.
- `apps/desktop/src-tauri/src/process/supervisor.rs` needs packaged path resolution and log rotation in or near `capture_lines`.
- Documentation should point users to app log locations, packaged config diagnostics, PG/Redis readiness expectations, and UAT status.

</code_context>

<specifics>
## Specific Ideas

- Prefer an `externalBin` style layout because Phase 07.4 already pointed packaged builds at Tauri sidecar/external binary patterns.
- Prefer a single release orchestration command so Phase 10 can produce repeatable artifacts and UAT evidence from one documented path.
- Keep development ergonomics intact by preserving the current dev `processes.json`; packaged behavior should be introduced through bundled/generated packaged config rather than by making dev config harder to use.
- Treat PG/Redis as readiness dependencies for Go Server, not as prerequisites for Agent startup.

</specifics>

<deferred>
## Deferred Ideas

None - discussion stayed within phase scope.

</deferred>

---

*Phase: 10-packaging*
*Context gathered: 2026-07-07*

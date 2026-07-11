# Phase 10: Packaging - Context

**Gathered:** 2026-07-11
**Status:** Ready for replanning

<domain>
## Phase Boundary

Phase 10 delivers a real installed macOS application with bundled Python Agent and Go Server sidecars, a Windows x64 `.msi` build proven on a native Windows CI runner, bounded packaged logs, and auditable installation/UAT documentation. macOS installed-app UAT is blocking; Windows installed-app UAT is deferred and Windows remains non-release-ready until that matrix is completed.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `10-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `10-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- macOS `.dmg` build, installation, and real installed-app UAT.
- Windows `.msi` build capability and auditable artifact status; real Windows UAT may be deferred.
- PyInstaller Agent sidecar and Go Server sidecar platform artifacts.
- Packaged config, installed-resource lookup, and supervisor-owned sidecar startup.
- Sidecar startup environment inheritance and missing-config diagnostics.
- macOS closure and Windows deferral records for Phase 07.3/07.4 packaged UAT.
- Packaged sidecar log rotation, redaction, and UI stream continuity.
- User installation, first-run, troubleshooting, and per-platform release-status documentation.

**Out of scope (from SPEC.md):**
- Real Windows installed-app UAT as a Phase 10 completion gate; it is deferred and Windows remains non-release-ready.
- A settings screen, config-file editor, or other new user configuration surface.
- Code signing, notarization, and auto-update.
- Public release hosting or update channels.
- Linux as a blocking packaging target.
- Replacing the existing `cmd: string[]` process config schema.
- Agent or Go Server product behavior unrelated to packaged startup.
- Phase 9 desktop admin UI.

</spec_lock>

<decisions>
## Implementation Decisions

### Sidecar Bundle and Build Chain
- **D-01:** Use Tauri `externalBin` or an equivalent bundled-resource layout. Logical executable names remain `paladin-agent-sidecar` and `paladin-server-sidecar`; runtime resolution must handle Tauri target-triple names and Windows `.exe` suffixes.
- **D-02:** Provide one release-oriented package-manager entry point that builds the PyInstaller Agent, Go Server, and Tauri installer in sequence. Missing sidecars or any `.env` file entering sidecar/bundle inputs fail the build before Tauri packaging.
- **D-03:** Preserve the existing dev `processes.json`. Add or generate a separate packaged config using the existing `cmd: string[]` schema and load it from installed resources.

### macOS Supported Launch Path
- **D-04:** Provide a supported macOS launch wrapper that reads configuration from its current process environment and directly launches the installed Paladin executable without persisting secrets.
- **D-05:** The wrapper is shared by first-run user documentation and macOS installed-app UAT so both paths exercise the same behavior.
- **D-06:** The wrapper defaults to `/Applications/Paladin.app` and accepts `--app <path>` for custom or temporary installed locations. It must not auto-search for another copy.
- **D-07:** The wrapper reports names of missing required variables but still starts Paladin; packaged application diagnostics remain the final truth source and can be tested in missing-config scenarios.
- **D-08:** Configuration values must not be accepted as CLI arguments. Secrets come only from the current environment; the non-secret `--app` path argument is allowed.

### Environment Forwarding and `.env` Boundary
- **D-09:** Sidecars receive an explicit business-configuration allowlist rather than the complete Paladin parent environment. Empty allowlisted values count as missing.
- **D-10:** In addition to business configuration, forward an explicit minimal system baseline needed for home/temp directories, locale, and TLS certificate discovery. Do not use an open-ended denylist.
- **D-11:** Dev mode preserves current `.env` convenience. Packaged mode completely disables Python `load_dotenv` and Go `godotenv` loading; packaged sidecars accept only supervisor-forwarded environment.
- **D-12:** Rust supervisor derives and forcibly injects `PALADIN_RUNTIME_MODE=packaged` from the validated process config. A same-named parent variable cannot override the internal runtime mode.
- **D-13:** Release input validation fails closed if any `.env` file would enter PyInstaller or Tauri bundle inputs; silently excluding or merely warning is insufficient.

### Windows Native Build Proof
- **D-14:** Use GitHub Actions `windows-latest` to run the real PyInstaller, Go, and Tauri/WiX chain and generate the `.msi`; macOS cross-compilation is not accepted as MSI proof.
- **D-15:** The Windows workflow supports manual dispatch and runs automatically on pull requests that change packaging-related files. It need not run for unrelated changes.
- **D-16:** Upload the `.msi` plus a non-secret build manifest containing commit SHA, runner OS, target architecture, sidecar and installer filenames, file sizes, and SHA-256 values. Do not upload the entire build directory.
- **D-17:** Phase 10 Windows support is limited to `x86_64-pc-windows-msvc`. Windows ARM64 is outside the current phase.
- **D-18:** A successful native Windows build proves artifact buildability only. Until real installed-app UAT is completed later, documentation must state Windows is unverified and non-release-ready.

### Installed-App UAT Evidence
- **D-19:** Use a human-readable Markdown UAT summary paired with structured JSON results. JSON is the machine-checkable record for scenario completeness and evidence references.
- **D-20:** Store necessary screenshots and short redacted log excerpts in a phase-local `evidence/` directory. JSON references them by relative path; installer binaries are never committed to Git.
- **D-21:** Every UAT scenario records date, tester, OS version and architecture, commit SHA, installer filename and SHA-256, install path, dependency scenario, Agent/Go states, PASS/FAIL result, and evidence paths.
- **D-22:** Retests append immutable attempt records instead of overwriting history. Per-platform release-ready status is derived only from the latest complete required matrix.
- **D-23:** macOS UAT covers PG+Redis both available, PostgreSQL missing, Redis missing, and both missing. Go may degrade in the latter three cases while Agent and the main workspace remain usable.

### Packaged Log Rotation
- **D-24:** Implement the 10 MB × 5 retained-file policy inside the Rust supervisor logging path around `capture_lines`, after line-level redaction and at complete-line boundaries.
- **D-25:** Rotation or disk-write failure must not interrupt redacted `process-log` event delivery to the Logs panel.

### the agent's Discretion
- Choose exact wrapper/build script filenames and output directories while preserving the supported behaviors above.
- Define the exact business allowlist and minimal system baseline from currently consumed Agent/Server variables; keep the lists explicit and tested.
- Choose packaged-config generation/copy mechanics and exact resource paths, provided installed lookup and validation are deterministic.
- Choose exact JSON field names/schema version, evidence filenames, and CI artifact retention period while retaining all D-16 and D-21 fields.
- Choose the focused test implementation for the three test-tier prohibitions in `10-SPEC.md`; tests must remain fail-closed and prove real negative behavior.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked Scope and Phase State
- `.planning/phases/10-packaging/10-SPEC.md` — Locked requirements, boundaries, acceptance criteria, edge coverage, and prohibitions; MUST read before planning.
- `.planning/ROADMAP.md` — Phase 10 PKG-01 through PKG-03 goal and milestone placement.
- `.planning/REQUIREMENTS.md` — Packaging requirement traceability.
- `.planning/STATE.md` — Deferred packaged/platform UAT and current milestone status.

### Prior Runtime and UI Decisions
- `.planning/notes/sidecar-runtime-mode.md` — Hybrid dev runtime and packaged supervisor-owned direction.
- `.planning/phases/07.4-sidecar-runtime-mode/07.4-CONTEXT.md` — Strict packaged mode, ownership safety, readiness, and UI diagnostic semantics.
- `.planning/phases/07.3-sidecar-process-management/07.3-CONTEXT.md` — ProcessSupervisor lifecycle, logging, and deferred UAT decisions.
- `.planning/phases/10-packaging/10-UI-SPEC.md` — Existing packaged startup, degraded-state, LogsPanel, and release-honesty UI contract.

### Active Implementation Surfaces
- `apps/desktop/src-tauri/tauri.conf.json` — Tauri bundle configuration and future external binary/resource wiring.
- `apps/desktop/src-tauri/processes.json` — Existing dev configuration that must remain intact.
- `apps/desktop/src-tauri/src/process/config.rs` — Runtime mode parsing and packaged command/cwd validation.
- `apps/desktop/src-tauri/src/process/supervisor.rs` — Environment forwarding, executable/cwd resolution, ownership, health probes, and log capture.
- `apps/desktop/src-tauri/src/process/log_redact.rs` — Existing line-level secret redaction.
- `apps/desktop/src-tauri/src/lib.rs` — Current source-tree config lookup and Tauri setup integration.
- `apps/desktop/scripts/tauri-cli.mjs` — Existing package-manager/Tauri wrapper pattern.
- `apps/agent/pyproject.toml` — Agent dependencies and console entry points.
- `apps/agent/src/server/cli.py` — Current Python `.env` loading and server entry point.
- `apps/server/cmd/server/main.go` — Go server startup and current `.env` load call.
- `apps/server/internal/config/config.go` — Required Go environment variables and validation.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProcessConfig::load_from_path`, `validate`, and `runtime_mode`: packaged config loading and strict no-dev-command boundary.
- `ProcessSupervisor::spawn_child_to_slot`: central integration point for executable resolution, explicit environment forwarding, lifecycle ownership, and log tasks.
- `spawn_path_for_mode`: already prevents dev PATH augmentation in packaged mode.
- `capture_lines` and `redact_log_line`: existing emit-first/redacted-line path to extend with bounded rotation.
- Existing packaged config tests: already accept locked sidecar logical names and reject `uv`, `go`, and repo-relative dev cwd values.

### Established Patterns
- Rust remains the process/runtime truth source; frontend consumes typed status/log events.
- Commands remain argv arrays and never pass through a shell.
- Packaged services are supervisor-owned; lifecycle operations only affect tracked child handles.
- Config failures surface through the diagnostic fallback supervisor rather than raw stderr alone.
- Agent availability gates the workspace; Go readiness degradation is non-blocking.
- Podman-first PostgreSQL/Redis setup is the established local integration-test convention.

### Integration Points
- Bundle config must add platform sidecars/resources and platform-specific target names.
- Tauri setup must select dev vs installed resource config without `CARGO_MANIFEST_DIR` assumptions.
- Rust process spawning must replace implicit full-environment inheritance with explicit allowlists and force the internal runtime mode marker.
- Python and Go startup must gate `.env` loading on runtime mode.
- Release orchestration must build/validate sidecars before Tauri and reject bundled `.env` files.
- A Windows-native workflow must execute the same release entry point and emit the manifest.
- Phase-local UAT summary, JSON, and `evidence/` files must describe macOS results and Windows deferral honestly.

</code_context>

<specifics>
## Specific Ideas

- The supported macOS user path and UAT path must be identical; the wrapper is not merely a developer helper.
- Missing configuration is intentionally allowed to reach the installed app so its redacted diagnostics can be verified.
- Buildability, installed behavior, and release-ready status are three separate facts and must never be collapsed.
- UAT history should show failure-to-fix progression rather than presenting only the latest green result.

</specifics>

<deferred>
## Deferred Ideas

- Windows real installed-app UAT — deferred until a Windows environment is available; Windows remains non-release-ready.
- Windows ARM64 packaging — outside the Phase 10 x64 target.

### Reviewed Todos (not folded)
- `Implement Resizable CopilotSidebar` — weak keyword-only match; unrelated to packaging and already belongs to chat/sidebar work.
- `Integrate Conversation List into CopilotSidebar` — weak keyword-only match; unrelated to packaging.
- `Refactor App.tsx to separate workspace and chat sidebar` — weak keyword-only match; unrelated to packaging.

</deferred>

---

*Phase: 10-packaging*
*Context gathered: 2026-07-11*

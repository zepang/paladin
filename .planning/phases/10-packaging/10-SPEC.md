# Phase 10: Packaging - Specification

**Created:** 2026-07-07
**Ambiguity score:** 0.15 (gate: <= 0.20)
**Requirements:** 6 locked

## Goal

Paladin produces installable macOS and Windows desktop packages that launch the app with bundled Agent and Go Server sidecars, verify real packaged startup behavior, and provide first-run user documentation.

## Background

Paladin currently has a working Tauri desktop app, a Python Agent served by `uv run paladin-agent serve --dev`, and a Go Server served by `go run ./cmd/server`. Phase 07.3 added a Rust `ProcessSupervisor` driven by `apps/desktop/src-tauri/processes.json`; Phase 07.4 added dev attach/spawn/conflict semantics and packaged-mode validation that rejects dev commands such as `uv` and `go` and repo-relative dev working directories.

The current `processes.json` is still `mode: "dev"` and uses development commands. `apps/desktop/src-tauri/tauri.conf.json` enables Tauri bundling, but no Phase 10 packaging spec, packaged sidecar binary production, installer UAT, or user installation documentation exists yet. Prior 07.3/07.4 UAT explicitly deferred real packaged and cross-platform validation to Phase 10.

## Requirements

1. **macOS installer**: Produce a macOS `.dmg` installer for the Paladin desktop app.
   - Current: Tauri bundle config exists, but no Phase 10 `.dmg` artifact or installed-app UAT is recorded.
   - Target: A `.dmg` can be built from the repo and installed on macOS without requiring development commands at runtime.
   - Acceptance: Installing the `.dmg` and launching Paladin starts the packaged app without requiring `pnpm`, `cargo`, `uv`, `go run`, or a repo checkout.

2. **Windows installer**: Produce a Windows `.msi` installer for the Paladin desktop app.
   - Current: Tauri bundle config targets all platforms, but no `.msi` artifact or Windows installed-app UAT is recorded.
   - Target: An `.msi` can be built from the repo and installed on Windows without requiring development commands at runtime.
   - Acceptance: Installing the `.msi` and launching Paladin starts the packaged app without requiring `pnpm`, `cargo`, `uv`, `go run`, or a repo checkout.

3. **Packaged sidecar binaries**: Package the Python Agent and Go Server as real sidecar executables for packaged supervision.
   - Current: Agent runs via `uv`; Go Server runs via `go run`; packaged config validation rejects those commands but real packaged binaries are not produced.
   - Target: The Python Agent is frozen with PyInstaller into `paladin-agent-sidecar`, the Go Server is compiled into `paladin-server-sidecar`, and packaged supervision starts those binaries.
   - Acceptance: Packaged runtime validation rejects `uv`, `go`, and repo-relative dev `cwd` values, while a packaged config using `paladin-agent-sidecar` and `paladin-server-sidecar` passes validation and launches both services.

4. **Installed sidecar UAT**: Verify installed macOS and Windows builds run the bundled sidecars correctly.
   - Current: Automated Rust/frontend gates pass, but manual packaged/installer UAT from 07.3/07.4 remains deferred.
   - Target: On installed macOS and Windows builds, the supervisor starts Agent and Go sidecars, Agent liveness passes, Go liveness passes, and Go readiness passes when PostgreSQL and Redis are available.
   - Acceptance: UAT records show Agent liveness green, Go `/healthz` green, Go `/readyz` green with PostgreSQL/Redis available, and Go degraded but non-blocking when PostgreSQL/Redis are unavailable.

5. **Bounded packaged logs**: Keep sidecar log persistence redacted and bounded in packaged sessions.
   - Current: Logs are redacted and written to the app log directory, but Phase 07.3 explicitly deferred rotation/compression and long-running hardening to Phase 10.
   - Target: Packaged sidecar logs rotate at 10 MB per file with 5 retained files per service, preserving full log lines and keeping the UI log stream usable during rotation.
   - Acceptance: Long-running log output never grows beyond 5 retained 10 MB files per service, redaction still applies, no complete log line is split or lost during rotation, and the Logs panel continues receiving new lines.

6. **User first-run documentation**: Document installation and first-run expectations for users.
   - Current: README files exist, but no Phase 10 user-facing installation and packaged sidecar troubleshooting guide exists.
   - Target: User documentation explains macOS and Windows installation, first launch, sidecar startup expectations, PostgreSQL/Redis readiness expectations, log locations, and common startup/config failures.
   - Acceptance: README or linked docs contain pass/fail-verifiable sections for macOS install, Windows install, first launch, PG/Redis readiness, log location, sidecar startup failure, packaged config failure, and where to find UAT status.

## Boundaries

**In scope:**
- macOS `.dmg` build and installed-app UAT.
- Windows `.msi` build and installed-app UAT.
- PyInstaller-based Python Agent sidecar executable named `paladin-agent-sidecar`.
- Go Server sidecar executable named `paladin-server-sidecar`.
- Packaged-mode process supervision using real sidecar binaries rather than dev commands.
- UAT closure for 07.3/07.4 packaged and cross-platform deferred items on macOS and Windows.
- Log rotation for packaged sidecar logs.
- User installation and first-run documentation.

**Out of scope:**
- Code signing, notarization, and auto-update distribution - excluded from v1 local packaging scope.
- Public release hosting or update channels - installer artifacts are sufficient for this phase.
- Linux as a blocking packaging target - Linux may be documented or recorded as non-blocking, but PKG-01/PKG-02 are macOS and Windows.
- Replacing the existing `cmd: string[]` process config schema - prior phases intentionally preserved this schema.
- Reworking Agent or Go Server product behavior beyond what is needed for packaged startup.
- Desktop admin UI for Phase 9 systems - Phase 9 explicitly kept desktop admin out of scope.

## Constraints

- Packaged runtime must not require `pnpm`, `cargo`, `uv`, `go run`, a login-shell PATH, or a source checkout after installation.
- Python Agent packaging is locked to PyInstaller for this phase.
- Go Server must be compiled as a platform executable and launched as a sidecar.
- Packaged process validation must continue rejecting `uv`, `go`, and repo-relative dev `cwd` values.
- macOS and Windows are blocking validation targets; Linux is non-blocking.
- PostgreSQL and Redis are required for the passing Go `/readyz` UAT path; without them Go may be degraded but must not block Agent startup.
- Sidecar log rotation limit is 10 MB x 5 retained files per service.

## Acceptance Criteria

- [ ] A macOS `.dmg` artifact is generated from the repo.
- [ ] The installed macOS app launches without `pnpm`, `cargo`, `uv`, `go run`, or a repo checkout.
- [ ] A Windows `.msi` artifact is generated from the repo.
- [ ] The installed Windows app launches without `pnpm`, `cargo`, `uv`, `go run`, or a repo checkout.
- [ ] PyInstaller produces a packaged Agent executable named `paladin-agent-sidecar`.
- [ ] Go build produces a packaged Server executable named `paladin-server-sidecar`.
- [ ] Packaged config validation rejects `uv`, `go`, and repo-relative dev `cwd` values.
- [ ] Packaged config using the sidecar binary names passes validation.
- [ ] Installed macOS UAT records Agent liveness pass and Go liveness pass.
- [ ] Installed Windows UAT records Agent liveness pass and Go liveness pass.
- [ ] With PostgreSQL and Redis available, installed macOS and Windows UAT record Go `/readyz` pass.
- [ ] Without PostgreSQL or Redis, Go is shown as degraded and does not block Agent startup.
- [ ] Sidecar logs rotate at 10 MB x 5 retained files per service.
- [ ] Log redaction remains active after rotation.
- [ ] Log rotation does not split or lose complete log lines and does not interrupt the Logs panel stream.
- [ ] User documentation covers macOS install, Windows install, first launch, PG/Redis readiness, log locations, common sidecar/config errors, and UAT status.
- [ ] Any platform that does not pass UAT is explicitly marked not release-ready in the documentation and phase output.
- [ ] Packaged logs, UI diagnostics, and documentation examples do not expose raw secrets, tokens, or environment values.
- [ ] Packaged stop/restart/shutdown only affects supervisor-owned child processes and does not kill user-managed external processes by port or process name.

## Edge Coverage

**Coverage:** 8/8 applicable edges resolved - 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | R1 | resolved / explicit | AC: macOS installed app launches without `pnpm`, `cargo`, `uv`, `go run`, or repo checkout. |
| unclassified | R2 | resolved / explicit | AC: Windows installed app launches without `pnpm`, `cargo`, `uv`, `go run`, or repo checkout. |
| unclassified | R3 | resolved / explicit | AC: named sidecar binaries exist and packaged validation rejects dev commands and repo-relative cwd. |
| unclassified | R4 | resolved / explicit | AC: PG/Redis available path passes `/readyz`; unavailable path is degraded but non-blocking. |
| boundary | R5 | resolved / explicit | AC: each service keeps at most 5 log files of 10 MB each. |
| precision | R5 | resolved / explicit | AC: rotation preserves complete log lines and redaction remains active. |
| concurrency | R5 | resolved / explicit | AC: rotation does not interrupt the live Logs panel stream. |
| unclassified | R6 | resolved / explicit | AC: user docs cover install, first launch, readiness, logs, common failures, and UAT status. |

## Prohibitions (must-NOT)

**Coverage:** 3/3 applicable prohibitions resolved - 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT mark a dev-only or failed-UAT package as release-ready; any platform with missing or failed UAT must be explicitly marked not release-ready. | R1/R2/R4/R6 | resolved | verification: judgment |
| MUST NOT expose raw secrets, tokens, or environment values in packaged logs, UI diagnostics, or documentation examples. | R5/R6 | resolved | verification: test |
| MUST NOT stop, restart, or shut down user-managed external processes by matching ports or process names; packaged lifecycle actions may only target supervisor-owned child handles. | R4 | resolved | verification: test |

## Ambiguity Report

| Dimension          | Score | Min   | Status | Notes |
|--------------------|-------|-------|--------|-------|
| Goal Clarity       | 0.92  | 0.75  | met    | Installer, sidecar, UAT, and documentation outputs are measurable. |
| Boundary Clarity   | 0.84  | 0.70  | met    | Signing/notarization/auto-update/Linux blocking scope explicitly excluded. |
| Constraint Clarity | 0.82  | 0.65  | met    | PyInstaller, packaged no-dev-deps, PG/Redis readiness, and log limits are locked. |
| Acceptance Criteria| 0.80  | 0.70  | met    | 19 pass/fail criteria cover artifacts, runtime, logs, docs, and prohibitions. |
| **Ambiguity**      | 0.15  | <=0.20| met    | Gate passed after round 4. |

Status: met = dimension meets minimum.

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 1 | Researcher | Final deliverable, sidecar strategy, platform scope | Deliver installable macOS/Windows packages with bundled runnable sidecars; Linux is non-blocking. |
| 2 | Researcher + Simplifier | Python freezing, PG/Redis readiness, documentation scope | Lock Python packaging to a real binary path, require PG/Redis UAT for `/readyz`, and deliver user install/first-run docs. |
| 3 | Boundary Keeper | Freezing tool, exclusions, final evidence | Use PyInstaller, exclude signing/notarization/auto-update, require `.dmg`/`.msi` plus installed sidecar UAT evidence. |
| 4 | Failure Analyst | Critical failure, packaged config validation, log rotation | Sidecar startup failure is blocking; Rust validation rejects dev config; log rotation is required. |
| Edge Probe | Completeness | Packaging, sidecar, runtime, log, and docs edges | All raised edges resolved as explicit acceptance criteria. |
| Prohibition Probe | Must-NOT | Release honesty, secret exposure, external process safety | Three bespoke prohibitions retained and resolved. |

---

*Phase: 10-packaging*
*Spec created: 2026-07-07*
*Next step: $gsd-discuss-phase 10 - implementation decisions (how to build what's specified above)*

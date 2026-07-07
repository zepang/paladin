---
phase: 10
slug: packaging
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-07
---

# Phase 10 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test`, Node/Vitest, shell build probes, manual installed-app UAT |
| **Config file** | `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/package.json`, root `package.json` |
| **Quick run command** | `cd apps/desktop/src-tauri && cargo test process:: --lib` |
| **Full suite command** | `pnpm --filter @paladin/desktop test && cd apps/desktop/src-tauri && cargo test && cargo clippy --all-targets -- -D warnings` |
| **Estimated runtime** | ~180 seconds excluding installer builds and manual UAT |

---

## Sampling Rate

- **After every task commit:** Run the fastest relevant automated command for the touched surface:
  - Rust process/config/logging changes: `cd apps/desktop/src-tauri && cargo test process:: --lib`
  - Desktop frontend/process UI changes: `pnpm --filter @paladin/desktop test`
  - Release script changes: run the script's dry-run/help/fixture verification if provided by the plan.
- **After every plan wave:** Run `pnpm --filter @paladin/desktop test && cd apps/desktop/src-tauri && cargo test`.
- **Before `$gsd-verify-work`:** Full automated suite must be green and manual installed-app UAT status must be recorded.
- **Max feedback latency:** 10 minutes for automated checks; manual macOS/Windows installed UAT is explicitly outside the quick loop.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 10-W0-01 | Wave 0 | 0 | PKG-01~03 | — | Establish release/UAT evidence locations before implementation | source | `test -f .planning/phases/10-packaging/10-VALIDATION.md` | ✅ | ⬜ pending |
| 10-PKG-01 | TBD | TBD | PKG-01 | T-10-packaging-artifact | macOS installer must not depend on dev commands after install | build + manual UAT | `pnpm --filter @paladin/desktop tauri build -- --bundles dmg` or final release command | ❌ W0 | ⬜ pending |
| 10-PKG-02 | TBD | TBD | PKG-02 | T-10-packaging-artifact | Windows installer must not depend on dev commands after install | build + manual UAT | Windows release command producing `.msi` | ❌ W0 | ⬜ pending |
| 10-SDC-01 | TBD | TBD | PKG-01~03 | T-10-sidecar-path | Packaged config rejects dev tools and resolves sidecars from bundle/install context | unit | `cd apps/desktop/src-tauri && cargo test process::config --lib` | ❌ W0 | ⬜ pending |
| 10-SDC-02 | TBD | TBD | PKG-01~03 | T-10-process-control | Packaged stop/restart/shutdown only affects supervisor-owned child handles | unit | `cd apps/desktop/src-tauri && cargo test process:: --lib` | ❌ W0 | ⬜ pending |
| 10-LOG-01 | TBD | TBD | PKG-03 | T-10-secret-log | Log rotation preserves redaction and complete lines | unit | `cd apps/desktop/src-tauri && cargo test process:: --lib log -- --nocapture` | ❌ W0 | ⬜ pending |
| 10-UAT-01 | TBD | TBD | PKG-01~03 | T-10-release-honesty | UAT docs truthfully mark unverified platforms not release-ready | manual + source | `rg -n "not release-ready|UAT|macOS|Windows" README.md docs .planning/phases/10-packaging` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] Planner must create exact plan IDs and replace `TBD` rows above with final task/plan references.
- [ ] Planner must add or identify automated tests for packaged config lookup, packaged sidecar path resolution, and 10 MB x 5 log rotation.
- [ ] Planner must define the release command(s) that prove `.dmg` and `.msi` artifacts exist.
- [ ] Planner must define a phase-local UAT evidence artifact for installed macOS/Windows runs, including PG/Redis available and unavailable paths.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Installed macOS `.dmg` launch | PKG-01, PKG-03 | Requires installed app outside repo and host OS installer behavior | Install `.dmg`, launch Paladin, confirm no `pnpm`/`cargo`/`uv`/`go run`/repo checkout required, record Agent `/health`, Go `/healthz`, and Go `/readyz` with PG/Redis up. |
| Installed Windows `.msi` launch | PKG-02, PKG-03 | Requires Windows installer and installed app behavior | Install `.msi`, launch Paladin, confirm no dev commands or repo checkout required, record Agent `/health`, Go `/healthz`, and Go `/readyz` with PG/Redis up. |
| Degraded dependency path | PKG-03 | Requires toggling PG/Redis availability in installed environment | Launch installed app with PG/Redis unavailable, record Agent remains usable and Go is degraded/non-blocking. |
| Release honesty | PKG-03 | Requires comparing actual UAT evidence to docs | Verify README/docs/phase output mark any missing or failed platform UAT as not release-ready. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all MISSING references.
- [ ] No watch-mode flags.
- [ ] Feedback latency < 10 minutes for automated checks.
- [ ] Manual installed-app UAT status is recorded for macOS and Windows.
- [ ] `nyquist_compliant: true` set in frontmatter after all validation rows are green or explicitly manual-complete.

**Approval:** pending

---
phase: 12
slug: installed-app-direct-launch-runtime-configuration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-16
---

# Phase 12 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Rust `cargo test --lib`, Vitest, Go `go test`, Python `pytest` |
| **Config file** | Existing workspace package/test configuration |
| **Quick run command** | `cd apps/desktop/src-tauri && cargo test --lib go_service:: process::` plus focused desktop Vitest and `cd apps/server && go test ./...` |
| **Full suite command** | Phase 10/11 desktop, Rust, Go, Agent, release and secret-scan gates |
| **Estimated runtime** | ~180 seconds for focused gates; platform UAT is separate |

## Sampling Rate

- **After every task commit:** Run the changed tier's focused test plus a secret-sentinel assertion.
- **After every plan wave:** Run Rust library tests, focused Vitest, Go tests, and the affected harness/script test.
- **Before `$gsd-verify-work`:** Run the full existing suites; complete macOS Finder evidence and record Windows/Linux automation status.
- **Max feedback latency:** 180 seconds for automated checks.

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 12-01-01 | TBD | 1 | Go config persistence | T-12-01 | Secrets are write-only and masked on readback | Rust unit/command | `cargo test --lib go_service::` | ❌ W0 | ⬜ pending |
| 12-01-02 | TBD | 1 | Runtime precedence | T-12-02 | Normal launch ignores parent secret env; marker-bound override stays nonpersistent | Rust unit | `cargo test --lib process::` | ❌ W0 | ⬜ pending |
| 12-02-01 | TBD | 2 | Go readiness diagnosis | T-12-03 | Missing/invalid config and dependency outage are field-specific and never expose values | Rust + Go | `cargo test --lib && cd ../../../server && go test ./...` | ❌ W0 | ⬜ pending |
| 12-02-02 | TBD | 2 | Desktop configuration UX | T-12-01 | Inputs are write-only; UI separates Agent availability from Go degradation | Vitest | `pnpm --filter @paladin/desktop test --run` | ❌ W0 | ⬜ pending |
| 12-03-01 | TBD | 3 | Installed-app direct launch | T-12-04 | Packaged launcher and evidence remain secret-free; non-macOS status is explicit | script + manual UAT | release scanner plus platform harness | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

## Wave 0 Requirements

- [ ] Rust Go-service manager tests for complete-set validation, serialized save, masked readback, clear/import provenance, and override precedence.
- [ ] Supervisor-environment tests proving persisted values replace parent values in normal mode and session overrides require an explicit marker.
- [ ] Go readiness tests for field-only missing/invalid diagnostics without secret reflection.
- [ ] Vitest store/panel tests for write-only inputs, masked display, save/test separation, import/clear CTAs, and Agent-vs-Go status separation.
- [ ] Secret-free evidence scanner, macOS Finder UAT recorder, and Windows/Linux clean-environment automation harnesses.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| macOS Finder direct launch | Installed application behavior | Finder interaction and signed DMG install cannot be fully inferred from repository tests | Install the produced DMG, double-click the app in Finder, execute the three locked scenarios, and attach structured secret-free evidence. |
| Windows Start Menu/Explorer and Linux AppImage/desktop/deb launch | Platform UAT | Target platform environments are not available locally | Run clean-environment automation where possible, complete manual launcher UAT on the target OS, and retain `release_ready=false` until the evidence is complete. |

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all missing references.
- [ ] No watch-mode flags.
- [ ] Feedback latency < 180s for automated checks.
- [ ] `nyquist_compliant: true` set in frontmatter.

**Approval:** pending

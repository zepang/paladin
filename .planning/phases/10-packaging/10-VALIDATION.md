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
| 10-PKG-01 | 10-02/T5, 10-05/T1, 10-05/T3 | 2, 5 | PKG-01 | T-10-packaging-artifact | macOS installer must not depend on dev commands after install | build + manual gate | `pnpm --filter @paladin/desktop exec node apps/desktop/scripts/tauri-cli.mjs release-installers --platform macos --out-dir apps/desktop/src-tauri/target/release/bundle && find apps/desktop/src-tauri/target/release/bundle/dmg -name '*.dmg' -print -quit \| grep -q .` | ✅ | ⬜ pending |
| 10-PKG-02 | 10-02/T5, 10-05/T1, 10-05/T3 | 2, 5 | PKG-02 | T-10-packaging-artifact | Windows installer must not depend on dev commands after install | build + manual gate | `pnpm --filter @paladin/desktop exec node apps/desktop/scripts/tauri-cli.mjs release-installers --platform windows --out-dir apps/desktop/src-tauri/target/release/bundle && find apps/desktop/src-tauri/target/release/bundle/msi -name '*.msi' -print -quit \| grep -q .` | ✅ | ⬜ pending |
| 10-SDC-01 | 10-01/T2, 10-01/T3, 10-02/T4, 10-03/T1, 10-03/T2 | 1, 2, 3 | PKG-01~03 | T-10-sidecar-path | Packaged config rejects dev tools and resolves sidecars from bundle/install context | build + unit | `pnpm --filter @paladin/desktop exec node apps/desktop/scripts/tauri-cli.mjs release-sidecars --platform current --verify-runtime-contract && cd apps/desktop/src-tauri && cargo test process::config --lib` | ✅ | ⬜ pending |
| 10-SDC-02 | 10-03/T1, 10-03/T2, 10-03/T4 | 3 | PKG-01~03 | T-10-process-control | Packaged stop/restart/shutdown only affects supervisor-owned child handles | unit | `cd apps/desktop/src-tauri && cargo test process::supervisor --lib` | ✅ | ⬜ pending |
| 10-LOG-01 | 10-03/T3, 10-03/T4 | 3 | PKG-03 | T-10-secret-log | Log rotation preserves redaction and complete lines | unit | `cd apps/desktop/src-tauri && cargo test process:: --lib log -- --nocapture` | ✅ | ⬜ pending |
| 10-UAT-PREREQ | 10-02/T4, 10-05/T2 | 2, 5 | PKG-01~03 | T-10-config-chain | Installed-app env/config/assets contract is explicit before UAT starts | manual gate + source | `10-UAT.md` prerequisite sections cover Agent API key, Go DB/Redis/JWT, runtime assets/config, and failure wording. | ✅ | ⬜ pending |
| 10-UAT-01 | 10-05/T3, 10-05/T4, 10-05/T5 | 5 | PKG-01~03 | T-10-release-honesty | UAT docs truthfully mark unverified platforms not release-ready | manual gate + source | `10-UAT.md` records the four platform/scenario runs, and README/docs repeat the same platform status truthfully. | ✅ | ⬜ pending |
| 10-CLOSE-01 | 10-05/T6 | 5 | PKG-01~03 | T-10-source-audit | Closure only after full source audit and dual-platform hard gate | source + audit | `rg -n "D-01\|D-02\|D-03\|D-04\|D-05\|D-06\|D-07\|D-08\|D-09\|D-10\|D-11\|D-12\|D-13\|D-14\|D-15\|D-16\|PKG-01\|PKG-02\|PKG-03\|Requirement 1\|Requirement 2\|Requirement 3\|Requirement 4\|Requirement 5\|Requirement 6\|R1\|R2\|R3\|R4\|R5\|R6\|MUST NOT\|release-ready\|not release-ready" .planning/phases/10-packaging/10-VERIFICATION.md .planning/phases/10-packaging/10-VALIDATION.md` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [x] Planner created exact plan IDs and replaced `TBD` rows above with final task/plan references.
- [ ] Planner must add or identify automated tests for packaged config lookup, packaged sidecar path resolution, and 10 MB x 5 log rotation.
- [ ] Planner must define the release command(s) that prove `.dmg` and `.msi` artifacts exist.
- [ ] Planner must define a phase-local UAT evidence artifact for installed macOS/Windows runs, including PG/Redis available and unavailable paths.
- [ ] Planner must define the installed-app env/config/assets prerequisite gate before manual UAT can start.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Installed-app prerequisite gate | PKG-01, PKG-02, PKG-03 | Requires human confirmation of env/config/assets on each OS before launch | Confirm `10-UAT.md` lists where macOS and Windows obtain `DEEPSEEK_API_KEY`, `PALADIN_DATABASE_URL`, `PALADIN_REDIS_URL`, `PALADIN_JWT_SECRET`, packaged Agent assets/config, and expected installed-app failure wording. This is a hard manual gate; file existence alone is insufficient. |
| Installed macOS `.dmg` launch | PKG-01, PKG-03 | Requires installed app outside repo and host OS installer behavior | Install `.dmg`, launch Paladin, confirm no `pnpm`/`cargo`/`uv`/`go run`/repo checkout required, record installer filename, OS version, Agent `/health`, Go `/healthz`, Go `/readyz` with PG/Redis up, and visible UI state. |
| Installed Windows `.msi` launch | PKG-02, PKG-03 | Requires Windows installer and installed app behavior | Install `.msi`, launch Paladin, confirm no dev commands or repo checkout required, record installer filename, OS version, Agent `/health`, Go `/healthz`, Go `/readyz` with PG/Redis up, and visible UI state. |
| Degraded dependency path | PKG-03 | Requires toggling PG/Redis availability in installed environment | Launch installed app with PG/Redis unavailable on both macOS and Windows, record Agent remains usable, Go is degraded/non-blocking, and `/readyz` result is captured. |
| Release honesty | PKG-03 | Requires comparing actual UAT evidence to docs | Verify README/docs/phase output mark any missing or failed platform UAT as not release-ready and do not claim closure before the dual-platform hard gate passes. |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies.
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify.
- [ ] Wave 0 covers all MISSING references.
- [ ] No watch-mode flags.
- [ ] Feedback latency < 10 minutes for automated checks.
- [ ] Manual prerequisite gate and installed-app UAT status are recorded for macOS and Windows.
- [ ] Dual-platform hard gate passed before source audit and closure.
- [ ] `wave_0_complete: true` set in frontmatter after all Wave 0 requirements are satisfied and validation rows are fully keyed.
- [ ] `nyquist_compliant: true` set in frontmatter after all validation rows are green or explicitly manual-complete and the Sign-Off checklist is fully checked.

**Approval:** pending

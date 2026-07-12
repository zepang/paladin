---
phase: 10-packaging
plan: "06"
subsystem: macos-installed-uat
tags: [macos, dmg, installed-app-uat, sidecar, degraded-mode, evidence]
status: complete
requires:
  - phase: 10-packaging
    plan: "09"
    provides: verified macOS DMG artifact and secret sentinel gate
provides:
  - supported env-only macOS launch wrapper
  - append-only macOS installed-app UAT record
  - four-scenario installed-app evidence for Agent and Go sidecars
  - macOS release-ready platform status after human confirmation
affects: [10-07, release-readiness, installed-app-uat]
tech-stack:
  added: []
  patterns: [env-only installed-app launch, append-only UAT attempts, command-log evidence, release-honesty status]
key-files:
  created:
    - scripts/launch-paladin-macos.sh
    - scripts/test-launch-paladin-macos.sh
    - .planning/phases/10-packaging/10-UAT.json
    - .planning/phases/10-packaging/10-UAT.md
    - .planning/phases/10-packaging/evidence/macos-uat-all-available-command-verified-2d5dcf7.md
    - .planning/phases/10-packaging/evidence/macos-uat-postgres-missing-command-verified-2d5dcf7.md
    - .planning/phases/10-packaging/evidence/macos-uat-redis-missing-command-verified-2d5dcf7.md
    - .planning/phases/10-packaging/evidence/macos-uat-both-missing-command-verified-2d5dcf7.md
  modified:
    - .planning/phases/10-packaging/evidence/macos-build.json
key-decisions:
  - "UAT uses the installed app copied from the verified DMG into a non-repository path."
  - "Secrets are provided only through the launched process environment; evidence records variable names and health states only."
  - "Windows remains buildability-only/deferred/non-release-ready even after macOS UAT passes."
patterns-established:
  - "Four-scenario macOS installed-app evidence records Agent /health, Go /healthz, Go /readyz, wrapper stderr, and redaction status."
requirements-completed: [PKG-01, PKG-02, PKG-03]
coverage:
  - id: D1
    description: "Supported macOS wrapper launches only a selected Paladin.app executable, inherits environment, rejects config CLI values, and prints missing variable names only."
    requirement: PKG-01
    verification:
      - kind: shell
        ref: "bash scripts/test-launch-paladin-macos.sh"
        status: pass
    human_judgment: false
  - id: D2
    description: "macOS installed app passes all_available, postgres_missing, redis_missing, and both_missing UAT scenarios from a non-repository install path."
    requirement: PKG-01
    verification:
      - kind: manual_procedural
        ref: ".planning/phases/10-packaging/10-UAT.json"
        status: pass
      - kind: command-log
        ref: ".planning/phases/10-packaging/evidence/macos-uat-all-available-command-verified-2d5dcf7.md"
        status: pass
      - kind: command-log
        ref: ".planning/phases/10-packaging/evidence/macos-uat-postgres-missing-command-verified-2d5dcf7.md"
        status: pass
      - kind: command-log
        ref: ".planning/phases/10-packaging/evidence/macos-uat-redis-missing-command-verified-2d5dcf7.md"
        status: pass
      - kind: command-log
        ref: ".planning/phases/10-packaging/evidence/macos-uat-both-missing-command-verified-2d5dcf7.md"
        status: pass
    human_judgment: true
    rationale: "The plan explicitly requires human confirmation that installed-app observations and evidence match."
  - id: D3
    description: "Release status remains honest: macOS UAT passed, Windows installed UAT deferred and non-release-ready."
    requirement: PKG-03
    verification:
      - kind: json-gate
        ref: "node -e UAT release-honesty check"
        status: pass
    human_judgment: false
duration: multi-session
completed: 2026-07-12
---

# Phase 10 Plan 06: macOS Installed-App UAT Summary

**The verified macOS DMG now passes the installed-app four-scenario UAT matrix from a non-repository app path, with Agent usable and Go degraded only when dependencies are intentionally missing.**

## Performance

- **Duration:** multi-session
- **Completed:** 2026-07-12
- **Tasks:** 3, including one human-confirmed installed-app checkpoint
- **Files modified:** 9

## Accomplishments

- Added and verified `scripts/launch-paladin-macos.sh`, the supported env-only first-run and UAT launcher.
- Installed the latest verified DMG into `/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app`, outside the repository tree.
- Completed the required macOS UAT matrix:
  - `all_available`: Agent `/health` OK, Go `/healthz` OK, Go `/readyz` OK.
  - `postgres_missing`: Agent OK, Go liveness OK, Go readiness degraded/non-blocking.
  - `redis_missing`: Agent OK, Go liveness OK, Go readiness degraded/non-blocking.
  - `both_missing`: Agent OK, Go liveness OK, Go readiness degraded/non-blocking.
- Recorded append-only structured attempts and redacted command-log evidence.
- Confirmed macOS installed-app UAT manually via the four project checks; Windows remains deferred and non-release-ready.

## Task Commits

1. **Task 1: supported macOS launch wrapper** — `a2f7532` (feat)
2. **Task 2: initialize installed UAT evidence** — `9668aa8` (docs)
3. **Task 3 fixes and evidence loop** — `a2c003e`, `8228b0f`, `1d6f2d4`, `e8de5ce`, `2d5dcf7`, `b8b9e61`
4. **Task 3 human confirmation + summary** — this commit

## Evidence

- **Commit:** `2d5dcf768503b61f9f8bf331ed70d568d11699e7`
- **DMG:** `paladin_0.1.0_aarch64.dmg`
- **DMG SHA-256:** `9ddfb59f75c824ce1a358e3a11f808016a4283f51d247d47119089ad6fb7c281`
- **Installed app:** `/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app`
- **UAT record:** `.planning/phases/10-packaging/10-UAT.json`
- **Human-readable summary:** `.planning/phases/10-packaging/10-UAT.md`

## Verification

- `test -x "/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app/Contents/MacOS/Paladin"` — PASS
- `shasum -a 256 apps/desktop/src-tauri/target/release/bundle/dmg/paladin_0.1.0_aarch64.dmg` — PASS (`9ddfb59f75c824ce1a358e3a11f808016a4283f51d247d47119089ad6fb7c281`)
- `bash scripts/test-launch-paladin-macos.sh` — PASS
- Four latest macOS scenario JSON gate — PASS
- `node apps/desktop/scripts/secret-sentinel.mjs --require-all` — PASS, 0 findings

## Deviations from Plan

### Auto-fixed Issues

**1. Packaged Agent dynamic import failed under PyInstaller**
- **Found during:** all_available installed-app UAT
- **Issue:** The packaged Agent used a uvicorn dynamic import string and failed to import `src.server`.
- **Fix:** Run the packaged Agent without the dynamic uvicorn import.
- **Verification:** Rebuilt DMG and re-ran installed-app probes.

**2. Packaged Agent logfire/Pydantic source inspection failed under PyInstaller**
- **Found during:** all_available installed-app UAT
- **Issue:** Frozen source inspection raised `OSError: could not get source code`.
- **Fix:** Force packaged mode to disable Logfire Pydantic recording and add frozen sidecar smoke verification.
- **Verification:** Rebuilt DMG and re-ran installed-app probes.

**3. Packaged Go server exited instead of staying degraded when dependencies or JWT were missing**
- **Found during:** degraded scenario UAT
- **Issue:** Missing PG/Redis or invalid JWT could stop the Go sidecar, blocking the desired degraded state.
- **Fix:** Start a bounded degraded server in packaged mode with `/healthz` 200 and `/readyz` 503.
- **Verification:** `postgres_missing`, `redis_missing`, `both_missing`, and short-JWT probes passed.

**Total deviations:** 3 auto-fixed correctness issues.  
**Impact on plan:** All fixes were required to make the installed-app UAT contract truthful; no scope expansion beyond packaged startup/degraded behavior.

## Issues Encountered

- Several initial all_available attempts failed before the final packaged Agent fixes. They remain in the append-only JSON history as failed attempts.
- Command-log evidence was used instead of screenshots for the final four-scenario matrix because the acceptance criteria are health/readiness states and redacted wrapper output.

## Release Honesty

- macOS installed-app UAT: complete and human-confirmed.
- macOS platform release-ready status in UAT evidence: true.
- Windows native MSI buildability: verified.
- Windows installed-app UAT: deferred.
- Windows release-ready status: false.
- Overall Phase 10 still needs Plan 07 final verification and release-honesty audit.

## User Setup Required

None for this plan. Future testers should provide configuration only through environment variables and use `scripts/launch-paladin-macos.sh --app <Paladin.app>`.

## Next Phase Readiness

Plan 10-07 can now run final focused/full closure gates and produce the release verification artifact using a completed macOS installed-app UAT matrix.

## Self-Check: PASSED

- Installed app path is outside the repository.
- Four required scenarios have latest PASS attempts and evidence.
- Human confirmation is recorded.
- Secret scan passed with 0 findings.
- Windows remains deferred and non-release-ready.

---
*Phase: 10-packaging*
*Completed: 2026-07-12*

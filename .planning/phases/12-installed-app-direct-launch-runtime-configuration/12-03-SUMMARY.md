---
phase: 12-installed-app-direct-launch-runtime-configuration
plan: "03"
status: complete
subsystem: go-sidecar-runtime-and-diagnostics
tags: [tdd, rust, tauri, go, redaction, readiness]
dependency_graph:
  requires: [12-01-SUMMARY.md, 12-02-SUMMARY.md]
  provides: [selected Go snapshot sidecar injection, secret-free readiness diagnostics]
  affects: [12-04 frontend Go service status and controls]
---

# Phase 12 Plan 03: Go Sidecar Runtime and Diagnostics Summary

Connected the Rust-owned Go configuration authority to the managed Server sidecar, and made Go readiness diagnostics structured and secret-safe without turning Go degradation into an Agent/UI startup failure.

## RED → GREEN → REFACTOR

| Stage | Result |
| --- | --- |
| RED | Wave 0 contracts failed as expected: Go DSN/Redis/JWT sentinels were not centrally redacted and the Go field-only readiness symbols did not exist. |
| GREEN | The supervisor selects a persisted or explicitly marker-gated session snapshot only when spawning the managed Server child, strips inherited Go values otherwise, and retains `env_clear` and supervisor-owned runtime mode. |
| REFACTOR | Added typed process diagnostic categories/lifecycle actions, central Go DSN redaction, and a testable Go degraded handler returning fixed categories and field states only. |

## What Changed

- Wired `GoConfigManager` into `ProcessSupervisor`; normal Server starts use its complete persisted snapshot, while only `PALADIN_GO_SESSION_OVERRIDE` may select a process-local marked session snapshot.
- Prevented ordinary parent DB/Redis/JWT environment values from reaching the Server when no selected snapshot exists. Managed restart and crash-backoff follow the same selection path; external restart remains redetect-only.
- Added structured status fields: diagnostic category, pending-apply flag, and owner-gated lifecycle actions. Readiness degradation remains nonblocking for Agent startup.
- Extended central sidecar redaction for Go config key/value forms and directly printed PostgreSQL/Redis DSNs before event, tail, or disk fan-out.
- Added Go `/readyz` fixed categories and field statuses. `/healthz` remains live in degraded mode; readiness bodies never reflect secret values.

## Task Commits

| Task | Commit | Notes |
| --- | --- | --- |
| Task 1: secure selected-snapshot supervisor integration | `d58bb42` | Snapshot injection, inherited-value removal, owner-safe actions, structured desktop status. |
| Task 2: secret-free Go readiness and diagnostics | `01ef133` | Go DSN redaction and fixed, secret-free readiness categories. |

## Verification

- `cd apps/desktop/src-tauri && cargo test --lib process::supervisor_tests` — PASS (15/15)
- `cd apps/desktop/src-tauri && cargo test --lib process::log_redact_tests` — PASS (23/23)
- `cd apps/server && go test ./cmd/server` — PASS
- `cd apps/desktop/src-tauri && cargo test --lib process::` — PASS (99/99)
- `git diff --check` — PASS

## Deviations

None. Existing user-owned `STATE.md`, `ROADMAP.md`, unrelated Go module formatting, and untracked planning files were left untouched.

## Self-Check: PASSED

- Selected Go values stay inside Rust until `Command::envs` receives the managed Server environment.
- Missing or invalid Go configuration and dependency readiness are classified without exposing DSNs, Redis URLs, JWTs, stderr, or raw parser errors.
- External owner stop/restart protections remain intact; Go readiness still does not gate Agent/UI availability.

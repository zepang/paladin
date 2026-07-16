---
phase: 12-installed-app-direct-launch-runtime-configuration
plan: "01"
status: complete
subsystem: installed-app-direct-launch-runtime-configuration
tags:
  - tdd
  - red-tests
  - tauri
  - go
  - frontend
  - packaging
dependency_graph:
  requires:
    - .planning/phases/12-installed-app-direct-launch-runtime-configuration/12-CONTEXT.md
    - .planning/phases/12-installed-app-direct-launch-runtime-configuration/12-UI-SPEC.md
  provides:
    - Phase 12 Wave 0 RED validation scaffold
  affects:
    - apps/desktop/src-tauri/src/go_config/
    - apps/server/cmd/server/main_test.go
    - apps/desktop/src/stores/__tests__/goService.test.ts
    - apps/desktop/src/components/go-service/__tests__/GoServicePanel.test.tsx
    - apps/desktop/src/components/StatusBar/__tests__/GoServiceLight.test.tsx
    - apps/desktop/scripts/direct-launch-evidence.test.mjs
tech_stack:
  added: []
  patterns:
    - Rust app-data and supervisor RED contracts
    - Go field-only readiness RED contracts
    - Vitest/Testing Library write-only UI RED contracts
    - Node structured evidence scanner RED contracts
key_files:
  created:
    - apps/desktop/src-tauri/src/go_config/mod.rs
    - apps/desktop/src-tauri/src/go_config/storage_tests.rs
    - apps/desktop/src-tauri/src/go_config/bootstrap_tests.rs
    - apps/desktop/src/stores/__tests__/goService.test.ts
    - apps/desktop/src/components/go-service/__tests__/GoServicePanel.test.tsx
    - apps/desktop/src/components/StatusBar/__tests__/GoServiceLight.test.tsx
    - apps/desktop/scripts/direct-launch-evidence.test.mjs
  modified:
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src-tauri/src/process/supervisor_tests.rs
    - apps/desktop/src-tauri/src/process/log_redact_tests.rs
    - apps/server/cmd/server/main_test.go
decisions:
  - Keep Wave 0 strictly RED: only test modules and test discovery wiring were added; no Go configuration runtime implementation or production stubs were introduced.
  - Record direct-launch validation by launcher class and platform state, with scanner findings limited to safe categories.
metrics:
  duration: single-session
  completed_date: 2026-07-16
---

# Phase 12 Plan 01: RED Validation Scaffold Summary

Created focused failing contracts for persisted Go sidecar configuration, nonblocking readiness diagnostics, write-only desktop UI, and secret-free direct-launch evidence.

## What Changed

- Added Rust RED modules for complete Go configuration persistence, masked DTO readback, serialized saves, explicit import, clear-without-reimport, marker-bound session overrides, packaged spawn precedence, and source redaction.
- Added Go RED tests for packaged field-only readiness categories that never reflect configuration input.
- Added frontend RED tests for the masked Go service store, dedicated configuration panel, independent AI/Go status lights, accessibility behavior, and external-owner restart protection.
- Added Node RED tests for Finder/Windows/Linux launcher classes, platform readiness states, required evidence schema, and secret-safe evidence scanning.

## Task Commits

| Task | Commit | Notes |
| --- | --- | --- |
| Task 1: Rust app-data authority and spawn precedence | `3004784` | Added Go config/storage/bootstrap/supervisor/redaction RED contracts. |
| Task 2: Go and frontend structured diagnostics | `6e57990` | Added Go readiness plus store, panel, and status-light RED contracts. |
| Task 3: Evidence and platform status | `6242e3e` | Added structured direct-launch evidence RED contracts. |

## Verification

Expected result for this plan is RED: every command must fail only because the planned Phase 12 symbols, components, or helper module do not exist yet.

| Command | Result |
| --- | --- |
| `cd apps/desktop/src-tauri && cargo test --lib go_config::` | PASS: compilation stops on missing planned Go configuration manager/DTO APIs and environment selector. |
| `cd apps/desktop/src-tauri && cargo test --lib process::` | PASS: compilation stops on the same missing Phase 12 Go configuration and supervisor selection APIs. |
| `cd apps/server && go test ./cmd/server -run 'GoConfig|Ready'` | PASS: build fails on missing field-only Go readiness diagnostics. |
| `pnpm --filter @paladin/desktop test --run GoService` | PASS: Vitest discovers the new contracts and fails resolving planned Go store/panel/status-light modules. |
| `node --test apps/desktop/scripts/direct-launch-evidence.test.mjs` | PASS: Node fails resolving the planned direct-launch evidence helper. |

## Deviations from Plan

### Auto-adjusted Verification Shell Variable

- **Found during:** Task 3 verification.
- **Issue:** The documented command uses `status=$?`, but `zsh` reserves `status` as read-only.
- **Fix:** Used the equivalent `evidence_status=$?` and reran the command.
- **Files modified:** None.
- **Commit:** Not applicable.

No dependencies, production stubs, database services, or real credentials were introduced.

## Known Stubs

None. These tests intentionally reference the planned Phase 12 APIs and components so that Wave 1 implementation has explicit contracts to satisfy.

## Threat Flags

None. The plan adds security-focused RED coverage only; it does not change runtime secret handling, process spawning, or release tooling.

## Self-Check: PASSED

- All planned RED test files exist in the working tree.
- Task commits exist: `3004784`, `6e57990`, `6242e3e`.
- All five focused RED commands were rerun after task commits and failed only on missing Phase 12 APIs, modules, or helpers.
- Existing user-owned `.planning/STATE.md` changes and unrelated untracked planning files were left unstaged.

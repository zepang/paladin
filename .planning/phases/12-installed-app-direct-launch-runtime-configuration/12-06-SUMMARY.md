---
phase: 12-installed-app-direct-launch-runtime-configuration
plan: "06"
status: complete
subsystem: desktop-go-status-light
tags: [frontend, statusbar, popover, redaction, owner-safety]
dependency_graph:
  requires: [12-04-SUMMARY.md, 12-05-SUMMARY.md]
  provides: [independent Go status light, owner-safe Go recovery actions]
  affects: [StatusBar, GoServicePanel, StartupMask]
---

# Phase 12 Plan 06: Go Status Light Summary

Added an independent `GoServiceLight` to the desktop StatusBar. It consumes only the structured, masked Go configuration and process state, so Go readiness remains separate from Agent and AI-provider availability.

## Delivered

- Replaced the generic Go `ProcessLight` with a dedicated 24px Go status light and Popover.
- Mapped unconfigured, incomplete, session override, checking, ready, dependency-degraded, port-conflict, sidecar-failed, and saved-pending-restart states to fixed, secret-free Chinese copy.
- Kept the locked recovery order: open settings, test/retry when applicable, managed restart, re-detect, then logs.
- Prevented external-owner lifecycle control: restart stays disabled while re-detection and logs remain available with an explanatory reason.
- Kept Go degradation nonblocking and Agent/AI status lights independently visible. `StartupMask` remains Agent-only.
- Added test cleanup so Popover portals do not leak between status-light test cases.

## Task Commit

| Task | Commit | Notes |
| --- | --- | --- |
| Task 1: Go status light and recovery popover | `b934fa2` | Structured state mapping, owner-safe actions, StatusBar integration, focused tests. |

## Verification

- `pnpm --filter @paladin/desktop test --run GoServiceLight StartupMask StatusBar` — PASS (4 files, 18 tests)
- `pnpm --filter @paladin/desktop build` — PASS
- `git diff --check` — PASS

## Scope Notes

- No raw diagnostic, DSN, Redis URL, JWT, token, API key, repository path, or shell command is rendered by the new Popover.
- Existing user-owned `.planning/STATE.md`, `.planning/ROADMAP.md`, and unrelated untracked planning files were left untouched.

---
phase: 10-packaging
plan: "08"
subsystem: packaged-process-ui
tags: [ui, startup-mask, status-bar, diagnostics, rtl, tdd]
status: complete
requires:
  - phase: 10-packaging
    plan: "03"
    provides: packaged runtime marker and process ownership semantics
provides:
  - installed-app-safe StartupMask diagnostics
  - Agent-only blocking startup behavior contract
  - Go degraded non-blocking ProcessLight copy
  - external owner action safety in status popover
affects: [10-06, 10-09, installed-app-uat]
tech-stack:
  added: []
  patterns: [rendered-copy negative assertions, non-blocking degraded status copy]
key-files:
  created:
    - apps/desktop/src/components/__tests__/StartupMask.test.tsx
    - apps/desktop/src/components/StatusBar/__tests__/ProcessLight.test.tsx
  modified:
    - apps/desktop/src/components/StartupMask.tsx
    - apps/desktop/src/components/StatusBar/ProcessLight.tsx
key-decisions:
  - "StartupMask diagnostics default to installed-app wording and hide source-path/developer-tool guidance."
  - "Agent running returns no StartupMask even if another service is degraded."
  - "Go degraded explicitly says Agent remains usable."
  - "External owner keeps stop/restart disabled while redetect and logs remain available."
patterns-established:
  - "RTL tests assert both required visible copy and prohibited misleading copy."
requirements-completed: [PKG-01, PKG-03]
coverage:
  - id: D1
    description: "Packaged config failures render installed-app copy without source path or developer command guidance."
    requirement: PKG-03
    verification:
      - kind: rtl
        ref: "apps/desktop/src/components/__tests__/StartupMask.test.tsx"
        status: pass
    human_judgment: false
  - id: D2
    description: "Agent running does not render a blocking StartupMask for Go-only degraded/readiness failure."
    requirement: PKG-01
    verification:
      - kind: rtl
        ref: "apps/desktop/src/components/__tests__/StartupMask.test.tsx"
        status: pass
    human_judgment: false
  - id: D3
    description: "ProcessLight explains Go degraded as non-blocking and protects external owner actions."
    requirement: PKG-03
    verification:
      - kind: rtl
        ref: "apps/desktop/src/components/StatusBar/__tests__/ProcessLight.test.tsx"
        status: pass
    human_judgment: false
duration: 8 min
completed: 2026-07-12
---

# Phase 10 Plan 08: Packaged Process UI Diagnostics Summary

**StartupMask and ProcessLight now match the packaged-app contract: Agent failures block, Go degraded does not, and diagnostics avoid developer-only recovery instructions.**

## Performance

- **Duration:** 8 min
- **Completed:** 2026-07-12
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments

- Added RTL tests for packaged StartupMask diagnostics, including negative assertions against source paths and development tool guidance.
- Updated StartupMask failure classification to use installed-app copy for config, executable, cwd, port conflict, startup exit, and generic stopped states.
- Sanitized diagnostic error text when it contains source-path or development-environment details.
- Added Go degraded ProcessLight explanation: `Go 服务已启动，但依赖未完全就绪；Agent 仍可继续使用。`
- Preserved external owner safety: stop/restart disabled, redetect enabled, logs available.

## Task Commits

1. **Task 1/2 RED: packaged process UI semantics** — `2fa4677` (test)
2. **Task 1/2 GREEN: packaged process UI states** — `d5b0255` (fix)

## Verification

- `pnpm --filter @paladin/desktop test --run src/components/__tests__/StartupMask.test.tsx` — PASS（2/2）
- `pnpm --filter @paladin/desktop test --run src/components/StatusBar/__tests__/ProcessLight.test.tsx` — PASS（2/2）
- `pnpm --filter @paladin/desktop test --run` — PASS（47/47）

## Deviations from Plan

None - plan executed as written. The two task files were implemented in one RED commit and one GREEN commit because both UI contracts are tightly coupled around process state semantics and shared test environment setup.

## Issues Encountered

- Initial test run used repository-relative file filters; Vitest filters are package-relative under `@paladin/desktop`. Re-ran with `src/...` filters.
- Tests import `@testing-library/jest-dom/vitest` locally because this project does not configure global jest-dom matchers.

## Security Notes

- Rendered diagnostics no longer direct installed-app users to `src-tauri/processes.json` or development commands.
- Raw diagnostic strings containing source-path or development-tool details are replaced with a bounded installed-app-safe message.
- The UI still displays stderr tails, relying on the Phase 10 log redaction path before frontend delivery.

## User Setup Required

None.

## Next Phase Readiness

macOS installed-app UAT can now evaluate startup and degraded UI copy without Go readiness being misrepresented as a full application startup failure.

## Self-Check: PASSED

- Required UI copy is covered by user-visible DOM assertions.
- Prohibited source-path/developer-tool guidance is covered by negative assertions.
- External owner stop/restart protection is covered by button disabled assertions.

---
*Phase: 10-packaging*
*Completed: 2026-07-12*

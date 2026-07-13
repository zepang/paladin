---
phase: 11-desktop-ai-provider-configuration
plan: 04
status: complete
subsystem: desktop-ai-provider-configuration
tags:
  - rust
  - tauri
  - process-supervisor
  - secret-redaction
  - macos-launch
  - tdd
dependency_graph:
  requires:
    - .planning/phases/11-desktop-ai-provider-configuration/11-02-SUMMARY.md
    - .planning/phases/11-desktop-ai-provider-configuration/11-03-SUMMARY.md
    - .planning/phases/11-desktop-ai-provider-configuration/11-SPEC.md
  provides:
    - PALADIN_AI sidecar environment bootstrap allowlist
    - Expanded AI provider secret redaction vocabulary
    - No-key macOS launch wrapper semantics
  affects:
    - apps/desktop/src-tauri/src/process/supervisor.rs
    - apps/desktop/src-tauri/src/process/log_redact.rs
    - apps/desktop/src-tauri/src/process/log_redact_tests.rs
    - scripts/launch-paladin-macos.sh
    - scripts/test-launch-paladin-macos.sh
tech_stack:
  added: []
  patterns:
    - central regex redaction before log emission or persistence
    - explicit non-empty sidecar environment allowlist
    - shell wrapper secret CLI rejection
key_files:
  created: []
  modified:
    - apps/desktop/src-tauri/src/process/supervisor.rs
    - apps/desktop/src-tauri/src/process/log_redact.rs
    - apps/desktop/src-tauri/src/process/log_redact_tests.rs
    - scripts/launch-paladin-macos.sh
    - scripts/test-launch-paladin-macos.sh
decisions:
  - Keep provider secret masking centralized in redact_log_line instead of adding caller-side replacements.
  - Allow only the four locked PALADIN_AI bootstrap variables through the sidecar environment boundary.
  - Continue accepting DEEPSEEK_API_KEY for legacy bootstrap while removing AI keys from wrapper missing-recommendation output.
metrics:
  duration: single-session
  completed_date: 2026-07-13
---

# Phase 11 Plan 04: Env Bootstrap and Redaction Summary

Expanded sidecar AI provider bootstrap boundaries and log redaction so Phase 11 provider configuration can start without keys while keeping provider secrets out of logs, diagnostics, and wrapper output.

## What Changed

- Added `PALADIN_AI_PROVIDER`, `PALADIN_AI_BASE_URL`, `PALADIN_AI_API_KEY`, and `PALADIN_AI_MODEL` to the explicit non-empty `BUSINESS_ENV_ALLOWLIST`.
- Kept `DEEPSEEK_API_KEY` in the sidecar allowlist for backwards-compatible bootstrap.
- Expanded central `SECRET_PATTERNS` and `redact_log_line()` coverage for `PALADIN_AI_API_KEY`, `OPENAI_API_KEY`, provider key aliases, JSON diagnostic fields, camelCase diagnostic fields, bearer tokens, and special-character key values.
- Updated the macOS launch wrapper so missing AI keys are not presented as recommended startup prerequisites; DB and Redis recommendations remain separate.
- Added wrapper checks that reject `--PALADIN_AI_API_KEY` and `--PALADIN_AI_API_KEY=...` without printing raw secret values.

## Task Commits

| Task | Commit | Notes |
| --- | --- | --- |
| Task 1: Expand central redaction for provider secrets | `93c9c57` | Added provider secret RED tests and central redaction implementation. |
| Task 2: Update sidecar env allowlist and macOS launch wrapper for bootstrap/no-key semantics | `2218a86` | Added PALADIN_AI env forwarding tests, allowlist entries, no-key wrapper behavior, and PALADIN_AI secret CLI rejection. |

## Verification

| Command | Result |
| --- | --- |
| `cd apps/desktop/src-tauri && cargo test log_redact --lib` | PASS: 22 tests passed. |
| `cd apps/desktop/src-tauri && cargo test environment_for_process --lib` | PASS: 3 tests passed. |
| `scripts/test-launch-paladin-macos.sh` | PASS: wrapper tests passed. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking Issue] Split invalid combined cargo test filter**
- **Found during:** Final verification.
- **Issue:** The plan-level command `cargo test log_redact environment_for_process --lib` is invalid for the current Cargo CLI because `cargo test` accepts only one test filter before option parsing.
- **Fix:** Ran the equivalent focused verification as two commands: `cargo test log_redact --lib` and `cargo test environment_for_process --lib`.
- **Files modified:** None.
- **Commit:** Not applicable.

**2. [Rule 1 - Bug] Narrowed wrapper no-key assertion to recommendation list items**
- **Found during:** Task 2 verification.
- **Issue:** The initial RED shell assertion checked for any `DEEPSEEK_API_KEY` occurrence and matched the fake app's diagnostic env label, not the wrapper's missing-recommendation list.
- **Fix:** Asserted absence of `- DEEPSEEK_API_KEY` and `- PALADIN_AI_API_KEY` recommendation entries while preserving fake app execution evidence.
- **Files modified:** `scripts/test-launch-paladin-macos.sh`
- **Commit:** `2218a86`

## Known Stubs

None. Stub scan only matched existing test wording about placeholder replacement and formatting examples; no incomplete runtime stub or placeholder data path was introduced.

## Threat Flags

None. The security-relevant surfaces changed in this plan are covered by the plan threat model:

| Threat | Mitigation |
| --- | --- |
| T-11-04-01 Information Disclosure in log redaction | Provider key names, aliases, diagnostic fields, bearer tokens, and special-character values are redacted through `redact_log_line()` before log emission/persistence. |
| T-11-04-02 Env allowlist tampering | Only the four locked `PALADIN_AI_*` keys were added to the explicit allowlist; empty values remain ignored and `PALADIN_RUNTIME_MODE` remains forced by runtime mode. |
| T-11-04-03 CLI secret leakage | `PALADIN_AI_API_KEY` CLI arguments are rejected by name and raw secret values are not printed. |
| T-11-04-04 No-key launch DoS | Missing AI keys are no longer recommended prerequisites in the wrapper path, and the fake app still executes without provider env vars. |

## Auth Gates

None.

## Self-Check: PASSED

- Modified files exist: `supervisor.rs`, `log_redact.rs`, `log_redact_tests.rs`, `launch-paladin-macos.sh`, and `test-launch-paladin-macos.sh`.
- Task commits exist: `93c9c57`, `2218a86`.
- Focused verification passed after task commits.
- Existing unrelated planning changes in `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/todos/pending/desktop-ai-provider-configuration.md`, and `.planning/phases/11-desktop-ai-provider-configuration/.gitkeep` were not staged for this plan.

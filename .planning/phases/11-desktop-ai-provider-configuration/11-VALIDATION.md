---
phase: 11
slug: desktop-ai-provider-configuration
status: draft
nyquist_compliant: true
wave_0_complete: false
created: 2026-07-13
---

# Phase 11 - Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Python `pytest`, Rust `cargo test`, frontend `vitest` |
| **Config file** | `apps/agent/pyproject.toml`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/package.json` |
| **Quick run command** | Tier-specific focused commands from the per-task map |
| **Full suite command** | `cd apps/agent && uv run pytest`; `cd apps/desktop/src-tauri && cargo test`; `pnpm --filter @paladin/desktop test --run` |
| **Estimated runtime** | ~120 seconds focused, longer for full suite |

---

## Sampling Rate

- **After every task commit:** Run the focused command for the changed tier: `uv run pytest ... -x`, `cargo test <module> --lib`, or `pnpm --filter @paladin/desktop test --run <pattern>`.
- **After every plan wave:** Run all three full tier suites: `cd apps/agent && uv run pytest`; `cd apps/desktop/src-tauri && cargo test`; `pnpm --filter @paladin/desktop test --run`.
- **Before `$gsd-verify-work`:** Full suite must be green, plus a no-key startup smoke and secret/evidence scan.
- **Max feedback latency:** 180 seconds for focused task feedback.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 11-00-01 | Wave 0 | 0 | R1-R7 | T-11-01 / T-11-02 / T-11-03 | Test scaffolds exist before implementation tasks rely on them | unit scaffolding | `cd apps/agent && uv run pytest tests/test_provider_runtime.py -x`; `cd apps/desktop/src-tauri && cargo test ai_provider --lib`; `pnpm --filter @paladin/desktop test --run AiProvider` | no | pending |
| 11-01-01 | Agent runtime | 1 | R1, R2, R4 | T-11-04 | Missing provider returns structured state and does not crash import/startup | Python unit/API | `cd apps/agent && uv run pytest tests/test_server.py tests/test_provider_runtime.py -x` | partial | pending |
| 11-02-01 | Desktop persistence | 1 | R3, R4, R5, R6 | T-11-02 / T-11-03 | Rust is only persisted writer; saved secrets are masked on readback | Rust unit | `cd apps/desktop/src-tauri && cargo test ai_provider --lib` | no | pending |
| 11-03-01 | UI provider surface | 2 | R2, R3, R7 | T-11-05 | CTA/status/settings surface separates AI readiness from process readiness | frontend unit | `pnpm --filter @paladin/desktop test --run AiProvider`; `pnpm --filter @paladin/desktop test --run ChatAreaProviderCta`; `pnpm --filter @paladin/desktop test --run StatusBar` | no | pending |
| 11-04-01 | Redaction and evidence | 2 | R6 | T-11-01 | Raw API keys are absent from logs, diagnostics, UI snapshots, and test evidence | Rust/frontend/scan | `cd apps/desktop/src-tauri && cargo test log_redact --lib`; `pnpm --filter @paladin/desktop test --run AiProvider` | partial | pending |
| 11-05-01 | End-to-end smoke | 3 | R1-R7 | all | No-key startup, env bootstrap, saved provider, hot switch, and failed provider flows are distinguishable | mixed smoke | full suite commands plus no-key startup smoke | no | pending |

*Status: pending / green / red / flaky*

---

## Wave 0 Requirements

- [ ] `apps/agent/tests/test_provider_runtime.py` - no-key startup, request-start snapshot, invalid provider, DeepSeek base URL behavior.
- [ ] `apps/desktop/src-tauri/src/ai_provider/*_tests.rs` - persistence, bootstrap precedence, concurrent saves, masked readback.
- [ ] `apps/desktop/src/stores/__tests__/aiProvider.test.ts` - frontend DTO and AI readiness store behavior.
- [ ] `apps/desktop/src/components/provider/__tests__/AiProviderPanel.test.tsx` - save/test separation, masked key metadata, destructive delete flow.
- [ ] `apps/desktop/src/components/StatusBar/__tests__/AiProviderLight.test.tsx` - separate AI status indicator and actions.
- [ ] `apps/desktop/src/components/__tests__/ChatAreaProviderCta.test.tsx` - missing-provider CTA opens the `ai-provider` RightPanel tab.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Packaged app no-key startup across desktop shell and sidecars | R1, R7 | Requires runtime process orchestration and sidecar launch conditions | Start the desktop app with no AI provider env vars. Confirm Agent sidecar and Go sidecar remain running, `/health` is OK, and chat shows provider CTA instead of process failure. |
| Live provider success against a real compatible endpoint | R3, R4 | Requires a real user-owned key or local LM Studio endpoint | Configure DeepSeek or OpenAI-compatible endpoint from the RightPanel, save, run test connection, send one chat message, switch provider/model, and confirm the next request uses the new provider without restart. |
| Secret evidence review | R6 | Requires inspecting local logs/evidence captured during UAT | Search captured logs, diagnostics, UAT evidence, and UI screenshots for the raw test API key. Only masked fingerprints such as `pk_7F3A` may appear. |

---

## Validation Sign-Off

- [x] All tasks have automated verify commands or Wave 0 dependencies.
- [x] Sampling continuity: no 3 consecutive tasks without automated verify.
- [x] Wave 0 covers all missing test references from research.
- [x] No watch-mode flags in validation commands.
- [x] Feedback latency target is below 180 seconds for focused checks.
- [x] `nyquist_compliant: true` set in frontmatter.

**Approval:** approved 2026-07-13

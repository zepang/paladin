---
phase: 11-desktop-ai-provider-configuration
plan: 07
status: complete
subsystem: desktop-ai-provider-configuration
tags:
  - frontend
  - copilotkit
  - ai-provider
  - statusbar
  - tdd
dependency_graph:
  requires:
    - .planning/phases/11-desktop-ai-provider-configuration/11-02-SUMMARY.md
    - .planning/phases/11-desktop-ai-provider-configuration/11-06-SUMMARY.md
    - .planning/phases/11-desktop-ai-provider-configuration/11-UI-SPEC.md
  provides:
    - Missing-provider ChatArea CTA
    - Separate StatusBar AI readiness light
    - CopilotKit provider-not-configured error mapping
  affects:
    - apps/desktop/src/components/ChatArea.tsx
    - apps/desktop/src/components/__tests__/ChatAreaProviderCta.test.tsx
    - apps/desktop/src/components/StatusBar/AiProviderLight.tsx
    - apps/desktop/src/components/StatusBar/__tests__/AiProviderLight.test.tsx
    - apps/desktop/src/components/StatusBar.tsx
    - apps/desktop/src/App.tsx
tech_stack:
  added: []
  patterns:
    - Zustand provider readiness drives chat fallback and status bar state
    - Provider-not-configured CopilotKit errors update product state instead of process failure UI
    - StatusBar AI readiness remains separate from Agent and Go process lights
key_files:
  created:
    - apps/desktop/src/components/StatusBar/AiProviderLight.tsx
  modified:
    - apps/desktop/src/components/ChatArea.tsx
    - apps/desktop/src/components/__tests__/ChatAreaProviderCta.test.tsx
    - apps/desktop/src/components/StatusBar/__tests__/AiProviderLight.test.tsx
    - apps/desktop/src/components/StatusBar.tsx
    - apps/desktop/src/App.tsx
decisions:
  - ChatArea renders the configured-provider CTA only when a conversation exists and AI readiness is unconfigured or invalid, preserving the no-conversation welcome state.
  - AiProviderLight derives its own AI readiness labels and actions, rather than reusing process health vocabulary.
  - CopilotKit provider-not-configured errors are handled as AI provider readiness state and do not show a generic Agent failure toast.
metrics:
  duration: single-session
  completed_date: 2026-07-13T16:00:35Z
---

# Phase 11 Plan 07: Chat and Status Provider Readiness Summary

Integrated AI provider readiness into the desktop chat surface, status bar, and CopilotKit error path so missing provider configuration is actionable without being presented as Agent or Go process failure.

## What Changed

- Added a ChatArea missing-provider branch with the exact UI-SPEC copy `尚未配置 AI provider` and `配置 AI provider`.
- Wired the ChatArea CTA to the existing RightPanel `ai-provider` tab through the provider store's settings action.
- Added `AiProviderLight` with labels `AI · 未配置`, `AI · 未测试`, `AI · 可用`, and `AI · 无效`.
- Added an AI provider status popover with provider/model/status details plus `打开设置` and provider-aware `测试连接` actions.
- Inserted the AI provider light into `StatusBar` separately from Agent and Go `ProcessLight` entries.
- Updated App-level CopilotKit error handling so structured `provider-not-configured` responses update AI provider readiness and skip generic Agent error toasts.
- Initialized provider readiness after runtime config is available, refreshing Agent runtime readiness when the Agent process is running.

## Task Commits

| Task | Commit | Notes |
| --- | --- | --- |
| Task 1: Implement ChatArea configure-provider CTA | `04e3dac` | Added neutral missing-provider CTA and RightPanel `ai-provider` opening. |
| Task 2: Add AiProviderLight and StatusBar readiness separation | `fb3d694` | Added AI status light, popover actions, and StatusBar integration coverage. |
| Task 3: Map provider-not-configured CopilotKit errors into provider readiness state | `7ed8b0a` | Added App readiness sync and provider error mapping; fixed a ChatArea test fixture type mismatch. |

## Verification

| Command | Result |
| --- | --- |
| `pnpm --filter @paladin/desktop test --run ChatAreaProviderCta` | PASS: 1 file, 2 tests. |
| `pnpm --filter @paladin/desktop test --run AiProviderLight StatusBar` | PASS: 2 files, 8 tests. |
| `pnpm --filter @paladin/desktop test --run ChatAreaProviderCta AiProviderLight StatusBar` | PASS: 3 files, 10 tests. |
| `pnpm --filter @paladin/desktop build` | PASS: TypeScript and Vite production build completed. |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Fixed ChatArea provider CTA test fixture type mismatch**
- **Found during:** Task 3 build verification.
- **Issue:** `ChatAreaProviderCta.test.tsx` used an obsolete `updatedAt` field and omitted required `Conversation` fields, causing `tsc` to fail during the desktop build.
- **Fix:** Removed `updatedAt` and added `lastMessage` and `messageCount` to match the current `Conversation` type.
- **Files modified:** `apps/desktop/src/components/__tests__/ChatAreaProviderCta.test.tsx`
- **Commit:** `7ed8b0a`

## Known Stubs

None. Stub scan found no production TODO/FIXME/placeholder/coming-soon copy or hardcoded empty UI data flow in files created or modified by this plan.

## Threat Flags

None. The new surfaces match the plan threat model: structured provider errors map only to AI readiness, the status popover renders masked provider metadata only, and missing-provider chat fallback leaves Agent/process health semantics unchanged.

## Self-Check: PASSED

- Created file exists: `apps/desktop/src/components/StatusBar/AiProviderLight.tsx`.
- Modified files exist: `apps/desktop/src/components/ChatArea.tsx`, `apps/desktop/src/components/__tests__/ChatAreaProviderCta.test.tsx`, `apps/desktop/src/components/StatusBar/__tests__/AiProviderLight.test.tsx`, `apps/desktop/src/components/StatusBar.tsx`, `apps/desktop/src/App.tsx`.
- Task commits exist: `04e3dac`, `fb3d694`, `7ed8b0a`.
- Plan-level verification passed: focused Vitest suites and desktop build.
- Existing unrelated planning changes in `.planning/ROADMAP.md`, `.planning/STATE.md`, `.planning/todos/pending/desktop-ai-provider-configuration.md`, and `.planning/phases/11-desktop-ai-provider-configuration/.gitkeep` were not staged for this plan.

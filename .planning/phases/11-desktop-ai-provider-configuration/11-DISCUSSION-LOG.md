# Phase 11: Desktop AI Provider Configuration - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-13
**Phase:** 11-desktop-ai-provider-configuration
**Areas discussed:** Configuration authority and sync, Agent no-key model lifecycle, Desktop UI entry points, Secret storage and display

---

## Todo Folding

| Option | Description | Selected |
|--------|-------------|----------|
| Only fold AI provider todo | Fold `desktop-ai-provider-configuration.md`; mark layout/sidebar matches unrelated. | yes |
| Fold first three matches | Fold AI provider plus App layout and conversation list todos. | |
| Skip all todos | Do not fold pending todos into Phase 11 context. | |

**User's choice:** `1`
**Notes:** `desktop-ai-provider-configuration.md` is folded. `refactor-app-tsx-layout.md`, `integrate-conversation-list.md`, and `implement-resizable-sidebar.md` are reviewed but deferred.

---

## Configuration Authority and Sync

| Option | Description | Selected |
|--------|-------------|----------|
| Desktop persists + Agent API refresh | Desktop app data is authority; Agent exposes read/update/validate runtime API; supports hot switching. | yes |
| Env injection on Agent spawn | Close to current supervisor forwarding but requires restart or a second path for hot switching. | |
| Agent persists config | Agent is independent, but conflicts with Desktop authority locked by SPEC. | |
| the agent decides | Would select Desktop persists + Agent API refresh. | |

**User's choice:** `1`
**Notes:** Desktop app data remains the persisted authority; Agent receives runtime updates.

| Option | Description | Selected |
|--------|-------------|----------|
| Rust/Tauri writes app data only | Agent receives memory snapshot and does not write provider config files. | yes |
| Rust and Agent both write | Flexible but introduces cross-language locking/schema drift risks. | |
| Agent writes config | Faster Python-side path but weakens Desktop authority. | |
| the agent decides | Would select Rust/Tauri writes app data only. | |

**User's choice:** `1`
**Notes:** Rust/Tauri is the only persistent writer; Agent does not touch the config file directly.

---

## Agent No-Key Model Lifecycle

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy resolver | Request-time model creation/reuse from provider snapshot; no-key startup returns structured provider-not-configured. | yes |
| Unconfigured model stub | Placeholder model at startup; may fight Pydantic AI/AG-UI lifecycle. | |
| Rebuild Agent after config | Clear but complicates tools/deps and hot switching. | |
| the agent decides | Would select lazy resolver. | |

**User's choice:** `1`
**Notes:** Agent should not create a concrete LLM model at module import time.

| Option | Description | Selected |
|--------|-------------|----------|
| Keep in-flight requests on original snapshot | Provider switch affects the next request, not current stream. | yes |
| Cancel in-flight immediately | More immediate but requires cancellation semantics and UI handling. | |
| Ask user whether to cancel | Richer UX but expands scope into running-task control. | |
| the agent decides | Would select request-start snapshot semantics. | |

**User's choice:** `1`
**Notes:** Snapshot-at-request-start is locked.

---

## Desktop UI Entry Points

| Option | Description | Selected |
|--------|-------------|----------|
| Chat CTA + status bar + settings panel | Error location gets an action; status bar provides persistent visibility; panel hosts management UI. | yes |
| Chat CTA only | Minimal but less discoverable before first chat attempt. | |
| Status bar only | Tool-like but less contextual when chat fails. | |
| the agent decides | Would select combined CTA/status/settings. | |

**User's choice:** `1`
**Notes:** User asked what CTA means; clarified as "Call To Action", an actionable button/link such as "配置 AI provider".

| Option | Description | Selected |
|--------|-------------|----------|
| RightPanel AI Provider/Settings view | Reuses existing right-side tool panel and avoids new routing. | yes |
| Modal/dialog | Lightweight but cramped for list + form + test state. | |
| Full settings route/page | Scalable long-term but introduces routing/app structure changes. | |
| the agent decides | Would select RightPanel settings view. | |

**User's choice:** `1`
**Notes:** Add a provider/settings view to the existing right panel.

| Option | Description | Selected |
|--------|-------------|----------|
| Save and test separately | Save persists drafts; "测试连接" validates separately. | yes |
| Require test before save | Prevents invalid configs but blocks offline/local temporary cases. | |
| Auto-test after save | Smooth UX but more complex status timing. | |
| the agent decides | Would select separate save/test. | |

**User's choice:** `1`
**Notes:** Active provider can be saved as untested/failed, with state shown clearly.

---

## Secret Storage and Display

| Option | Description | Selected |
|--------|-------------|----------|
| Protected app-data abstraction now, Keychain later | Matches SPEC minimum and keeps Phase 11 bounded. | yes |
| Implement system Keychain now | Stronger security but cross-platform credential engineering expands scope. | |
| Plain JSON plus redaction | Fastest but leaves obvious security debt. | |
| the agent decides | Would select protected app-data abstraction. | |

**User's choice:** `1`
**Notes:** System credential storage is deferred to a later secure-phase.

| Option | Description | Selected |
|--------|-------------|----------|
| Presence + short masked fingerprint | Shows useful status without exposing raw key; edit input stays empty. | yes |
| Masked full-length placeholder | Understandable but may leak key length. | |
| Presence only | Safest but less useful for multiple providers. | |
| the agent decides | Would select presence + short masked fingerprint. | |

**User's choice:** `1`
**Notes:** Fixed-format short masked fingerprint, no raw key prefill.

## the agent's Discretion

- Exact Agent API route names and DTO fields.
- Exact lazy resolver cache mechanics.
- Exact neutral CTA copy.
- Concrete app-data protected storage file names and representation.

## Deferred Ideas

- System Keychain/Credential Manager/Secret Service support.
- Organization/shared provider policies, marketplace discovery, OAuth provider accounts, and billing management.
- App layout/sidebar/conversation list todos outside provider configuration.

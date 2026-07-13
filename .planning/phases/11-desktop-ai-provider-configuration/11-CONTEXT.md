# Phase 11: Desktop AI Provider Configuration - Context

**Gathered:** 2026-07-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 11 delivers runtime-configurable AI provider management for Paladin's desktop app and Agent: no-key startup, desktop-managed local provider configuration, Agent runtime refresh APIs, provider/model hot switching, neutral configure-provider UX, and secret-safe diagnostics. It does not introduce cloud account linking, organization policy, system Keychain hardening, or unrelated chat/sidebar layout work.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**7 requirements are locked.** See `11-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `11-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Agent-side model readiness state and request-time provider resolution.
- Desktop provider settings UI for DeepSeek, OpenAI-compatible endpoints, and LM Studio.
- Runtime persistence under local app data, with Desktop as the authoritative persisted source.
- Agent API or command surface needed for Desktop to read, update, validate, and activate provider config.
- Hot switching of active provider/model for subsequent chat calls.
- Bootstrap import from `PALADIN_AI_*` variables plus backwards-compatible `DEEPSEEK_API_KEY`.
- Secret redaction and masked-key presentation across Agent, Desktop, logs, diagnostics, tests, and UAT evidence.
- Documentation updates that stop presenting `DEEPSEEK_API_KEY` as a hard startup prerequisite.

**Out of scope (from SPEC.md):**
- OAuth, cloud account linking, provider billing management, or marketplace-style provider discovery.
- Organization/team-shared provider policy.
- Migration of Go Server auth, quota, audit, or database readiness semantics beyond separating them from AI-provider readiness.
- Secure enclave/keychain hardening beyond the project's current local-storage and redaction guarantees.
- Changing CopilotKit protocol semantics except what is necessary to surface provider-not-configured errors productively.

</spec_lock>

<decisions>
## Implementation Decisions

### Configuration Authority and Sync
- **D-01:** Desktop app data is the persisted authority for AI provider configuration. Agent exposes runtime read/update/validate endpoints or commands so Desktop can refresh the active provider state without restarting sidecars.
- **D-02:** Rust/Tauri is the only writer for the persisted app data configuration. Agent receives an in-memory runtime snapshot and must not write the provider config file directly.
- **D-03:** Do not implement hot switching by restarting the Agent sidecar. The intended path is: Desktop saves config -> Desktop updates persisted app data -> Desktop calls Agent runtime refresh/update -> subsequent chat requests use the refreshed provider snapshot.

### Agent Runtime Model Lifecycle
- **D-04:** Agent uses a lazy model resolver. Startup loads the server, health endpoint, system prompt/tooling prerequisites, and runtime provider state, but it does not require creating an `OpenAIChatModel` at import time.
- **D-05:** Chat/request handling creates or reuses the concrete model from the current provider snapshot at request time. If no usable provider exists, Agent returns a structured `provider-not-configured` style error/state instead of crashing or making the process unhealthy.
- **D-06:** Provider switching uses snapshot-at-request-start semantics. In-flight streaming requests continue with the provider snapshot they started with; the next request uses the newly active provider/model.

### Desktop UX and Provider Settings
- **D-07:** The user-facing configure-provider path has two entry points: an actionable chat-area CTA when chat cannot proceed because no provider is configured, and a persistent AI provider status entry in the status bar.
- **D-08:** CTA means "Call To Action": a direct action button or link such as "配置 AI provider", not merely passive error text.
- **D-09:** Provider management lives in the existing right-side panel by adding an `AI Provider` or `Settings` view to `RightPanel`, rather than introducing a full routing system or using only a modal dialog.
- **D-10:** The settings view supports saving provider configuration independently from connection testing. Saving persists the provider; a separate "测试连接" action validates base URL/key/model. Active providers may be saved in `untested` or `failed` state, and the UI must show that state clearly.

### Secret Storage and Display
- **D-11:** Phase 11 uses a local protected app-data configuration abstraction as the minimum viable secret storage. System Keychain/Credential Manager/Secret Service integration is deferred to a later secure-phase or security hardening phase.
- **D-12:** API keys are write-only from the normal UI perspective. Read APIs and UI display only key presence plus a fixed-format short masked fingerprint; edit fields do not prefill the raw key. Re-entering a key replaces the previous stored secret.
- **D-13:** Redaction must be expanded beyond `DEEPSEEK_API_KEY` to include `PALADIN_AI_API_KEY`, provider-specific aliases used by bootstrap, bearer tokens, and any runtime diagnostic fields that can carry secrets.

### Todo Routing
- **D-14:** Fold `desktop-ai-provider-configuration.md` into Phase 11. It is the originating high-priority todo and its goals are represented by `11-SPEC.md` plus the decisions in this context.
- **D-15:** Do not fold layout/sidebar todos into Phase 11. `refactor-app-tsx-layout.md`, `integrate-conversation-list.md`, and `implement-resizable-sidebar.md` are reviewed as weak keyword matches and belong to separate chat/sidebar UI work.

### the agent's Discretion
- Choose the exact Agent API route names and DTO field names for config read/update/validate, as long as they preserve Desktop authority and secret masking.
- Choose whether the lazy resolver caches model clients by provider ID/model ID, as long as provider switching obeys snapshot-at-request-start semantics.
- Choose exact UI copy for the missing-provider CTA, keeping it neutral and actionable per `11-SPEC.md` prohibitions.
- Choose the concrete app-data file names and local protected-storage representation, keeping packaged resources read-only and secret values out of normal UI/log output.

### Folded Todos
- `desktop-ai-provider-configuration.md` — Original high-priority todo calling for runtime-configurable AI provider setup, no-key startup, desktop settings, DeepSeek `api_base` support, unified `PALADIN_AI_*` naming, hot switching, and secret-safe diagnostics. Folded fully into Phase 11 scope.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked Scope and Phase Inputs
- `.planning/phases/11-desktop-ai-provider-configuration/11-SPEC.md` — Locked Phase 11 requirements, boundaries, acceptance criteria, edge coverage, and prohibitions; MUST read before planning.
- `.planning/ROADMAP.md` — Phase 11 placement and current roadmap wording.
- `.planning/REQUIREMENTS.md` — Project-level Agent, Desktop, Sidecar, and Packaging requirement context.
- `.planning/STATE.md` — Prior packaging/runtime decisions and current phase state.
- `.planning/todos/pending/desktop-ai-provider-configuration.md` — Folded source todo for this phase.

### Prior Runtime and Packaging Decisions
- `.planning/phases/10-packaging/10-CONTEXT.md` — Packaged app startup, supervisor-owned sidecars, explicit environment forwarding, packaged `.env` boundary, and Go-degraded non-blocking semantics.
- `.planning/phases/10.1-macos-linux-packaging-workflows/10.1-CONTEXT.md` — Packaging buildability context; confirms provider configuration is separate runtime work.
- `.planning/phases/07.4-sidecar-runtime-mode/07.4-CONTEXT.md` — Hybrid dev attach/spawn ownership model, health/readiness tuple semantics, and external service safety.
- `.planning/phases/07.3-sidecar-process-management/07.3-CONTEXT.md` — ProcessSupervisor lifecycle, status events, logging, and diagnostics patterns.

### Active Agent Surfaces
- `apps/agent/src/server/main.py` — Current module-import Agent creation and `/health`/`/copilotkit` endpoints; must change so no-key startup succeeds.
- `apps/agent/src/agent/paladin_agent.py` — Current `ModelConfig`, `_create_model()`, `create_paladin_agent()`, DeepSeek hardcoded base URL, and fallback model creation.
- `apps/agent/config/config.json` — Current bundled/repo model config that should stop being the sole runtime source.
- `apps/agent/.env.example` — Current DeepSeek/LM Studio bootstrap documentation to update.
- `apps/agent/tests/test_agent.py` and `apps/agent/tests/test_server.py` — Existing tests that assume env-provided keys; update/add no-key startup, lazy resolver, DeepSeek base URL, and health-readiness coverage.

### Active Desktop/Rust Surfaces
- `apps/desktop/src-tauri/src/process/supervisor.rs` — Current business env allowlist, sidecar env forwarding, and process runtime truth source.
- `apps/desktop/src-tauri/src/process/log_redact.rs` — Existing redaction path; expand for `PALADIN_AI_*` and provider secret aliases.
- `apps/desktop/src-tauri/src/process/commands.rs` — Existing Tauri command pattern for runtime/process data; likely home for provider config commands or adjacent module integration.
- `apps/desktop/src-tauri/src/lib.rs` — Tauri setup and command registration.
- `apps/desktop/src/App.tsx` — Current CopilotKit provider mounting, runtime config loading, and generic CopilotKit error handling.
- `apps/desktop/src/components/ChatArea.tsx` — Place for missing-provider chat CTA when no configured provider can serve a chat request.
- `apps/desktop/src/components/layout/RightPanel.tsx` — Existing right panel tabs (`terminal`, `file-preview`, `diff`, `logs`) to extend with an AI Provider/Settings view.
- `apps/desktop/src/stores/terminal.ts` — Current `activePanel` union that must include the new provider/settings panel.
- `apps/desktop/src/components/StatusBar/ProcessLight.tsx` and `apps/desktop/src/components/StatusBar.tsx` — Existing status bar patterns; add separate AI provider status without conflating process health.
- `apps/desktop/src/components/ui/button.tsx`, `popover.tsx`, `sheet.tsx`, `alert-dialog.tsx`, `scroll-area.tsx`, `sonner.tsx` — Existing shadcn-style primitives available for settings UI and feedback.

### Documentation and Evidence Surfaces
- `README.md` — Current setup guidance mentions `DEEPSEEK_API_KEY` as the practical path; update to no-key startup plus runtime settings.
- `docs/packaging.md` — Current packaged configuration/troubleshooting docs describe `DEEPSEEK_API_KEY` as required; update for AI provider runtime configuration and separate Go readiness semantics.
- `scripts/launch-paladin-macos.sh` and `scripts/test-launch-paladin-macos.sh` — Current macOS launch wrapper/test references `DEEPSEEK_API_KEY`; update bootstrap and missing-config expectations.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `ProcessSupervisor` and `get_runtime_config`: Rust/Tauri already acts as runtime truth source for process URLs and sidecar state; provider config commands should follow this pattern.
- `environment_for_process()`: Existing allowlist-based env forwarding is the correct place to add `PALADIN_AI_*` bootstrap variables while preserving explicit env boundaries.
- `redact_log_line()`: Existing pure redaction function and tests can be extended for AI provider secrets.
- `RightPanel`: Already supports tabbed tool views and fixed right-side settings-like surfaces; adding a provider panel fits the established UI shell.
- Existing shadcn-style UI primitives: Button, Popover, Sheet, AlertDialog, ScrollArea, and Sonner support forms, confirmations, status popovers, and feedback without adding a new design system.

### Established Patterns
- Rust is the desktop/runtime coordination layer; frontend calls Tauri commands via `invoke`.
- Packaged app resources are read-only inputs; mutable runtime state belongs in app data or external runtime locations.
- Agent availability gates CopilotKit mounting today, while Go degraded state is non-blocking. Phase 11 must add AI provider readiness as a third product state, not overload process health.
- Existing frontend state uses Zustand; panel state currently lives in `useTerminalStore`, so adding a settings panel either extends that union or motivates a small rename/refactor at plan time.
- Tests are expected at Python, Rust, and frontend layers for behavior changes that affect startup, config, diagnostics, and UI.

### Integration Points
- Refactor `src.server.main` so importing the module and serving `/health` does not require immediate model creation.
- Introduce an Agent runtime provider snapshot/resolver that `_create_model()` or its replacement can use at request time.
- Update DeepSeek provider creation so `api_base` is honored.
- Add Rust/Tauri commands for provider CRUD, active provider selection, masked readback, bootstrap import, and Agent runtime refresh.
- Extend `RightPanel` tabs and `useTerminalStore.activePanel` to include the AI Provider/Settings view.
- Add a chat-area missing-provider state and an AI provider status entry that opens the settings panel.
- Extend secret redaction tests, launch wrapper tests, and UAT/evidence scanners so new `PALADIN_AI_*` variables cannot leak raw values.

</code_context>

<specifics>
## Specific Ideas

- The missing-provider prompt should be calm and neutral, for example "尚未配置 AI provider" with a direct "配置 AI provider" action. Avoid fear, blame, or alarmist language.
- Save and test should remain separate actions. This supports local LM Studio or cloud providers that may be temporarily offline while still allowing configuration edits.
- Use status vocabulary like `unconfigured`, `untested`, `available`, and `invalid` for AI provider readiness; keep it separate from process `running/degraded/unhealthy`.
- Masked key display should use a fixed format and not reveal the full key or key length. Editing a provider should show an empty secret input with "已配置" metadata rather than prefilled secret text.

</specifics>

<deferred>
## Deferred Ideas

- System Keychain/Credential Manager/Secret Service integration for API keys — defer to a later secure-phase/security-hardening phase.
- Organization/team-shared provider policy, provider marketplace/discovery, OAuth provider accounts, billing management, and quota UI — out of scope for local desktop runtime configuration.
- Full App.tsx workspace/chat-sidebar layout refactor, conversation-list integration, and resizable sidebar work — separate UI phases/todos.

### Reviewed Todos (not folded)
- `refactor-app-tsx-layout.md` — weak keyword match; belongs to workspace/chat layout refactor, not provider configuration.
- `integrate-conversation-list.md` — weak keyword match; belongs to chat/sidebar history work, not provider configuration.
- `implement-resizable-sidebar.md` — weak keyword match; belongs to sidebar ergonomics, not provider configuration.

</deferred>

---

*Phase: 11-desktop-ai-provider-configuration*
*Context gathered: 2026-07-13*

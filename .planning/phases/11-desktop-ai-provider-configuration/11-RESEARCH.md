# Phase 11: desktop-ai-provider-configuration - Research

**Researched:** 2026-07-13  
**Domain:** Tauri desktop runtime configuration, Python Agent runtime model resolution, provider settings UI  
**Confidence:** HIGH for codebase facts, MEDIUM for external framework patterns

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
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

### Deferred Ideas (OUT OF SCOPE)
- System Keychain/Credential Manager/Secret Service integration for API keys — defer to a later secure-phase/security-hardening phase.
- Organization/team-shared provider policy, provider marketplace/discovery, OAuth provider accounts, billing management, and quota UI — out of scope for local desktop runtime configuration.
- Full App.tsx workspace/chat-sidebar layout refactor, conversation-list integration, and resizable sidebar work — separate UI phases/todos.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| R1 | No-key startup: Agent, desktop, and sidecars start without AI provider keys; `/health` stays 200 and reports AI readiness separately. | Current module-import model creation is blocking startup at `apps/agent/src/server/main.py:58` and `apps/agent/src/agent/paladin_agent.py:327`; plan must move model construction to request-time resolver. [VERIFIED: codebase grep] |
| R2 | Actionable chat fallback for missing/invalid provider. | `ChatArea` currently only renders CopilotChat/welcome states and has no provider CTA path. [VERIFIED: codebase grep] |
| R3 | Desktop provider configuration surface for DeepSeek, OpenAI-compatible, and LM Studio. | `RightPanel` already owns fixed tabbed tool views and has no `ai-provider` tab yet. [VERIFIED: codebase grep] |
| R4 | Persistent runtime authority and hot switching without sidecar restart. | Rust/Tauri already owns runtime command/state patterns through `ProcessSupervisor`, `get_runtime_config`, and `invoke` usage. [VERIFIED: codebase grep] |
| R5 | Env bootstrap compatibility for `PALADIN_AI_*` and `DEEPSEEK_API_KEY`. | Supervisor allowlist currently includes `DEEPSEEK_API_KEY` but no `PALADIN_AI_*` names. [VERIFIED: codebase grep] |
| R6 | Secret safety across logs, diagnostics, UI, metadata, and evidence. | Redaction currently covers DeepSeek/JWT/Bearer/password patterns, not `PALADIN_AI_API_KEY` or provider aliases. [VERIFIED: codebase grep] |
| R7 | Separate Agent liveness, AI provider readiness, and Go readiness. | Existing process status model already separates `state`, `owner`, and `health`; Phase 11 needs a separate AI readiness store/API, not reuse process health. [VERIFIED: codebase grep] |
</phase_requirements>

## Summary

Phase 11 should be planned as a cross-tier runtime configuration capability, not as a UI-only settings form. The hard boundary is: Rust/Tauri persists and mutates local provider config, Python Agent receives an in-memory runtime snapshot and exposes validate/activate/readiness APIs, and React renders provider status plus settings controls. [VERIFIED: 11-CONTEXT.md]

The largest technical risk is the current Agent import path. `src.server.main` creates `agent = create_paladin_agent(...)` at module import, and `create_paladin_agent()` immediately calls `_create_model(primary_config)`, which raises when the env API key cannot be resolved. This must be split into "tooling/runtime shell can start" and "provider/model can serve a request". [VERIFIED: codebase grep]

**Primary recommendation:** implement `AiProviderConfigManager` in Rust with atomic-ish JSON persistence and masked DTOs, plus an Agent `ProviderRuntime` lazy resolver that snapshots provider state at request start; never restart sidecars for switching. [VERIFIED: 11-CONTEXT.md] [ASSUMED]

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|--------------|----------------|-----------|
| Persist provider metadata/secrets | Desktop Rust / Tauri | Filesystem app data | CONTEXT locks Rust/Tauri as only persisted writer; packaged resources must remain read-only. [VERIFIED: 11-CONTEXT.md] |
| Runtime provider snapshot | API / Python Agent | Desktop Rust / Tauri | Agent must serve chat from in-memory snapshot supplied by Desktop; it must not write the config file. [VERIFIED: 11-CONTEXT.md] |
| Validate provider connection | Python Agent | Desktop Rust / React | Validation needs provider SDK semantics and should not persist or activate unless the user saves/selects. [VERIFIED: 11-SPEC.md] |
| Missing-provider CTA | Browser / React | Python Agent | Agent emits structured missing-provider state; React owns actionable CTA and panel opening. [VERIFIED: 11-UI-SPEC.md] |
| AI provider status | Browser / React | Python Agent health/readiness API | StatusBar must show AI readiness separately from Agent/Go process lights. [VERIFIED: 11-UI-SPEC.md] |
| Env bootstrap | Desktop Rust / Tauri | Process supervisor env forwarding | Desktop owns config import precedence; supervisor already filters explicit env allowlists. [VERIFIED: codebase grep] |
| Secret redaction | Desktop Rust / Agent logging | Tests/evidence scans | Rust already redacts process logs before emit/tail/disk; expand vocabulary and apply same policy to diagnostics. [VERIFIED: codebase grep] |

## Project Constraints

- No `AGENTS.md` or `.codex/AGENTS.md` was found in `/Users/kdocs/Workspace/paladin`; user-facing explanations in this session still follow the user-provided Chinese-language instruction. [VERIFIED: codebase find]
- `workflow.nyquist_validation` is enabled in `.planning/config.json`; include validation architecture and Wave 0 test gaps. [VERIFIED: codebase grep]
- `workflow.security_enforcement` is enabled with ASVS level 1; include Security Domain. [VERIFIED: codebase grep]
- Do not add third-party UI/form packages; `11-UI-SPEC.md` explicitly says no new third-party form library and no third-party shadcn registry. [VERIFIED: 11-UI-SPEC.md]

## Standard Stack

### Core
| Library / Layer | Version | Purpose | Why Standard |
|-----------------|---------|---------|--------------|
| Tauri | `2` in `apps/desktop/src-tauri/Cargo.toml` | Rust commands, managed state, app data paths, sidecar supervision | Existing desktop runtime authority and official state-management pattern. [VERIFIED: codebase grep] [CITED: https://v2.tauri.app/develop/state-management/] |
| React | `^19.1.0` | Provider settings UI, ChatArea CTA, StatusBar AI status | Existing desktop UI stack. [VERIFIED: codebase grep] |
| Zustand | `^5.0.14` | Provider/readiness frontend store | Existing stores already use Zustand for process and panel state. [VERIFIED: codebase grep] |
| shadcn/Base UI primitives | existing `button`, `popover`, `scroll-area`, `alert-dialog`, `sonner` | Settings form, status popover, delete confirmation, feedback | UI-SPEC locks existing primitives and forbids new third-party form library. [VERIFIED: 11-UI-SPEC.md] |
| Pydantic AI | `>=2.3.0` | Agent and `OpenAIChatModel` provider integration | Existing Agent dependency; docs define Model/Provider separation and OpenAI-compatible provider configuration. [VERIFIED: codebase grep] [CITED: https://pydantic.dev/docs/ai/models/overview/] |
| FastAPI | `>=0.136.3` | Agent provider config/readiness HTTP API | Existing Agent server framework. [VERIFIED: codebase grep] |
| CopilotKit React Core | `^1.60.1` | Existing chat runtime provider and error boundary | Existing `CopilotKitProvider`/`CopilotChat` integration. [VERIFIED: codebase grep] |
| Rust `serde_json` + `tokio::sync::Mutex` | existing Cargo deps | Config DTO serialization and overlapping-save serialization | Existing Rust dependencies are sufficient; no new persistence crate required. [VERIFIED: codebase grep] [ASSUMED] |

### Supporting
| Library / Tool | Version | Purpose | When to Use |
|----------------|---------|---------|-------------|
| `reqwest` | `0.12` rustls | Desktop/Rust can call Agent validate/refresh endpoints if implemented from Tauri command layer | Use for Rust-to-Agent refresh/validate calls. [VERIFIED: codebase grep] |
| `regex` | `1` | Expand log redaction patterns | Existing redaction implementation uses regex. [VERIFIED: codebase grep] |
| `sonner` | `^2.0.7` | Save/test feedback | Use for non-blocking provider save/test result notifications. [VERIFIED: codebase grep] |
| lucide-react | `^1.18.0` | Settings/provider/status icons | UI-SPEC requires lucide icons. [VERIFIED: codebase grep] [VERIFIED: 11-UI-SPEC.md] |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Rust app-data JSON | SQLite | Overkill for small local config; concurrency can be handled with Rust state mutex and temp-file rename. [ASSUMED] |
| Existing `useTerminalStore` for panel state | New `useRightPanelStore` | Existing code names the right panel state as terminal; a rename is cleaner but expands blast radius. Planner should choose small union extension unless doing a contained rename. [VERIFIED: codebase grep] [ASSUMED] |
| Agent endpoint refresh | Sidecar restart | Restart violates D-03 and loses in-flight request semantics. [VERIFIED: 11-CONTEXT.md] |

**Installation:** no new external packages recommended. [VERIFIED: codebase grep]

## Package Legitimacy Audit

No external package installation is recommended for this phase. Existing dependencies are already present in `apps/desktop/package.json`, `apps/agent/pyproject.toml`, and `apps/desktop/src-tauri/Cargo.toml`. [VERIFIED: codebase grep]

**Packages removed due to [SLOP] verdict:** none  
**Packages flagged as suspicious [SUS]:** none

## Architecture Patterns

### System Architecture Diagram

```text
User opens CTA/status/settings
  -> React provider store invokes Tauri provider commands
    -> Rust AiProviderConfigManager validates DTO shape, masks readback, serializes saves
      -> App data provider config + protected local secret representation
      -> Rust calls Agent /ai-provider/runtime refresh with masked-free runtime snapshot
        -> Python ProviderRuntime swaps active snapshot under lock/version
          -> Next /copilotkit request captures snapshot at request start
            -> If unconfigured/invalid: structured provider-not-configured response
            -> If configured: create/reuse OpenAIChatModel with provider base_url/key/model
              -> AGUIAdapter streams response to CopilotKit
```

### Recommended Project Structure

```text
apps/desktop/src-tauri/src/ai_provider/
├── mod.rs              # manager wiring and exported commands
├── types.rs            # persisted DTOs, masked DTOs, readiness enum
├── storage.rs          # app data paths, read/write, concurrency tests
├── bootstrap.rs        # PALADIN_AI_* and DEEPSEEK_API_KEY import
└── redact.rs           # shared helper or tests around provider secret aliases

apps/agent/src/agent/provider_runtime.py
apps/agent/src/server/provider_routes.py

apps/desktop/src/stores/aiProvider.ts
apps/desktop/src/components/provider/AiProviderPanel.tsx
apps/desktop/src/components/StatusBar/AiProviderLight.tsx
```

### Pattern 1: Desktop-Owned Provider Manager
**What:** Manage persisted config as Tauri state using `app.manage(...)`; expose commands like `get_ai_provider_config`, `save_ai_provider`, `delete_ai_provider`, `set_active_ai_provider`, `test_ai_provider`, and `refresh_agent_ai_provider`. [CITED: https://v2.tauri.app/develop/state-management/]  
**When to use:** All UI reads/writes and bootstrap import.  
**Example:**
```rust
// Source: existing process command pattern + Tauri state docs
#[tauri::command]
async fn save_ai_provider(
    state: tauri::State<'_, AiProviderConfigManager>,
    input: SaveProviderInput,
) -> Result<MaskedProviderConfig, String> {
    state.save_provider(input).await
}
```

### Pattern 2: Request-Time Agent Snapshot
**What:** Keep Agent process live with tooling initialized; select provider/model at request start from a versioned runtime snapshot. [VERIFIED: 11-CONTEXT.md]  
**When to use:** `/copilotkit`, `/health`, validation, and provider switching.  
**Example:**
```python
# Source: Pydantic AG-UI docs + current main.py dispatch path
snapshot = provider_runtime.snapshot()
if not snapshot.usable:
    return provider_not_configured_response(snapshot)
agent = agent_factory.for_snapshot(snapshot)
return await AGUIAdapter.dispatch_request(request=replay_request, agent=agent, deps=agent._default_deps)
```

### Pattern 3: Save/Test Separation
**What:** `保存配置` persists local config and may mark readiness `untested`; `测试连接` validates current provider without implicitly changing active provider unless the user saves/selects. [VERIFIED: 11-UI-SPEC.md]  
**When to use:** Provider editor and status popover.

### Anti-Patterns to Avoid
- **Agent writes config file:** violates Desktop persisted authority. [VERIFIED: 11-CONTEXT.md]
- **Sidecar restart for hot switch:** violates D-03 and breaks in-flight stream semantics. [VERIFIED: 11-CONTEXT.md]
- **Raw key readback or prefilled input:** violates D-12 and R6. [VERIFIED: 11-CONTEXT.md]
- **Reusing process health for AI readiness:** violates R7; missing provider is not Agent stopped/unhealthy. [VERIFIED: 11-SPEC.md]
- **Hardcoded DeepSeek base URL:** current code hardcodes `https://api.deepseek.com/v1`; Phase 11 must use configured `api_base`. [VERIFIED: codebase grep]

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| LLM provider HTTP client | Custom fetch/SSE model client | `OpenAIChatModel` with `OpenAIProvider`/`DeepSeekProvider` or an OpenAI-compatible provider path | Pydantic AI already models vendor/provider separation and OpenAI-compatible base URLs. [CITED: https://pydantic.dev/docs/ai/models/openai/] |
| Tauri command state plumbing | Global mutable statics | `app.manage` + `State<'_, T>` | Official Tauri pattern and existing supervisor pattern. [CITED: https://v2.tauri.app/develop/state-management/] [VERIFIED: codebase grep] |
| Settings UI primitives | New form/modal library | Existing shadcn primitives and native inputs | UI-SPEC forbids new third-party form library. [VERIFIED: 11-UI-SPEC.md] |
| Secret redaction | Per-call ad hoc string replacements | Extend central `redact_log_line()` and tests | Existing process logs use central redaction before emit/tail/disk. [VERIFIED: codebase grep] |
| Provider-ready classification | Toast-only string matching | Structured readiness enum: `unconfigured`, `untested`, `available`, `invalid` | UI-SPEC and SPEC require separate state classifications. [VERIFIED: 11-UI-SPEC.md] |

**Key insight:** The planner should create separate tasks for persistence authority, Agent runtime snapshot, UI surfaces, and redaction/evidence; merging them into one "settings panel" task will miss startup and hot-switch invariants. [ASSUMED]

## Runtime State Inventory

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | Existing model candidates live in bundled/repo `apps/agent/config/config.json`; no app-data provider file exists yet. [VERIFIED: 11-SPEC.md] | Create app-data runtime config and bootstrap import path; do not mutate bundled config. |
| Live service config | No external service UI/database config identified for AI providers in this phase. [VERIFIED: codebase grep] | None. |
| OS-registered state | Tauri sidecars are supervised by `ProcessSupervisor`; no OS scheduler/launchd provider config state found. [VERIFIED: codebase grep] | None. |
| Secrets/env vars | `DEEPSEEK_API_KEY` is currently allowlisted and tests/docs assume it; `PALADIN_AI_*` not yet allowlisted/redacted. [VERIFIED: codebase grep] | Add bootstrap/import precedence and redaction; update launch docs/tests. |
| Build artifacts / installed packages | Packaged resources are read-only; Phase 10 packaging docs/scripts mention env-key startup path. [VERIFIED: 11-CONTEXT.md] | Update docs and launch test expectations; ensure packaged app starts no-key. |

## Common Pitfalls

### Pitfall 1: Fixing `/health` by Faking Success While `/copilotkit` Still Crashes
**What goes wrong:** Agent health returns 200 but first chat still raises missing-key or hardcoded-base errors. [VERIFIED: codebase grep]  
**Why it happens:** Model creation remains tied to `create_paladin_agent()` instead of request-time provider snapshot. [VERIFIED: codebase grep]  
**How to avoid:** Add no-key import/startup tests plus missing-provider chat route tests. [ASSUMED]  
**Warning signs:** Tests only call `/health`, not `/copilotkit` or provider runtime APIs. [ASSUMED]

### Pitfall 2: Secret Leaks Through "Helpful" Diagnostics
**What goes wrong:** raw key appears in logs, stderr tail, toast, diagnostics, or UAT snapshots. [VERIFIED: 11-SPEC.md]  
**Why it happens:** Current redaction only targets five patterns and logger currently logs `config.api_key` env reference. [VERIFIED: codebase grep]  
**How to avoid:** Centralize masked DTOs and expand redaction before any emit/tail/disk/UI path. [VERIFIED: codebase grep]  
**Warning signs:** API readback includes `api_key`, key length, raw prefix/suffix, or env var value. [VERIFIED: 11-UI-SPEC.md]

### Pitfall 3: Env Bootstrap Overwrites User Choice
**What goes wrong:** later launches with env vars silently switch active paid/cloud provider. [VERIFIED: 11-SPEC.md]  
**Why it happens:** Bootstrap is treated as override instead of seed-only after explicit local save. [VERIFIED: 11-SPEC.md]  
**How to avoid:** Persist `user_saved=true` or equivalent provenance and make env import idempotent. [ASSUMED]

### Pitfall 4: Panel State Change Accidentally Breaks Terminal
**What goes wrong:** adding `ai-provider` to `useTerminalStore.activePanel` affects terminal open/close semantics. [VERIFIED: codebase grep]  
**Why it happens:** RightPanel state lives in a terminal-named store and `removeTab()` can close the whole panel when terminal tabs go empty. [VERIFIED: codebase grep]  
**How to avoid:** Test opening provider panel with zero terminal tabs and switching among logs/diff/provider. [ASSUMED]

## Code Examples

### Agent Provider DTO
```python
# Source: Phase 11 requirements; names are recommended, planner may adjust.
@dataclass(frozen=True)
class ProviderSnapshot:
    version: int
    provider_id: str | None
    provider_type: Literal["deepseek", "openai-compatible", "lm-studio"] | None
    base_url: str | None
    model_id: str | None
    api_key: str | None
    readiness: Literal["unconfigured", "untested", "available", "invalid"]
```

### Rust Masked Readback
```rust
// Source: 11-UI-SPEC secret contract; do not expose raw api_key.
#[derive(serde::Serialize)]
struct MaskedProvider {
    id: String,
    display_name: String,
    provider_type: ProviderType,
    base_url: String,
    model_id: String,
    has_api_key: bool,
    key_fingerprint: Option<String>,
    readiness: AiReadiness,
}
```

### Frontend CTA Opens Existing Right Panel
```tsx
// Source: existing useTerminalStore panel controls + 11-UI-SPEC interaction contract.
const openProviderSettings = () => {
  const panel = useTerminalStore.getState();
  panel.setActivePanel('ai-provider');
  panel.openPanel();
};
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Startup-time env-only model creation | Desktop persisted provider config + Agent lazy runtime snapshot | Phase 11 target | Enables no-key startup and hot switching. [VERIFIED: 11-SPEC.md] |
| DeepSeek hardcoded base URL | Runtime `api_base` honored per provider | Phase 11 target | Required for DeepSeek-compatible and local endpoints. [VERIFIED: 11-SPEC.md] |
| Process health as only visible state | Agent liveness + AI readiness + Go readiness separated | Phase 11 target | Prevents missing AI config from appearing as process/DB failure. [VERIFIED: 11-SPEC.md] |

**Deprecated/outdated:**
- Treating `DEEPSEEK_API_KEY` as hard startup prerequisite is outdated for Phase 11. [VERIFIED: 11-SPEC.md]
- Returning raw or prefilled API keys to UI is prohibited. [VERIFIED: 11-CONTEXT.md]

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Existing `serde_json`, `tokio::sync::Mutex`, and same-directory temp rename are sufficient for local JSON persistence without a new crate. | Standard Stack / Architecture Patterns | Planner may need to add a crate or stricter fsync handling if cross-platform atomicity requirements are raised. |
| A2 | A request-scoped agent wrapper or model cache can be implemented without breaking `pydantic_deep.create_deep_agent()` tooling semantics. | Architecture Patterns | Planner may need a spike if pydantic-deep does not allow swapping model cleanly. |
| A3 | Extending `useTerminalStore` is lower risk than a right-panel store rename. | Alternatives / Pitfalls | Planner may choose a small refactor if terminal naming becomes too confusing. |

## Open Questions

1. **Exact Agent refresh API shape**
   - What we know: Desktop must call Agent runtime refresh/update without restart. [VERIFIED: 11-CONTEXT.md]
   - What's unclear: Whether to use `PUT /ai-provider/runtime`, `POST /ai-provider/refresh`, or Tauri-mediated internal command naming. [ASSUMED]
   - Recommendation: Planner should lock DTO names early and keep API raw-key write-only. [ASSUMED]

2. **Pydantic-deep model replacement mechanics**
   - What we know: current `create_deep_agent(model=primary_model, ...)` receives the model at construction. [VERIFIED: codebase grep]
   - What's unclear: Whether best implementation is a cached agent per provider snapshot or a rebuilt request-scoped agent. [ASSUMED]
   - Recommendation: Add a Wave 0 spike/test for snapshot-at-request-start using fake `OpenAIChatModel`. [ASSUMED]

3. **Protected local storage representation**
   - What we know: system keychain is deferred and app-data abstraction is MVP. [VERIFIED: 11-CONTEXT.md]
   - What's unclear: Whether "protected" means file permissions only, split metadata/secret files, or simple local JSON with redaction guarantees. [ASSUMED]
   - Recommendation: Use metadata + secret file abstraction with restrictive permissions where platform-supported; document as non-keychain. [ASSUMED]

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | desktop build/test | ✓ | `v22.22.3` | None needed. [VERIFIED: command] |
| pnpm | desktop tests/scripts | ✓ | `11.5.2` | npm not recommended due workspace lockfile. [VERIFIED: command] |
| uv | Agent tests with Python 3.12 env | ✓ | `0.7.5` | Use project uv environment instead of system `python3`. [VERIFIED: command] |
| system python3 | direct Python command | ⚠ | `3.9.6` | Use `uv run` because Agent requires `>=3.12`. [VERIFIED: command] |
| cargo | Rust tests | ✓ | `1.96.0` | None needed. [VERIFIED: command] |
| rustc | Rust compile/test | ✓ | `1.96.0` | None needed. [VERIFIED: command] |

**Missing dependencies with no fallback:** none found. [VERIFIED: command]  
**Missing dependencies with fallback:** system `python3` is too old for Agent, but `uv` is available. [VERIFIED: command]

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Python Agent | `pytest>=9.1.0` via `uv run pytest` from `apps/agent`. [VERIFIED: codebase grep] |
| Rust Desktop | Cargo tests from `apps/desktop/src-tauri`. [VERIFIED: codebase grep] |
| Frontend | `vitest` through `pnpm --filter @paladin/desktop test --run`. [VERIFIED: codebase grep] |
| Root quick suite | `pnpm test` runs desktop Vitest plus Node release-script tests. [VERIFIED: codebase grep] |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| R1 | no-key import/startup and `/health` 200 with AI readiness | Python unit/API | `cd apps/agent && uv run pytest tests/test_server.py -x` | ✅ update existing |
| R2 | missing-provider chat returns structured CTA state and no process exit | Python API + React component | `cd apps/agent && uv run pytest tests/test_server.py -x`; `pnpm --filter @paladin/desktop test --run ChatArea` | ❌ Wave 0 add frontend test |
| R3 | provider CRUD UI supports provider fields and masked key | React component/store | `pnpm --filter @paladin/desktop test --run AiProvider` | ❌ Wave 0 add |
| R4 | repeated/concurrent saves and hot switch next-request semantics | Rust unit + Python unit | `cd apps/desktop/src-tauri && cargo test ai_provider --lib`; `cd apps/agent && uv run pytest tests/test_provider_runtime.py -x` | ❌ Wave 0 add |
| R5 | env bootstrap seeds clean app data and does not override saved config | Rust unit | `cd apps/desktop/src-tauri && cargo test ai_provider --lib` | ❌ Wave 0 add |
| R6 | raw secrets absent from logs/readbacks/UI snapshots | Rust unit + frontend tests + scans | `cd apps/desktop/src-tauri && cargo test log_redact --lib`; `pnpm --filter @paladin/desktop test --run AiProvider` | ✅ extend existing redaction |
| R7 | AI readiness separate from Agent/Go process status | Rust/React/Python unit | focused tests above plus `pnpm --filter @paladin/desktop test --run StatusBar` | ❌ Wave 0 add |

### Sampling Rate
- **Per task commit:** focused test for changed tier: `uv run pytest ... -x`, `cargo test <module> --lib`, or `pnpm --filter @paladin/desktop test --run <pattern>`. [ASSUMED]
- **Per wave merge:** `cd apps/agent && uv run pytest`; `cd apps/desktop/src-tauri && cargo test`; `pnpm --filter @paladin/desktop test --run`. [VERIFIED: codebase grep]
- **Phase gate:** full suites plus secret/evidence scan and no-key startup smoke. [VERIFIED: 11-SPEC.md]

### Wave 0 Gaps
- [ ] `apps/agent/tests/test_provider_runtime.py` — snapshot-at-request-start, no-key, invalid provider, DeepSeek base URL.
- [ ] `apps/desktop/src-tauri/src/ai_provider/*_tests.rs` — persistence, bootstrap, concurrency, masked readback.
- [ ] `apps/desktop/src/stores/__tests__/aiProvider.test.ts` — frontend DTO/readiness store.
- [ ] `apps/desktop/src/components/provider/__tests__/AiProviderPanel.test.tsx` — save/test separation and masked key behavior.
- [ ] `apps/desktop/src/components/StatusBar/__tests__/AiProviderLight.test.tsx` — separate AI status popover/actions.
- [ ] `apps/desktop/src/components/__tests__/ChatAreaProviderCta.test.tsx` — missing-provider CTA opens `ai-provider` panel.

## Security Domain

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | Provider keys are local credentials, not user login. [VERIFIED: 11-SPEC.md] |
| V3 Session Management | no | No web session change in scope. [VERIFIED: 11-SPEC.md] |
| V4 Access Control | yes | Rust/Tauri is only persisted writer; Agent cannot write config. [VERIFIED: 11-CONTEXT.md] |
| V5 Input Validation | yes | Validate provider type/base URL/model/key presence and trim surrounding whitespace deterministically. [VERIFIED: 11-SPEC.md] |
| V6 Cryptography | yes | Do not hand-roll crypto; keychain hardening deferred, use local protected app-data abstraction only. [VERIFIED: 11-CONTEXT.md] |
| V7 Error Handling and Logging | yes | Raw secrets must not appear in logs, diagnostics, UI, or evidence. [VERIFIED: 11-SPEC.md] |
| V14 Configuration | yes | Packaged resources are read-only; runtime config belongs under app data. [VERIFIED: 11-SPEC.md] |

### Known Threat Patterns for Phase 11
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Raw API key leaked through logs/stderr tail/toasts | Information Disclosure | Central redaction + masked DTOs + evidence scans. [VERIFIED: codebase grep] |
| Env bootstrap overrides explicit user provider | Tampering | Persist config provenance and do seed-only import after saved local config. [VERIFIED: 11-SPEC.md] [ASSUMED] |
| Concurrent saves corrupt JSON or dangling active provider | Tampering / DoS | Serialize saves in Rust manager; temp-file write + rename; tests for overlapping saves. [VERIFIED: 11-SPEC.md] [ASSUMED] |
| Misclassified missing provider as Agent/Go failure | Spoofing / UX safety | Separate AI readiness enum and separate StatusBar entry. [VERIFIED: 11-SPEC.md] |
| SSRF-like validation to arbitrary base URLs | Tampering / Info Disclosure | User-supplied OpenAI-compatible endpoints are in scope; planner should keep validation explicit, avoid sending secrets except to selected endpoint, and document local-user trust boundary. [ASSUMED] |

## UI Integration Facts and Constraints

- `RightPanel` minimum width is enforced by `setPanelWidth(Math.max(300, w))`; provider UI must work at 300px. [VERIFIED: codebase grep]
- Existing tabs are `terminal`, `file-preview`, `diff`, and `logs`; add `ai-provider` with one consistent lucide icon. [VERIFIED: codebase grep] [VERIFIED: 11-UI-SPEC.md]
- `ChatArea` currently renders either welcome state or `CopilotChat`; provider CTA needs an explicit readiness/error state input. [VERIFIED: codebase grep]
- `StatusBar` currently renders terminal, Agent `ProcessLight`, and Go `ProcessLight`; add a separate AI provider entry, not another process state. [VERIFIED: codebase grep] [VERIFIED: 11-UI-SPEC.md]
- Required copy includes `配置 AI provider`, `尚未配置 AI provider`, `保存配置`, `测试连接`, `连接可用`, and fixed masked key metadata like `API key 已配置 · pk_7F3A`. [VERIFIED: 11-UI-SPEC.md]
- UI must not prefill raw API key, must render field-level validation text, and must keep destructive deletion behind `AlertDialog`. [VERIFIED: 11-UI-SPEC.md]

## Sources

### Primary (HIGH confidence)
- `.planning/phases/11-desktop-ai-provider-configuration/11-CONTEXT.md` — locked authority, lifecycle, UX, secret decisions.
- `.planning/phases/11-desktop-ai-provider-configuration/11-SPEC.md` — seven requirements, acceptance criteria, prohibitions, edge coverage.
- `.planning/phases/11-desktop-ai-provider-configuration/11-UI-SPEC.md` — copy, interaction, components, accessibility.
- Codebase files inspected: `apps/agent/src/server/main.py`, `apps/agent/src/agent/paladin_agent.py`, `apps/desktop/src-tauri/src/process/supervisor.rs`, `apps/desktop/src-tauri/src/process/log_redact.rs`, `apps/desktop/src/App.tsx`, `apps/desktop/src/components/ChatArea.tsx`, `apps/desktop/src/components/layout/RightPanel.tsx`, `apps/desktop/src/stores/terminal.ts`, `apps/desktop/src/components/StatusBar.tsx`.

### Secondary (MEDIUM confidence)
- https://pydantic.dev/docs/ai/models/overview/ — Model/Provider separation.
- https://pydantic.dev/docs/ai/models/openai/ — OpenAI-compatible models and `OpenAIProvider` base URL/API key configuration.
- https://pydantic.dev/docs/ai/integrations/ui/ag-ui/ — `AGUIAdapter.dispatch_request()` FastAPI/Starlette pattern and request-level arguments.
- https://v2.tauri.app/develop/state-management/ — Tauri managed state with commands.
- https://v2.tauri.app/reference/javascript/api/namespacepath/ — app data/config/local data path APIs.
- https://docs.copilotkit.ai/langgraph-fastapi/troubleshooting/common-issues — runtime URL and `/info` troubleshooting pattern.

### Tertiary (LOW confidence)
- Atomic JSON persistence details are based on local Rust practice and existing deps; planner may spike if stricter cross-platform durability is needed. [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — existing project dependencies and UI contract lock the stack; no new packages needed.
- Architecture: HIGH for tier boundaries from CONTEXT, MEDIUM for exact Agent lazy resolver mechanics until pydantic-deep model replacement is spiked.
- Pitfalls: HIGH for startup/redaction/UI facts from code and SPEC, MEDIUM for persistence implementation details.

**Research date:** 2026-07-13  
**Valid until:** 2026-08-12 for codebase-specific research; re-check external Pydantic/CopilotKit docs if dependency versions are upgraded.

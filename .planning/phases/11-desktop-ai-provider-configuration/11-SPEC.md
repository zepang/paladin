# Phase 11: Desktop AI Provider Configuration — Specification

**Created:** 2026-07-13
**Ambiguity score:** 0.10 (gate: <= 0.20)
**Requirements:** 7 locked

## Goal

Paladin moves AI provider setup from required startup-time environment variables to a desktop-managed runtime configuration that supports no-key startup, multiple providers, hot switching, and secret-safe diagnostics.

## Background

Today the Agent server creates the Pydantic AI agent during `src/server/main.py` module import. `create_paladin_agent()` loads `apps/agent/config/config.json`, selects the first model, and `_create_model()` raises when the referenced API key environment variable is missing. The DeepSeek branch ignores `api_base` and hardcodes `https://api.deepseek.com/v1`. Desktop sidecar supervision still allowlists `DEEPSEEK_API_KEY`, and log redaction is keyed around that legacy variable. The frontend mounts CopilotKit only when the Agent process is running, but it has no AI-provider settings surface and no product-level “provider not configured” prompt.

## Requirements

1. **No-key startup:** Agent startup must not require any configured AI provider or API key.
   - Current: Importing `src.server.main` creates the Agent immediately; missing `DEEPSEEK_API_KEY` raises during model creation and prevents startup.
   - Target: Paladin app, Agent sidecar, and Go sidecar start in dev, packaged, and CI/UAT modes with no AI key. Agent `/health` returns HTTP 200 and reports AI model readiness as `unconfigured` or equivalent.
   - Acceptance: With `DEEPSEEK_API_KEY`, `PALADIN_AI_API_KEY`, `OPENAI_API_KEY`, and LM Studio env vars unset, Agent process starts, `/health` returns 200, and the response distinguishes service liveness from model availability.

2. **Actionable chat fallback:** Chat attempts without a usable provider must produce an actionable desktop prompt instead of process exit or generic connection failure.
   - Current: Provider setup failures happen before or during Agent initialization; CopilotKit errors are surfaced as generic toasts.
   - Target: When provider/model is missing, invalid, or rejected, the chat area shows a clear “configure AI provider” state with an action that opens the provider configuration UI.
   - Acceptance: Sending a message with no configured provider leaves the Agent process running and displays a configuration CTA in the chat surface.

3. **Provider configuration surface:** Desktop must provide a settings surface for multiple AI providers.
   - Current: Provider candidates live in `apps/agent/config/config.json`; there is no desktop UI for adding, editing, deleting, ordering, or selecting providers.
   - Target: Users can create and edit DeepSeek, OpenAI-compatible, and local LM Studio providers with provider type, base URL, API key, default model ID, optional display name, priority, and active/inactive selection.
   - Acceptance: A verifier can add at least one provider of each supported type, edit all required fields, see masked key status, and observe validation errors for missing base URL/model/key where that provider type requires them.

4. **Persistent runtime authority and hot switching:** Runtime AI provider configuration must persist under local app data and support switching without restarting Paladin or sidecars.
   - Current: The effective model configuration is loaded from packaged/repo Agent config at process start and then attached to the created Agent instance.
   - Target: Desktop app data is the authoritative persisted runtime source. The active provider/model can be changed while the app and sidecars remain running, and subsequent chat calls use the new provider/model.
   - Acceptance: After saving a provider, restarting Paladin reloads the same non-secret provider metadata; switching active provider/model changes the next Agent request without restarting desktop, Agent, or Go sidecar.

5. **Environment bootstrap compatibility:** Environment variables must seed runtime configuration without remaining the only configuration path.
   - Current: DeepSeek primarily relies on `DEEPSEEK_API_KEY`; docs and launch scripts describe it as required.
   - Target: `PALADIN_AI_PROVIDER`, `PALADIN_AI_BASE_URL`, `PALADIN_AI_API_KEY`, and `PALADIN_AI_MODEL` seed or override the initial/default runtime provider. `DEEPSEEK_API_KEY` remains accepted as a backwards-compatible bootstrap for DeepSeek.
   - Acceptance: A clean app data directory plus `PALADIN_AI_*` env vars produces a usable configured provider; a clean directory plus only `DEEPSEEK_API_KEY` produces a DeepSeek default; app data survives later launches with env vars absent.

6. **Secret safety:** Secret values must never appear in logs, diagnostics, frontend ordinary text, UAT evidence, or persisted non-secret metadata.
   - Current: Redaction covers `DEEPSEEK_API_KEY`, JWT, bearer tokens, and password patterns, but the new `PALADIN_AI_*` vocabulary is not yet covered.
   - Target: API keys are persisted only in the chosen secret storage or protected runtime config format, are returned to UI only as masked metadata, and are redacted from process logs, frontend diagnostics, build artifacts, and test evidence.
   - Acceptance: Source tests and evidence scans prove raw API key values are absent from logs, UI text snapshots, diagnostics payloads, and UAT evidence while key presence/masked status remains visible.

7. **State separation:** AI provider availability must be classified separately from Agent process health and Go DB/Redis readiness.
   - Current: Agent process health is probed via `/health`; Go liveness/readiness has separate `/healthz` and `/readyz`, but AI-provider readiness is not a separate product state.
   - Target: Agent liveness, AI provider readiness, and Go readiness are separate states in API responses and desktop UI. Missing DB/Redis must not be shown as AI misconfiguration, and missing AI provider must not make Go readiness degraded.
   - Acceptance: Test scenarios for missing AI provider, invalid AI key, missing DB, missing Redis, and all-configured state each produce distinct user-visible status classifications.

## Boundaries

**In scope:**

- Agent-side model readiness state and request-time provider resolution.
- Desktop provider settings UI for DeepSeek, OpenAI-compatible endpoints, and LM Studio.
- Runtime persistence under local app data, with Desktop as the authoritative persisted source.
- Agent API or command surface needed for Desktop to read, update, validate, and activate provider config.
- Hot switching of active provider/model for subsequent chat calls.
- Bootstrap import from `PALADIN_AI_*` variables plus backwards-compatible `DEEPSEEK_API_KEY`.
- Secret redaction and masked-key presentation across Agent, Desktop, logs, diagnostics, tests, and UAT evidence.
- Documentation updates that stop presenting `DEEPSEEK_API_KEY` as a hard startup prerequisite.

**Out of scope:**

- OAuth, cloud account linking, provider billing management, or marketplace-style provider discovery — this phase only configures user-supplied endpoints and keys.
- Organization/team-shared provider policy — runtime configuration is local desktop scope.
- Migration of Go Server auth, quota, audit, or database readiness semantics beyond separating them from AI-provider readiness.
- Secure enclave/keychain hardening beyond the project’s current local-storage and redaction guarantees — deeper platform credential storage can be a later security phase if needed.
- Changing CopilotKit protocol semantics except what is necessary to surface provider-not-configured errors productively.

## Constraints

- The app must start without AI credentials in dev, packaged, and CI/UAT modes.
- Packaged builds must not write back into bundled `apps/agent/config/config.json` or installed resources.
- Runtime configuration persistence must tolerate repeated saves and app restarts without duplicating providers or corrupting the active selection.
- Provider switch applies to subsequent requests; in-flight requests may finish on the provider they started with.
- DeepSeek must honor configured `api_base`; no provider branch may silently hardcode a base URL that contradicts runtime config.
- Secret values are write-only from the UI perspective: display and API readbacks expose only presence and masked metadata.

## Acceptance Criteria

- [ ] With all AI provider/key env vars unset, Paladin app, Agent sidecar, and Go sidecar start; Agent `/health` returns HTTP 200 with AI readiness reported as unconfigured.
- [ ] Sending a chat message while no provider is configured leaves the Agent running and shows an actionable configure-provider prompt in the chat area.
- [ ] Desktop settings can add/edit/select DeepSeek, OpenAI-compatible, and LM Studio providers with base URL, API key, model ID, display name, and priority fields.
- [ ] Saving the same provider data repeatedly is idempotent: no duplicate providers are created, the active selection remains stable, and no config file corruption occurs.
- [ ] Two overlapping provider saves cannot produce invalid JSON, partial writes, duplicate IDs, or a dangling active provider reference.
- [ ] Switching active provider/model affects the next chat request without restarting desktop, Agent, or Go sidecar.
- [ ] DeepSeek requests use the configured `api_base` rather than a hardcoded base URL.
- [ ] `PALADIN_AI_PROVIDER`, `PALADIN_AI_BASE_URL`, `PALADIN_AI_API_KEY`, and `PALADIN_AI_MODEL` seed a clean runtime configuration; `DEEPSEEK_API_KEY` still seeds a DeepSeek default for backwards compatibility.
- [ ] Empty provider lists, deleted active providers, duplicate display names, duplicate priorities, and missing base/model/key fields have deterministic validation or fallback behavior.
- [ ] Raw secret values do not appear in process logs, desktop diagnostics, frontend rendered text, persisted provider metadata, build manifests, or UAT evidence.
- [ ] Missing AI provider, invalid AI key, missing DB, missing Redis, and all-configured states produce distinct API/UI status classifications.
- [ ] Environment bootstrap never silently switches to a different active provider after a user has explicitly saved local runtime configuration.

## Edge Coverage

**Coverage:** 27/27 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| idempotency | R1 | covered | Repeated no-key startup keeps `/health` 200 and does not mutate provider config. |
| concurrency | R1 | covered | Concurrent health/chat probes during unconfigured startup cannot crash Agent. |
| empty | R2 | covered | Empty/missing provider state maps to configure-provider prompt. |
| encoding | R2 | dismissed | Prompt copy is static localized UI text; no user-entered text equality/length contract is involved. |
| idempotency | R2 | covered | Repeated failed chat attempts show one stable prompt state, not duplicated modals/toasts. |
| concurrency | R2 | covered | Multiple concurrent missing-provider chat attempts leave Agent running and surface the same configuration state. |
| adjacency | R3 | covered | Duplicate provider display names and duplicate priorities have deterministic handling. |
| empty | R3 | covered | Empty provider list is valid and represented as unconfigured. |
| encoding | R3 | covered | Provider IDs/base URLs/model IDs preserve Unicode text but validation treats URLs and IDs as exact strings after trimming surrounding whitespace. |
| ordering | R3 | covered | Provider priority ties are stable and do not override the explicit active provider. |
| idempotency | R3 | covered | Saving the same provider twice updates in place. |
| concurrency | R3 | covered | Overlapping edits cannot corrupt persisted provider config. |
| adjacency | R4 | covered | Deleting or replacing the active provider cannot leave a dangling active selection. |
| empty | R4 | covered | Persisted empty provider list reloads as unconfigured. |
| ordering | R4 | covered | Active provider selection wins over priority ordering; priority is only fallback/display ordering. |
| idempotency | R4 | covered | Restart reloads one stable runtime config without duplicate imports. |
| concurrency | R4 | covered | In-flight request keeps its original provider; subsequent requests use the newly active provider. |
| empty | R5 | covered | Empty env vars are ignored and do not create configured providers with blank secrets. |
| encoding | R5 | covered | Env var names are exact ASCII keys; values preserve exact strings except surrounding whitespace validation where specified. |
| idempotency | R5 | covered | Repeated bootstrap import does not duplicate default providers. |
| concurrency | R5 | covered | Env bootstrap and user save cannot race into a mixed active provider; saved local config takes precedence after first explicit save. |
| empty | R6 | covered | Missing key displays as absent/unconfigured, not as an empty raw value. |
| encoding | R6 | covered | Masking is value-based and must handle special characters without leaking suffixes beyond the approved masked form. |
| idempotency | R6 | covered | Repeated reads/diagnostics never transform masked values back into raw values. |
| concurrency | R6 | covered | Concurrent logging/diagnostic emission must use the same redaction path before persistence or UI emission. |
| idempotency | R7 | covered | Repeated probes report stable separate states until underlying conditions change. |
| concurrency | R7 | covered | Simultaneous Go readiness and AI provider failures remain independently classified. |

## Prohibitions (must-NOT)

**Coverage:** 5/5 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT block app startup or sidecar liveness solely because an AI provider is absent. | R1 | resolved | test: startup and `/health` no-key scenario. |
| MUST NOT display, log, persist in non-secret metadata, or include raw API key values in evidence. | R6 | resolved | test: redaction/unit scans plus UAT evidence scan. |
| MUST NOT silently switch the user to a different paid/cloud provider after they explicitly selected a provider. | R4, R5 | resolved | test: precedence and active-provider persistence tests. |
| MUST NOT present missing AI provider as Go DB/Redis readiness failure or Agent process crash. | R7 | resolved | test: classification matrix. |
| MUST NOT use fear, blame, or alarmist wording in the missing-provider prompt; it should be actionable and neutral. | R2 | resolved | judgment: UI copy review. |

Canon referral: injection, path traversal, OS credential-store hardening, and general GDPR retention are security/compliance canon and should be handled by `$gsd-secure-phase` or normal security review if this phase later touches those surfaces.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes |
|--------------------|-------|------|--------|-------|
| Goal Clarity       | 0.94  | 0.75 | met    | Runtime-configurable provider capability and no-key startup are explicit. |
| Boundary Clarity   | 0.90  | 0.70 | met    | Desktop local runtime config is in scope; cloud accounts and team policy are out. |
| Constraint Clarity | 0.86  | 0.65 | met    | Startup, persistence, hot-switch, secret, and base URL constraints are locked. |
| Acceptance Criteria| 0.91  | 0.70 | met    | Criteria cover no-key startup, UI, persistence, bootstrap, redaction, and state separation. |
| **Ambiguity**      | 0.10  | <=0.20 | met  | Ready for discuss-phase. |

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 1 | Researcher | Where is runtime config authority? | Desktop app data is authoritative; Agent participates through read/update/validate surface but does not write bundled config. |
| 1 | Researcher | Must no-key startup cover packaged/CI? | Yes. Dev, packaged, and CI/UAT all start with no AI key. |
| 1 | Simplifier | Minimum config UI scope? | Phase 11 includes multiple providers plus current provider/model switching. |
| 2 | Seed Closer | Edge and prohibition defaults after user delegated decisions. | Resolve applicable edge cases into acceptance criteria; keep bespoke privacy, transparency, and provider-switch prohibitions. |

---

*Phase: 11-desktop-ai-provider-configuration*
*Spec created: 2026-07-13*
*Next step: $gsd-discuss-phase 11 — implementation decisions (how to build what's specified above)*

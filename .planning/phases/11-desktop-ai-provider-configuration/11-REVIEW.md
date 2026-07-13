---
phase: 11-desktop-ai-provider-configuration
reviewed: 2026-07-13T16:11:58Z
depth: standard
files_reviewed: 34
files_reviewed_list:
  - apps/agent/.env.example
  - apps/agent/src/agent/paladin_agent.py
  - apps/agent/src/agent/provider_runtime.py
  - apps/agent/src/server/main.py
  - apps/agent/src/server/provider_routes.py
  - apps/agent/tests/test_provider_runtime.py
  - apps/desktop/src-tauri/src/ai_provider/bootstrap.rs
  - apps/desktop/src-tauri/src/ai_provider/bootstrap_tests.rs
  - apps/desktop/src-tauri/src/ai_provider/commands_tests.rs
  - apps/desktop/src-tauri/src/ai_provider/mod.rs
  - apps/desktop/src-tauri/src/ai_provider/storage.rs
  - apps/desktop/src-tauri/src/ai_provider/storage_tests.rs
  - apps/desktop/src-tauri/src/ai_provider/types.rs
  - apps/desktop/src-tauri/src/lib.rs
  - apps/desktop/src-tauri/src/process/log_redact.rs
  - apps/desktop/src-tauri/src/process/log_redact_tests.rs
  - apps/desktop/src-tauri/src/process/supervisor.rs
  - apps/desktop/src/App.tsx
  - apps/desktop/src/components/ChatArea.tsx
  - apps/desktop/src/components/StatusBar.tsx
  - apps/desktop/src/components/StatusBar/AiProviderLight.tsx
  - apps/desktop/src/components/StatusBar/__tests__/AiProviderLight.test.tsx
  - apps/desktop/src/components/__tests__/ChatAreaProviderCta.test.tsx
  - apps/desktop/src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx
  - apps/desktop/src/components/layout/RightPanel.tsx
  - apps/desktop/src/components/provider/AiProviderPanel.tsx
  - apps/desktop/src/components/provider/__tests__/AiProviderPanel.test.tsx
  - apps/desktop/src/lib/tauri-commands.ts
  - apps/desktop/src/stores/__tests__/aiProvider.test.ts
  - apps/desktop/src/stores/aiProvider.ts
  - apps/desktop/src/stores/terminal.ts
  - docs/packaging.md
  - scripts/launch-paladin-macos.sh
  - scripts/test-launch-paladin-macos.sh
findings:
  critical: 3
  warning: 2
  info: 0
  total: 5
status: issues_found
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-13T16:11:58Z
**Depth:** standard
**Files Reviewed:** 34
**Status:** issues_found

## Summary

Reviewed the provider runtime, desktop Tauri commands/storage, frontend provider UI, launch wrapper, docs, and related tests. The implementation still has correctness gaps in provider protocol mapping, readiness propagation, and masked-secret workflows. Several tests assert that calls happen but do not assert the state that users actually rely on, so they can pass while the shipped provider flow is broken.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01 [BLOCKER]: OpenAI-compatible providers pass validation but crash when chat starts

**File:** `apps/agent/src/agent/provider_runtime.py:221`

**Issue:** Rust serializes OpenAI-compatible providers as `openai-compatible`, and the UI exposes that exact provider type. `validate_provider_snapshot()` treats any provider type with a base URL, model, and key as usable, but `create_model_for_provider_snapshot()` only accepts `openai`, `lm-studio`, `lm_studio`, or `local` on the OpenAIProvider path. When an `openai-compatible` provider is active, `snapshot.usable` is true, `apply_provider_snapshot()` calls model creation at `apps/agent/src/agent/paladin_agent.py:189`, and the request raises `ValueError("Unsupported provider type: openai-compatible")` instead of serving chat.

**Fix:**
```python
def _normalize_provider_type(provider_type: str | None) -> str | None:
    aliases = {
        "openai-compatible": "openai",
        "openai_compatible": "openai",
        "lm_studio": "lm-studio",
        "local": "lm-studio",
    }
    return aliases.get(provider_type, provider_type)

provider_type = _normalize_provider_type(snapshot.provider_type)
if provider_type == "deepseek":
    ...
elif provider_type in {"openai", "lm-studio"}:
    provider = OpenAIProvider(base_url=snapshot.base_url, api_key=snapshot.api_key or "paladin-local")
else:
    return ProviderValidationResult(ProviderReadiness.INVALID, True, f"Unsupported provider type: {snapshot.provider_type}")
```

Also add a test that saves or posts an `openai-compatible` runtime snapshot and then calls `create_model_for_provider_snapshot()` or `/copilotkit`.

### CR-02 [BLOCKER]: Agent readiness responses are discarded, so UI state stays stale forever

**File:** `apps/desktop/src-tauri/src/ai_provider/mod.rs:165`

**Issue:** `refresh_agent_ai_provider_with_manager()` posts the active provider to `/ai-provider/runtime` and then throws away the response. It immediately reloads masked local storage, where `mask_config()` hard-codes top-level readiness to `Untested` whenever an active provider exists (`apps/desktop/src-tauri/src/ai_provider/storage.rs:437`) and `mask_provider()` returns the previously stored provider readiness (`apps/desktop/src-tauri/src/ai_provider/storage.rs:470`). The Agent can respond `available` or `invalid`, but desktop state does not persist or return that result. This breaks the status light, ChatArea gating, and "current provider unavailable" flows.

**Fix:**
```rust
let response = post_agent_json(agent_url, "/ai-provider/runtime", &payload).await?;
let envelope: AgentRuntimeEnvelope = serde_json::from_str(&response)
    .map_err(|error| error.to_string())?;
manager
    .set_provider_readiness(
        envelope.ai_provider.provider_id.as_deref(),
        envelope.ai_provider.readiness,
        envelope.ai_provider.message,
    )
    .await?;
manager.load_masked_config().await.map_err(|error| error.to_string())
```

Add a Rust command test where the fake Agent returns `{"ai_provider":{"readiness":"invalid","provider_id":"second"}}` and assert that the returned masked config and active provider both become `invalid`. The current `commands_tests.rs:110` only checks the POST body, which masks this failure.

### CR-03 [BLOCKER]: Existing cloud providers cannot be saved or reliably tested without re-entering the secret

**File:** `apps/desktop/src/components/provider/AiProviderPanel.tsx:190`

**Issue:** The UI intentionally clears `api_key` for an existing provider (`draftFromProvider()` returns `api_key: ''`) so raw secrets are not kept in frontend state. But saving that edited provider sends no key, and Rust rejects cloud providers with no key in `normalize_input()` (`apps/desktop/src-tauri/src/ai_provider/storage.rs:377`). The same masked-state mismatch affects testing: the status bar calls `testProvider()` with `api_key: null` at `apps/desktop/src/components/StatusBar/AiProviderLight.tsx:53`, and the Agent validation path reports cloud providers invalid because no key is sent. Users who already saved a key cannot edit non-secret fields or test from the status light unless they paste the secret again.

**Fix:**
```rust
// On save, preserve the existing secret when api_key is None for an existing provider.
let existing_secret = secrets.api_keys.get(&provider.id).cloned();
let effective_api_key = provider.api_key.clone().or(existing_secret);
if provider.provider_type.requires_api_key() && effective_api_key.is_none() {
    return Err(AiProviderConfigError::Invalid("api key is required for cloud providers".to_string()));
}
if let Some(api_key) = provider.api_key.as_ref() {
    secrets.api_keys.insert(provider.id.clone(), api_key.trim().to_string());
}
```

For testing, add a command that tests an existing provider by id using the stored secret, or have `test_ai_provider` resolve the stored secret when `api_key` is omitted and the provider id already exists. Update frontend tests to click "测试连接" from `AiProviderLight` and assert the real command succeeds for a saved cloud provider.

## Warnings

### WR-01 [WARNING]: Save/delete commands can persist local changes and still report failure after Agent refresh

**File:** `apps/desktop/src-tauri/src/ai_provider/mod.rs:59`

**Issue:** `save_ai_provider()` writes local config first, then calls `refresh_agent_ai_provider_with_manager()` and propagates any Agent/network error. If the Agent is temporarily unavailable, the user sees a failed save even though the provider is already persisted. `delete_ai_provider()` has the same shape at `apps/desktop/src-tauri/src/ai_provider/mod.rs:71`. This creates UI/storage desynchronization and can make retry behavior confusing.

**Fix:** Treat local persistence as the command's primary success and report Agent refresh separately in the returned config or warning field, or make the operation transactional by rolling back the local write when refresh fails. The safer desktop behavior is usually to return the saved masked config plus a non-fatal refresh error so the user does not lose track of the persisted state.

### WR-02 [WARNING]: Invalid readiness payloads can crash the Agent runtime route

**File:** `apps/agent/src/agent/provider_runtime.py:153`

**Issue:** `ProviderRuntime.update()` constructs `ProviderReadiness(payload.get(...))` directly. A malformed or stale desktop payload such as `{"readiness":"available "}` or an unexpected future enum value raises `ValueError`, producing a 500 response from `/ai-provider/runtime` instead of a structured invalid provider state. This is an unsafe boundary for a Tauri-command-fed local HTTP API.

**Fix:**
```python
try:
    readiness = ProviderReadiness(payload.get("readiness", ProviderReadiness.UNTESTED))
except ValueError:
    readiness = ProviderReadiness.INVALID
    message = "Unsupported provider readiness value."
```

Return a public `invalid` snapshot with a message instead of letting the exception escape, and add a provider route test for an unknown readiness string.

---

_Reviewed: 2026-07-13T16:11:58Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

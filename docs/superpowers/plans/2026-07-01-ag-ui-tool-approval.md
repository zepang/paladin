# AG-UI Tool Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Paladin tool permission approvals from the Phase 07 side-channel SSE/dialog flow into durable AG-UI interrupt/resume approvals rendered in the CopilotKit message stream.

**Architecture:** Use standard AG-UI interrupt/resume as the public contract. Prefer Pydantic AI's official AG-UI approval mapping if the installed dependency behavior supports it; otherwise add a narrow Paladin adapter that maps `DeferredToolRequests` to `RunFinishedInterruptOutcome` and `RunAgentInput.resume[]` back to `DeferredToolResults`. After Phase 07.2, do not keep the old `/approval/stream` path; it is removed historical prior behavior only.

**Tech Stack:** Python 3.12, FastAPI, Pydantic AI, `ag-ui-protocol`, pydantic-deep, pytest, React 19, TypeScript, CopilotKit v2, Vitest.

---

## File Structure

- Modify: `apps/agent/src/server/main.py`
  - Replace deprecated `handle_ag_ui_request` with a request dispatcher that can use `AGUIAdapter.dispatch_request()` and inject deferred approval results.
  - Do not keep old approval endpoints; Phase 07.2 removed them.
- Create: `apps/agent/src/agent/agui_approval_bridge.py`
  - Thin compatibility mapping between Pydantic deferred approval objects and AG-UI interrupt/resume objects.
- Modify: `apps/agent/src/agent/paladin_agent.py`
  - Use official AG-UI deferred approvals without preserving the removed ToolGuard fallback.
- Create: `apps/agent/tests/test_agui_approval_bridge.py`
  - Unit tests for interrupt mapping and resume mapping.
- Modify: `apps/agent/tests/test_server.py`
  - Server tests for AG-UI dispatch selection and removal of dependence on `/approval/stream`. (removed in 07.2; historical prior behavior only)
- Modify: `apps/desktop/src/components/approval/ApprovalCard.tsx`
  - Convert from old `ApprovalRequest` props to AG-UI interrupt props and local status.
- Create: `apps/desktop/src/components/approval/AguiApprovalInterrupt.tsx`
  - Register `useInterrupt` rendering and resolve/cancel behavior.
- Modify: `apps/desktop/src/components/ChatArea.tsx`
  - Mount interrupt renderer in the chat area.
- Modify: `apps/desktop/src/App.tsx`
  - Remove `ApprovalProvider` and modal-first approval wiring after the interrupt renderer is verified.
- Create: `apps/desktop/src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx`
  - Component tests for approve, deny, expired, and failure states.

---

### Task 1: Add Dependency Behavior Probe

**Files:**
- Create: `apps/agent/tests/test_agui_dependency_probe.py`
- Create: `apps/desktop/src/components/approval/__tests__/copilotkitInterruptProbe.test.tsx`

- [ ] **Step 1: Write backend probe tests**

Create `apps/agent/tests/test_agui_dependency_probe.py`:

```python
import dataclasses

from ag_ui.core import Interrupt, ResumeEntry, RunAgentInput
from ag_ui.core.events import RunFinishedInterruptOutcome
from pydantic_ai.tools import DeferredToolRequests, DeferredToolResults, ToolApproved, ToolDenied
from pydantic_ai.ui.ag_ui import AGUIAdapter


def test_agui_adapter_dispatch_request_exists():
    assert hasattr(AGUIAdapter, "dispatch_request")


def test_agui_protocol_has_standard_interrupt_and_resume_types():
    interrupt = Interrupt(
        id="int-call-1",
        reason="approval_required",
        message="Approve tool call",
        toolCallId="call-1",
        metadata={"tool_name": "computer_click"},
    )
    outcome = RunFinishedInterruptOutcome(interrupts=[interrupt])

    assert outcome.type == "interrupt"
    assert outcome.interrupts[0].id == "int-call-1"
    assert outcome.interrupts[0].tool_call_id == "call-1"

    resume = ResumeEntry(
        interruptId="int-call-1",
        status="resolved",
        payload={"decision": "approved"},
    )
    assert resume.interrupt_id == "int-call-1"
    assert resume.status == "resolved"


def test_pydantic_deferred_approval_types_are_available():
    assert dataclasses.is_dataclass(DeferredToolRequests)
    assert dataclasses.is_dataclass(DeferredToolResults)
    assert dataclasses.is_dataclass(ToolApproved)
    assert dataclasses.is_dataclass(ToolDenied)

    approved = ToolApproved()
    denied = ToolDenied(message="User denied this tool call.")

    assert approved.kind == "tool-approved"
    assert denied.kind == "tool-denied"
```

- [ ] **Step 2: Run backend probe tests**

Run:

```bash
cd apps/agent
uv run pytest tests/test_agui_dependency_probe.py -v
```

Expected: all tests pass. If imports fail, update `apps/agent/pyproject.toml` dependency versions before continuing.

- [ ] **Step 3: Write frontend probe test**

Create `apps/desktop/src/components/approval/__tests__/copilotkitInterruptProbe.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';

describe('CopilotKit interrupt dependency probe', () => {
  it('exports useInterrupt from the v2 package', async () => {
    const mod = await import('@copilotkit/react-core/v2');
    expect(typeof mod.useInterrupt).toBe('function');
  });
});
```

- [ ] **Step 4: Run frontend probe test**

Run:

```bash
cd apps/desktop
npm test -- --run src/components/approval/__tests__/copilotkitInterruptProbe.test.tsx
```

Expected: pass. If `npm test` is not defined, add this script to `apps/desktop/package.json`:

```json
"test": "vitest"
```

Then rerun the command.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/tests/test_agui_dependency_probe.py \
  apps/desktop/package.json \
  apps/desktop/src/components/approval/__tests__/copilotkitInterruptProbe.test.tsx
git commit -m "test: probe ag-ui approval dependencies"
```

---

### Removed Historical Task: Durable Approval Store

Phase 07.2 removed the legacy `approval_store` module and tests. Do not recreate this task as active implementation guidance; durable audit history belongs to a future admin/audit phase.

### Task 7: Convert Approval Mode To Official AG-UI Only

**Files:**
- Modify: `apps/agent/src/agent/paladin_agent.py`
- Modify: `apps/agent/tests/test_agent.py`

- [ ] **Step 1: Assert approval mode policy**

Add or keep tests proving omitted `hitl.mode` defaults to `agui_interrupt` and explicit legacy mode is rejected with an error naming the removed `legacy_sse` mode and the supported `agui_interrupt` mode (removed in 07.2; historical prior behavior only).

- [ ] **Step 2: Keep agent construction official-only**

Ensure `create_paladin_agent()` does not install a legacy approval callback and configures approval through official AG-UI interrupt behavior only.

- [ ] **Step 3: Run agent tests**

Run:

```bash
cd apps/agent
uv run pytest tests/test_agent.py tests/test_hitl.py -v
```

Expected: all tests pass. If `ToolGuard` requires `approval_callback` for `require_approval`, stop and keep `agui_interrupt` as the only supported mode until Task 8 verifies native Pydantic tool approval for the selected tools.

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/agent/paladin_agent.py apps/agent/tests/test_agent.py
git commit -m "feat: add approval mode switch"
```

---

### Task 8: End-To-End Manual Verification

**Files:**
- Modify only files needed to fix defects found during verification.

- [ ] **Step 1: Start backend**

Run:

```bash
cd apps/agent
DEEPSEEK_API_KEY=fake-key uv run uvicorn src.server.main:app --host 127.0.0.1 --port 9876
```

Expected: server starts and `/health` returns 200. For real model execution, replace `fake-key` with the configured development key.

- [ ] **Step 2: Start frontend**

Run in another shell:

```bash
cd apps/desktop
npm run dev -- --host 127.0.0.1
```

Expected: Vite prints a local URL, usually `http://127.0.0.1:5173/`.

- [ ] **Step 3: Verify chat stream approval**

In the desktop app:

1. Open or create a conversation.
2. Ask the agent to perform one configured approval-required operation, such as a computer-use action.
3. Confirm an approval card appears inside the chat stream.
4. Click approve.
5. Confirm the agent resumes the same thread and reports the tool result.

Expected: no modal approval is required and `/approval/stream` is not needed for the primary flow. (removed in 07.2; historical prior behavior only)

- [ ] **Step 4: Verify denial**

Repeat the same operation and click deny.

Expected: the card changes to denied, the agent resumes the same thread, and the assistant explains that the tool call was denied.

- [ ] **Step 5: Verify refresh durability**

Start an approval-required operation, leave the card pending, refresh the frontend, and reopen the same conversation.

Expected: the pending approval remains available or is clearly shown as expired based on `expires_at`.

- [ ] **Step 6: Run full automated checks**

Run:

```bash
cd apps/agent
uv run pytest -v
cd ../desktop
npm test -- --run
npm run build
```

Expected: all tests and build pass.

- [ ] **Step 7: Commit fixes**

If verification required changes:

```bash
git add apps/agent apps/desktop
git commit -m "fix: verify ag-ui approval flow"
```

If no changes were needed, do not create an empty commit.

---

### Task 9: Verify Modal-First Approval Path Is Removed

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/agent/src/server/main.py`
- Modify: `apps/agent/src/agent/paladin_agent.py`
- Modify: `apps/agent/tests/test_hitl.py`
- Modify: `apps/agent/tests/test_server.py`

- [ ] **Step 1: Confirm frontend provider and dialog wiring is gone**

Verify the app shell no longer imports or mounts the removed legacy bridge, provider, or dialog components (removed in 07.2; historical prior behavior only). Keep the root layout directly inside `CopilotKitProvider`.

- [ ] **Step 2: Confirm old approval endpoints stay absent**

In `apps/agent/src/server/main.py`, the old `/approval/stream` and `/approval/{request_id}` endpoints are removed in 07.2 as historical prior behavior only. Do not reintroduce endpoint queues, broadcast tasks, startup/shutdown loops, or request-id decision handlers.

- [ ] **Step 3: Update tests to match final endpoint policy**

Do not add fallback tests. Route absence and official `/copilotkit` resume forwarding are the active assertions after the 07.2 legacy cleanup.

- [ ] **Step 4: Run full checks**

Run:

```bash
cd apps/agent
uv run pytest -v
cd ../desktop
npm test -- --run
npm run build
```

Expected: all tests and build pass.

- [ ] **Step 5: Commit cleanup**

```bash
git add apps/agent apps/desktop
git commit -m "refactor: retire modal-first approval flow"
```

---

## Self-Review

- Spec coverage: The plan covers the standard AG-UI interrupt/resume target, official-adapter-first probing, thin adapter fallback, durable storage, frontend message-stream rendering, resume behavior, error cases, migration staging, and verification.
- Completeness scan: Every task has concrete files, commands, and expected results.
- Type consistency: AG-UI interrupt ids use `int-{tool_call_id}` consistently; resume mapping removes the `int-` prefix to produce Pydantic approval results keyed by `tool_call_id`.
- Scope check: This is one coherent migration plan with a fallback switch. It should not be split unless dependency probing shows the installed packages require a major version upgrade across the app.

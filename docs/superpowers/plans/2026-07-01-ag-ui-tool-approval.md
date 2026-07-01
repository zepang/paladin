# AG-UI Tool Approval Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Paladin tool permission approvals from the Phase 07 side-channel SSE/dialog flow into durable AG-UI interrupt/resume approvals rendered in the CopilotKit message stream.

**Architecture:** Use standard AG-UI interrupt/resume as the public contract. Prefer Pydantic AI's official AG-UI approval mapping if the installed dependency behavior supports it; otherwise add a narrow Paladin adapter that maps `DeferredToolRequests` to `RunFinishedInterruptOutcome` and `RunAgentInput.resume[]` back to `DeferredToolResults`. Keep the old `/approval/stream` path as a temporary fallback until the new flow is verified.

**Tech Stack:** Python 3.12, FastAPI, Pydantic AI, `ag-ui-protocol`, pydantic-deep, pytest, React 19, TypeScript, CopilotKit v2, Vitest.

---

## File Structure

- Modify: `apps/agent/src/server/main.py`
  - Replace deprecated `handle_ag_ui_request` with a request dispatcher that can use `AGUIAdapter.dispatch_request()` and inject deferred approval results.
  - Keep old approval endpoints behind fallback until final cleanup.
- Create: `apps/agent/src/agent/approval_store.py`
  - Durable approval record model and JSON-backed local store.
- Create: `apps/agent/src/agent/agui_approval_bridge.py`
  - Thin compatibility mapping between Pydantic deferred approval objects and AG-UI interrupt/resume objects.
- Modify: `apps/agent/src/agent/paladin_agent.py`
  - Introduce a feature flag path for Pydantic deferred approvals while preserving ToolGuard fallback.
- Create: `apps/agent/tests/test_agui_approval_bridge.py`
  - Unit tests for interrupt mapping and resume mapping.
- Create: `apps/agent/tests/test_approval_store.py`
  - Unit tests for persistence, duplicate decisions, expiry, and reload behavior.
- Modify: `apps/agent/tests/test_server.py`
  - Server tests for AG-UI dispatch selection and removal of dependence on `/approval/stream`.
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

### Task 2: Add Durable Approval Store

**Files:**
- Create: `apps/agent/src/agent/approval_store.py`
- Create: `apps/agent/tests/test_approval_store.py`

- [ ] **Step 1: Write failing store tests**

Create `apps/agent/tests/test_approval_store.py`:

```python
from datetime import datetime, timedelta, timezone

import pytest

from src.agent.approval_store import (
    ApprovalDecisionError,
    ApprovalRecord,
    ApprovalStore,
)


def make_record() -> ApprovalRecord:
    now = datetime.now(timezone.utc)
    return ApprovalRecord(
        approval_id="int-call-1",
        thread_id="thread-1",
        run_id="run-1",
        tool_call_id="call-1",
        tool_name="computer_click",
        tool_args={"x": 10, "y": 20},
        reason="Agent requests computer_click",
        risk_level="high",
        created_at=now,
        expires_at=now + timedelta(hours=24),
        status="pending",
        decision=None,
        resolved_at=None,
        metadata={"source": "test"},
    )


def test_store_persists_and_reloads_pending_approval(tmp_path):
    path = tmp_path / "approvals.json"
    store = ApprovalStore(path)
    store.upsert(make_record())

    reloaded = ApprovalStore(path)
    record = reloaded.get("int-call-1")

    assert record is not None
    assert record.status == "pending"
    assert record.tool_name == "computer_click"
    assert record.tool_args == {"x": 10, "y": 20}


def test_resolve_approval_records_first_decision(tmp_path):
    store = ApprovalStore(tmp_path / "approvals.json")
    store.upsert(make_record())

    resolved = store.resolve(
        approval_id="int-call-1",
        decision="approved",
        now=datetime.now(timezone.utc),
    )

    assert resolved.status == "approved"
    assert resolved.decision == "approved"
    assert resolved.resolved_at is not None


def test_duplicate_decision_is_rejected(tmp_path):
    store = ApprovalStore(tmp_path / "approvals.json")
    store.upsert(make_record())
    store.resolve("int-call-1", "approved", now=datetime.now(timezone.utc))

    with pytest.raises(ApprovalDecisionError, match="already resolved"):
        store.resolve("int-call-1", "denied", now=datetime.now(timezone.utc))


def test_expired_approval_cannot_be_resumed(tmp_path):
    record = make_record()
    record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    store = ApprovalStore(tmp_path / "approvals.json")
    store.upsert(record)

    with pytest.raises(ApprovalDecisionError, match="expired"):
        store.resolve("int-call-1", "approved", now=datetime.now(timezone.utc))

    expired = store.get("int-call-1")
    assert expired is not None
    assert expired.status == "expired"
```

- [ ] **Step 2: Run store tests and verify they fail**

Run:

```bash
cd apps/agent
uv run pytest tests/test_approval_store.py -v
```

Expected: fail with `ModuleNotFoundError: No module named 'src.agent.approval_store'`.

- [ ] **Step 3: Implement the store**

Create `apps/agent/src/agent/approval_store.py`:

```python
from __future__ import annotations

import json
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal

ApprovalStatus = Literal["pending", "approved", "denied", "expired", "cancelled"]
ApprovalDecision = Literal["approved", "denied"]


class ApprovalDecisionError(ValueError):
    pass


@dataclass
class ApprovalRecord:
    approval_id: str
    thread_id: str
    run_id: str
    tool_call_id: str
    tool_name: str
    tool_args: dict[str, Any]
    reason: str
    risk_level: str | None
    created_at: datetime
    expires_at: datetime | None
    status: ApprovalStatus
    decision: ApprovalDecision | None
    resolved_at: datetime | None
    metadata: dict[str, Any]


class ApprovalStore:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._records: dict[str, ApprovalRecord] = {}
        self._load()

    def get(self, approval_id: str) -> ApprovalRecord | None:
        return self._records.get(approval_id)

    def upsert(self, record: ApprovalRecord) -> None:
        self._records[record.approval_id] = record
        self._save()

    def resolve(
        self,
        approval_id: str,
        decision: ApprovalDecision,
        *,
        now: datetime | None = None,
    ) -> ApprovalRecord:
        record = self._records.get(approval_id)
        if record is None:
            raise ApprovalDecisionError(f"approval not found: {approval_id}")

        now = now or datetime.now(timezone.utc)
        if record.status != "pending":
            raise ApprovalDecisionError(f"approval already resolved: {approval_id}")

        if record.expires_at is not None and record.expires_at <= now:
            record.status = "expired"
            self._save()
            raise ApprovalDecisionError(f"approval expired: {approval_id}")

        record.status = decision
        record.decision = decision
        record.resolved_at = now
        self._save()
        return record

    def _load(self) -> None:
        if not self.path.exists():
            return
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        self._records = {
            key: self._decode_record(value)
            for key, value in raw.items()
        }

    def _save(self) -> None:
        encoded = {
            key: self._encode_record(record)
            for key, record in self._records.items()
        }
        self.path.write_text(
            json.dumps(encoded, ensure_ascii=False, indent=2, sort_keys=True),
            encoding="utf-8",
        )

    def _encode_record(self, record: ApprovalRecord) -> dict[str, Any]:
        data = asdict(record)
        for key in ("created_at", "expires_at", "resolved_at"):
            value = data[key]
            data[key] = value.isoformat() if value is not None else None
        return data

    def _decode_record(self, data: dict[str, Any]) -> ApprovalRecord:
        return ApprovalRecord(
            approval_id=data["approval_id"],
            thread_id=data["thread_id"],
            run_id=data["run_id"],
            tool_call_id=data["tool_call_id"],
            tool_name=data["tool_name"],
            tool_args=data["tool_args"],
            reason=data["reason"],
            risk_level=data["risk_level"],
            created_at=datetime.fromisoformat(data["created_at"]),
            expires_at=(
                datetime.fromisoformat(data["expires_at"])
                if data["expires_at"] is not None
                else None
            ),
            status=data["status"],
            decision=data["decision"],
            resolved_at=(
                datetime.fromisoformat(data["resolved_at"])
                if data["resolved_at"] is not None
                else None
            ),
            metadata=data["metadata"],
        )
```

- [ ] **Step 4: Run store tests and verify they pass**

Run:

```bash
cd apps/agent
uv run pytest tests/test_approval_store.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/agent/approval_store.py apps/agent/tests/test_approval_store.py
git commit -m "feat: add durable approval store"
```

---

### Task 3: Add AG-UI Approval Bridge

**Files:**
- Create: `apps/agent/src/agent/agui_approval_bridge.py`
- Create: `apps/agent/tests/test_agui_approval_bridge.py`

- [ ] **Step 1: Write bridge tests**

Create `apps/agent/tests/test_agui_approval_bridge.py`:

```python
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import DeferredToolRequests, ToolApproved, ToolDenied

from src.agent.agui_approval_bridge import (
    deferred_approvals_to_interrupt_outcome,
    resume_entries_to_deferred_tool_results,
)


def test_deferred_approval_maps_to_interrupt_outcome():
    call = ToolCallPart(
        tool_name="computer_click",
        args={"x": 10, "y": 20},
        tool_call_id="call-1",
    )
    requests = DeferredToolRequests(
        calls=[],
        approvals=[call],
        metadata={
            "call-1": {
                "reason": "Agent requests computer_click",
                "risk_level": "high",
                "thread_id": "thread-1",
                "run_id": "run-1",
            }
        },
    )

    outcome = deferred_approvals_to_interrupt_outcome(requests)

    assert outcome.type == "interrupt"
    assert len(outcome.interrupts) == 1
    interrupt = outcome.interrupts[0]
    assert interrupt.id == "int-call-1"
    assert interrupt.reason == "approval_required"
    assert interrupt.tool_call_id == "call-1"
    assert interrupt.metadata["tool_name"] == "computer_click"
    assert interrupt.metadata["tool_args"] == {"x": 10, "y": 20}
    assert interrupt.metadata["risk_level"] == "high"


def test_resume_approved_maps_to_tool_approved():
    results = resume_entries_to_deferred_tool_results([
        {
            "interruptId": "int-call-1",
            "status": "resolved",
            "payload": {"decision": "approved"},
        }
    ])

    approval = results.approvals["call-1"]
    assert isinstance(approval, ToolApproved)


def test_resume_denied_maps_to_tool_denied():
    results = resume_entries_to_deferred_tool_results([
        {
            "interruptId": "int-call-1",
            "status": "resolved",
            "payload": {
                "decision": "denied",
                "message": "User denied computer_click.",
            },
        }
    ])

    approval = results.approvals["call-1"]
    assert isinstance(approval, ToolDenied)
    assert approval.message == "User denied computer_click."
```

- [ ] **Step 2: Run bridge tests and verify they fail**

Run:

```bash
cd apps/agent
uv run pytest tests/test_agui_approval_bridge.py -v
```

Expected: fail with `ModuleNotFoundError: No module named 'src.agent.agui_approval_bridge'`.

- [ ] **Step 3: Implement the bridge**

Create `apps/agent/src/agent/agui_approval_bridge.py`:

```python
from __future__ import annotations

from typing import Any

from ag_ui.core import Interrupt
from ag_ui.core.events import RunFinishedInterruptOutcome
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import DeferredToolRequests, DeferredToolResults, ToolApproved, ToolDenied


def _call_args(call: ToolCallPart) -> dict[str, Any]:
    args = call.args
    return args if isinstance(args, dict) else {"args": args}


def deferred_approvals_to_interrupt_outcome(
    requests: DeferredToolRequests,
) -> RunFinishedInterruptOutcome:
    interrupts: list[Interrupt] = []
    for call in requests.approvals:
        tool_call_id = call.tool_call_id or call.tool_name
        metadata = dict(requests.metadata.get(tool_call_id, {}))
        metadata.setdefault("tool_name", call.tool_name)
        metadata.setdefault("tool_args", _call_args(call))

        interrupts.append(
            Interrupt(
                id=f"int-{tool_call_id}",
                reason="approval_required",
                message=metadata.get("reason", f"Approve {call.tool_name}"),
                toolCallId=tool_call_id,
                expiresAt=metadata.get("expires_at"),
                metadata=metadata,
            )
        )
    return RunFinishedInterruptOutcome(interrupts=interrupts)


def resume_entries_to_deferred_tool_results(
    resume_entries: list[dict[str, Any]],
) -> DeferredToolResults:
    approvals: dict[str, ToolApproved | ToolDenied] = {}
    metadata: dict[str, dict[str, Any]] = {}

    for entry in resume_entries:
        interrupt_id = entry["interruptId"]
        tool_call_id = interrupt_id.removeprefix("int-")
        payload = entry.get("payload") or {}
        decision = payload.get("decision")
        metadata[tool_call_id] = {"interrupt_id": interrupt_id, "payload": payload}

        if entry.get("status") == "cancelled" or decision == "denied":
            approvals[tool_call_id] = ToolDenied(
                message=payload.get("message", "The tool call was denied.")
            )
        elif decision == "approved":
            approvals[tool_call_id] = ToolApproved(
                override_args=payload.get("override_args")
            )
        else:
            approvals[tool_call_id] = ToolDenied(
                message=f"Unsupported approval decision: {decision!r}"
            )

    return DeferredToolResults(calls={}, approvals=approvals, metadata=metadata)
```

- [ ] **Step 4: Run bridge tests and verify they pass**

Run:

```bash
cd apps/agent
uv run pytest tests/test_agui_approval_bridge.py -v
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/agent/agui_approval_bridge.py apps/agent/tests/test_agui_approval_bridge.py
git commit -m "feat: add ag-ui approval bridge"
```

---

### Task 4: Switch Server To Current AG-UI Dispatch Entry Point

**Files:**
- Modify: `apps/agent/src/server/main.py`
- Modify: `apps/agent/tests/test_server.py`

- [ ] **Step 1: Add server tests for dispatch entry point**

Append to `apps/agent/tests/test_server.py`:

```python
class TestAguiDispatchEntrypoint:
    def test_server_imports_current_agui_adapter(self):
        from src.server import main

        assert hasattr(main, "AGUIAdapter")
        assert not hasattr(main, "handle_ag_ui_request")
```

- [ ] **Step 2: Run server test and verify it fails**

Run:

```bash
cd apps/agent
uv run pytest tests/test_server.py::TestAguiDispatchEntrypoint -v
```

Expected: fail because `main` still imports `handle_ag_ui_request`.

- [ ] **Step 3: Replace deprecated import and endpoint call**

In `apps/agent/src/server/main.py`, replace:

```python
from pydantic_ai.ag_ui import handle_ag_ui_request
```

with:

```python
from pydantic_ai.ui.ag_ui import AGUIAdapter
```

Then replace the body of `copilotkit_endpoint` with:

```python
    return await AGUIAdapter.dispatch_request(
        request=request,
        agent=agent,
        deps=getattr(agent, '_default_deps', None),
    )
```

- [ ] **Step 4: Run server tests**

Run:

```bash
cd apps/agent
uv run pytest tests/test_server.py -v
```

Expected: all server tests pass. If invalid JSON status changes from 422 to 400 under the new adapter, update the assertion to match the adapter's documented validation response and keep the test name descriptive.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/server/main.py apps/agent/tests/test_server.py
git commit -m "refactor: use current ag-ui adapter dispatch"
```

---

### Task 5: Add Frontend Interrupt Approval Renderer

**Files:**
- Modify: `apps/desktop/src/components/approval/ApprovalCard.tsx`
- Create: `apps/desktop/src/components/approval/AguiApprovalInterrupt.tsx`
- Create: `apps/desktop/src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx`
- Modify: `apps/desktop/src/components/ChatArea.tsx`

- [ ] **Step 1: Write component tests**

Create `apps/desktop/src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalCard, type ApprovalInterrupt } from '../ApprovalCard';

const interrupt: ApprovalInterrupt = {
  id: 'int-call-1',
  reason: 'approval_required',
  message: 'Approve computer_click',
  toolCallId: 'call-1',
  metadata: {
    tool_name: 'computer_click',
    tool_args: { x: 10, y: 20 },
    risk_level: 'high',
  },
};

describe('ApprovalCard', () => {
  it('renders interrupt metadata', () => {
    render(
      <ApprovalCard
        interrupt={interrupt}
        status="pending"
        onApprove={() => undefined}
        onDeny={() => undefined}
      />
    );

    expect(screen.getByText('等待审批')).toBeInTheDocument();
    expect(screen.getByText('computer_click')).toBeInTheDocument();
    expect(screen.getByText(/"x":10/)).toBeInTheDocument();
  });

  it('resolves approve and deny actions', () => {
    const onApprove = vi.fn();
    const onDeny = vi.fn();

    render(
      <ApprovalCard
        interrupt={interrupt}
        status="pending"
        onApprove={onApprove}
        onDeny={onDeny}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: '批准' }));
    fireEvent.click(screen.getByRole('button', { name: '拒绝' }));

    expect(onApprove).toHaveBeenCalledWith(interrupt);
    expect(onDeny).toHaveBeenCalledWith(interrupt);
  });

  it('disables actions after approval', () => {
    render(
      <ApprovalCard
        interrupt={interrupt}
        status="approved"
        onApprove={() => undefined}
        onDeny={() => undefined}
      />
    );

    expect(screen.getByText('已批准')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '批准' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '拒绝' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: Run component tests and verify they fail**

Run:

```bash
cd apps/desktop
npm test -- --run src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx
```

Expected: fail because `ApprovalCard` still expects old `ApprovalRequest` props.

- [ ] **Step 3: Convert ApprovalCard props**

Replace `apps/desktop/src/components/approval/ApprovalCard.tsx` with:

```tsx
export interface ApprovalInterrupt {
  id: string;
  reason: string;
  message?: string | null;
  toolCallId?: string | null;
  expiresAt?: string | null;
  metadata?: {
    tool_name?: string;
    tool_args?: Record<string, unknown>;
    risk_level?: string;
    [key: string]: unknown;
  } | null;
}

export type ApprovalCardStatus = 'pending' | 'approved' | 'denied' | 'expired' | 'error';

interface ApprovalCardProps {
  interrupt: ApprovalInterrupt;
  status: ApprovalCardStatus;
  onApprove: (interrupt: ApprovalInterrupt) => void;
  onDeny: (interrupt: ApprovalInterrupt) => void;
}

function truncate(s: string, maxLen: number): string {
  if (s.length <= maxLen) return s;
  return s.slice(0, maxLen) + '...';
}

function statusLabel(status: ApprovalCardStatus): string {
  if (status === 'approved') return '已批准';
  if (status === 'denied') return '已拒绝';
  if (status === 'expired') return '已过期';
  if (status === 'error') return '处理失败';
  return '等待审批';
}

export function ApprovalCard({ interrupt, status, onApprove, onDeny }: ApprovalCardProps) {
  const metadata = interrupt.metadata ?? {};
  const toolName = metadata.tool_name ?? interrupt.toolCallId ?? 'unknown_tool';
  const toolArgs = metadata.tool_args ?? {};
  const argsSummary = truncate(JSON.stringify(toolArgs), 200);
  const disabled = status !== 'pending';

  return (
    <div className="approval-card my-2 w-full rounded-lg border border-border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <span className="inline-flex items-center rounded-md bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
          {statusLabel(status)}
        </span>
        <span className="text-sm font-mono font-semibold text-foreground">
          {toolName}
        </span>
      </div>

      {argsSummary && (
        <div className="mb-2 rounded bg-muted px-3 py-1.5">
          <code className="text-xs text-muted-foreground break-all">{argsSummary}</code>
        </div>
      )}

      {(interrupt.message || interrupt.reason) && (
        <p className="mb-3 text-xs text-muted-foreground">
          {interrupt.message ?? interrupt.reason}
        </p>
      )}

      <div className="flex gap-2">
        <button
          disabled={disabled}
          onClick={() => onDeny(interrupt)}
          className="inline-flex h-8 items-center rounded-md border border-destructive/30 bg-destructive/10 px-3 text-xs font-medium text-destructive transition-colors hover:bg-destructive/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          拒绝
        </button>
        <button
          disabled={disabled}
          onClick={() => onApprove(interrupt)}
          className="inline-flex h-8 items-center rounded-md bg-emerald-600 px-3 text-xs font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          批准
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Add useInterrupt renderer**

Create `apps/desktop/src/components/approval/AguiApprovalInterrupt.tsx`:

```tsx
import { useState } from 'react';
import { useInterrupt } from '@copilotkit/react-core/v2';
import { ApprovalCard, type ApprovalCardStatus, type ApprovalInterrupt } from './ApprovalCard';

interface InterruptHandlerArgs {
  event: { value: ApprovalInterrupt };
  resolve: (payload: unknown) => void;
  cancel: (payload?: unknown) => void;
}

export function AguiApprovalInterrupt() {
  useInterrupt({
    enabled: ({ event }: InterruptHandlerArgs) => {
      return event.value?.reason === 'approval_required';
    },
    renderInChat: true,
    handler: ({ event, resolve, cancel }: InterruptHandlerArgs) => {
      function ApprovalInterruptCard() {
        const [status, setStatus] = useState<ApprovalCardStatus>('pending');
        const interrupt = event.value;

        return (
          <ApprovalCard
            interrupt={interrupt}
            status={status}
            onApprove={() => {
              setStatus('approved');
              resolve({ decision: 'approved' });
            }}
            onDeny={() => {
              setStatus('denied');
              cancel({
                decision: 'denied',
                message: 'User denied this tool call.',
              });
            }}
          />
        );
      }

      return <ApprovalInterruptCard />;
    },
  });

  return null;
}
```

- [ ] **Step 5: Mount renderer in chat area**

In `apps/desktop/src/components/ChatArea.tsx`, add:

```tsx
import { AguiApprovalInterrupt } from '@/components/approval/AguiApprovalInterrupt';
```

Then render it next to `CopilotChat`:

```tsx
      <AguiApprovalInterrupt />
      <CopilotChat
        className="flex-1 min-w-0"
        threadId={currentConversation.threadId}
        labels={{
          welcomeMessageText: 'Paladin — AI 编程伙伴',
          chatInputPlaceholder: '输入消息...',
        }}
      />
```

- [ ] **Step 6: Run frontend tests**

Run:

```bash
cd apps/desktop
npm test -- --run src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx
npm run build
```

Expected: test passes and TypeScript build passes. If the `useInterrupt` local type signature differs, adjust only `AguiApprovalInterrupt.tsx` to match the installed hook while preserving the `ApprovalCard` public props.

- [ ] **Step 7: Commit**

```bash
git add apps/desktop/src/components/approval/ApprovalCard.tsx \
  apps/desktop/src/components/approval/AguiApprovalInterrupt.tsx \
  apps/desktop/src/components/approval/__tests__/AguiApprovalInterrupt.test.tsx \
  apps/desktop/src/components/ChatArea.tsx \
  apps/desktop/package.json
git commit -m "feat: render approval interrupts in chat"
```

---

### Task 6: Wire Resume Payload Into Backend Dispatch

**Files:**
- Modify: `apps/agent/src/server/main.py`
- Modify: `apps/agent/tests/test_server.py`

- [ ] **Step 1: Add resume extraction helper test**

Append to `apps/agent/tests/test_server.py`:

```python
class TestAguiResumeExtraction:
    def test_extract_resume_entries_from_run_agent_input(self):
        from src.server.main import _extract_resume_entries

        body = {
            "threadId": "thread-1",
            "runId": "run-2",
            "state": {},
            "messages": [],
            "tools": [],
            "context": [],
            "forwardedProps": {},
            "resume": [
                {
                    "interruptId": "int-call-1",
                    "status": "resolved",
                    "payload": {"decision": "approved"},
                }
            ],
        }

        assert _extract_resume_entries(body) == body["resume"]

    def test_extract_resume_entries_defaults_to_empty_list(self):
        from src.server.main import _extract_resume_entries

        assert _extract_resume_entries({"threadId": "thread-1"}) == []
```

- [ ] **Step 2: Run resume tests and verify they fail**

Run:

```bash
cd apps/agent
uv run pytest tests/test_server.py::TestAguiResumeExtraction -v
```

Expected: fail because `_extract_resume_entries` does not exist.

- [ ] **Step 3: Implement resume extraction and deferred result injection**

In `apps/agent/src/server/main.py`, add imports:

```python
from ..agent.agui_approval_bridge import resume_entries_to_deferred_tool_results
```

Add helper near endpoint definitions:

```python
def _extract_resume_entries(body: dict) -> list[dict]:
    resume = body.get("resume")
    return resume if isinstance(resume, list) else []
```

Replace `copilotkit_endpoint` with:

```python
@app.post("/copilotkit")
async def copilotkit_endpoint(request: Request) -> Response:
    body = await request.json()
    resume_entries = _extract_resume_entries(body)
    deferred_tool_results = (
        resume_entries_to_deferred_tool_results(resume_entries)
        if resume_entries
        else None
    )

    async def receive_once():
        return {
            "type": "http.request",
            "body": json.dumps(body).encode("utf-8"),
            "more_body": False,
        }

    replay_request = Request(request.scope, receive_once)
    return await AGUIAdapter.dispatch_request(
        request=replay_request,
        agent=agent,
        deps=getattr(agent, '_default_deps', None),
        deferred_tool_results=deferred_tool_results,
    )
```

- [ ] **Step 4: Run backend tests**

Run:

```bash
cd apps/agent
uv run pytest tests/test_agui_approval_bridge.py tests/test_server.py -v
```

Expected: all selected tests pass.

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/server/main.py apps/agent/tests/test_server.py
git commit -m "feat: pass approval resume payloads to ag-ui adapter"
```

---

### Task 7: Convert One Approval Tool Path And Keep Fallback

**Files:**
- Modify: `apps/agent/src/agent/paladin_agent.py`
- Modify: `apps/agent/tests/test_agent.py`

- [ ] **Step 1: Add configuration test for approval mode**

Append to `apps/agent/tests/test_agent.py`:

```python
def test_hitl_mode_defaults_to_agui_interrupt():
    from src.agent.paladin_agent import _approval_mode

    assert _approval_mode({}) == "agui_interrupt"


def test_hitl_mode_allows_legacy_sse_fallback():
    from src.agent.paladin_agent import _approval_mode

    assert _approval_mode({"hitl": {"mode": "legacy_sse"}}) == "legacy_sse"
```

- [ ] **Step 2: Run the new tests and verify they fail**

Run:

```bash
cd apps/agent
uv run pytest tests/test_agent.py::test_hitl_mode_defaults_to_agui_interrupt tests/test_agent.py::test_hitl_mode_allows_legacy_sse_fallback -v
```

Expected: fail because `_approval_mode` does not exist.

- [ ] **Step 3: Add approval mode helper**

In `apps/agent/src/agent/paladin_agent.py`, add after `_load_mcp_servers`:

```python
def _approval_mode(raw_config: dict) -> str:
    mode = raw_config.get("hitl", {}).get("mode", "agui_interrupt")
    if mode not in {"agui_interrupt", "legacy_sse"}:
        raise ValueError(f"Unsupported hitl.mode: {mode}")
    return mode
```

- [ ] **Step 4: Use the mode when creating ToolGuard**

In `create_paladin_agent`, after `timeout = hitl_parsed["timeout_seconds"]`, add:

```python
    mode = _approval_mode(raw_config)
```

Then replace:

```python
    approval_callback = create_approval_callback(timeout=timeout)
```

with:

```python
    approval_callback = (
        create_approval_callback(timeout=timeout)
        if mode == "legacy_sse"
        else None
    )
```

Then replace the `ToolGuard` creation with:

```python
    guard_kwargs = {
        "blocked": blocked,
        "require_approval": require_approval,
    }
    if approval_callback is not None:
        guard_kwargs["approval_callback"] = approval_callback

    guard = ToolGuard(**guard_kwargs)
```

- [ ] **Step 5: Run agent tests**

Run:

```bash
cd apps/agent
uv run pytest tests/test_agent.py tests/test_hitl.py -v
```

Expected: all tests pass. If `ToolGuard` requires `approval_callback` for `require_approval`, stop and keep `legacy_sse` as the default until Task 8 verifies native Pydantic tool approval for the selected tools.

- [ ] **Step 6: Commit**

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

Expected: no modal approval is required and `/approval/stream` is not needed for the primary flow.

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

### Task 9: Remove Modal-First Approval Path After Verification

**Files:**
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/agent/src/server/main.py`
- Modify: `apps/agent/src/agent/paladin_agent.py`
- Modify: `apps/agent/tests/test_hitl.py`
- Modify: `apps/agent/tests/test_server.py`

- [ ] **Step 1: Remove frontend provider and dialog wiring**

In `apps/desktop/src/App.tsx`, remove:

```tsx
import { ApprovalProvider, useApprovalContext } from '@/components/approval/ApprovalBridge';
import { ApprovalDialog } from '@/components/approval/ApprovalDialog';
```

Remove the `<ApprovalProvider>` wrapper and any `ApprovalContextDialog` usage. Keep the root layout directly inside `CopilotKitProvider`.

- [ ] **Step 2: Remove primary dependency on legacy approval endpoints**

In `apps/agent/src/server/main.py`, keep `/approval/stream` and `/approval/{request_id}` only if `hitl.mode == "legacy_sse"` remains a supported fallback. If the fallback is no longer needed, remove the endpoints, `_approval_queues`, `_broadcast_task`, and startup/shutdown broadcast loop.

- [ ] **Step 3: Update tests to match final endpoint policy**

If fallback remains, add this test to `apps/agent/tests/test_server.py`:

```python
def test_approval_stream_is_not_required_for_copilotkit():
    from src.server.main import _extract_resume_entries

    assert _extract_resume_entries({"resume": []}) == []
```

If fallback is removed, delete tests in `apps/agent/tests/test_hitl.py` that assert SSE callback behavior and replace them with bridge/store tests from earlier tasks.

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

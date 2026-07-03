# AG-UI Tool Approval Design

Date: 2026-07-01

## Goal

Render tool permission approval requests inside the CopilotKit conversation message stream while making approvals durable, thread-scoped, and resumable.

The target architecture is standard AG-UI interrupt/resume. A tool approval request should stop the current run with an interrupt outcome, persist the pending approval, render an approval card in the chat stream, and resume the same thread after the user approves or denies the request.

## Current State

Phase 07 implemented human-in-the-loop approval as a side channel:

- The backend stores pending approvals in memory.
- `/approval/stream` sends approval requests through a separate SSE stream. (removed in 07.2; historical prior behavior only)
- `/approval/{request_id}` receives approve or deny decisions. (removed in 07.2; historical prior behavior only)
- The desktop app keeps approval state in `ApprovalProvider`.
- The main UI renders approval through `ApprovalDialog`; `ApprovalCard` exists but is not part of the active CopilotKit message stream. (removed in 07.2; historical prior behavior only)

This works for short live sessions, but it has two structural limits:

- A pending approval depends on process-local state and a waiting coroutine.
- Approval UI is outside the AG-UI/CopilotKit run lifecycle, so it does not naturally appear as a conversation event.

## Decision

Use the official AG-UI interrupt/resume architecture as the only supported approval path after Phase 07.2.

### Target Architecture

Use Pydantic deferred tool approval mapped to standard AG-UI interrupt/resume:

```text
Pydantic tool requires approval
-> DeferredToolRequests
-> AG-UI RUN_FINISHED outcome.type = "interrupt"
-> CopilotKit interrupt approval card in the chat stream
-> AG-UI RunAgentInput.resume
-> Pydantic DeferredToolResults
-> original tool call continues and emits its result
```

The required invariant is:

> Tool approval must be thread-scoped, resume-based, and durable. It must not rely on keeping the original async run blocked until the user responds.

### Path 1: Official Adapter First

Prefer the official integration if the installed or upgraded dependency versions support it end to end:

- Pydantic AI tools declare approval with `requires_approval=True`.
- Pydantic returns `DeferredToolRequests` when approval is needed.
- `AGUIAdapter.dispatch_request()` maps deferred approval to AG-UI interrupt output.
- CopilotKit `useInterrupt` renders the interrupt in the conversation stream.
- The frontend resolves the interrupt through AG-UI resume.
- The backend maps resume payloads back into `DeferredToolResults`.

This is the cleanest path because Paladin does not own protocol translation logic.

### Path 2: Thin Adapter Compatibility Path

If the current dependency set cannot produce or consume standard approval interrupts as documented, add a narrow compatibility adapter inside Paladin.

The adapter may translate:

- `DeferredToolRequests` to AG-UI `RunFinishedInterruptOutcome`
- `RunAgentInput.resume[]` to Pydantic `DeferredToolResults`

The adapter must not own business policy. It should not decide which tools require approval, whether a request is safe, or how approval is audited. Those decisions remain in the agent/tool approval layer.

This path is still part of the standard AG-UI interrupt/resume architecture. It only fills a dependency gap.

## Removed Legacy Fallback

Phase 07.2 removed the Phase 07 side-channel approval fallback. The deprecated legacy SSE/HTTP path is historical prior behavior only and must not be implemented, selected, or retained as operational guidance.

Active Paladin approvals now use `/copilotkit` plus official AG-UI interrupt/resume. A narrow compatibility adapter remains acceptable only when it preserves that public contract; it must not reintroduce a separate request-id approval transport.

## Backend Design

### Approval Declaration

Tools that need user approval should be declared through the Pydantic approval mechanism rather than through a long-running callback wait.

Each approval-capable tool should expose enough metadata to render a useful approval card:

- Tool name
- Tool arguments
- Human-readable reason
- Risk level or category when available
- Tool call id
- Thread id
- Optional expiry time

### AG-UI Request Handling

Replace the deprecated AG-UI request entrypoint with the current adapter API where possible.

The backend should use `AGUIAdapter.dispatch_request()` as the primary route once verified. If dependency behavior does not match the documented interrupt approval lifecycle, route through the thin compatibility adapter described above.

### Approval State

After Phase 07.2, Paladin does not ship the legacy local approval store. Approval state should follow the official AG-UI interrupt/resume lifecycle through the adapter and thread context. Durable audit or approval history belongs to a future admin/audit phase, not the removed legacy fallback.

### Resume Semantics

Approval resume should preserve the original thread and tool call identity.

For approval:

```text
resume decision -> ToolApproved -> continue original tool call
```

For denial:

```text
resume decision -> ToolDenied -> return denied result to agent
```

Denial is not a transport error. It is a valid tool result that the agent can explain to the user.

## Frontend Design

### Message Stream UI

The approval request should render inside `CopilotChat` as an interrupt card. It should not be a modal-first experience.

The card should show:

- Tool name
- Reason for approval
- Important arguments in a compact summary
- Risk indicator when present
- Approve and deny actions
- Current status after the user acts

The existing `ApprovalCard` can provide visual and interaction direction, but its data source should move from `ApprovalProvider` to the AG-UI interrupt payload and resolver.

### Toolbar and Dialog

The toolbar may keep a lightweight pending-approval indicator, but it should not be the primary approval surface.

`ApprovalDialog` should be removed from the main approval path after the message-stream card is working. If a modal remains useful for details, it should be opened from the card and should not own approval state.

### Resume Behavior

When the user approves or denies, the frontend should resolve the interrupt through CopilotKit/AG-UI resume rather than POSTing to the old `/approval/{request_id}` endpoint. (removed in 07.2; historical prior behavior only)

The UI should handle:

- Pending approval
- Approved approval waiting for resumed output
- Denied approval waiting for resumed output
- Expired approval
- Resume failure

## Error Handling

The system should treat these cases explicitly:

- Expired approval: render the card as expired and do not resume.
- Duplicate decision: keep the first decision and reject later attempts.
- Missing approval record: show a recoverable error in the card.
- Backend restart: reload pending approvals from durable storage.
- Dependency adapter mismatch: fail verification without restoring the removed side-channel path.
- Resume transport failure: leave the card in a retryable state until the backend confirms resolution.

## Migration Plan

Implementation should be staged:

1. Verify dependency support for documented AG-UI interrupt/resume approval.
2. Add or select durable storage for pending approvals.
3. Convert one low-risk approval-required tool to Pydantic deferred approval.
4. Wire backend AG-UI interrupt output and resume input.
5. Render approval interrupts in the CopilotKit message stream.
6. Verify the deprecated side-channel approval path is removed in 07.2 and remains historical prior behavior only.

## Testing And Verification

Verification should cover:

- A tool requiring approval renders an approval card inside the chat stream.
- Approving resumes the same thread and executes the original tool.
- Denying resumes the same thread and returns a denied tool result.
- Refreshing the desktop app does not lose pending approval.
- - An expired approval cannot be resumed.
- A duplicate approval decision is rejected or ignored consistently.
- Existing non-approval tool calls still stream normally.
- The deprecated `/approval/stream` path is not required for the primary approval flow.

## Open Dependency Check

Before implementation planning, confirm the exact installed versions and behavior of:

- Pydantic AI AG-UI adapter
- `ag-ui-protocol`
- CopilotKit `useInterrupt`

If the official adapter matches the documented approval lifecycle, use Path 1. If it does not, implement Path 2 as a narrow compatibility bridge while preserving the same public architecture.

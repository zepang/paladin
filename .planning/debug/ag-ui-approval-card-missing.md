# AG-UI Approval Card Missing Debug

## Context

- Phase: 07.1 official AG-UI deferred tool approval
- Reported at: 2026-07-03T03:40:26Z
- User-visible symptom: a `write_file` tool call stays in the chat as `Running`, but no approval card or approval dialog appears.
- Prompt used in UAT: `帮我创建一个临时文件/tmp/test.txt，写入hello`

## Expected

When `write_file` requires approval, the official AG-UI deferred approval path should surface a pending approval UI in chat. The user should be able to approve or deny the tool call, and the next AG-UI request should resume the pending interrupt.

## Observed

The screenshot shows:

- `write_file` appears as a normal tool-call row.
- The row remains `Running`.
- No inline approval card is visible.
- No legacy approval dialog is visible.
- Browser console does not show a relevant frontend exception.

## Evidence

Backend configuration is using the new official path:

- `apps/agent/src/agent/paladin_agent.py:335` sets `interrupt_on` in `agui_interrupt` mode.
- `apps/agent/src/agent/paladin_agent.py:337` clears `guarded_require_approval`.
- `apps/agent/src/agent/paladin_agent.py:338` disables the legacy `approval_callback`.
- `apps/agent/src/agent/paladin_agent.py:378` passes `interrupt_on` into `create_deep_agent`.

The old SSE UI still exists, but this mode does not feed it:

- `apps/desktop/src/components/approval/ApprovalBridge.tsx` listens to `/approval/stream`.
- `apps/agent/src/server/main.py:146` defines `/approval/stream`.
- In `agui_interrupt` mode, the backend does not create the callback that writes approval requests into that stream.

The new inline approval UI is wired through CopilotKit `useInterrupt`:

- `apps/desktop/src/components/approval/AguiApprovalInterrupt.tsx:95` registers `useInterrupt`.
- `apps/desktop/src/components/approval/AguiApprovalInterrupt.tsx:96` accepts events whose value has `reason === "tool_call"`.
- `apps/desktop/src/components/approval/AguiApprovalInterrupt.tsx:98` renders the approval card when the hook receives a matching event.

However, the installed CopilotKit hook listens to a custom-event channel:

- `@copilotkit/react-core/dist/v2/headless.mjs:542` handles only `onCustomEvent`.
- `@copilotkit/react-core/dist/v2/headless.mjs:543` stores only events named `on_interrupt`.
- `@copilotkit/react-core/dist/v2/headless.mjs:564` resumes by sending `forwardedProps.command.resume`.

The AG-UI client supports the official interrupt lifecycle separately:

- `@ag-ui/client/dist/index.d.ts` exposes `onRunFinishedEvent` with `outcome: "interrupt"` and `interrupts: Interrupt[]`.
- It also exposes `RunAgentParameters.resume?: ResumeEntry[]`.
- The runtime stores pending interrupts from `RUN_FINISHED.outcome.interrupts`.

## Root Cause

The approval card is waiting on the wrong frontend event shape. The backend emits official AG-UI deferred approvals as `RUN_FINISHED.outcome.interrupts`, while `AguiApprovalInterrupt` depends on CopilotKit `useInterrupt`, which listens for a custom event named `on_interrupt`.

There is currently no Paladin bridge that converts the official AG-UI interrupt outcome into the custom event consumed by `useInterrupt`, and the resume payload path used by `useInterrupt` is not the same as AG-UI `resume` entries. As a result, the pending approval reaches the agent runtime but never reaches the visible approval card.

## Impact

- Approval-gated tools can enter a pending/running state without a visible decision UI.
- Automated tests D6 and D7 are insufficient because they mock `useInterrupt` instead of exercising the real AG-UI event stream.
- UAT for Phase 07.1 must remain failed until the real event path is covered.

## Fix Direction

Recommended fix:

1. Replace or augment `AguiApprovalInterrupt` with a hook that subscribes to `agent.subscribe({ onRunFinishedEvent })` and captures `outcome === "interrupt"`.
2. Render the existing `ApprovalCard` from the captured `Interrupt`.
3. On approve or deny, call `copilotkit.runAgent` or `agent.runAgent` with AG-UI `resume: [{ interruptId, status: "resolved", payload }]`.
4. Add an integration test that feeds a real `RUN_FINISHED` interrupt outcome through the frontend agent subscription and verifies the approval card appears.
5. Add a resume test that verifies the next request contains `resume[]` entries addressing the pending interrupt id.

from __future__ import annotations

from typing import Any

from ag_ui.core import Interrupt
from ag_ui.core.events import RunFinishedInterruptOutcome
from pydantic_ai.tools import DeferredToolRequests, DeferredToolResults, ToolApproved, ToolDenied


def deferred_approvals_to_interrupt_outcome(
    requests: DeferredToolRequests,
) -> RunFinishedInterruptOutcome:
    interrupts = []

    for call in requests.approvals:
        tool_call_id = call.tool_call_id
        tool_args = call.args if isinstance(call.args, dict) else {"args": call.args}
        metadata = {
            **requests.metadata.get(tool_call_id, {}),
            "tool_name": call.tool_name,
            "tool_args": tool_args,
        }
        message = metadata.get("reason") or f"Approve tool call {call.tool_name}."

        interrupts.append(
            Interrupt(
                id=f"int-{tool_call_id}",
                reason="approval_required",
                message=message,
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
        tool_call_id = _tool_call_id_from_interrupt_id(interrupt_id)
        payload = entry.get("payload") or {}
        decision = payload.get("decision")
        metadata[tool_call_id] = {"interrupt_id": interrupt_id, "resume_entry": entry}

        if entry.get("status") == "cancelled" or decision == "denied":
            approvals[tool_call_id] = ToolDenied(
                message=payload.get("message") or "The tool call was denied."
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


def _tool_call_id_from_interrupt_id(interrupt_id: str) -> str:
    return interrupt_id.removeprefix("int-")

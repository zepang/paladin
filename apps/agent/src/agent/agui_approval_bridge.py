from __future__ import annotations

from datetime import datetime
from typing import Any

from ag_ui.core import Interrupt, ResumeEntry
from ag_ui.core.events import RunFinishedInterruptOutcome
from pydantic_ai.tools import DeferredToolRequests, DeferredToolResults, ToolApproved, ToolDenied

_VALID_RESUME_STATUSES = {"resolved", "cancelled"}


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
        expires_at = _normalize_expires_at(metadata.get("expires_at"))

        interrupts.append(
            Interrupt(
                id=f"int-{tool_call_id}",
                reason="approval_required",
                message=message,
                toolCallId=tool_call_id,
                expiresAt=expires_at,
                metadata=metadata,
            )
        )

    return RunFinishedInterruptOutcome(interrupts=interrupts)


def resume_entries_to_deferred_tool_results(
    resume_entries: list[Any],
) -> DeferredToolResults:
    approvals: dict[str, ToolApproved | ToolDenied] = {}
    metadata: dict[str, dict[str, Any]] = {}

    for index, entry in enumerate(resume_entries):
        normalized_entry = _normalize_resume_entry(entry, index)
        interrupt_id = normalized_entry["interrupt_id"]
        tool_call_id = normalized_entry["tool_call_id"]
        payload = normalized_entry["payload"]
        decision = payload.get("decision")
        metadata[tool_call_id] = normalized_entry["metadata"]

        if error := normalized_entry.get("error"):
            approvals[tool_call_id] = ToolDenied(
                message=f"Malformed resume entry: {error}"
            )
            continue

        if normalized_entry["status"] == "cancelled" or decision in {"cancelled", "denied"}:
            approvals[tool_call_id] = ToolDenied(
                message=payload.get("message") or "The tool call was denied."
            )
        elif decision == "approved":
            override_args = payload.get("override_args")
            if override_args is not None and not isinstance(override_args, dict):
                approvals[tool_call_id] = ToolDenied(
                    message=(
                        "Malformed override_args: expected dict, "
                        f"got {type(override_args).__name__}."
                    )
                )
            else:
                approvals[tool_call_id] = ToolApproved(override_args=override_args)
        else:
            approvals[tool_call_id] = ToolDenied(
                message=f"Unsupported approval decision: {decision!r}"
            )

    return DeferredToolResults(calls={}, approvals=approvals, metadata=metadata)


def _tool_call_id_from_interrupt_id(interrupt_id: str) -> str:
    return interrupt_id.removeprefix("int-")


def _normalize_expires_at(expires_at: Any) -> str | None:
    if expires_at is None or isinstance(expires_at, str):
        return expires_at
    if isinstance(expires_at, datetime):
        return expires_at.isoformat()
    raise ValueError(
        "Invalid expires_at metadata: expected datetime, string, or None, "
        f"got {type(expires_at).__name__}."
    )


def _normalize_resume_entry(
    entry: Any,
    index: int,
) -> dict[str, Any]:
    if isinstance(entry, dict):
        interrupt_id = entry.get("interruptId")
        if interrupt_id is None and "interrupt_id" in entry:
            interrupt_id = entry.get("interrupt_id")
        status = entry.get("status")
        payload, payload_error = _normalize_resume_payload(entry.get("payload"))
        error = _resume_entry_error(interrupt_id, status, payload_error)
        tool_call_id = _normalized_tool_call_id(interrupt_id, index)
        metadata = {
            "interrupt_id": interrupt_id,
            "payload": payload,
            "entry": entry,
        }
        if error is not None:
            metadata["error"] = error

        return {
            "interrupt_id": interrupt_id,
            "tool_call_id": tool_call_id,
            "status": status,
            "payload": payload,
            "metadata": metadata,
            "error": error,
        }

    if not isinstance(entry, ResumeEntry):
        error = f"unsupported resume entry type: {type(entry).__name__}"
        return {
            "interrupt_id": None,
            "tool_call_id": f"malformed-{index}",
            "status": None,
            "payload": {},
            "metadata": {
                "interrupt_id": None,
                "payload": {},
                "entry": entry,
                "error": error,
            },
            "error": error,
        }

    interrupt_id = getattr(entry, "interrupt_id", None)
    status = getattr(entry, "status", None)
    payload, payload_error = _normalize_resume_payload(getattr(entry, "payload", None))
    error = _resume_entry_error(interrupt_id, status, payload_error)
    tool_call_id = _normalized_tool_call_id(interrupt_id, index)
    metadata = {"interrupt_id": interrupt_id, "payload": payload}
    if error is not None:
        metadata["error"] = error

    return {
        "interrupt_id": interrupt_id,
        "tool_call_id": tool_call_id,
        "status": status,
        "payload": payload,
        "metadata": metadata,
        "error": error,
    }


def _normalize_resume_payload(payload: Any) -> tuple[dict[str, Any], str | None]:
    if payload is None:
        return {}, None
    if isinstance(payload, dict):
        return payload, None
    return {}, f"non-dict payload: got {type(payload).__name__}"


def _resume_entry_error(
    interrupt_id: Any,
    status: Any,
    payload_error: str | None = None,
) -> str | None:
    if not isinstance(interrupt_id, str) or interrupt_id == "":
        return "missing or non-string interruptId"
    if not isinstance(status, str):
        return "missing or non-string status"
    if status not in _VALID_RESUME_STATUSES:
        return (
            "invalid status: expected 'resolved' or 'cancelled', "
            f"got {status!r}"
        )
    if payload_error is not None:
        return payload_error
    return None


def _normalized_tool_call_id(interrupt_id: Any, index: int) -> str:
    if isinstance(interrupt_id, str) and interrupt_id != "":
        return _tool_call_id_from_interrupt_id(interrupt_id)
    return f"malformed-{index}"

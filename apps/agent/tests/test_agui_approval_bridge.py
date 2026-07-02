from datetime import datetime, timezone

from ag_ui.core import ResumeEntry
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


def test_deferred_approval_datetime_expires_at_maps_to_iso_string():
    expires_at = datetime(2026, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
    call = ToolCallPart(
        tool_name="computer_click",
        args={"x": 10, "y": 20},
        tool_call_id="call-1",
    )
    requests = DeferredToolRequests(
        calls=[],
        approvals=[call],
        metadata={"call-1": {"expires_at": expires_at}},
    )

    outcome = deferred_approvals_to_interrupt_outcome(requests)

    assert outcome.interrupts[0].expires_at == expires_at.isoformat()


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


def test_resume_entry_object_approved_maps_to_tool_approved():
    results = resume_entries_to_deferred_tool_results([
        ResumeEntry(
            interruptId="int-call-1",
            status="resolved",
            payload={"decision": "approved"},
        )
    ])

    approval = results.approvals["call-1"]
    assert isinstance(approval, ToolApproved)


def test_resume_approved_with_malformed_override_args_maps_to_tool_denied():
    results = resume_entries_to_deferred_tool_results([
        {
            "interruptId": "int-call-1",
            "status": "resolved",
            "payload": {
                "decision": "approved",
                "override_args": ["not", "a", "dict"],
            },
        }
    ])

    approval = results.approvals["call-1"]
    assert isinstance(approval, ToolDenied)
    assert "Malformed override_args" in approval.message


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


def test_resume_cancelled_decision_maps_to_tool_denied():
    results = resume_entries_to_deferred_tool_results([
        {
            "interruptId": "int-call-1",
            "status": "resolved",
            "payload": {"decision": "cancelled"},
        }
    ])

    approval = results.approvals["call-1"]
    assert isinstance(approval, ToolDenied)
    assert approval.message == "The tool call was denied."


def test_resume_metadata_includes_interrupt_id_and_payload():
    payload = {"decision": "approved", "source": "user"}

    results = resume_entries_to_deferred_tool_results([
        {
            "interruptId": "int-call-1",
            "status": "resolved",
            "payload": payload,
        }
    ])

    assert results.metadata["call-1"]["interrupt_id"] == "int-call-1"
    assert results.metadata["call-1"]["payload"] == payload


def test_resume_missing_interrupt_id_fails_closed_as_tool_denied():
    entry = {"status": "resolved", "payload": {"decision": "approved"}}

    results = resume_entries_to_deferred_tool_results([entry])

    approval = results.approvals["malformed-0"]
    assert isinstance(approval, ToolDenied)
    assert "Malformed resume entry" in approval.message
    assert results.metadata["malformed-0"]["entry"] == entry
    assert results.metadata["malformed-0"]["payload"] == {"decision": "approved"}
    assert "interruptId" in results.metadata["malformed-0"]["error"]


def test_resume_missing_status_fails_closed_as_tool_denied():
    entry = {"interruptId": "int-call-1", "payload": {"decision": "approved"}}

    results = resume_entries_to_deferred_tool_results([entry])

    approval = results.approvals["call-1"]
    assert isinstance(approval, ToolDenied)
    assert "Malformed resume entry" in approval.message
    assert results.metadata["call-1"]["interrupt_id"] == "int-call-1"
    assert results.metadata["call-1"]["entry"] == entry
    assert "status" in results.metadata["call-1"]["error"]


def test_resume_non_string_interrupt_id_fails_closed_with_synthetic_key():
    entry = {
        "interruptId": 123,
        "status": "resolved",
        "payload": {"decision": "approved"},
    }

    results = resume_entries_to_deferred_tool_results([entry])

    approval = results.approvals["malformed-0"]
    assert isinstance(approval, ToolDenied)
    assert "Malformed resume entry" in approval.message
    assert results.metadata["malformed-0"]["entry"] == entry
    assert results.metadata["malformed-0"]["payload"] == {"decision": "approved"}
    assert "interruptId" in results.metadata["malformed-0"]["error"]

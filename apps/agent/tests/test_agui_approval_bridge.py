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

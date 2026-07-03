import dataclasses
import inspect

from ag_ui.core import Interrupt, ResumeEntry, RunAgentInput
from ag_ui.core.events import RunFinishedInterruptOutcome
from pydantic_ai.tools import DeferredToolRequests, DeferredToolResults, ToolApproved, ToolDenied
from pydantic_ai.ui.ag_ui import AGUIAdapter


def test_agui_adapter_dispatch_request_exists():
    assert hasattr(AGUIAdapter, "dispatch_request")
    signature = inspect.signature(AGUIAdapter.dispatch_request)
    assert "deferred_tool_results" in signature.parameters


def test_agui_protocol_has_standard_interrupt_and_resume_types():
    assert "resume" in RunAgentInput.model_fields

    interrupt = Interrupt(
        id="int-call-1",
        reason="tool_call",
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
        payload={"approved": True},
    )
    assert resume.interrupt_id == "int-call-1"
    assert resume.status == "resolved"


def test_pydantic_deferred_approval_types_are_available():
    assert dataclasses.is_dataclass(DeferredToolRequests)
    assert dataclasses.is_dataclass(DeferredToolResults)
    assert dataclasses.is_dataclass(ToolApproved)
    assert dataclasses.is_dataclass(ToolDenied)

    request_fields = {field.name for field in dataclasses.fields(DeferredToolRequests)}
    result_fields = {field.name for field in dataclasses.fields(DeferredToolResults)}

    assert "approvals" in request_fields
    assert "approvals" in result_fields

    approved = ToolApproved()
    denied = ToolDenied(message="User denied this tool call.")

    assert approved.kind == "tool-approved"
    assert denied.kind == "tool-denied"

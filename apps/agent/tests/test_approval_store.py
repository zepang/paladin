import json
from dataclasses import asdict
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


def test_mutating_original_record_after_upsert_does_not_mutate_store(tmp_path):
    store = ApprovalStore(tmp_path / "approvals.json")
    record = make_record()

    store.upsert(record)
    record.tool_name = "mutated"
    record.tool_args["x"] = 999

    stored = store.get("int-call-1")
    assert stored is not None
    assert stored.tool_name == "computer_click"
    assert stored.tool_args == {"x": 10, "y": 20}


def test_mutating_record_returned_by_get_does_not_mutate_store(tmp_path):
    store = ApprovalStore(tmp_path / "approvals.json")
    store.upsert(make_record())

    returned = store.get("int-call-1")
    assert returned is not None
    returned.tool_name = "mutated"
    returned.tool_args["x"] = 999

    stored = store.get("int-call-1")
    assert stored is not None
    assert stored.tool_name == "computer_click"
    assert stored.tool_args == {"x": 10, "y": 20}


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


def test_mutating_record_returned_by_resolve_does_not_mutate_store(tmp_path):
    store = ApprovalStore(tmp_path / "approvals.json")
    store.upsert(make_record())

    resolved = store.resolve(
        approval_id="int-call-1",
        decision="approved",
        now=datetime.now(timezone.utc),
    )
    resolved.status = "pending"
    resolved.decision = None
    resolved.resolved_at = None

    stored = store.get("int-call-1")
    assert stored is not None
    assert stored.status == "approved"
    assert stored.decision == "approved"
    assert stored.resolved_at is not None


def test_invalid_decision_is_rejected_and_not_persisted(tmp_path):
    path = tmp_path / "approvals.json"
    store = ApprovalStore(path)
    store.upsert(make_record())

    with pytest.raises(ApprovalDecisionError, match="invalid decision"):
        store.resolve("int-call-1", "maybe", now=datetime.now(timezone.utc))  # type: ignore[arg-type]

    reloaded = ApprovalStore(path)
    record = reloaded.get("int-call-1")
    assert record is not None
    assert record.status == "pending"
    assert record.decision is None
    assert record.resolved_at is None


def test_resolved_decision_survives_reload(tmp_path):
    path = tmp_path / "approvals.json"
    store = ApprovalStore(path)
    store.upsert(make_record())
    resolved_at = datetime.now(timezone.utc)

    store.resolve("int-call-1", "approved", now=resolved_at)

    reloaded = ApprovalStore(path)
    record = reloaded.get("int-call-1")
    assert record is not None
    assert record.status == "approved"
    assert record.decision == "approved"
    assert record.resolved_at == resolved_at


def test_denied_decision_survives_reload(tmp_path):
    path = tmp_path / "approvals.json"
    store = ApprovalStore(path)
    store.upsert(make_record())
    resolved_at = datetime.now(timezone.utc)

    resolved = store.resolve("int-call-1", "denied", now=resolved_at)

    assert resolved.status == "denied"
    assert resolved.decision == "denied"
    assert resolved.resolved_at == resolved_at

    reloaded = ApprovalStore(path)
    record = reloaded.get("int-call-1")
    assert record is not None
    assert record.status == "denied"
    assert record.decision == "denied"
    assert record.resolved_at == resolved_at


def test_missing_approval_gets_none_and_resolve_raises(tmp_path):
    store = ApprovalStore(tmp_path / "approvals.json")

    assert store.get("missing") is None
    with pytest.raises(ApprovalDecisionError, match="approval not found: missing"):
        store.resolve("missing", "approved", now=datetime.now(timezone.utc))


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


@pytest.mark.parametrize(
    ("field", "value", "match"),
    [
        ("status", "unknown", "invalid status"),
        ("decision", "maybe", "invalid decision"),
    ],
)
def test_invalid_persisted_status_or_decision_is_rejected_on_load(
    tmp_path,
    field,
    value,
    match,
):
    path = tmp_path / "approvals.json"
    record = make_record()
    data = asdict(record)
    for key in ("created_at", "expires_at", "resolved_at"):
        timestamp = data[key]
        data[key] = timestamp.isoformat() if timestamp is not None else None
    data[field] = value
    path.write_text(json.dumps({record.approval_id: data}), encoding="utf-8")

    with pytest.raises(ApprovalDecisionError, match=match):
        ApprovalStore(path)


def test_non_object_top_level_json_is_rejected(tmp_path):
    path = tmp_path / "approvals.json"
    path.write_text(json.dumps([]), encoding="utf-8")

    with pytest.raises(ApprovalDecisionError, match="top-level"):
        ApprovalStore(path)


def test_persisted_record_value_not_object_is_rejected(tmp_path):
    path = tmp_path / "approvals.json"
    path.write_text(json.dumps({"int-call-1": []}), encoding="utf-8")

    with pytest.raises(ApprovalDecisionError, match="record int-call-1"):
        ApprovalStore(path)


def test_missing_required_field_is_rejected(tmp_path):
    path = tmp_path / "approvals.json"
    record = make_record()
    data = asdict(record)
    for key in ("created_at", "expires_at", "resolved_at"):
        timestamp = data[key]
        data[key] = timestamp.isoformat() if timestamp is not None else None
    del data["tool_name"]
    path.write_text(json.dumps({record.approval_id: data}), encoding="utf-8")

    with pytest.raises(ApprovalDecisionError, match="missing required field tool_name"):
        ApprovalStore(path)


def test_malformed_field_type_is_rejected(tmp_path):
    path = tmp_path / "approvals.json"
    record = make_record()
    data = asdict(record)
    for key in ("created_at", "expires_at", "resolved_at"):
        timestamp = data[key]
        data[key] = timestamp.isoformat() if timestamp is not None else None
    data["tool_args"] = "not a dict"
    path.write_text(json.dumps({record.approval_id: data}), encoding="utf-8")

    with pytest.raises(ApprovalDecisionError, match="tool_args must be a dict"):
        ApprovalStore(path)


def test_key_approval_id_mismatch_is_rejected(tmp_path):
    path = tmp_path / "approvals.json"
    record = make_record()
    data = asdict(record)
    for key in ("created_at", "expires_at", "resolved_at"):
        timestamp = data[key]
        data[key] = timestamp.isoformat() if timestamp is not None else None
    path.write_text(json.dumps({"other-id": data}), encoding="utf-8")

    with pytest.raises(ApprovalDecisionError, match="approval_id mismatch"):
        ApprovalStore(path)


@pytest.mark.parametrize(
    ("decision", "match"),
    [
        (None, "approved approval must have matching decision"),
        ("denied", "approved approval must have matching decision"),
    ],
)
def test_approved_status_with_missing_or_mismatched_decision_is_rejected(
    tmp_path,
    decision,
    match,
):
    path = tmp_path / "approvals.json"
    record = make_record()
    record.status = "approved"
    record.decision = decision
    record.resolved_at = datetime.now(timezone.utc)
    data = asdict(record)
    for key in ("created_at", "expires_at", "resolved_at"):
        timestamp = data[key]
        data[key] = timestamp.isoformat() if timestamp is not None else None
    path.write_text(json.dumps({record.approval_id: data}), encoding="utf-8")

    with pytest.raises(ApprovalDecisionError, match=match):
        ApprovalStore(path)


def test_pending_status_with_resolved_at_is_rejected(tmp_path):
    path = tmp_path / "approvals.json"
    record = make_record()
    record.resolved_at = datetime.now(timezone.utc)
    data = asdict(record)
    for key in ("created_at", "expires_at", "resolved_at"):
        timestamp = data[key]
        data[key] = timestamp.isoformat() if timestamp is not None else None
    path.write_text(json.dumps({record.approval_id: data}), encoding="utf-8")

    with pytest.raises(ApprovalDecisionError, match="pending approval cannot be resolved"):
        ApprovalStore(path)


@pytest.mark.parametrize(
    ("field", "value", "match"),
    [
        ("tool_args", "bad", "tool_args must be a dict"),
        ("metadata", [], "metadata must be a dict"),
        ("approval_id", 123, "approval_id must be a string"),
    ],
)
def test_malformed_runtime_record_values_are_rejected(tmp_path, field, value, match):
    record = make_record()
    setattr(record, field, value)
    store = ApprovalStore(tmp_path / "approvals.json")

    with pytest.raises(ApprovalDecisionError, match=match):
        store.upsert(record)

    assert store.get("int-call-1") is None


def test_naive_datetime_is_rejected_on_upsert(tmp_path):
    record = make_record()
    record.created_at = datetime.now()
    path = tmp_path / "approvals.json"
    store = ApprovalStore(path)

    with pytest.raises(ApprovalDecisionError, match="timezone-aware"):
        store.upsert(record)

    assert not path.exists()


def test_upsert_does_not_change_memory_when_save_fails(tmp_path, monkeypatch):
    store = ApprovalStore(tmp_path / "approvals.json")
    original = make_record()
    replacement = make_record()
    replacement.tool_name = "computer_drag"
    store.upsert(original)

    def fail_save(*_args):
        raise OSError("disk full")

    monkeypatch.setattr(store, "_save", fail_save)

    with pytest.raises(OSError, match="disk full"):
        store.upsert(replacement)

    record = store.get("int-call-1")
    assert record is not None
    assert record.tool_name == "computer_click"


def test_resolve_does_not_change_memory_when_save_fails(tmp_path, monkeypatch):
    store = ApprovalStore(tmp_path / "approvals.json")
    store.upsert(make_record())

    def fail_save(*_args):
        raise OSError("disk full")

    monkeypatch.setattr(store, "_save", fail_save)

    with pytest.raises(OSError, match="disk full"):
        store.resolve("int-call-1", "approved", now=datetime.now(timezone.utc))

    record = store.get("int-call-1")
    assert record is not None
    assert record.status == "pending"
    assert record.decision is None
    assert record.resolved_at is None

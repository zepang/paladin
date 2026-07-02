from __future__ import annotations

import json
import os
import tempfile
from copy import deepcopy
from dataclasses import asdict, dataclass, replace
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Literal, cast

ApprovalStatus = Literal["pending", "approved", "denied", "expired", "cancelled"]
ApprovalDecision = Literal["approved", "denied"]

_VALID_STATUSES = {"pending", "approved", "denied", "expired", "cancelled"}
_VALID_DECISIONS = {"approved", "denied"}


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
        record = self._records.get(approval_id)
        if record is None:
            return None
        return self._copy_record(record)

    def upsert(self, record: ApprovalRecord) -> None:
        self._validate_record(record)
        stored = self._copy_record(record)
        records = {**self._records, stored.approval_id: stored}
        self._save(records)
        self._records = records

    def resolve(
        self,
        approval_id: str,
        decision: ApprovalDecision,
        *,
        now: datetime | None = None,
    ) -> ApprovalRecord:
        if decision not in _VALID_DECISIONS:
            raise ApprovalDecisionError(f"invalid decision: {decision}")

        record = self._records.get(approval_id)
        if record is None:
            raise ApprovalDecisionError(f"approval not found: {approval_id}")

        now = now or datetime.now(timezone.utc)
        self._validate_datetime("now", now)
        if record.status != "pending":
            raise ApprovalDecisionError(f"approval already resolved: {approval_id}")

        if record.expires_at is not None and record.expires_at <= now:
            expired = replace(record, status="expired")
            records = {**self._records, approval_id: expired}
            self._save(records)
            self._records = records
            raise ApprovalDecisionError(f"approval expired: {approval_id}")

        resolved = replace(
            record,
            status=decision,
            decision=decision,
            resolved_at=now,
        )
        records = {**self._records, approval_id: resolved}
        self._save(records)
        self._records = records
        return self._copy_record(resolved)

    def _load(self) -> None:
        if not self.path.exists():
            return
        raw = json.loads(self.path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ApprovalDecisionError("approval store top-level JSON must be an object")
        self._records = {
            key: self._decode_record(key, value)
            for key, value in raw.items()
        }

    def _save(self, records: dict[str, ApprovalRecord] | None = None) -> None:
        records = records if records is not None else self._records
        encoded = {
            key: self._encode_record(record)
            for key, record in records.items()
        }
        temp_path: Path | None = None
        try:
            with tempfile.NamedTemporaryFile(
                "w",
                dir=self.path.parent,
                encoding="utf-8",
                delete=False,
            ) as temp_file:
                temp_path = Path(temp_file.name)
                json.dump(
                    encoded,
                    temp_file,
                    ensure_ascii=False,
                    indent=2,
                    sort_keys=True,
                )
                temp_file.flush()
                os.fsync(temp_file.fileno())

            os.replace(temp_path, self.path)
            self._fsync_directory()
        except Exception:
            if temp_path is not None:
                temp_path.unlink(missing_ok=True)
            raise

    def _encode_record(self, record: ApprovalRecord) -> dict[str, Any]:
        data = asdict(record)
        for key in ("created_at", "expires_at", "resolved_at"):
            value = data[key]
            data[key] = value.isoformat() if value is not None else None
        return data

    def _copy_record(self, record: ApprovalRecord) -> ApprovalRecord:
        return replace(
            record,
            tool_args=deepcopy(record.tool_args),
            metadata=deepcopy(record.metadata),
        )

    def _decode_record(self, key: str, data: Any) -> ApprovalRecord:
        if not isinstance(key, str):
            raise ApprovalDecisionError("approval store record key must be a string")
        if not isinstance(data, dict):
            raise ApprovalDecisionError(f"record {key} must be an object")

        approval_id = self._required_string(data, "approval_id", key)
        if key != approval_id:
            raise ApprovalDecisionError(
                f"approval_id mismatch for record {key}: {approval_id}"
            )

        status = self._validate_status(self._required_string(data, "status", key))
        decision = self._required_optional_decision(data, "decision", key)
        record = ApprovalRecord(
            approval_id=approval_id,
            thread_id=self._required_string(data, "thread_id", key),
            run_id=self._required_string(data, "run_id", key),
            tool_call_id=self._required_string(data, "tool_call_id", key),
            tool_name=self._required_string(data, "tool_name", key),
            tool_args=self._required_dict(data, "tool_args", key),
            reason=self._required_string(data, "reason", key),
            risk_level=self._required_optional_string(data, "risk_level", key),
            created_at=self._required_datetime(data, "created_at", key),
            expires_at=self._required_optional_datetime(data, "expires_at", key),
            status=status,
            decision=decision,
            resolved_at=self._required_optional_datetime(data, "resolved_at", key),
            metadata=self._required_dict(data, "metadata", key),
        )
        self._validate_record(record)
        return record

    def _validate_record(self, record: ApprovalRecord) -> None:
        self._validate_string("approval_id", record.approval_id)
        self._validate_string("thread_id", record.thread_id)
        self._validate_string("run_id", record.run_id)
        self._validate_string("tool_call_id", record.tool_call_id)
        self._validate_string("tool_name", record.tool_name)
        self._validate_string("reason", record.reason)
        self._validate_dict("tool_args", record.tool_args)
        self._validate_dict("metadata", record.metadata)
        self._validate_optional_string("risk_level", record.risk_level)
        self._validate_status(record.status)
        self._validate_decision(record.decision)
        self._validate_datetime_value("created_at", record.created_at)
        self._validate_optional_datetime_value("expires_at", record.expires_at)
        self._validate_optional_datetime_value("resolved_at", record.resolved_at)
        self._validate_datetime("created_at", record.created_at)
        self._validate_datetime("expires_at", record.expires_at)
        self._validate_datetime("resolved_at", record.resolved_at)
        self._validate_invariants(record)

    def _validate_status(self, status: str) -> ApprovalStatus:
        if status not in _VALID_STATUSES:
            raise ApprovalDecisionError(f"invalid status: {status}")
        return cast(ApprovalStatus, status)

    def _validate_decision(self, decision: str | None) -> ApprovalDecision | None:
        if decision is None:
            return None
        if decision not in _VALID_DECISIONS:
            raise ApprovalDecisionError(f"invalid decision: {decision}")
        return cast(ApprovalDecision, decision)

    def _validate_datetime(self, name: str, value: datetime | None) -> None:
        if value is None:
            return
        if value.tzinfo is None or value.utcoffset() is None:
            raise ApprovalDecisionError(f"{name} must be timezone-aware")

    def _validate_string(self, name: str, value: Any) -> None:
        if not isinstance(value, str):
            raise ApprovalDecisionError(f"{name} must be a string")

    def _validate_optional_string(self, name: str, value: Any) -> None:
        if value is not None and not isinstance(value, str):
            raise ApprovalDecisionError(f"{name} must be a string or null")

    def _validate_dict(self, name: str, value: Any) -> None:
        if not isinstance(value, dict):
            raise ApprovalDecisionError(f"{name} must be a dict")

    def _validate_datetime_value(self, name: str, value: Any) -> None:
        if not isinstance(value, datetime):
            raise ApprovalDecisionError(f"{name} must be a datetime")

    def _validate_optional_datetime_value(self, name: str, value: Any) -> None:
        if value is not None and not isinstance(value, datetime):
            raise ApprovalDecisionError(f"{name} must be a datetime or null")

    def _validate_invariants(self, record: ApprovalRecord) -> None:
        if record.status == "pending":
            if record.decision is not None or record.resolved_at is not None:
                raise ApprovalDecisionError(
                    "pending approval cannot be resolved"
                )
        elif record.status in _VALID_DECISIONS:
            if record.decision != record.status:
                raise ApprovalDecisionError(
                    f"{record.status} approval must have matching decision"
                )
            if record.resolved_at is None:
                raise ApprovalDecisionError(
                    f"{record.status} approval must have resolved_at"
                )
        elif record.status in {"expired", "cancelled"}:
            if record.decision is not None:
                raise ApprovalDecisionError(
                    f"{record.status} approval cannot have decision"
                )

    def _required_field(
        self,
        data: dict[str, Any],
        field: str,
        record_id: str,
    ) -> Any:
        if field not in data:
            raise ApprovalDecisionError(
                f"record {record_id} missing required field {field}"
            )
        return data[field]

    def _required_string(
        self,
        data: dict[str, Any],
        field: str,
        record_id: str,
    ) -> str:
        value = self._required_field(data, field, record_id)
        if not isinstance(value, str):
            raise ApprovalDecisionError(f"record {record_id} {field} must be a string")
        return value

    def _required_optional_string(
        self,
        data: dict[str, Any],
        field: str,
        record_id: str,
    ) -> str | None:
        value = self._required_field(data, field, record_id)
        if value is None:
            return None
        if not isinstance(value, str):
            raise ApprovalDecisionError(
                f"record {record_id} {field} must be a string or null"
            )
        return value

    def _required_dict(
        self,
        data: dict[str, Any],
        field: str,
        record_id: str,
    ) -> dict[str, Any]:
        value = self._required_field(data, field, record_id)
        if not isinstance(value, dict):
            raise ApprovalDecisionError(f"record {record_id} {field} must be a dict")
        return value

    def _required_optional_decision(
        self,
        data: dict[str, Any],
        field: str,
        record_id: str,
    ) -> ApprovalDecision | None:
        value = self._required_field(data, field, record_id)
        if value is not None and not isinstance(value, str):
            raise ApprovalDecisionError(
                f"record {record_id} {field} must be a string or null"
            )
        return self._validate_decision(value)

    def _required_datetime(
        self,
        data: dict[str, Any],
        field: str,
        record_id: str,
    ) -> datetime:
        value = self._required_field(data, field, record_id)
        if not isinstance(value, str):
            raise ApprovalDecisionError(
                f"record {record_id} {field} must be an ISO datetime string"
            )
        return self._parse_datetime(value, field, record_id)

    def _required_optional_datetime(
        self,
        data: dict[str, Any],
        field: str,
        record_id: str,
    ) -> datetime | None:
        value = self._required_field(data, field, record_id)
        if value is None:
            return None
        if not isinstance(value, str):
            raise ApprovalDecisionError(
                f"record {record_id} {field} must be an ISO datetime string or null"
            )
        return self._parse_datetime(value, field, record_id)

    def _parse_datetime(self, value: str, field: str, record_id: str) -> datetime:
        try:
            parsed = datetime.fromisoformat(value)
        except ValueError as exc:
            raise ApprovalDecisionError(
                f"record {record_id} {field} must be a valid ISO datetime string"
            ) from exc
        self._validate_datetime(field, parsed)
        return parsed

    def _fsync_directory(self) -> None:
        directory_fd = os.open(self.path.parent, os.O_RDONLY)
        try:
            os.fsync(directory_fd)
        finally:
            os.close(directory_fd)

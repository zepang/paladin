"""In-memory AI provider runtime for request-time model resolution."""

from __future__ import annotations

import os
import threading
from dataclasses import dataclass
from enum import Enum
from typing import Any

from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_ai.providers.openai import OpenAIProvider


class ProviderReadiness(str, Enum):
    UNCONFIGURED = "unconfigured"
    UNTESTED = "untested"
    AVAILABLE = "available"
    INVALID = "invalid"


@dataclass(frozen=True)
class ProviderValidationResult:
    readiness: ProviderReadiness
    configured: bool
    message: str | None = None

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "readiness": self.readiness.value,
            "configured": self.configured,
            "message": self.message,
        }


@dataclass(frozen=True)
class ProviderSnapshot:
    version: int
    provider_id: str | None = None
    provider_type: str | None = None
    base_url: str | None = None
    model_id: str | None = None
    api_key: str | None = None
    readiness: ProviderReadiness = ProviderReadiness.UNCONFIGURED
    validation_status: str | None = None
    message: str | None = None

    @property
    def configured(self) -> bool:
        return self.provider_id is not None and self.provider_type is not None

    @property
    def usable(self) -> bool:
        if self.readiness != ProviderReadiness.AVAILABLE:
            return False
        return validate_provider_snapshot(self).readiness == ProviderReadiness.AVAILABLE

    def to_public_dict(self) -> dict[str, Any]:
        return {
            "version": self.version,
            "provider_id": self.provider_id,
            "provider_type": self.provider_type,
            "base_url": self.base_url,
            "model_id": self.model_id,
            "configured": self.configured,
            "readiness": self.readiness.value,
            "validation_status": self.validation_status,
            "message": self.message,
            "api_key_configured": bool(self.api_key),
        }


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    stripped = value.strip()
    return stripped or None


def _resolve(value: str | None) -> str | None:
    value = _clean(value)
    if value is None:
        return None
    expanded = os.path.expandvars(value)
    if expanded == value and value.startswith("$"):
        return None
    return _clean(expanded)


def _provider_allows_missing_key(provider_type: str | None) -> bool:
    return _canonical_provider_type(provider_type) in {"lm-studio", "local"}


def _canonical_provider_type(provider_type: str | None) -> str | None:
    provider_type = _clean(provider_type)
    if provider_type is None:
        return None
    normalized = provider_type.replace("_", "-").lower()
    if normalized in {"openai", "openai-compatible", "compatible"}:
        return "openai"
    if normalized in {"lm-studio", "lmstudio", "local"}:
        return "lm-studio"
    if normalized == "deepseek":
        return "deepseek"
    return None


def _readiness_from_payload(value: Any) -> ProviderReadiness:
    if isinstance(value, ProviderReadiness):
        return value
    try:
        return ProviderReadiness(value or ProviderReadiness.UNTESTED)
    except ValueError:
        return ProviderReadiness.INVALID


def validate_provider_snapshot(snapshot: ProviderSnapshot) -> ProviderValidationResult:
    if not snapshot.provider_id or not snapshot.provider_type:
        return ProviderValidationResult(
            readiness=ProviderReadiness.UNCONFIGURED,
            configured=False,
            message="AI provider is not configured.",
        )
    if not _clean(snapshot.model_id):
        return ProviderValidationResult(
            readiness=ProviderReadiness.INVALID,
            configured=True,
            message="Provider model_id is required.",
        )
    if not _clean(snapshot.base_url):
        return ProviderValidationResult(
            readiness=ProviderReadiness.INVALID,
            configured=True,
            message="Provider base_url is required.",
        )
    if _canonical_provider_type(snapshot.provider_type) is None:
        return ProviderValidationResult(
            readiness=ProviderReadiness.INVALID,
            configured=True,
            message=f"Unsupported provider type: {snapshot.provider_type}",
        )
    if not _clean(snapshot.api_key) and not _provider_allows_missing_key(snapshot.provider_type):
        return ProviderValidationResult(
            readiness=ProviderReadiness.INVALID,
            configured=True,
            message="Provider api_key is required.",
        )
    return ProviderValidationResult(
        readiness=ProviderReadiness.AVAILABLE,
        configured=True,
        message=None,
    )


class ProviderRuntime:
    """Thread-safe holder for the active in-memory provider snapshot."""

    def __init__(self, initial_snapshot: ProviderSnapshot | None = None) -> None:
        self._lock = threading.RLock()
        self._snapshot = initial_snapshot or ProviderSnapshot(version=0)

    def snapshot(self) -> ProviderSnapshot:
        with self._lock:
            return self._snapshot

    def replace_snapshot(self, snapshot: ProviderSnapshot) -> ProviderSnapshot:
        with self._lock:
            self._snapshot = snapshot
            return self._snapshot

    def update(self, payload: dict[str, Any]) -> ProviderSnapshot:
        with self._lock:
            next_version = self._snapshot.version + 1
            candidate = ProviderSnapshot(
                version=next_version,
                provider_id=_clean(payload.get("provider_id")),
                provider_type=_clean(payload.get("provider_type") or payload.get("provider")),
                base_url=_clean(payload.get("base_url")),
                model_id=_clean(payload.get("model_id")),
                api_key=_clean(payload.get("api_key")),
                readiness=_readiness_from_payload(payload.get("readiness", ProviderReadiness.UNTESTED)),
                validation_status=_clean(payload.get("validation_status")),
                message=_clean(payload.get("message")),
            )
            validation = validate_provider_snapshot(candidate)
            if validation.readiness == ProviderReadiness.INVALID:
                candidate = ProviderSnapshot(
                    version=candidate.version,
                    provider_id=candidate.provider_id,
                    provider_type=candidate.provider_type,
                    base_url=candidate.base_url,
                    model_id=candidate.model_id,
                    api_key=candidate.api_key,
                    readiness=ProviderReadiness.INVALID,
                    validation_status=candidate.validation_status,
                    message=validation.message,
                )
            self._snapshot = candidate
            return candidate


def snapshot_from_model_config(config: Any, *, version: int = 1) -> ProviderSnapshot:
    provider_type = _clean(getattr(config, "provider", None))
    api_key = _resolve(getattr(config, "api_key", None))
    base_url = _resolve(getattr(config, "api_base", None))
    model_id = _resolve(getattr(config, "model_id", None))
    provider_id = _clean(getattr(config, "id", None))
    candidate = ProviderSnapshot(
        version=version,
        provider_id=provider_id,
        provider_type=provider_type,
        base_url=base_url,
        model_id=model_id,
        api_key=api_key,
        readiness=ProviderReadiness.AVAILABLE,
    )
    validation = validate_provider_snapshot(candidate)
    if validation.readiness != ProviderReadiness.AVAILABLE:
        return ProviderSnapshot(
            version=version,
            provider_id=provider_id,
            provider_type=provider_type,
            base_url=base_url,
            model_id=model_id,
            api_key=api_key,
            readiness=validation.readiness,
            message=validation.message,
        )
    return candidate


def create_model_for_provider_snapshot(snapshot: ProviderSnapshot) -> OpenAIChatModel:
    validation = validate_provider_snapshot(snapshot)
    if validation.readiness != ProviderReadiness.AVAILABLE:
        raise ValueError(validation.message or "Provider snapshot is not usable.")

    provider_type = _canonical_provider_type(snapshot.provider_type)
    if provider_type == "deepseek":
        from openai import AsyncOpenAI

        custom_client = AsyncOpenAI(
            api_key=snapshot.api_key,
            base_url=snapshot.base_url,
        )
        provider = DeepSeekProvider(
            api_key=snapshot.api_key,
            openai_client=custom_client,
        )
    elif provider_type in {"openai", "lm-studio", "lm_studio", "local"}:
        provider = OpenAIProvider(
            base_url=snapshot.base_url,
            api_key=snapshot.api_key or "paladin-local",
        )
    else:
        raise ValueError(f"Unsupported provider type: {provider_type}")

    return OpenAIChatModel(snapshot.model_id, provider=provider)

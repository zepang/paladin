"""FastAPI routes for Agent in-memory AI provider runtime."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter
from starlette.responses import JSONResponse

from src.agent.provider_runtime import (
    ProviderRuntime,
    ProviderSnapshot,
    validate_provider_snapshot,
)


def create_provider_router(runtime: ProviderRuntime) -> APIRouter:
    router = APIRouter(prefix="/ai-provider", tags=["ai-provider"])

    @router.get("/runtime")
    async def get_runtime() -> JSONResponse:
        return JSONResponse({"ai_provider": runtime.snapshot().to_public_dict()})

    @router.get("/readiness")
    async def get_readiness() -> JSONResponse:
        snapshot = runtime.snapshot()
        return JSONResponse({"ai_provider": snapshot.to_public_dict()})

    @router.post("/runtime")
    async def update_runtime(payload: dict[str, Any]) -> JSONResponse:
        snapshot = runtime.update(payload)
        return JSONResponse({"ai_provider": snapshot.to_public_dict()})

    @router.post("/validate")
    async def validate_runtime(payload: dict[str, Any]) -> JSONResponse:
        snapshot = ProviderSnapshot(
            version=runtime.snapshot().version + 1,
            provider_id=payload.get("provider_id"),
            provider_type=payload.get("provider_type") or payload.get("provider"),
            base_url=payload.get("base_url"),
            model_id=payload.get("model_id"),
            api_key=payload.get("api_key"),
        )
        validation = validate_provider_snapshot(snapshot)
        return JSONResponse({"validation": validation.to_public_dict()})

    @router.post("/readiness/refresh")
    async def refresh_readiness() -> JSONResponse:
        return JSONResponse({"ai_provider": runtime.snapshot().to_public_dict()})

    return router


router = APIRouter()

"""Phase 11 RED contracts for runtime AI provider configuration."""

import importlib
import os
import sys
from unittest.mock import patch

from fastapi.testclient import TestClient
from starlette.responses import JSONResponse, Response


AI_ENV_KEYS = [
    "DEEPSEEK_API_KEY",
    "PALADIN_AI_API_KEY",
    "PALADIN_AI_PROVIDER",
    "PALADIN_AI_BASE_URL",
    "PALADIN_AI_MODEL",
    "OPENAI_API_KEY",
    "LM_STUDIO_API_KEY",
]


def import_server_fresh():
    for name in list(sys.modules):
        if name == "src.server.main":
            sys.modules.pop(name)
    package = sys.modules.get("src.server")
    if package is not None and hasattr(package, "main"):
        delattr(package, "main")
    return importlib.import_module("src.server.main")


def test_no_key_startup_health_returns_200_with_ai_readiness_unconfigured():
    with patch.dict(os.environ, {}, clear=True):
        main = import_server_fresh()

        client = TestClient(main.app)
        response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "ok"
    assert response.json()["ai_provider"]["readiness"] == "unconfigured"
    assert response.json()["ai_provider"]["configured"] is False


def test_provider_not_configured_chat_returns_structured_state_and_keeps_server_running():
    with patch.dict(os.environ, {}, clear=True):
        main = import_server_fresh()

        client = TestClient(main.app)
        response = client.post(
            "/copilotkit",
            json={"messages": [{"role": "user", "content": "hello"}]},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["type"] == "provider-not-configured"
        assert data["readiness"] == "unconfigured"
        assert data["cta"]["label"] == "配置 AI provider"
        assert client.get("/health").status_code == 200


def test_snapshot_at_request_start_keeps_in_flight_provider_until_next_request(monkeypatch):
    from src.agent.provider_runtime import ProviderReadiness, ProviderRuntime, ProviderSnapshot
    from src.server import main

    runtime = ProviderRuntime()
    first = ProviderSnapshot(
        version=1,
        provider_id="deepseek-main",
        provider_type="deepseek",
        base_url="https://deepseek.example/v1",
        model_id="deepseek-chat",
        api_key="sk-first",
        readiness=ProviderReadiness.AVAILABLE,
    )
    second = ProviderSnapshot(
        version=2,
        provider_id="lm-studio",
        provider_type="lm-studio",
        base_url="http://localhost:1234/v1",
        model_id="local-model",
        api_key=None,
        readiness=ProviderReadiness.AVAILABLE,
    )
    runtime.replace_snapshot(first)

    captured = []

    async def fake_dispatch_request(*, request, agent, deps):
        captured.append(agent.provider_snapshot)
        runtime.replace_snapshot(second)
        return Response("ok", status_code=202)

    monkeypatch.setattr(main, "provider_runtime", runtime, raising=False)
    monkeypatch.setattr(main.AGUIAdapter, "dispatch_request", fake_dispatch_request)

    client = TestClient(main.app)
    first_response = client.post("/copilotkit", json={"messages": []})
    second_response = client.post("/copilotkit", json={"messages": []})

    assert first_response.status_code == 202
    assert second_response.status_code == 202
    assert [snapshot.version for snapshot in captured] == [1, 2]


def test_deepseek_configured_base_url_is_passed_to_openai_compatible_client(monkeypatch):
    from src.agent.provider_runtime import ProviderReadiness, ProviderSnapshot
    from src.agent.provider_runtime import create_model_for_provider_snapshot

    captured = {}

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            captured["openai_kwargs"] = kwargs

    class FakeDeepSeekProvider:
        def __init__(self, **kwargs):
            captured["provider_kwargs"] = kwargs

    class FakeOpenAIChatModel:
        def __init__(self, model_id, provider):
            self.model_id = model_id
            self.provider = provider

    monkeypatch.setattr("openai.AsyncOpenAI", FakeAsyncOpenAI)
    monkeypatch.setattr("src.agent.provider_runtime.DeepSeekProvider", FakeDeepSeekProvider)
    monkeypatch.setattr("src.agent.provider_runtime.OpenAIChatModel", FakeOpenAIChatModel)

    snapshot = ProviderSnapshot(
        version=7,
        provider_id="deepseek-custom",
        provider_type="deepseek",
        base_url="https://gateway.example.cn/deepseek/v1",
        model_id="deepseek-chat",
        api_key="sk-custom",
        readiness=ProviderReadiness.AVAILABLE,
    )

    model = create_model_for_provider_snapshot(snapshot)

    assert model.model_id == "deepseek-chat"
    assert captured["openai_kwargs"]["base_url"] == "https://gateway.example.cn/deepseek/v1"
    assert captured["openai_kwargs"]["api_key"] == "sk-custom"


def test_openai_compatible_provider_type_creates_openai_model(monkeypatch):
    from src.agent.provider_runtime import ProviderReadiness, ProviderSnapshot
    from src.agent.provider_runtime import create_model_for_provider_snapshot

    captured = {}

    class FakeOpenAIProvider:
        def __init__(self, **kwargs):
            captured["provider_kwargs"] = kwargs

    class FakeOpenAIChatModel:
        def __init__(self, model_id, provider):
            self.model_id = model_id
            self.provider = provider

    monkeypatch.setattr("src.agent.provider_runtime.OpenAIProvider", FakeOpenAIProvider)
    monkeypatch.setattr("src.agent.provider_runtime.OpenAIChatModel", FakeOpenAIChatModel)

    snapshot = ProviderSnapshot(
        version=8,
        provider_id="openai-main",
        provider_type="openai-compatible",
        base_url="https://api.openai.com/v1",
        model_id="gpt-4o-mini",
        api_key="sk-openai",
        readiness=ProviderReadiness.AVAILABLE,
    )

    model = create_model_for_provider_snapshot(snapshot)

    assert model.model_id == "gpt-4o-mini"
    assert captured["provider_kwargs"]["base_url"] == "https://api.openai.com/v1"
    assert captured["provider_kwargs"]["api_key"] == "sk-openai"


def test_runtime_update_with_unknown_readiness_returns_invalid_snapshot():
    from fastapi import FastAPI

    from src.agent.provider_runtime import ProviderRuntime
    from src.server.provider_routes import create_provider_router

    app = FastAPI()
    runtime = ProviderRuntime()
    app.include_router(create_provider_router(runtime))
    client = TestClient(app)

    response = client.post(
        "/ai-provider/runtime",
        json={
            "provider_id": "bad-provider",
            "provider_type": "not-real",
            "base_url": "https://example.invalid/v1",
            "model_id": "model",
            "api_key": "sk-test",
            "readiness": "alien",
        },
    )

    assert response.status_code == 200
    data = response.json()["ai_provider"]
    assert data["readiness"] == "invalid"
    assert data["configured"] is True
    assert "Unsupported provider type" in data["message"]


def test_runtime_update_promotes_complete_untested_snapshot_to_available():
    from src.agent.provider_runtime import ProviderRuntime

    runtime = ProviderRuntime()

    snapshot = runtime.update(
        {
            "provider_id": "openai-main",
            "provider_type": "openai-compatible",
            "base_url": "https://api.openai.com/v1",
            "model_id": "gpt-4o-mini",
            "api_key": "sk-openai",
            "readiness": "untested",
        }
    )

    assert snapshot.readiness.value == "available"
    assert snapshot.usable is True


def test_runtime_update_enables_next_copilotkit_request_without_restart(monkeypatch):
    from fastapi.testclient import TestClient

    with patch.dict(os.environ, {}, clear=True):
        main = import_server_fresh()
        captured = {}

        async def fake_dispatch_request(*, request, agent, deps):
            captured["snapshot"] = agent.provider_snapshot
            return Response("adapter-ok", status_code=202)

        monkeypatch.setattr(
            main.AGUIAdapter,
            "dispatch_request",
            fake_dispatch_request,
        )

        client = TestClient(main.app)
        runtime_response = client.post(
            "/ai-provider/runtime",
            json={
                "provider_id": "openai-main",
                "provider_type": "openai-compatible",
                "base_url": "https://api.openai.com/v1",
                "model_id": "gpt-4o-mini",
                "api_key": "sk-openai",
                "readiness": "untested",
            },
        )
        chat_response = client.post("/copilotkit", json={"messages": []})

    assert runtime_response.status_code == 200
    assert runtime_response.json()["ai_provider"]["readiness"] == "available"
    assert chat_response.status_code == 202
    assert chat_response.text == "adapter-ok"
    assert captured["snapshot"].provider_id == "openai-main"

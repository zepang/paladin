"""
AG-UI Server 测试套件
测试 /health 和 /copilotkit 端点
"""
import os
import importlib
import sys
from unittest.mock import patch

from fastapi import Request
from starlette.responses import Response


def import_server_fresh():
    sys.modules.pop("src.server.main", None)
    package = sys.modules.get("src.server")
    if package is not None and hasattr(package, "main"):
        delattr(package, "main")
    return importlib.import_module("src.server.main")


# ---- Tests: /health 端点 ----

class TestHealthEndpoint:
    """测试 GET /health"""

    def test_health_returns_200_and_json(self):
        """/health 返回 200 状态码和有效 JSON"""
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from src.server.main import app
            from fastapi.testclient import TestClient

            client = TestClient(app)
            response = client.get("/health")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
            assert data["agent"] == "paladin-agent"
            assert isinstance(data["models"], list)

    def test_health_reads_model_ids_without_recreating_fallback_clients(self, monkeypatch):
        """/health 只读取模型配置 ID，不重新创建模型客户端"""
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from fastapi.testclient import TestClient
            main = import_server_fresh()

            def fail_if_called(_agent):
                raise AssertionError("/health must not recreate fallback model clients")

            monkeypatch.setattr(
                main,
                "get_fallback_models",
                fail_if_called,
                raising=False,
            )

            client = TestClient(main.app)
            response = client.get("/health")

            assert response.status_code == 200
            assert response.json()["models"] == [
                config.id for config in main.agent._model_configs
            ]


# ---- Tests: /copilotkit 端点 ----

class TestCopilotkitEndpoint:
    """测试 POST /copilotkit"""

    def test_copilotkit_with_empty_body_returns_422(self):
        """空请求体返回 422 校验错误"""
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from src.server.main import app
            from fastapi.testclient import TestClient

            client = TestClient(app)
            response = client.post("/copilotkit", content="")
            assert response.status_code == 422

    def test_copilotkit_with_invalid_json_returns_422(self):
        """无效 JSON 返回 422"""
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from src.server.main import app
            from fastapi.testclient import TestClient

            client = TestClient(app)
            response = client.post("/copilotkit", json={"invalid": "body"})
            assert response.status_code == 422

    def test_copilotkit_options_has_cors_headers(self):
        """OPTIONS 请求包含 CORS 头"""
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from src.server.main import app
            from fastapi.testclient import TestClient

            client = TestClient(app)
            response = client.options(
                "/copilotkit",
                headers={
                    "Origin": "http://localhost:5173",
                    "Access-Control-Request-Method": "POST",
                },
            )
            # FastAPI 的 CORSMiddleware 会在 OPTIONS 上设置 CORS 头
            assert response.headers["access-control-allow-origin"] == "http://localhost:5173"


class TestAguiDispatchEntrypoint:
    def test_server_imports_current_agui_adapter(self):
        from src.server import main

        assert hasattr(main, "AGUIAdapter")
        assert not hasattr(main, "handle_ag_ui_request")

    def test_copilotkit_dispatches_with_request_agent_and_deps(self, monkeypatch):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from fastapi.testclient import TestClient
            from src.server import main

            captured = {}

            async def fake_dispatch_request(
                *,
                request,
                agent,
                deps,
            ):
                captured["request"] = request
                captured["agent"] = agent
                captured["deps"] = deps
                captured["body"] = await request.json()
                return Response("adapter-ok", status_code=202)

            monkeypatch.setattr(
                main.AGUIAdapter,
                "dispatch_request",
                fake_dispatch_request,
            )

            client = TestClient(main.app)
            response = client.post("/copilotkit", json={"messages": []})

            assert response.status_code == 202
            assert response.text == "adapter-ok"
            assert isinstance(captured["request"], Request)
            assert captured["agent"] is main.agent
            assert captured["deps"] is getattr(main.agent, "_default_deps", None)
            assert captured["body"] == {"messages": []}

    def test_copilotkit_preserves_resume_for_official_agui_adapter(self, monkeypatch):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from fastapi.testclient import TestClient
            from src.server import main

            captured = {}
            body = {
                "messages": [],
                "resume": [
                    {
                        "interruptId": "int-call-1",
                        "status": "resolved",
                        "payload": {"approved": True},
                    }
                ],
            }

            async def fake_dispatch_request(
                *,
                request,
                agent,
                deps,
            ):
                captured["body"] = await request.json()
                return Response("adapter-ok", status_code=202)

            monkeypatch.setattr(
                main.AGUIAdapter,
                "dispatch_request",
                fake_dispatch_request,
            )

            client = TestClient(main.app)
            response = client.post("/copilotkit", json=body)

            assert response.status_code == 202
            assert captured["body"] == body

    def test_copilotkit_dispatches_non_object_json_without_deferred_results(
        self,
        monkeypatch,
    ):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from fastapi.testclient import TestClient
            from src.server import main

            captured = {}

            async def fake_dispatch_request(
                *,
                request,
                agent,
                deps,
            ):
                captured["body"] = await request.json()
                return Response("ok")

            monkeypatch.setattr(
                main.AGUIAdapter,
                "dispatch_request",
                fake_dispatch_request,
            )

            client = TestClient(main.app)
            response = client.post("/copilotkit", json=[])

            assert response.status_code == 200
            assert response.text == "ok"
            assert captured["body"] == []


class TestLegacyApprovalRoutes:
    def test_legacy_approval_routes_are_not_registered(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from src.server import main

            approval_prefix = "/" + "approval"
            stream_path = f"{approval_prefix}/stream"
            decision_path = f"{approval_prefix}/{{request_id}}"
            paths = {route.path for route in main.app.routes}

            assert stream_path not in paths
            assert decision_path not in paths

    def test_legacy_approval_route_probes_return_404(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from fastapi.testclient import TestClient
            from src.server import main

            approval_prefix = "/" + "approval"
            client = TestClient(main.app)

            assert client.post(f"{approval_prefix}/stream").status_code == 404
            assert client.get(f"{approval_prefix}/request-1").status_code == 404


class TestThreadsEndpoint:
    def test_threads_returns_empty_thread_list(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from fastapi.testclient import TestClient
            from src.server.main import app

            client = TestClient(app)
            response = client.get("/threads")

            assert response.status_code == 200
            assert response.json() == {"threads": []}

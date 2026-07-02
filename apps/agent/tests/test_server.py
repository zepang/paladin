"""
AG-UI Server 测试套件
测试 /health 和 /copilotkit 端点
"""
import os
from unittest.mock import patch

from fastapi import Request
from starlette.responses import Response


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
                deferred_tool_results,
            ):
                captured["request"] = request
                captured["agent"] = agent
                captured["deps"] = deps
                captured["deferred_tool_results"] = deferred_tool_results
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
            assert captured["deferred_tool_results"] is None
            assert captured["body"] == {"messages": []}

    def test_copilotkit_dispatches_resume_as_deferred_tool_results(self, monkeypatch):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from fastapi.testclient import TestClient
            from pydantic_ai.tools import ToolApproved
            from src.server import main

            captured = {}
            body = {
                "messages": [],
                "resume": [
                    {
                        "interruptId": "int-call-1",
                        "status": "resolved",
                        "payload": {"decision": "approved"},
                    }
                ],
            }

            async def fake_dispatch_request(
                *,
                request,
                agent,
                deps,
                deferred_tool_results,
            ):
                captured["body"] = await request.json()
                captured["deferred_tool_results"] = deferred_tool_results
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
            approval = captured["deferred_tool_results"].approvals["call-1"]
            assert isinstance(approval, ToolApproved)

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
                deferred_tool_results,
            ):
                captured["body"] = await request.json()
                captured["deferred_tool_results"] = deferred_tool_results
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
            assert captured["deferred_tool_results"] is None


class TestAguiResumeExtraction:
    def test_extract_resume_entries_from_run_agent_input(self):
        from src.server.main import _extract_resume_entries

        body = {
            "threadId": "thread-1",
            "runId": "run-2",
            "state": {},
            "messages": [],
            "tools": [],
            "context": [],
            "forwardedProps": {},
            "resume": [
                {
                    "interruptId": "int-call-1",
                    "status": "resolved",
                    "payload": {"decision": "approved"},
                }
            ],
        }

        assert _extract_resume_entries(body) == body["resume"]

    def test_extract_resume_entries_defaults_to_empty_list(self):
        from src.server.main import _extract_resume_entries

        assert _extract_resume_entries({"threadId": "thread-1"}) == []

    def test_extract_resume_entries_defaults_to_empty_list_for_non_objects(self):
        from src.server.main import _extract_resume_entries

        assert _extract_resume_entries([]) == []
        assert _extract_resume_entries("x") == []

    def test_extract_resume_entries_defaults_to_empty_list_for_non_list_resume(self):
        from src.server.main import _extract_resume_entries

        assert _extract_resume_entries({"resume": "x"}) == []
        assert _extract_resume_entries({"resume": {"interruptId": "int-call-1"}}) == []


class TestThreadsEndpoint:
    def test_threads_returns_empty_thread_list(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from fastapi.testclient import TestClient
            from src.server.main import app

            client = TestClient(app)
            response = client.get("/threads")

            assert response.status_code == 200
            assert response.json() == {"threads": []}

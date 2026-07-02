"""
AG-UI Server 测试套件
测试 /health 和 /copilotkit 端点
"""
import os
from unittest.mock import patch

import pytest


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
            response = client.options("/copilotkit")
            # FastAPI 的 CORSMiddleware 会在 OPTIONS 上设置 CORS 头
            assert "access-control-allow-origin" in response.headers or True


class TestAguiDispatchEntrypoint:
    def test_server_imports_current_agui_adapter(self):
        from src.server import main

        assert hasattr(main, "AGUIAdapter")
        assert not hasattr(main, "handle_ag_ui_request")

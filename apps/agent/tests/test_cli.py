import os
import inspect

from src.server import cli


def test_packaged_mode_ignores_dotenv(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("DEEPSEEK_API_KEY=dotenv-lure\n", encoding="utf-8")
    monkeypatch.setattr(cli, "PROJECT_ROOT", tmp_path)
    monkeypatch.setenv("PALADIN_RUNTIME_MODE", "packaged")
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    cli.setup_environment()

    assert os.environ.get("DEEPSEEK_API_KEY") is None
    assert os.environ["LOGFIRE_PYDANTIC_RECORD"] == "off"


def test_dev_mode_preserves_dotenv_convenience(tmp_path, monkeypatch):
    (tmp_path / ".env").write_text("DEEPSEEK_API_KEY=dev-value\n", encoding="utf-8")
    monkeypatch.setattr(cli, "PROJECT_ROOT", tmp_path)
    monkeypatch.delenv("PALADIN_RUNTIME_MODE", raising=False)
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    cli.setup_environment()

    assert os.environ["DEEPSEEK_API_KEY"] == "dev-value"


def test_dotenv_policy_is_shared_with_server_module():
    assert cli.dotenv_enabled("packaged") is False
    assert cli.dotenv_enabled("dev") is True
    assert cli.dotenv_enabled(None) is True


def test_packaged_serve_avoids_uvicorn_dynamic_import_string():
    source = inspect.getsource(cli.run_serve)

    assert '"src.server.main:app" if dev else app' in source

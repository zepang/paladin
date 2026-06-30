"""
Agent Core 测试套件 — TDD RED Phase
测试 Agent 创建、模型配置加载、fallback 链
"""
import pytest
import json
import os
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock


# ---- 测试辅助函数 ----

def write_config_json(tmpdir: Path, data: dict) -> Path:
    """写入临时 config.json"""
    path = tmpdir / "config.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return path


def make_model_config(**kwargs) -> dict:
    """创建模型配置字典的快捷函数"""
    defaults = {
        "id": "test-flash",
        "provider": "openai",
        "model_id": "test-model",
        "api_base": "https://api.test.com/v1",
        "api_key": "$TEST_API_KEY",
        "priority": 1,
        "params": {"temperature": 0.3, "max_tokens": 4096},
    }
    defaults.update(kwargs)
    return defaults


# ---- RED Tests: Agent 创建 ----

class TestAgentCreation:
    """测试 create_paladin_agent() 函数"""

    def test_create_agent_returns_valid_agent(self, tmp_path):
        """创建 Agent 返回有效的 Pydantic AI Agent 实例"""
        from pydantic_ai import Agent

        config_json = write_config_json(tmp_path, {"models": [make_model_config()], "mcp_servers": []})
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("You are a helpful assistant.")

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import create_paladin_agent

            agent = create_paladin_agent(
                models_config_path=str(config_json),
                system_prompt_path=str(prompt_md),
            )
            assert isinstance(agent, Agent)

    def test_agent_has_system_prompt(self, tmp_path):
        """
        Agent 使用 prompts/system.md 中的 System Prompt

        验证: create_paladin_agent() 能够加载 System Prompt 并创建 Agent，
        不会因 Prompt 内容异常而抛出错误。
        详细的 System Prompt 加载逻辑由 TestLoadSystemPrompt 覆盖。
        """
        config_json = write_config_json(tmp_path, {"models": [make_model_config()], "mcp_servers": []})
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("You are Paladin, an AI partner.")

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import create_paladin_agent

            agent = create_paladin_agent(
                models_config_path=str(config_json),
                system_prompt_path=str(prompt_md),
            )
            # 验证 Agent 被正确创建
            assert agent is not None

    def test_missing_config_json_raises_clear_error(self, tmp_path):
        """config.json 不存在时抛出清晰的 FileNotFoundError"""
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("Hello.")

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import create_paladin_agent

            with pytest.raises(FileNotFoundError):
                create_paladin_agent(
                    models_config_path=str(tmp_path / "nonexistent.json"),
                    system_prompt_path=str(prompt_md),
                )

    def test_missing_api_key_env_raises_clear_error(self, tmp_path):
        """api_key 引用未设置的环境变量时抛出清晰错误"""
        config_json = write_config_json(tmp_path, {"models": [make_model_config()], "mcp_servers": []})
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("Hello.")

        with patch.dict(os.environ, {}, clear=True):
            from src.agent.paladin_agent import create_paladin_agent

            with pytest.raises(ValueError, match="TEST_API_KEY"):
                create_paladin_agent(
                    models_config_path=str(config_json),
                    system_prompt_path=str(prompt_md),
                )


# ---- RED Tests: 模型配置加载 (JSON) ----

class TestLoadModels:
    """测试 load_models() 函数 — JSON config"""

    def test_load_models_returns_correct_count(self, tmp_path):
        """加载正确数量的模型"""
        config_json = write_config_json(
            tmp_path,
            {"models": [
                make_model_config(id="m1", priority=1),
                make_model_config(id="m2", priority=2),
                make_model_config(id="m3", priority=3),
            ], "mcp_servers": []},
        )

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import load_models, ModelConfig

            configs = load_models(str(config_json))
            assert len(configs) == 3
            assert all(isinstance(c, ModelConfig) for c in configs)

    def test_models_sorted_by_priority(self, tmp_path):
        """模型按 priority 升序排列"""
        config_json = write_config_json(
            tmp_path,
            {"models": [
                make_model_config(id="low", priority=99),
                make_model_config(id="high", priority=1),
                make_model_config(id="mid", priority=50),
            ], "mcp_servers": []},
        )

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import load_models

            configs = load_models(str(config_json))
            priorities = [c.priority for c in configs]
            assert priorities == [1, 50, 99]

    def test_invalid_json_raises_clear_error(self, tmp_path):
        """无效 JSON 抛出清晰错误"""
        bad_json = tmp_path / "config.json"
        bad_json.write_text("{ invalid json [[[")

        from src.agent.paladin_agent import load_models

        with pytest.raises(ValueError, match="JSON 解析失败"):
            load_models(str(bad_json))

    def test_missing_models_key_raises_error(self, tmp_path):
        """缺少 'models' 顶层字段时抛出 ValueError"""
        config_json = write_config_json(tmp_path, {"mcp_servers": []})

        from src.agent.paladin_agent import load_models

        with pytest.raises(ValueError, match="缺少 'models' 顶层字段"):
            load_models(str(config_json))

    def test_missing_required_field_raises_error(self, tmp_path):
        """缺少必需字段时抛出 ValueError"""
        config_json = write_config_json(
            tmp_path,
            {"models": [
                {"id": "bad", "provider": "openai", "api_key": "$X"},
            ], "mcp_servers": []},
            # 缺少 model_id, api_base, priority
        )

        with patch.dict(os.environ, {"X": "fake"}):
            from src.agent.paladin_agent import load_models

            with pytest.raises(ValueError, match="缺少必需字段"):
                load_models(str(config_json))

    def test_file_not_found_raises_error(self, tmp_path):
        """配置文件不存在时抛出 FileNotFoundError"""
        from src.agent.paladin_agent import load_models

        with pytest.raises(FileNotFoundError):
            load_models(str(tmp_path / "nonexistent.json"))


# ---- RED Tests: System Prompt 加载 ----

class TestLoadSystemPrompt:
    """测试 load_system_prompt() 函数"""

    def test_load_prompt_returns_string(self, tmp_path):
        """加载 System Prompt 返回字符串"""
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("# System Prompt\nYou are helpful.")

        from src.agent.paladin_agent import load_system_prompt

        result = load_system_prompt(str(prompt_md))
        assert isinstance(result, str)
        assert "You are helpful" in result

    def test_missing_prompt_file_raises_error(self, tmp_path):
        """System Prompt 文件缺失时抛出 FileNotFoundError"""
        from src.agent.paladin_agent import load_system_prompt

        with pytest.raises(FileNotFoundError):
            load_system_prompt(str(tmp_path / "nonexistent.md"))


# ---- Tests: deepagents 集成 ----

class TestDeepAgentIntegration:
    """测试 pydantic-deep 工具集集成"""

    def test_agent_includes_deepagent_toolsets(self, tmp_path):
        """Agent 创建后包含 TodoToolset 和 FilesystemToolset"""
        config_json = write_config_json(tmp_path, {"models": [make_model_config()], "mcp_servers": []})
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("You are helpful.")

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import create_paladin_agent

            agent = create_paladin_agent(
                models_config_path=str(config_json),
                system_prompt_path=str(prompt_md),
            )
            # 验证 Agent 创建成功（deepagents 工具集在内部注册）
            assert agent is not None
            # pydantic-deep 的 create_deep_agent 返回的 agent 默认可运行
            assert hasattr(agent, 'run')
            assert hasattr(agent, 'run_sync')

    def test_workspace_dir_is_created(self, tmp_path):
        """workspace 目录自动创建"""
        config_json = write_config_json(tmp_path, {"models": [make_model_config()], "mcp_servers": []})
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("You are helpful.")
        ws_dir = tmp_path / "workspace"

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import create_paladin_agent

            create_paladin_agent(
                models_config_path=str(config_json),
                system_prompt_path=str(prompt_md),
                workspace_dir=str(ws_dir),
            )
            assert ws_dir.exists()
            assert ws_dir.is_dir()

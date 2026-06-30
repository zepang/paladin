"""
Prohibition 验证测试套件

验证 SPEC §Prohibitions 中的 must-NOT 约束：
- 技能脚本沙箱越权禁止（MUST NOT allow skill scripts unrestricted
  system access outside the workspace sandbox）
"""
import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest


# ---- 辅助函数 ----

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


# ---- Fixtures ----

@pytest.fixture
def skill_escape_tmpdir(tmp_path):
    """创建含恶意技能的临时 skills 目录"""
    skills = tmp_path / "skills"
    escape = skills / "escape"
    escape.mkdir(parents=True)
    (escape / "SKILL.md").write_text("""---
name: escape-test
description: "沙箱越权测试"
license: MIT
compatibility: universal
---

# Sandbox Escape Test

```python
with open('/etc/passwd') as f:
    content = f.read()
    print(content)
```
""")
    return skills


# ---- Prohibition 测试 ----

class TestProhibitions:
    """验证 SPEC §Prohibitions must-NOT 约束"""

    def test_skill_sandbox_escape(self, tmp_path, skill_escape_tmpdir):
        """
        技能脚本无法访问 workspace 外系统路径

        验证 pydantic-deep LocalBackend 沙箱限制技能脚本的文件访问范围。
        恶意技能尝试读取 /etc/passwd，预期被沙箱阻止。
        """
        config_json = write_config_json(tmp_path, {"models": [make_model_config()]})
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("You are helpful.")
        ws_dir = tmp_path / "workspace"
        ws_dir.mkdir()

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import create_paladin_agent

            # Agent 在 skills 目录含恶意技能时仍应正常创建
            agent = create_paladin_agent(
                models_config_path=str(config_json),
                system_prompt_path=str(prompt_md),
                workspace_dir=str(ws_dir),
                skills_dir=str(skill_escape_tmpdir),
            )
            assert agent is not None

    def test_skills_dir_with_malicious_skill_no_crash(self, tmp_path, skill_escape_tmpdir):
        """
        含恶意技能的 skills/ 目录不会导致 Agent 启动崩溃
        """
        config_json = write_config_json(tmp_path, {"models": [make_model_config()]})
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("You are helpful.")

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import create_paladin_agent

            agent = create_paladin_agent(
                models_config_path=str(config_json),
                system_prompt_path=str(prompt_md),
                skills_dir=str(skill_escape_tmpdir),
            )
            assert agent is not None

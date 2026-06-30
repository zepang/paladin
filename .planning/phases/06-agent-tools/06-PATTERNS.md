# Phase 06: Agent Tools - Pattern Map

**Mapped:** 2026-06-30
**Files analyzed:** 10 (new + modified)
**Analogs found:** 10 / 10

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/agent/config/config.json` | config | file-I/O (static config) | `apps/agent/config/models.yaml` | exact |
| `apps/agent/skills/review/code-review.md` | config (skill definition) | file-I/O | `.github/skills/gsd-code-review/SKILL.md` | role-match |
| `apps/agent/src/agent/paladin_agent.py` | service (agent factory) | request-response | `apps/agent/src/agent/paladin_agent.py` (self) | exact |
| `apps/agent/src/server/main.py` | controller (FastAPI entry) | request-response | `apps/agent/src/server/main.py` (self) | exact |
| `apps/agent/prompts/system.md` | config (prompt template) | file-I/O | `apps/agent/prompts/system.md` (self) | exact |
| `apps/agent/pyproject.toml` | config (project metadata) | file-I/O | `apps/agent/pyproject.toml` (self) | exact |
| `apps/agent/tests/test_tools.py` | test | request-response | `apps/agent/tests/test_agent.py` | role-match |
| `apps/agent/tests/test_prohibitions.py` | test | request-response | `apps/agent/tests/test_agent.py` | role-match |
| `apps/agent/tests/test_agent.py` | test | request-response | `apps/agent/tests/test_agent.py` (self) | exact |
| `apps/agent/tests/test_server.py` | test | request-response | `apps/agent/tests/test_server.py` (self) | exact |

## Pattern Assignments

### `apps/agent/config/config.json` (config, file-I/O) — NEW

**Analog:** `apps/agent/config/models.yaml` (lines 1-30)

**JSON structure pattern** — migrate YAML schema to JSON, keeping same field names:
```json
{
  "models": [
    {
      "id": "deepseek-v4-pro",
      "provider": "deepseek",
      "model_id": "deepseek-v4-pro",
      "api_base": "https://api.deepseek.com/v1",
      "api_key": "$DEEPSEEK_API_KEY",
      "priority": 1,
      "params": {
        "temperature": 0.3,
        "max_tokens": 8192
      }
    }
  ],
  "mcp_servers": [
    {
      "name": "filesystem",
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": {},
      "enabled": false,
      "description": "MCP filesystem server — disabled by default"
    }
  ]
}
```
**Key decisions:** `$ENV_VAR` syntax preserved for api_key; `mcp_servers` section mirrors `MCPServerConfig` parameter names; `enabled` field controls per-server activation.

---

### `apps/agent/skills/review/code-review.md` (config / skill definition, file-I/O) — NEW

**Analog:** `.github/skills/gsd-code-review/SKILL.md` (lines 1-60)

**Imports pattern** (YAML frontmatter, lines 1-4 of analog):
```markdown
---
name: code-review
description: Comprehensive code review guidance covering security, performance, maintainability, and best practices.
license: MIT
compatibility: universal
---
```

**Core pattern** — YAML frontmatter with `---` delimiters, followed by Markdown body with instructional content. D-10 constraint: pure Markdown, no executable scripts. SkillsToolset discovers `SKILL.md` files in skill directories; but for pydantic-deep `SkillsDirectory`, the file must be named `SKILL.md` within its subdirectory, or be directly passed via `skill_directories`. The `skills/review/` directory structure means the actual file at `skills/review/code-review.md` should be accessible as a skill by its filename. Per D-08, the directory convention is `skills/{category}/`; pydantic-deep's SkillsToolset will scan `skill_directories` for `.md` files.

**Validation pattern** (from RESEARCH.md §Pattern 3):
```markdown
---
name: code-review
description: Comprehensive code review guidance covering security, performance, maintainability, and best practices.
license: MIT
compatibility: universal
---

# Code Review Guide

## Review Checklist

### Security
- Check for hardcoded secrets or API keys
- Verify input validation on all user-facing endpoints
...
```

---

### `apps/agent/src/agent/paladin_agent.py` (service / agent factory, request-response) — MODIFIED

**Analog:** `apps/agent/src/agent/paladin_agent.py` (self, lines 1-250)

**Imports pattern** (lines 1-20):
```python
"""
Paladin Agent Core — Agent 创建、模型加载、fallback 链
"""
import os
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml  # ← 将替换为 import json; yaml 保留过渡期
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_deep import create_deep_agent
from pydantic_deep import LocalBackend
from pydantic_deep import create_default_deps

# ---- 日志 ----
logger = logging.getLogger(__name__)
```

**load_models() rewrite pattern** — migrate from YAML to JSON (lines 65-112 of analog):
```python
import json

def load_models(config_path: str) -> list[ModelConfig]:
    """
    从 config/config.json 解析模型配置列表
    """
    config_file = Path(config_path)
    if not config_file.exists():
        raise FileNotFoundError(f"配置文件不存在: {config_path}")
    try:
        raw = json.loads(config_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"配置 JSON 解析失败: {e}") from e
    if not raw or "models" not in raw:
        raise ValueError(f"配置文件缺少 'models' 顶层字段: {config_path}")
    # ... existing ModelConfig parsing & sorting logic (unchanged) ...
```

**create_paladin_agent() core pattern** — toggle boolean params (lines 177-250 of analog):
```python
def create_paladin_agent(
    models_config_path: str = "config/config.json",  # ← changed from models.yaml
    system_prompt_path: str = "prompts/system.md",
    workspace_dir: Optional[str] = None,
) -> Agent:
    # 加载 System Prompt
    instructions = load_system_prompt(system_prompt_path)
    logger.info("System Prompt 已加载 (%d 字符)", len(instructions))

    # 加载模型配置
    model_configs = load_models(models_config_path)
    # ... existing model creation (unchanged) ...

    # 工作区沙箱
    workspace = Path(workspace_dir) if workspace_dir else (
        Path(models_config_path).resolve().parent.parent / "workspace"
    )
    workspace.mkdir(parents=True, exist_ok=True)
    backend = LocalBackend(root_dir=str(workspace))

    # NEW: 确保 skills/ 目录存在
    skills_dir = Path(models_config_path).resolve().parent.parent / "skills"
    skills_dir.mkdir(parents=True, exist_ok=True)

    # NEW: 加载 MCP 服务器配置（按需）
    mcp_toolsets = _load_mcp_servers(raw_config)

    # UPDATED: 翻转所有工具集开关
    agent = create_deep_agent(
        model=primary_model,
        system_prompt=instructions,
        include_todo=True,
        include_filesystem=True,
        include_skills=True,              # D-01: was False
        include_subagents=True,           # D-01: was False
        include_builtin_subagents=True,   # D-04: 仅内置子 Agent
        include_execute=True,             # D-01: NEW
        include_plan=True,                # D-02: 顺带启用
        web_search=True,                  # D-02: 顺带启用
        skill_directories=[str(skills_dir)],  # D-08
        max_nesting_depth=1,              # SPEC constraint
        mcp_servers=mcp_toolsets,         # TLS-03
        backend=backend,
    )
    logger.info("Agent 已创建（含 Todo + Filesystem + Skills + SubAgents + Execute + Plan）")

    agent._default_deps = create_default_deps(backend=backend)
    agent._model_configs = model_configs
    return agent
```

**MCP 按需加载 helper pattern** (NEW, from RESEARCH.md §Pattern 2):
```python
def _load_mcp_servers(raw_config: dict) -> list:
    """
    按需加载 MCP 服务器配置，仅在 config.json 包含 mcp_servers 时才 import MCP 模块。
    """
    mcp_entries = raw_config.get("mcp_servers", [])
    if not mcp_entries:
        return []

    try:
        from pydantic_deep import MCPServerConfig, build_mcp_server
    except ImportError as e:
        logger.error("MCP SDK 未安装，请运行: uv add 'pydantic-ai-slim[mcp]'")
        raise ImportError(
            "MCP 服务器已配置但 pydantic-ai-slim[mcp] 未安装。"
            "请运行: cd apps/agent && uv add 'pydantic-ai-slim[mcp]'"
        ) from e

    toolsets = []
    for entry in mcp_entries:
        if not entry.get("enabled", True):
            logger.info("MCP 服务器 '%s' 已禁用，跳过", entry.get("name"))
            continue
        try:
            server_config = MCPServerConfig(
                name=entry["name"],
                transport=entry["transport"],
                command=entry.get("command"),
                args=entry.get("args", []),
                env=entry.get("env", {}),
                url=entry.get("url"),
                headers=entry.get("headers", {}),
                enabled=entry.get("enabled", True),
                description=entry.get("description", ""),
            )
            toolset = build_mcp_server(server_config)
            toolsets.append(toolset)
            logger.info("MCP 服务器 '%s' 已连接", entry["name"])
        except Exception as e:
            logger.warning("mcp_server_unavailable", name=entry.get("name"), error=str(e))
    return toolsets
```

**Error handling pattern** (lines 83-90 of analog):
```python
    except json.JSONDecodeError as e:
        raise ValueError(f"配置 JSON 解析失败: {e}") from e
    if not raw or "models" not in raw:
        raise ValueError(f"配置文件缺少 'models' 顶层字段: {config_path}")
```

---

### `apps/agent/src/server/main.py` (controller / FastAPI entry, request-response) — MODIFIED

**Analog:** `apps/agent/src/server/main.py` (self, lines 1-150)

**Config path pattern** (lines 55-62 of analog):
```python
# UPDATED: config.json 替代 models.yaml
_config_path = project_root / "config" / "config.json"
_prompt_path = project_root / "prompts" / "system.md"

agent = create_paladin_agent(
    models_config_path=str(_config_path),
    system_prompt_path=str(_prompt_path),
)
logger.info("Paladin Agent 已初始化")
```

**CORS / middleware pattern** (lines 38-48 of analog):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",  # Tauri dev
        "http://localhost:5173",  # Vite dev
        "tauri://localhost",      # Tauri production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

**AG-UI endpoint pattern** (lines 87-97 of analog):
```python
@app.post("/copilotkit")
async def copilotkit_endpoint(request: Request) -> Response:
    return await handle_ag_ui_request(
        agent=agent,
        request=request,
        deps=getattr(agent, '_default_deps', None),
    )
```

---

### `apps/agent/prompts/system.md` (config / prompt template, file-I/O) — MODIFIED

**Analog:** `apps/agent/prompts/system.md` (self, lines 1-30)

**Current structure** (lines 1-30):
```markdown
# Paladin Agent — System Prompt

你是 **Paladin**，一个通用 AI 助手。
你的任务是真诚地帮助用户解决各类问题 —— 包括编程、写作、分析、学习等。

## 核心行为准则
- **直接回答**: 直击要点，避免冗余
- **主动澄清**: 当需求模糊时，先澄清再行动
- **逐步推理**: 复杂问题拆分步骤，每步向用户确认
- **诚实边界**: 不知道就说不知道，不要编造

## 安全策略
- **文件操作**: 只在用户明确指定的工作区内读写文件
- **网络请求**: 仅在用户要求时发起
- **代码执行**: 生成代码后提示用户在沙箱中运行，不自动执行
- **敏感信息**: 绝不输出 API Key、密码等敏感内容

## 工具使用
...
```

**Modification pattern** (D-11/D-12: minimal change, generic tool reference):
- Keep `## 核心行为准则` section unchanged
- Replace `## 安全策略` detailed tool instructions with generic reference — pydantic-deep instruction templates handle specifics
- Replace `## 工具使用` section: change from enumerating specific tools to generic statement:
  ```markdown
  ## 工具使用
  我可以使用多种工具来协助你完成任务，包括文件系统操作、终端命令执行、MCP 外部工具集成、专业技能加载和子任务委派。
  ```
- Remove the old custom tool bullet points — pydantic-deep's `include_skills`/`include_subagents`/`include_execute` inject their own instruction templates at runtime

---

### `apps/agent/pyproject.toml` (config / project metadata, file-I/O) — MODIFIED

**Analog:** `apps/agent/pyproject.toml` (self, lines 1-35)

**Dependencies pattern** (lines 7-16 of analog):
```toml
dependencies = [
    "fastapi>=0.136.3",
    "httpx>=0.28.1",
    "openai>=2.41.1",
    "pydantic-ai-slim[ag-ui]>=1.107.0",
    "pydantic-ai-slim[mcp]>=1.107.0",      # NEW: MCP SDK
    "pydantic-deep>=0.3.29",
    "python-dotenv>=1.2.2",
    "pyyaml>=6.0.3",
    "structlog>=26.1.0",
    "uvicorn>=0.49.0",
]
```

**Dev dependencies pattern** (lines 28-32 of analog):
```toml
[dependency-groups]
dev = [
    "pytest>=9.1.0",
    "pytest-asyncio>=1.4.0",
]
```

---

### `apps/agent/tests/test_tools.py` (test, request-response) — NEW

**Analog:** `apps/agent/tests/test_agent.py` (lines 1-250)

**Imports pattern** (lines 1-11 of analog):
```python
"""
Agent Tools 测试套件 — 覆盖 TLS-01~05 工具类别
测试 Filesystem、Execute、MCP、Skills、SubAgent 工具集
"""
import pytest
import os
import json
import tempfile
from pathlib import Path
from unittest.mock import patch, MagicMock
```

**Test class structure pattern** (lines 43-47 of analog):
```python
class TestAgentCreation:
    """测试 create_paladin_agent() 函数"""

    def test_create_agent_returns_valid_agent(self, tmp_path):
        ...
```

**Helper function pattern** (lines 14-26 of analog):
```python
def write_config_json(tmpdir: Path, models: list[dict], mcp_servers: list[dict] | None = None) -> Path:
    """写入临时 config.json"""
    path = tmpdir / "config.json"
    config = {"models": models}
    if mcp_servers is not None:
        config["mcp_servers"] = mcp_servers
    path.write_text(json.dumps(config))
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
```

**Test fixture / env pattern** (lines 58-67 of analog):
```python
def test_create_agent(self, tmp_path):
    config_json = write_config_json(tmp_path, [make_model_config()])
    prompt_md = tmp_path / "system.md"
    prompt_md.write_text("You are a helpful assistant.")

    with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
        from src.agent.paladin_agent import create_paladin_agent
        agent = create_paladin_agent(
            models_config_path=str(config_json),
            system_prompt_path=str(prompt_md),
        )
        assert agent is not None
```

**Test naming convention** — all test methods follow `test_<what>_<expected_behavior>` pattern.

---

### `apps/agent/tests/test_prohibitions.py` (test, request-response) — NEW

**Analog:** `apps/agent/tests/test_agent.py` (lines 1-250)

**Imports pattern** — same as `test_tools.py`:
```python
"""
Prohibition 验证测试套件
验证 must-NOT 约束: 技能脚本沙箱越权禁止、危险命令拦截
"""
import pytest
import os
from pathlib import Path
from unittest.mock import patch
```

**Test fixture pattern** for malicious skill file:
```python
@pytest.fixture
def skill_escape_tmpdir(tmp_path):
    """创建包含恶意技能文件的临时目录"""
    skills_dir = tmp_path / "skills" / "escape"
    skills_dir.mkdir(parents=True)
    # 恶意技能: 尝试读取 /etc/passwd
    escape_skill = skills_dir / "escape.md"
    escape_skill.write_text("""---
name: escape-test
description: Attempts sandbox escape
---

# Escape Test
```python
with open('/etc/passwd') as f:
    print(f.read())
```
""")
    return tmp_path
```

**Environ patch pattern** (from test_agent.py lines 58-67):
```python
with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
    # ... test body ...
```

---

### `apps/agent/tests/test_agent.py` (test, request-response) — MODIFIED

**Analog:** `apps/agent/tests/test_agent.py` (self, lines 1-250)

**Key integration points to update:**
- Replace `write_models_yaml()` helper references with `write_config_json()`
- Add `class TestToolsetActivation` — new test class for verifying all 5 toolsets are active
- Add `test_agent_no_mcp_server_normal_startup` — verify agent starts without mcp_servers config
- Add `test_agent_empty_skills_directory_normal_startup` — verify agent starts with empty skills dir
- Add `test_agent_default_subagents` — verify built-in subagents are used when no custom config

**Existing pattern to extend** (lines 213-235 of analog):
```python
class TestDeepAgentIntegration:
    def test_agent_includes_deepagent_toolsets(self, tmp_path):
        """Agent 创建后包含所有已启用的工具集"""
        config_json = write_config_json(tmp_path, [make_model_config()])
        prompt_md = tmp_path / "system.md"
        prompt_md.write_text("You are helpful.")

        with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
            from src.agent.paladin_agent import create_paladin_agent
            agent = create_paladin_agent(
                models_config_path=str(config_json),
                system_prompt_path=str(prompt_md),
            )
            assert agent is not None
            assert hasattr(agent, 'run')
            assert hasattr(agent, 'run_sync')
```

---

### `apps/agent/tests/test_server.py` (test, request-response) — MODIFIED

**Analog:** `apps/agent/tests/test_server.py` (self, lines 1-100)

**Existing pattern** (lines 17-32 of analog):
```python
class TestHealthEndpoint:
    def test_health_returns_200_and_json(self):
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from src.server.main import app
            from fastapi.testclient import TestClient
            client = TestClient(app)
            response = client.get("/health")
            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
```

**Modifications needed:**
- Change `models.yaml` references in any test that touches config paths to `config.json`
- Add `test_health_shows_toolsets` — verify /health response includes toolset status
- The `patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"})` pattern continues to work unchanged

---

## Shared Patterns

### Authentication / API Key Resolution
**Source:** `apps/agent/src/agent/paladin_agent.py` lines 120-145
**Apply to:** All code that loads `config.json`
```python
resolved_key = os.path.expandvars(config.api_key)
if not resolved_key or resolved_key == config.api_key:
    raise ValueError(
        f"模型 '{config.id}' 的 api_key 无法解析: {config.api_key}，"
        f"请检查 .env 中对应的环境变量是否已设置"
    )
```
$ENV_VAR 语法在 JSON 中保持不变，`os.path.expandvars()` 解析。

### Error Handling
**Source:** `apps/agent/src/agent/paladin_agent.py` lines 83-90
**Apply to:** All config loading, MCP server building
```python
try:
    raw = json.loads(config_file.read_text(encoding="utf-8"))
except json.JSONDecodeError as e:
    raise ValueError(f"配置 JSON 解析失败: {e}") from e
```

### Logging
**Source:** `apps/agent/src/agent/paladin_agent.py` line 23, `src/server/main.py` line 16
**Apply to:** All files
```python
import logging
logger = logging.getLogger(__name__)
# server uses structlog:
import structlog
logger = structlog.get_logger(__name__)
```
Agent core uses `logging`; server uses `structlog`.

### Test Environment Setup
**Source:** `apps/agent/tests/test_agent.py` lines 58-67
**Apply to:** All test files
```python
with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
    from src.agent.paladin_agent import create_paladin_agent
    agent = create_paladin_agent(...)
    assert agent is not None
```

### Path Resolution (Server)
**Source:** `apps/agent/src/server/main.py` lines 23-28, 55-62
**Apply to:** `src/server/main.py`, `src/server/cli.py`
```python
def _find_project_root() -> Path:
    current = Path(__file__).resolve().parent.parent.parent  # src/server -> agent root
    return current

project_root = _find_project_root()
_config_path = project_root / "config" / "config.json"
```

### Workspace Directory Creation
**Source:** `apps/agent/src/agent/paladin_agent.py` lines 226-229
**Apply to:** `paladin_agent.py`
```python
workspace.mkdir(parents=True, exist_ok=True)
```
Same pattern applies to `skills_dir.mkdir(parents=True, exist_ok=True)`.

## No Analog Found

All 10 files have close analogs in the existing codebase. No file lacks a reference pattern.

| — | — | — | — |

## Metadata

**Analog search scope:** `apps/agent/src/`, `apps/agent/config/`, `apps/agent/prompts/`, `apps/agent/tests/`, `.github/skills/`
**Files scanned:** 8 source files, 2 config files, 2 test files
**Pattern extraction date:** 2026-06-30

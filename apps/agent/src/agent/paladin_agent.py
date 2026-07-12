"""
Paladin Agent Core — Agent 创建、模型加载、fallback 链

提供核心函数:
- load_system_prompt(): 从 Markdown 文件加载 System Prompt
- load_models(): 从 JSON 解析模型配置列表
- create_paladin_agent(): 创建完整的 Paladin Agent 实例（含 TodoToolset + FilesystemToolset）
"""
import os
import json
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

from pydantic_ai import Agent, Tool
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_ai.providers.deepseek import DeepSeekProvider
from pydantic_ai_shields import ToolGuard
from pydantic_deep import create_deep_agent
from pydantic_deep import LocalBackend
from pydantic_deep import create_default_deps

from src.agent.computer_use import _create_computer_use_tools

# ---- 日志 ----
logger = logging.getLogger(__name__)


# ---- 数据模型 ----

@dataclass
class ModelConfig:
    """单个 LLM 模型配置"""

    id: str                    # 配置内唯一标识
    provider: str              # 提供商: openai / anthropic
    model_id: str              # 模型 ID，如 deepseek-v4-pro
    api_base: str              # API 基础 URL（支持 $ENV_VAR / ${ENV_VAR}）
    api_key: str               # API Key（支持 $ENV_VAR 从 .env 读取）
    priority: int              # fallback 优先级（升序：1 最优先）
    params: dict = field(default_factory=dict)  # temperature, max_tokens 等


# ---- 核心函数 ----

def load_system_prompt(path: str) -> str:
    """
    从 Markdown 文件加载 System Prompt

    Args:
        path: system.md 文件路径

    Returns:
        System Prompt 字符串

    Raises:
        FileNotFoundError: 文件不存在
    """
    prompt_path = Path(path)
    if not prompt_path.exists():
        raise FileNotFoundError(f"System Prompt 文件不存在: {path}")
    return prompt_path.read_text(encoding="utf-8")


def load_models(config_path: str) -> list[ModelConfig]:
    """
    从 config/config.json 解析模型配置列表

    Args:
        config_path: config.json 路径

    Returns:
        按 priority 升序排列的 ModelConfig 列表

    Raises:
        FileNotFoundError: 配置文件不存在
        ValueError: JSON 格式错误或必需字段缺失
    """
    config_file = Path(config_path)
    if not config_file.exists():
        raise FileNotFoundError(f"模型配置文件不存在: {config_path}")

    try:
        raw = json.loads(config_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"模型配置 JSON 解析失败: {e}") from e

    if not raw or "models" not in raw:
        raise ValueError(f"模型配置文件缺少 'models' 顶层字段: {config_path}")

    configs: list[ModelConfig] = []
    for entry in raw["models"]:
        # 校验必需字段
        required = ["id", "provider", "model_id", "api_base", "api_key", "priority"]
        missing = [f for f in required if f not in entry]
        if missing:
            raise ValueError(
                f"模型配置 '{entry.get('id', 'unknown')}' 缺少必需字段: {missing}"
            )

        configs.append(ModelConfig(
            id=entry["id"],
            provider=entry["provider"],
            model_id=entry["model_id"],
            api_base=entry["api_base"],
            api_key=entry["api_key"],
            priority=entry["priority"],
            params=entry.get("params", {}),
        ))

    # 按 priority 升序排列（priority=1 最优先）
    configs.sort(key=lambda c: c.priority)
    return configs


def _create_model(config: ModelConfig) -> OpenAIChatModel:
    """
    从 ModelConfig 创建 Pydantic AI OpenAIChatModel 实例

    根据 provider 字段选择正确的 Provider:
    - deepseek: 使用 DeepSeekProvider（推荐）
    - openai: 使用 OpenAIProvider（兼容其他 OpenAI 兼容 API）

    api_base 和 api_key 均支持 $ENV_VAR / ${ENV_VAR} 语法，通过 .env 注入实际值。

    Args:
        config: 模型配置

    Returns:
        OpenAIChatModel 实例

    Raises:
        ValueError: API Key 环境变量缺失或 provider 不支持
    """
    # 解析环境变量引用（$VAR 或 ${VAR}），从 .env 读取实际值
    resolved_key = os.path.expandvars(config.api_key)
    resolved_model = os.path.expandvars(config.model_id)
    
    if not resolved_key or resolved_key == config.api_key:
        # 展开后与原值相同，说明环境变量未设置
        raise ValueError(
            f"模型 '{config.id}' 的 api_key 无法解析: {config.api_key}，"
            f"请检查 .env 中对应的环境变量是否已设置"
        )
    
    # 根据 provider 选择正确的 Provider
    if config.provider == "deepseek":
        # 使用 Pydantic AI 官方推荐的 DeepSeekProvider
        # DeepSeekProvider 默认 base_url 是 https://api.deepseek.com，需要添加 /v1
        from openai import AsyncOpenAI
        custom_client = AsyncOpenAI(
            api_key=resolved_key,
            base_url="https://api.deepseek.com/v1",
        )
        provider = DeepSeekProvider(api_key=resolved_key, openai_client=custom_client)
    elif config.provider == "openai":
        # 使用 OpenAIProvider（兼容 LM Studio 等 OpenAI 兼容 API）
        resolved_base = os.path.expandvars(config.api_base)
        provider = OpenAIProvider(base_url=resolved_base, api_key=resolved_key)
    else:
        raise ValueError(f"不支持的 provider: {config.provider}")
    
    logger.info(
        "创建模型连接: model=%s, provider=%s, api_key_env=%s",
        resolved_model, config.provider, config.api_key,
    )
    
    return OpenAIChatModel(resolved_model, provider=provider)


# ---- MCP 按需加载 ----

def _load_mcp_servers(raw_config: dict) -> list:
    """
    从 config.json 按需加载 MCP 服务器工具集

    仅在 raw_config 包含非空 "mcp_servers" 字段时才导入 MCP 依赖。
    按 enabled 字段过滤，连接失败时记录 warning 日志但不影响启动。

    Args:
        raw_config: config.json 解析后的完整字典

    Returns:
        MCP toolset 列表（可能为空）

    Raises:
        ImportError: MCP SDK 未安装但配置了 mcp_servers
    """
    mcp_entries = raw_config.get("mcp_servers", [])
    if not mcp_entries:
        return []

    # 按需导入 MCP 依赖
    try:
        from pydantic_deep import MCPServerConfig, build_mcp_server
    except ImportError as e:
        raise ImportError(
            "pydantic-ai-slim[mcp] 未安装，无法加载 MCP 服务器配置。"
            "请运行: uv add 'pydantic-ai-slim[mcp]'"
        ) from e

    toolsets = []
    for entry in mcp_entries:
        if not entry.get("enabled", True):
            logger.info("MCP 服务器已禁用，跳过: %s", entry.get("name", "unknown"))
            continue

        try:
            server_config = MCPServerConfig(
                name=entry["name"],
                transport=entry.get("transport", "stdio"),
                command=entry.get("command"),
                args=entry.get("args", []),
                env=entry.get("env"),
                url=entry.get("url"),
                headers=entry.get("headers"),
                description=entry.get("description"),
            )
            toolset = build_mcp_server(server_config)
            toolsets.append(toolset)
            logger.info("MCP 服务器已加载: %s (transport=%s)", entry["name"], entry.get("transport", "stdio"))
        except Exception as e:
            logger.warning("mcp_server_unavailable name=%s error=%s", entry.get("name", "unknown"), e)

    return toolsets


def _approval_mode(raw_config: dict) -> str:
    mode = raw_config.get("hitl", {}).get("mode", "agui_interrupt")
    if mode == "legacy_sse":
        raise ValueError(
            "Unsupported hitl.mode: legacy_sse. "
            "The only supported approval mode is agui_interrupt."
        )
    if mode != "agui_interrupt":
        raise ValueError(f"Unsupported hitl.mode: {mode}")
    return mode


def validate_hitl_config(
    raw_config: dict,
    known_tool_names: list[str],
) -> dict:
    """Normalize neutral HITL config without legacy approval transport state."""
    require_approval = raw_config.get("require_approval", [])
    blocked = raw_config.get("blocked", [])
    timeout_seconds = raw_config.get("timeout_seconds", 30)

    known_set = set(known_tool_names)

    for tool_name in require_approval:
        if tool_name not in known_set:
            logger.warning(
                "hitl_config_unknown_tool tool_name=%s list_type=require_approval",
                tool_name,
            )

    for tool_name in blocked:
        if tool_name not in known_set:
            logger.warning(
                "hitl_config_unknown_tool tool_name=%s list_type=blocked",
                tool_name,
            )

    return {
        "require_approval": require_approval,
        "blocked": blocked,
        "timeout_seconds": timeout_seconds,
    }


def create_paladin_agent(
    models_config_path: str = "config/config.json",
    system_prompt_path: str = "prompts/system.md",
    workspace_dir: Optional[str] = None,
    skills_dir: Optional[str] = None,
) -> Agent:
    """
    创建完整的 Paladin Agent 实例

    集成 pydantic-deep 的 TodoToolset、FilesystemToolset、SkillsToolset、
    SubAgentToolset、ExecuteToolset、PlanToolset 和 WebSearch 能力。

    流程:
    1. 加载 System Prompt
    2. 加载模型配置（按 priority 排序）
    3. 创建 LocalBackend 沙箱
    4. 按需加载 MCP 服务器工具集
    5. 用 create_deep_agent() 创建 Agent（含全部内建工具集）

    Args:
        models_config_path: config.json 路径
        system_prompt_path: system.md 路径
        workspace_dir: Agent 工作区根目录，默认在项目 root 下的 workspace/
        skills_dir: Skills 目录路径，默认在项目 root 下的 skills/

    Returns:
        Pydantic AI Agent 实例（含 deepagents 全套工具集）

    Raises:
        FileNotFoundError: 配置文件缺失
        ValueError: 配置格式错误或 API Key 缺失
        ImportError: MCP SDK 未安装但配置了 mcp_servers
    """
    # 加载 System Prompt
    instructions = load_system_prompt(system_prompt_path)
    logger.info("System Prompt 已加载 (%d 字符)", len(instructions))

    # 加载 JSON 完整配置
    config_file = Path(models_config_path)
    try:
        raw_config = json.loads(config_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"模型配置 JSON 解析失败: {e}") from e

    mode = _approval_mode(raw_config)

    # 加载模型配置
    model_configs = load_models(models_config_path)
    logger.info("已加载 %d 个模型配置", len(model_configs))

    if not model_configs:
        raise ValueError("模型配置列表为空，至少需要一个模型")

    # 用最高优先级模型创建 Pydantic AI Model 实例
    primary_config = model_configs[0]
    primary_model = _create_model(primary_config)
    logger.info(
        "Agent 使用主模型: %s (%s/%s)",
        primary_config.id, primary_config.provider, primary_config.model_id,
    )

    # 创建工作区沙箱（LocalBackend: 限制文件访问范围）
    workspace = Path(workspace_dir) if workspace_dir else (
        Path(models_config_path).resolve().parent.parent / "workspace"
    )
    workspace.mkdir(parents=True, exist_ok=True)
    backend = LocalBackend(root_dir=str(workspace))
    logger.info("工作区沙箱: %s", workspace)

    # Skills 目录
    skills_path = Path(skills_dir) if skills_dir else (
        Path(models_config_path).resolve().parent.parent / "skills"
    )
    skills_path.mkdir(parents=True, exist_ok=True)

    # 按需加载 MCP 服务器
    mcp_toolsets = _load_mcp_servers(raw_config)

    # ---- HITL 配置初始化 ----
    hitl_config = raw_config.get("hitl", {})
    hitl_parsed = validate_hitl_config(hitl_config, [])
    require_approval = hitl_parsed["require_approval"]
    blocked = hitl_parsed["blocked"]
    timeout_seconds = hitl_parsed["timeout_seconds"]

    # ---- Computer Use 工具 ----
    computer_tools = _create_computer_use_tools()
    if computer_tools:
        logger.info("computer_use_tools_loaded count=%d", len(computer_tools))
        # 永久标记 Computer Use 工具 require_approval（D-07b, SPEC 禁止绕过）
        computer_use_names = ["computer_screenshot", "computer_click", "computer_type"]
        require_approval = list(set(require_approval + computer_use_names))
    else:
        logger.warning("computer_use_tools_unavailable")

    interrupt_on = {tool_name: True for tool_name in require_approval}
    guarded_require_approval: list[str] = []
    approved_computer_tools = [
        Tool(tool, requires_approval=True) for tool in computer_tools
    ] if computer_tools else None

    guard_kwargs = {
        "blocked": blocked,
        "require_approval": guarded_require_approval,
    }

    guard = ToolGuard(**guard_kwargs)
    logger.info(
        "hitl_initialized mode=%s require_approval=%s blocked=%s timeout=%d",
        mode, require_approval, blocked, timeout_seconds,
    )

    # 使用 pydantic-deep 创建 Agent，集成全部内建工具集 (D-01, D-02, D-04)
    agent = create_deep_agent(
        model=primary_model,
        system_prompt=instructions,
        capabilities=[guard],
        tools=approved_computer_tools,
        include_todo=True,                  # 启用 TodoToolset
        include_filesystem=True,            # 启用 FilesystemToolset
        include_subagents=True,             # 启用 SubAgentToolset
        include_builtin_subagents=True,     # 使用内置子 Agent
        include_plan=True,                  # 启用计划工具集
        include_skills=True,                # 启用 SkillsToolset
        include_execute=True,               # 启用终端命令执行
        web_search=False,                   # WebSearch 与 OpenAIChatModel 不兼容，延后
        skill_directories=[str(skills_path)],
        max_nesting_depth=1,                # 子 Agent 不可递归创建
        mcp_servers=mcp_toolsets if mcp_toolsets else None,
        interrupt_on=interrupt_on,
        backend=backend,
    )
    logger.info("Agent 已创建（含 Todo + Filesystem + Skills + SubAgents + Execute + Plan）")

    # 创建默认 deps（pydantic-deep 的 @agent.instructions 动态函数需要）
    # ctx.deps 是 DeepAgentDeps，不传 deps= 时为 None，导致 get_uploads_summary() 崩溃
    agent._default_deps = create_default_deps(backend=backend)  # type: ignore[attr-defined]

    # 将模型配置列表附加到 agent 上，供 server 层 fallback 使用
    agent._model_configs = model_configs  # type: ignore[attr-defined]

    return agent


# ---- Fallback 辅助 ----

def get_fallback_models(agent: Agent) -> list[tuple[ModelConfig, OpenAIChatModel]]:
    """
    获取 Agent 的 fallback 模型列表

    用于 server 层在 LLM 调用失败时按优先级降级

    Args:
        agent: 已创建的 Agent 实例

    Returns:
        (ModelConfig, OpenAIChatModel) 元组列表，按 priority 升序
    """
    configs: list[ModelConfig] = getattr(agent, "_model_configs", [])
    fallback_models: list[tuple[ModelConfig, OpenAIChatModel]] = []

    for config in configs:
        try:
            model = _create_model(config)
            fallback_models.append((config, model))
        except ValueError as e:
            logger.warning("Fallback 模型 '%s' 跳过: %s", config.id, e)
            continue

    return fallback_models

"""
Paladin Agent Core — Agent 创建、模型加载、fallback 链

提供核心函数:
- load_system_prompt(): 从 Markdown 文件加载 System Prompt
- load_models(): 从 YAML 解析模型配置列表
- create_paladin_agent(): 创建完整的 Paladin Agent 实例（含 TodoToolset + FilesystemToolset）
"""
import os
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

import yaml
from pydantic_ai import Agent
from pydantic_ai.models.openai import OpenAIChatModel
from pydantic_ai.providers.openai import OpenAIProvider
from pydantic_deep import create_deep_agent
from pydantic_deep import LocalBackend
from pydantic_deep import create_default_deps

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
    从 config/models.yaml 解析模型配置列表

    Args:
        config_path: models.yaml 路径

    Returns:
        按 priority 升序排列的 ModelConfig 列表

    Raises:
        FileNotFoundError: 配置文件不存在
        ValueError: YAML 格式错误或必需字段缺失
    """
    config_file = Path(config_path)
    if not config_file.exists():
        raise FileNotFoundError(f"模型配置文件不存在: {config_path}")

    try:
        raw = yaml.safe_load(config_file.read_text(encoding="utf-8"))
    except yaml.YAMLError as e:
        raise ValueError(f"模型配置 YAML 解析失败: {e}") from e

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


def _create_openai_model(config: ModelConfig) -> OpenAIChatModel:
    """
    从 ModelConfig 创建 Pydantic AI OpenAIChatModel 实例

    使用 OpenAIProvider 支持自定义 base_url（DeepSeek、LM Studio 等兼容 API）。
    api_base 和 api_key 均支持 $ENV_VAR / ${ENV_VAR} 语法，通过 .env 注入实际值。

    Args:
        config: 模型配置

    Returns:
        OpenAIChatModel 实例

    Raises:
        ValueError: API Key 环境变量缺失
    """
    # 解析环境变量引用（$VAR 或 ${VAR}），从 .env 读取实际值
    resolved_base = os.path.expandvars(config.api_base)
    resolved_key = os.path.expandvars(config.api_key)
    resolved_model = os.path.expandvars(config.model_id)
    if not resolved_key or resolved_key == config.api_key:
        # 展开后与原值相同，说明环境变量未设置
        raise ValueError(
            f"模型 '{config.id}' 的 api_key 无法解析: {config.api_key}，"
            f"请检查 .env 中对应的环境变量是否已设置"
        )
    provider = OpenAIProvider(base_url=resolved_base, api_key=resolved_key)
    return OpenAIChatModel(resolved_model, provider=provider)


def create_paladin_agent(
    models_config_path: str = "config/models.yaml",
    system_prompt_path: str = "prompts/system.md",
    workspace_dir: Optional[str] = None,
) -> Agent:
    """
    创建完整的 Paladin Agent 实例

    集成 pydantic-deep 的 TodoToolset 和 FilesystemToolset，
    使用 LocalBackend 沙箱限制文件访问范围。

    流程:
    1. 加载 System Prompt
    2. 加载模型配置（按 priority 排序）
    3. 创建 LocalBackend 沙箱
    4. 用 create_deep_agent() 创建 Agent（含内建工具集）

    Args:
        models_config_path: models.yaml 路径
        system_prompt_path: system.md 路径
        workspace_dir: Agent 工作区根目录，默认在项目 root 下的 workspace/

    Returns:
        Pydantic AI Agent 实例（含 deepagents 工具集）

    Raises:
        FileNotFoundError: 配置文件缺失
        ValueError: 配置格式错误或 API Key 缺失
    """
    # 加载 System Prompt
    instructions = load_system_prompt(system_prompt_path)
    logger.info("System Prompt 已加载 (%d 字符)", len(instructions))

    # 加载模型配置
    model_configs = load_models(models_config_path)
    logger.info("已加载 %d 个模型配置", len(model_configs))

    if not model_configs:
        raise ValueError("模型配置列表为空，至少需要一个模型")

    # 用最高优先级模型创建 Pydantic AI Model 实例
    primary_config = model_configs[0]
    primary_model = _create_openai_model(primary_config)
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

    # 使用 pydantic-deep 创建 Agent，集成 TodoToolset + FilesystemToolset
    agent = create_deep_agent(
        model=primary_model,
        system_prompt=instructions,
        include_todo=True,          # 启用 TodoToolset
        include_filesystem=True,    # 启用 FilesystemToolset
        include_subagents=False,    # Phase 3: 暂不启用子 Agent
        include_plan=False,         # Phase 3: 暂不启用计划工具集
        include_skills=False,       # Phase 3: 暂不启用技能工具集
        web_search=False,           # WebSearch 与 OpenAIChatModel 不兼容
        backend=backend,
    )
    logger.info("Agent 已创建（含 TodoToolset + FilesystemToolset）")

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
            model = _create_openai_model(config)
            fallback_models.append((config, model))
        except ValueError as e:
            logger.warning("Fallback 模型 '%s' 跳过: %s", config.id, e)
            continue

    return fallback_models

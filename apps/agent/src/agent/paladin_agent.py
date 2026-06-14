"""
Paladin Agent Core — Agent 创建、模型加载、fallback 链

提供核心函数:
- load_system_prompt(): 从 Markdown 文件加载 System Prompt
- load_models(): 从 YAML 解析模型配置列表
- create_paladin_agent(): 创建完整的 Paladin Agent 实例
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

# ---- 日志 ----
logger = logging.getLogger(__name__)


# ---- 数据模型 ----

@dataclass
class ModelConfig:
    """单个 LLM 模型配置"""

    id: str                    # 配置内唯一标识
    provider: str              # 提供商: openai / anthropic
    model_id: str              # 模型 ID，如 deepseek-v4-pro
    api_base: str              # API 基础 URL
    api_key_env: str           # API Key 环境变量名
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
        required = ["id", "provider", "model_id", "api_base", "api_key_env", "priority"]
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
            api_key_env=entry["api_key_env"],
            priority=entry["priority"],
            params=entry.get("params", {}),
        ))

    # 按 priority 升序排列（priority=1 最优先）
    configs.sort(key=lambda c: c.priority)
    return configs


def _create_openai_model(config: ModelConfig) -> OpenAIChatModel:
    """
    从 ModelConfig 创建 Pydantic AI OpenAIChatModel 实例

    使用 OpenAIProvider 支持自定义 base_url（DeepSeek、Llama Studio 等兼容 API）

    Args:
        config: 模型配置

    Returns:
        OpenAIChatModel 实例

    Raises:
        ValueError: API Key 环境变量缺失
    """
    api_key = os.environ.get(config.api_key_env)
    if not api_key:
        raise ValueError(
            f"模型 '{config.id}' 需要环境变量 {config.api_key_env}，但未设置"
        )
    # 创建自定义 Provider，支持任意 OpenAI 兼容 API
    provider = OpenAIProvider(base_url=config.api_base, api_key=api_key)
    return OpenAIChatModel(config.model_id, provider=provider)


def create_paladin_agent(
    models_config_path: str = "config/models.yaml",
    system_prompt_path: str = "prompts/system.md",
) -> Agent:
    """
    创建完整的 Paladin Agent 实例

    流程:
    1. 加载 System Prompt
    2. 加载模型配置（按 priority 排序）
    3. 用最高优先级模型创建 Pydantic AI Agent

    Args:
        models_config_path: models.yaml 路径
        system_prompt_path: system.md 路径

    Returns:
        Pydantic AI Agent 实例

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

    # 用最高优先级模型创建 Agent
    primary_config = model_configs[0]
    primary_model = _create_openai_model(primary_config)
    logger.info(
        "Agent 使用主模型: %s (%s/%s)",
        primary_config.id, primary_config.provider, primary_config.model_id,
    )

    agent = Agent(
        model=primary_model,
        instructions=instructions,
    )

    # 将模型配置列表附加到 agent 上，供 server 层 fallback 使用
    agent._model_configs = model_configs  # type: ignore[attr-defined]

    return agent


# ---- Fallback 辅助 ----

def get_fallback_models(agent: Agent) -> list[tuple[ModelConfig, OpenAIChatModel]]:
    """
    获取 Agent 的 fallback 模型列表（排除当前主模型）

    用于 server 层在 LLM 调用失败时按优先级降级

    Args:
        agent: 已创建的 Agent 实例

    Returns:
        (ModelConfig, OpenAIModel) 元组列表，按 priority 升序
    """
    configs: list[ModelConfig] = getattr(agent, "_model_configs", [])
    fallback_models: list[tuple[ModelConfig, OpenAIModel]] = []

    for config in configs:
        try:
            model = _create_openai_model(config)
            fallback_models.append((config, model))
        except ValueError as e:
            logger.warning("Fallback 模型 '%s' 跳过: %s", config.id, e)
            continue

    return fallback_models

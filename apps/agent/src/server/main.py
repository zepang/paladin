"""
Paladin Agent — FastAPI HTTP Server
提供 /copilotkit (AG-UI SSE) 和 /health 端点
"""
import logging
import os
from pathlib import Path

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response

from pydantic_ai.ag_ui import handle_ag_ui_request

from ..agent.paladin_agent import create_paladin_agent, get_fallback_models

# ---- 日志 ----
logger = structlog.get_logger(__name__)

# ---- 初始化 ----

def _find_project_root() -> Path:
    """
    查找项目根目录 (apps/agent/)
    从当前文件向上查找包含 pyproject.toml 的目录
    """
    current = Path(__file__).resolve().parent.parent.parent  # src/server -> agent root
    return current

# 创建 FastAPI 应用
app = FastAPI(
    title="Paladin Agent",
    description="Pydantic AI + AG-UI protocol endpoint for CopilotKit integration",
    version="0.1.0",
)

# CORS — 允许 Tauri 前端访问
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

# 加载 .env
project_root = _find_project_root()
load_dotenv(project_root / ".env")

# 创建 Agent（模块加载时初始化）
_config_path = project_root / "config" / "config.json"
_prompt_path = project_root / "prompts" / "system.md"

agent = create_paladin_agent(
    models_config_path=str(_config_path),
    system_prompt_path=str(_prompt_path),
)
logger.info("Paladin Agent 已初始化")


# ---- 端点 ----

# CopilotKit v2 子路由：/copilotkit/info 和 /copilotkit POST
# CopilotKitProvider 的 runtimeUrl 指向 /copilotkit，
# 框架内部调用 <runtimeUrl>/info 获取 Agent 列表，POST <runtimeUrl> 发起对话

@app.get("/copilotkit/info")
async def copilotkit_info():
    """
    CopilotKit Agent 发现端点
    
    CopilotKit v2 启动时调用 <runtimeUrl>/info 获取可用 Agent 列表。
    Phase 4 添加以支持直连 AG-UI 模式（无需 Copilot Runtime 中间层）。
    
    Returns:
        JSON: {"agents": [{"name": "default", "type": "ag-ui"}]}
    """
    return JSONResponse({
        "agents": [
            {
                "name": "default",
                "description": "Paladin AI 编程助手",
                "type": "ag-ui",
            }
        ]
    })


@app.post("/copilotkit")
async def copilotkit_endpoint(request: Request) -> Response:
    """
    AG-UI 协议端点
    
    接收 CopilotKit 前端发来的 RunAgentInput，
    通过 Pydantic AI 的 handle_ag_ui_request 处理并返回 SSE 事件流。
    
    Returns:
        text/event-stream 响应，包含 AG-UI 事件
    """
    return await handle_ag_ui_request(
        agent=agent,
        request=request,
        deps=getattr(agent, '_default_deps', None),
    )


@app.get("/health")
async def health():
    """
    健康检查端点
    
    返回 Agent 状态和可用模型信息。
    
    Returns:
        JSON: {"status": "ok", "agent": "paladin-agent", "models": [...]}
    """
    fallback = get_fallback_models(agent)
    model_ids = [config.id for config, _ in fallback]

    return JSONResponse({
        "status": "ok",
        "agent": "paladin-agent",
        "models": model_ids,
    })


@app.get("/info")
async def info():
    """
    CopilotKit Agent 发现端点
    
    返回可用 Agent 列表，供 CopilotKit v2 启动时调用 
    Phase 5.1 添加以解决直连模式下的 /info 404 问题
    
    Returns:
        JSON: {"agents": [{"name": "default", "type": "ag-ui"}]}
    """
    return JSONResponse({
        "agents": [
            {
                "name": "default",
                "description": "Paladin AI 编程助手",
                "type": "ag-ui",
            }
        ]
    })


@app.get("/copilotkit/threads")
async def copilotkit_threads(agentId: str = "default"):
    """
    CopilotKit 线程列表端点（带前缀）
    
    CopilotKit v2 启动时会调用此端点获取线程列表。
    返回空数组表示当前没有持久化的线程（Phase 4 简化实现）。
    
    Args:
        agentId: Agent 标识符，默认 "default"
    
    Returns:
        JSON: {"threads": []}
    """
    return JSONResponse({
        "threads": []
    })


@app.get("/threads")
async def threads(agentId: str = "default"):
    """
    CopilotKit 线程列表端点（根路径）
    
    CopilotKit v2 可能直接调用 /threads 获取线程列表。
    提供根路径版本以兼容不同的 API 调用方式。
    
    Args:
        agentId: Agent 标识符，默认 "default"
    
    Returns:
        JSON: {"threads": []}
    """
    return JSONResponse({
        "threads": []
    })

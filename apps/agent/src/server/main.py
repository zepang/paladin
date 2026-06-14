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
_config_path = project_root / "config" / "models.yaml"
_prompt_path = project_root / "prompts" / "system.md"

agent = create_paladin_agent(
    models_config_path=str(_config_path),
    system_prompt_path=str(_prompt_path),
)
logger.info("Paladin Agent 已初始化")


# ---- 端点 ----

@app.post("/copilotkit")
async def copilotkit_endpoint(request: Request) -> Response:
    """
    AG-UI 协议端点
    
    接收 CopilotKit 前端发来的 RunAgentInput，
    通过 Pydantic AI 的 handle_ag_ui_request 处理并返回 SSE 事件流。
    
    Returns:
        text/event-stream 响应，包含 AG-UI 事件
    """
    return await handle_ag_ui_request(agent=agent, request=request)


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

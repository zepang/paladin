"""
Paladin Agent — FastAPI HTTP Server
提供 /copilotkit (AG-UI SSE) 和 /health 端点
"""
import asyncio
import json
import logging
import os
from pathlib import Path

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response, StreamingResponse

from pydantic_ai.ui.ag_ui import AGUIAdapter

from ..agent.paladin_agent import create_paladin_agent, get_fallback_models
from ..agent import hitl

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

# ---- HITL: Queue 桥接 ----
# 将 Plan 02 创建的 agent._hitl_sse_queue 连接到 Plan 01 的 hitl._sse_queue
# approval_callback 写入此 queue → SSE 端点读取并推送到前端
hitl._sse_queue = getattr(agent, '_hitl_sse_queue', None)
logger.info("HITL SSE queue 已桥接")

# 已连接 SSE 客户端列表（每个客户端一个本地 queue）
_approval_queues: list[asyncio.Queue] = []

# 优雅关闭信号 — SSE generator 检查此 Event 以快速退出
_shutdown_event = asyncio.Event()

# 后台广播任务引用 — 供 shutdown 取消
_broadcast_task: asyncio.Task | None = None


def _broadcast_approval_event(event: dict) -> None:
    """向所有已连接 SSE 客户端广播审批事件（非阻塞）。"""
    dead_queues: list[asyncio.Queue] = []
    for q in _approval_queues:
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            dead_queues.append(q)
    for q in dead_queues:
        try:
            _approval_queues.remove(q)
        except ValueError:
            pass


# ---- 审批广播循环 ----
@app.on_event("startup")
async def _start_approval_broadcast():
    """启动后台广播任务：从 hitl._sse_queue 读取事件并转发到 SSE 客户端。"""
    async def _approval_broadcast_loop():
        sse_queue = getattr(hitl, '_sse_queue', None)
        if sse_queue is None:
            return
        while not _shutdown_event.is_set():
            try:
                event = await asyncio.wait_for(sse_queue.get(), timeout=1.0)
                _broadcast_approval_event(event)
            except asyncio.TimeoutError:
                continue  # 检查 _shutdown_event
            except asyncio.CancelledError:
                break
            except Exception:
                logger.exception("approval_broadcast_error")

    global _broadcast_task
    _broadcast_task = asyncio.create_task(_approval_broadcast_loop())
    logger.info("HITL broadcast loop started")


@app.on_event("shutdown")
async def _stop_approval_broadcast():
    """优雅关闭：取消广播任务，通知所有 SSE 客户端断开。"""
    _shutdown_event.set()
    if _broadcast_task is not None and not _broadcast_task.done():
        _broadcast_task.cancel()
        try:
            await asyncio.wait_for(_broadcast_task, timeout=2.0)
        except (asyncio.CancelledError, asyncio.TimeoutError):
            pass
    # 向所有 SSE 客户端队列放入 None sentinel 以解除阻塞
    for q in list(_approval_queues):
        try:
            q.put_nowait(None)
        except asyncio.QueueFull:
            pass
    _approval_queues.clear()
    logger.info("HITL broadcast loop stopped")


# ---- HITL 审批端点 ----

@app.get("/approval/stream")
async def approval_stream(request: Request):
    """SSE 审批事件推送通道

    前端 EventSource 连接此端点，接收 real-time 审批请求事件。
    事件格式（D-03）：data: {"type":"approval_request","request_id":"<uuid4>",...}

    Returns:
        text/event-stream 响应，15s 无事件时发送 keepalive 注释行。
    """
    import json as _json

    local_queue: asyncio.Queue = asyncio.Queue()
    _approval_queues.append(local_queue)

    async def event_generator():
        try:
            while not _shutdown_event.is_set():
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(local_queue.get(), timeout=15.0)
                    if event is None:  # shutdown sentinel
                        break
                    yield f"data: {_json.dumps(event, ensure_ascii=False)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        finally:
            try:
                _approval_queues.remove(local_queue)
            except ValueError:
                pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/approval/{request_id}")
async def approval_decision(request_id: str, request: Request):
    """HTTP 审批决策回调端点

    前端用户点击「批准」或「拒绝」后 POST 到此端点。
    调用 hitl.resolve_approval() 唤醒阻塞的 approval_callback。

    Args:
        request_id: 审批请求 UUID4
    Body:
        {"decision": true} 或 {"decision": false}

    Returns:
        200 {"status": "ok"} 成功，404 {"error": "..."} request_id 不存在
    """
    import json as _json

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"error": "invalid JSON body"}, status_code=400)

    decision = body.get("decision")
    if not isinstance(decision, bool):
        return JSONResponse({"error": "decision must be boolean"}, status_code=400)

    success = hitl.resolve_approval(request_id, decision)
    if not success:
        return JSONResponse(
            {"error": f"request_id not found: {request_id}"},
            status_code=404,
        )

    return JSONResponse({"status": "ok"})


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
    通过 Pydantic AI 的 AGUIAdapter 处理并返回 SSE 事件流。
    
    Returns:
        text/event-stream 响应，包含 AG-UI 事件
    """
    return await AGUIAdapter.dispatch_request(
        request=request,
        agent=agent,
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

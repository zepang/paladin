"""
Phase 07a HITL 审批回调模块 — asyncio.Event 驱动的审批决策循环

提供 ToolGuard.approval_callback 工厂函数、审批状态管理（_pending_approvals / _pending_decisions）、
SSE 事件推送（通过 _sse_queue），以及 HTTP 回调辅助函数（get_pending_approval / resolve_approval）。

Architecture:
  Agent Tool → ToolGuard.before_tool_execute → approval_callback
    → asyncio.Event + SSE push → await Event.wait(timeout)
    → POST /approval/{id} → resolve_approval → Event.set()
    → callback returns bool → ToolGuard throws ToolBlocked on False
"""
import asyncio
import logging
import uuid
from typing import Any, Callable, Optional

logger = logging.getLogger(__name__)

# ---- 全局审批状态 ----

_pending_approvals: dict[str, asyncio.Event] = {}
"""request_id → asyncio.Event，阻塞 approval_callback 等待前端决策"""

_pending_decisions: dict[str, bool] = {}
"""request_id → bool，前端 HTTP 回调写入决策结果"""

_sse_queue: Optional[asyncio.Queue] = None
"""asyncio.Queue，由 server 层注入，用于推送 SSE 审批事件到前端。
None 时优雅降级：跳过推送，等待超时后自动拒绝。"""


# ---- 审批回调工厂 ----

def create_approval_callback(timeout: float = 30.0) -> Callable:
    """创建 approval_callback 闭包，捕获 timeout。

    返回 async 函数 (tool_name: str, args: dict) -> bool：
    1. 生成 UUID4 request_id
    2. 创建 asyncio.Event 并注册到 _pending_approvals
    3. 若 _sse_queue 已注入，推送 D-03 格式的 SSE 事件
    4. await Event.wait(timeout) — 阻塞等待前端决策
    5. 超时 → 返回 False（拒绝），清理 _pending_approvals

    Args:
        timeout: 等待前端决策的最长时间（秒），默认 30s。
    """
    async def approval_callback(tool_name: str, args: dict[str, Any]) -> bool:
        request_id = str(uuid.uuid4())
        event = asyncio.Event()
        _pending_approvals[request_id] = event

        # 推送 SSE 事件到前端（若 queue 已注入）
        if _sse_queue is not None:
            try:
                await _sse_queue.put({
                    "type": "approval_request",
                    "request_id": request_id,
                    "tool_name": tool_name,
                    "args": args,
                    "reason": f"Agent 请求执行 {tool_name}",
                })
            except Exception:
                logger.warning(
                    "hitl_sse_put_failed request_id=%s tool_name=%s",
                    request_id, tool_name,
                )

        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            decision = _pending_decisions.pop(request_id, False)
            return decision
        except asyncio.TimeoutError:
            logger.info(
                "hitl_timeout request_id=%s tool_name=%s timeout=%.1f",
                request_id, tool_name, timeout,
            )
            return False
        finally:
            _pending_approvals.pop(request_id, None)

    return approval_callback


# ---- HTTP 回调辅助函数 ----

def get_pending_approval(request_id: str) -> Optional[asyncio.Event]:
    """查询待审批请求的 asyncio.Event，供 server 层 HTTP 端点使用。

    Args:
        request_id: 审批请求 ID（UUID4）

    Returns:
        对应的 asyncio.Event，若 request_id 不存在则返回 None。
    """
    return _pending_approvals.get(request_id)


def resolve_approval(request_id: str, decision: bool) -> bool:
    """写入决策并触发 Event，释放阻塞中的 approval_callback。

    Args:
        request_id: 审批请求 ID
        decision: True = 批准, False = 拒绝

    Returns:
        True 若成功解析，False 若 request_id 不存在（已超时或被清理）。
    """
    event = _pending_approvals.get(request_id)
    if event is None:
        logger.warning(
            "hitl_resolve_missing_request request_id=%s decision=%s",
            request_id, decision,
        )
        return False

    _pending_decisions[request_id] = decision
    event.set()
    return True


# ---- 配置校验 ----

def validate_hitl_config(
    raw_config: dict,
    known_tool_names: list[str],
) -> dict:
    """校验 hitl 配置段，检查 unknown 工具名并记录 warning。

    Args:
        raw_config: config.json 中的 hitl 段（可能为空 dict 或缺失 key）
        known_tool_names: 当前已知的工具名列表（由 create_deep_agent 注册的全部工具名）

    Returns:
        规范化后的 hitl 配置: {
            "require_approval": [...],
            "blocked": [...],
            "timeout_seconds": 30
        }
    """
    require_approval = raw_config.get("require_approval", [])
    blocked = raw_config.get("blocked", [])
    timeout_seconds = raw_config.get("timeout_seconds", 30)

    known_set = set(known_tool_names)

    # 校验 require_approval 中的工具名
    for tool_name in require_approval:
        if tool_name not in known_set:
            logger.warning(
                "hitl_config_unknown_tool tool_name=%s list_type=require_approval",
                tool_name,
            )

    # 校验 blocked 中的工具名
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

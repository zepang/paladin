"""
Phase 07a HITL 审批回调测试 — 覆盖 approval_callback 工厂、状态管理、配置校验

测试 asyncio.Event 驱动的审批决策循环：ToolGuard → approval_callback → SSE → HTTP 回调 → Event.set()
"""
import asyncio
import json
import logging
import uuid
from unittest.mock import patch, MagicMock

import pytest


# ============================================================
# Test 1: create_approval_callback 正常审批流（批准/拒绝）
# ============================================================

@pytest.mark.asyncio
async def test_approval_callback_happy_path():
    """callback 创建审批请求 → 注入 decision → 返回正确 bool"""
    from src.agent.hitl import (
        create_approval_callback,
        _pending_approvals,
        _pending_decisions,
        resolve_approval,
    )

    _pending_approvals.clear()
    _pending_decisions.clear()

    test_queue: asyncio.Queue = asyncio.Queue()
    import src.agent.hitl as hitl_mod
    hitl_mod._sse_queue = test_queue

    try:
        callback = create_approval_callback(timeout=5.0)
        assert callable(callback)

        async def run_callback():
            return await callback("write_file", {"path": "/tmp/test.txt"})

        task = asyncio.create_task(run_callback())
        await asyncio.sleep(0.1)

        assert not test_queue.empty()
        event_data = await test_queue.get()
        assert event_data["type"] == "approval_request"
        assert event_data["tool_name"] == "write_file"
        request_id = event_data["request_id"]
        uuid.UUID(request_id)  # validate UUID4

        assert request_id in _pending_approvals
        pending_event = _pending_approvals[request_id]
        assert isinstance(pending_event, asyncio.Event)

        resolve_approval(request_id, True)
        result = await task
        assert result is True

        # Test deny
        task2 = asyncio.create_task(callback("edit_file", {"path": "/tmp/test.txt"}))
        await asyncio.sleep(0.1)
        event2 = await test_queue.get()
        rid2 = event2["request_id"]
        resolve_approval(rid2, False)
        result2 = await task2
        assert result2 is False
    finally:
        hitl_mod._sse_queue = None


# ============================================================
# Test 2: 超时自动拒绝
# ============================================================

@pytest.mark.asyncio
async def test_approval_timeout():
    """超时仍无决策 → 自动返回 False，清理 _pending_approvals"""
    from src.agent.hitl import (
        create_approval_callback,
        _pending_approvals,
    )

    _pending_approvals.clear()

    import src.agent.hitl as hitl_mod
    hitl_mod._sse_queue = asyncio.Queue()

    try:
        callback = create_approval_callback(timeout=0.5)
        result = await callback("execute", {"command": "rm -rf /"})

        assert result is False
        assert len(_pending_approvals) == 0
    finally:
        hitl_mod._sse_queue = None
        _pending_approvals.clear()


# ============================================================
# Test 3: _sse_queue=None 时优雅降级
# ============================================================

@pytest.mark.asyncio
async def test_sse_queue_none_graceful():
    """SSE queue 未初始化时 callback 不抛异常，超时后返回 False"""
    from src.agent.hitl import create_approval_callback

    import src.agent.hitl as hitl_mod
    hitl_mod._sse_queue = None

    try:
        callback = create_approval_callback(timeout=0.3)
        result = await callback("write_file", {"path": "/tmp/test"})
        assert result is False
    finally:
        hitl_mod._sse_queue = None


# ============================================================
# Test 4: validate_hitl_config 空配置
# ============================================================

def test_validate_hitl_config_empty():
    """空 hitl 配置 → 返回默认值，无 warning"""
    from src.agent.hitl import validate_hitl_config

    raw_config = {"require_approval": [], "blocked": []}
    known_tools = ["write_file", "edit_file", "execute"]

    result = validate_hitl_config(raw_config, known_tools)
    assert result["require_approval"] == []
    assert result["blocked"] == []
    assert result["timeout_seconds"] == 30


# ============================================================
# Test 5: validate_hitl_config 未知工具（require_approval）
# ============================================================

def test_validate_hitl_config_unknown_tool_require():
    """未知工具名在 require_approval → logger.warning，不抛异常"""
    from src.agent.hitl import validate_hitl_config

    raw_config = {"require_approval": ["nonexistent_tool"], "blocked": []}
    known_tools = ["write_file", "execute"]

    with patch("src.agent.hitl.logger") as mock_logger:
        result = validate_hitl_config(raw_config, known_tools)
        mock_logger.warning.assert_called()
        assert "nonexistent_tool" in result["require_approval"]


# ============================================================
# Test 6: validate_hitl_config 未知工具（blocked）
# ============================================================

def test_validate_hitl_config_unknown_tool_blocked():
    """未知工具名在 blocked → logger.warning，不抛异常"""
    from src.agent.hitl import validate_hitl_config

    raw_config = {"require_approval": [], "blocked": ["nonexistent_tool"]}
    known_tools = ["write_file", "execute"]

    with patch("src.agent.hitl.logger") as mock_logger:
        result = validate_hitl_config(raw_config, known_tools)
        mock_logger.warning.assert_called()


# ============================================================
# Test 7: 并发 3 个 approval_callback
# ============================================================

@pytest.mark.asyncio
async def test_concurrent_approval_callbacks():
    """3 个并发 callback → 各自独立 request_id + Event，互不干扰"""
    from src.agent.hitl import (
        create_approval_callback,
        _pending_approvals,
        _pending_decisions,
        resolve_approval,
    )

    _pending_approvals.clear()
    _pending_decisions.clear()

    import src.agent.hitl as hitl_mod
    hitl_mod._sse_queue = asyncio.Queue()

    try:
        callback = create_approval_callback(timeout=10.0)

        async def run_and_resolve(tool_name, decision, delay=0.0):
            task = asyncio.create_task(callback(tool_name, {}))
            await asyncio.sleep(delay)
            event_data = await hitl_mod._sse_queue.get()
            rid = event_data["request_id"]
            assert rid in _pending_approvals
            resolve_approval(rid, decision)
            return await task

        results = await asyncio.gather(
            run_and_resolve("t1", True, delay=0.05),
            run_and_resolve("t2", False, delay=0.1),
            run_and_resolve("t3", True, delay=0.15),
        )

        assert results == [True, False, True]
    finally:
        hitl_mod._sse_queue = None
        _pending_approvals.clear()
        _pending_decisions.clear()

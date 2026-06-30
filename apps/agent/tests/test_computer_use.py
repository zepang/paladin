"""Phase 07a Computer Use 工具测试 — 覆盖截图/点击/输入 + 降级路径"""
import asyncio
import base64
import io
from unittest.mock import patch, MagicMock

import pytest

import pytest


@pytest.mark.asyncio
async def test_computer_screenshot():
    """截图返回 base64 PNG"""
    with patch("pyautogui.screenshot") as mock_ss:
        from PIL import Image
        img = Image.new("RGB", (100, 50), "white")
        mock_ss.return_value = img

        from src.agent.computer_use import _create_computer_use_tools
        tools = {t.__name__: t for t in _create_computer_use_tools()}
        result = await tools["computer_screenshot"](None)
        assert "已截取当前屏幕截图" in result
        assert "100×50" in result


@pytest.mark.asyncio
async def test_computer_click():
    """点击操作返回确认消息"""
    with patch("pyautogui.click"):
        from src.agent.computer_use import _create_computer_use_tools
        tools = {t.__name__: t for t in _create_computer_use_tools()}
        result = await tools["computer_click"](None, x=100, y=200)
        assert "已在屏幕坐标 (100, 200) 处点击" in result


@pytest.mark.asyncio
async def test_computer_type():
    """输入操作返回确认消息"""
    with patch("pyautogui.typewrite"):
        from src.agent.computer_use import _create_computer_use_tools
        tools = {t.__name__: t for t in _create_computer_use_tools()}
        result = await tools["computer_type"](None, text="hello")
        assert "已输入文本（5 字符）" in result


def test_pyautogui_import_failure_graceful():
    """ImportError → _create_computer_use_tools() 返回降级工具（均为 'pyautogui 未安装'）"""
    with patch.dict("sys.modules", {"pyautogui": None}):
        import sys
        import importlib
        import src.agent.computer_use as cu

        real_import = __import__

        def mock_import(name, *args, **kw):
            if name == "pyautogui" or name.startswith("pyautogui."):
                raise ImportError("No module named 'pyautogui'")
            return real_import(name, *args, **kw)

        with patch("builtins.__import__", side_effect=mock_import):
            importlib.reload(cu)
            tools = cu._create_computer_use_tools()
            assert len(tools) == 3
            for tool in tools:
                result = asyncio.run(tool(None))
                assert "pyautogui 未安装" in result
            importlib.reload(cu)


@pytest.mark.asyncio
async def test_failsafe_handling():
    """FailSafeException → 返回友好错误消息而非崩溃"""
    import pyautogui as pg

    with patch.object(pg, "screenshot", side_effect=pg.FailSafeException):
        from src.agent.computer_use import _create_computer_use_tools
        tools = {t.__name__: t for t in _create_computer_use_tools()}
        result = await tools["computer_screenshot"](None)
        assert "FailSafe" in result
        assert "辅助功能权限" in result


def test_create_computer_use_tools_factory():
    """正常导入 → 返回 3 个工具函数（含预期名称）"""
    from src.agent.computer_use import _create_computer_use_tools
    tools = _create_computer_use_tools()
    assert len(tools) == 3
    names = {t.__name__ for t in tools}
    assert names == {"computer_screenshot", "computer_click", "computer_type"}

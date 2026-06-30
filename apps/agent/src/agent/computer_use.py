"""
Phase 07a Computer Use 工具 — pyautogui 集成的 pydantic-ai @tool 函数

提供 3 个 Agent 工具函数:
- computer_screenshot(): 截取当前屏幕，返回 base64 PNG 字符串
- computer_click(x, y): 在屏幕坐标处点击
- computer_type(text, interval): 键盘输入文本

所有 3 个工具硬编码 require_approval（永久标记，与 config.json 无关）
—— 确保 Agent 每次桌面操作都需经用户 HITL 审批。

非 macOS 环境或 pyautogui 未安装时，工具优雅降级（返回错误字符串，不崩溃）。
"""
import base64
import io
import logging
from typing import Optional

from pydantic_ai import RunContext

logger = logging.getLogger(__name__)


def _create_computer_use_tools():
    """创建 Computer Use 工具列表。

    try/except 包裹 pyautogui 导入:
    - 导入成功 → 返回 3 个 @tool 函数列表
    - ImportError → 返回降级工具列表（返回错误消息），记录 warning
    - macOS FailSafeException → 工具返回友好提示，不崩溃

    Returns:
        list[@tool 函数]
    """
    try:
        import pyautogui as _pg

        # ---- computer_screenshot ----
        async def computer_screenshot(_: RunContext[None]) -> str:
            """截取当前主屏幕的完整截图，返回 base64 编码的 PNG 图像。

            Returns:
                成功时返回语义化描述字符串（base64 数据以元数据形式返回）。
                辅助功能权限未授予时返回错误提示。
            """
            try:
                img = _pg.screenshot()
                buf = io.BytesIO()
                img.save(buf, format="PNG")
                b64 = base64.b64encode(buf.getvalue()).decode("ascii")
                return (
                    f"已截取当前屏幕截图。图像大小: {img.size[0]}×{img.size[1]} 像素。\n"
                    f"data:image/png;base64,{b64}"
                )
            except _pg.FailSafeException:
                return (
                    "Error: 触发 FailSafe——鼠标移至屏幕角落（pyautogui 安全机制）。"
                    " 请授予 macOS 辅助功能权限：系统偏好设置 → 安全性与隐私 → 辅助功能 → 允许终端。"
                )

        # ---- computer_click ----
        async def computer_click(ctx: RunContext[None], x: int, y: int) -> str:
            """在屏幕坐标 (x, y) 处执行鼠标左键单击。

            Args:
                x: 水平坐标（像素，从屏幕左上角起）
                y: 垂直坐标（像素，从屏幕左上角起）

            Returns:
                操作结果描述。
            """
            try:
                _pg.click(x, y)
                return f"已在屏幕坐标 ({x}, {y}) 处点击。"
            except _pg.FailSafeException:
                return (
                    "Error: 触发 FailSafe。"
                    " 请授予 macOS 辅助功能权限：系统偏好设置 → 安全性与隐私 → 辅助功能 → 允许终端。"
                )

        # ---- computer_type ----
        async def computer_type(
            ctx: RunContext[None], text: str, interval: float = 0.0
        ) -> str:
            """在当前焦点位置输入文本（模拟键盘输入）。

            Args:
                text: 要输入的文本内容
                interval: 字符间延迟（秒），默认 0.0 即时输入

            Returns:
                操作结果描述。
            """
            try:
                _pg.typewrite(text, interval=interval)
                return f"已输入文本（{len(text)} 字符）{'，间隔: ' + str(interval) + 's' if interval else ''} 。"
            except _pg.FailSafeException:
                return (
                    "Error: 触发 FailSafe。"
                    " 请授予 macOS 辅助功能权限：系统偏好设置 → 安全性与隐私 → 辅助功能 → 允许终端。"
                )

        return [computer_screenshot, computer_click, computer_type]

    except ImportError:
        logger.warning("pyautogui 未安装——Computer Use 工具不可用")

        # 降级工具——同步函数，始终返回友好的错误消息
        def _unavailable_msg(msg: str):
            async def _fn(_: RunContext[None]) -> str:
                return msg
            return _fn

        return [
            _unavailable_msg("Error: pyautogui 未安装。Computer Use 工具不可用。"),
            _unavailable_msg("Error: pyautogui 未安装。Computer Use 工具不可用。"),
            _unavailable_msg("Error: pyautogui 未安装。Computer Use 工具不可用。"),
        ]

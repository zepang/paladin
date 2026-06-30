# Phase 07a: HITL + Computer Use — Research

**Researched:** 2026-07-01
**Domain:** Human-in-the-Loop 审批流 + Computer Use 桌面操作
**Confidence:** HIGH

## Summary

Phase 7a 实现 Agent 危险操作审批流和基于 pyautogui 的 Computer Use 能力。核心架构分为三层：(1) **Agent 层** — `pydantic_ai_shields.ToolGuard` 通过 `before_tool_execute` 钩子拦截需审批的工具调用，`approval_callback` 使用 `asyncio.Event` 等待用户决策；(2) **通信层** — 自定义 SSE 端点推送 `approval_request` 事件到前端，HTTP `POST /approval/{request_id}` 回传决策；(3) **前端层** — CopilotKit `useHumanInTheLoop` hook 注册审批卡片渲染组件，`shadcn AlertDialog` 提供注意力提醒。

**Primary recommendation:** 采用 SSE + HTTP 回调双向通道（CONTEXT.md D-01），Approval Bridge 组件负责 SSE 订阅、状态管理和 HTTP 回调，`useHumanInTheLoop` 仅负责聊天流内嵌卡片渲染。

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 工具调用拦截 | API / Backend | — | ToolGuard.before_tool_execute 在 Agent 工具执行路径中运行 |
| 审批请求推送 | API / Backend | — | Agent server 通过自定义 SSE 端点推送事件 |
| 审批决策回传 | Browser / Client | — | 前端 POST 到 HTTP 回调端点 |
| 审批 UI 渲染 | Browser / Client | — | useHumanInTheLoop + shadcn AlertDialog |
| Computer Use 工具执行 | API / Backend | — | pyautogui 运行在 Agent 进程中 |
| 配置加载 | API / Backend | — | config.json hitl 段在 create_paladin_agent() 中解析 |

## User Constraints (from CONTEXT.md)

### Locked Decisions
- **D-01:** AG-UI SSE + HTTP 回调模式 — Agent 通过现有 SSE 通道推送 `approval_request` 事件，前端通过 `POST /approval/{request_id}` 回传决定
- **D-02:** `approval_callback` 内部使用 `asyncio.Event` 等待 — 创建 Event → 推送 SSE → await Event → 前端 POST 触发 Event.set() → 返回 bool
- **D-03:** SSE 事件格式：`{ type: "approval_request", request_id: str, tool_name: str, args: dict, reason: str }`
- **D-04:** HTTP 回调端点：`POST /approval/{request_id}` body `{ decision: bool }`，新增到现有 `localhost:9876` 服务器
- **D-05:** 聊天流内嵌审批卡片（主 UI）+ AlertDialog 弹窗（注意力提醒）
- **D-06:** 审批卡片展示完整上下文：工具名 + 完整参数 + Agent 调用原因
- **D-07:** 使用 CopilotKit v2 `useHumanInTheLoop` hook + shadcn `AlertDialog` 组件
- **D-08:** 多个审批请求排队时，卡片底部显示「还有 N 个待审批操作」队列提示
- **D-09:** `ChatToolbar` 升级为审批状态栏 — 新增「等待审批中…」状态行 + 当前待审批工具名称
- **D-10:** 使用 pydantic-ai `@tool` 装饰器定义 3 个工具函数：`computer_screenshot`、`computer_click`、`computer_type`
- **D-11:** pyautogui 作为 `pyproject.toml` 核心依赖（非可选）— 始终安装，非 macOS 环境优雅降级
- **D-12:** 工具函数通过 `create_deep_agent(tools=[...])` 参数注入，与现有工具集并列
- **D-13:** `config.json` 新增 `hitl` 顶级段
- **D-14:** `require_approval` 和 `blocked` 列表直接映射到 `ToolGuard()` 构造参数
- **D-15:** `timeout_seconds` 控制 `approval_callback` 中 `asyncio.Event.wait()` 的超时

### the agent's Discretion
- Computer Use 工具的具体 @tool 函数签名和参数设计
- SSE 事件序列化格式细节
- AlertDialog 与聊天内嵌卡片的 CSS 布局和 z-index
- 错误消息文案

### Deferred Ideas (OUT OF SCOPE)
- 审批历史/审计日志 — Phase 9
- 多级审批链
- OCR 文字识别
- Windows/Linux Computer Use 适配
- 屏幕录制/视频流
- Sidecar 进程管理 — Phase 7b
- Go Server sidecar — Phase 8 后

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HIT-01 | CopilotKit useHumanInTheLoop 审批 UI | §2 CopilotKit useHumanInTheLoop, §3 AG-UI SSE |
| HIT-02 | 危险操作标记与拦截 | §1 ToolGuard API, §5 Config-driven safety |
| HIT-03 | Computer Use 基础能力 | §4 pyautogui integration |

## 1. pydantic_ai_shields ToolGuard API

### 1.1 API 签名与核心机制

[VERIFIED: source code at `.venv/lib/python3.12/site-packages/pydantic_ai_shields/guardrails.py`]

```python
from dataclasses import dataclass, field
from typing import Any, Callable, Awaitable
from pydantic_ai import RunContext
from pydantic_ai.capabilities import AbstractCapability
from pydantic_ai.messages import ToolCallPart
from pydantic_ai.tools import ToolDefinition

ApprovalCallback = Callable[[str, dict[str, Any]], Awaitable[bool] | bool]

@dataclass
class ToolGuard(AbstractCapability[Any]):
    blocked: list[str] = field(default_factory=list)
    """Tool names to block entirely (hidden from model)."""

    require_approval: list[str] = field(default_factory=list)
    """Tool names that require human approval before execution."""

    approval_callback: ApprovalCallback = None
    """Async callback: (tool_name, args) -> bool."""

    async def prepare_tools(
        self, ctx: RunContext[Any], tool_defs: list[ToolDefinition]
    ) -> list[ToolDefinition]:
        """Hide blocked tools from the model."""
        if not self.blocked:
            return tool_defs
        blocked_set = set(self.blocked)
        return [td for td in tool_defs if td.name not in blocked_set]

    async def before_tool_execute(
        self, ctx: RunContext[Any], *,
        call: ToolCallPart, tool_def: ToolDefinition, args: dict[str, Any],
    ) -> dict[str, Any]:
        """Check approval for sensitive tools."""
        if call.tool_name not in self.require_approval:
            return args
        if self.approval_callback is None:
            raise ToolBlocked(call.tool_name, "Approval required but no callback configured")
        result = self.approval_callback(call.tool_name, args)
        if inspect.isawaitable(result):
            result = await result
        if not result:
            raise ToolBlocked(call.tool_name, "User denied")
        return args
```

**关键洞察：**
- `prepare_tools` 从模型可见工具列表中**移除** blocked 工具 — 模型根本不知道这些工具存在
- `before_tool_execute` 在工具参数解析后、实际执行前触发 — 可以 await 异步回调
- `approval_callback` 返回 `False` 时抛出 `ToolBlocked` 异常 — pydantic-ai 将其转换为工具调用错误返回给模型
- 回调签名 `(tool_name: str, args: dict[str, Any]) -> bool | Awaitable[bool]` — 支持同步和异步

### 1.2 接入 create_deep_agent

[VERIFIED: source code at `.venv/lib/python3.12/site-packages/pydantic_deep/agent.py:443`]

`create_deep_agent()` 接受 `capabilities: Sequence[AbstractCapability[Any]]` 参数：

```python
from pydantic_ai_shields import ToolGuard

# 在 create_paladin_agent() 中:
hitl_config = raw_config.get("hitl", {})
require_approval = hitl_config.get("require_approval", [])
blocked = hitl_config.get("blocked", [])
timeout = hitl_config.get("timeout_seconds", 30)

guard = ToolGuard(
    blocked=blocked,
    require_approval=require_approval,
    approval_callback=create_approval_callback(timeout),
)

agent = create_deep_agent(
    model=primary_model,
    system_prompt=instructions,
    capabilities=[guard],  # ← 传入 capabilities
    # ... existing kwargs ...
)
```

### 1.3 approval_callback 与 asyncio.Event 集成

[VERIFIED: pattern confirmed by ToolGuard source code — `before_tool_execute` awaits the callback]

```python
import asyncio
import uuid
from typing import Any

# 全局审批请求注册表
_pending_approvals: dict[str, asyncio.Event] = {}
_pending_decisions: dict[str, bool] = {}
_sse_queue: asyncio.Queue | None = None  # 由 server 层注入

def create_approval_callback(timeout: float = 30.0):
    async def approval_callback(tool_name: str, args: dict[str, Any]) -> bool:
        request_id = str(uuid.uuid4())
        event = asyncio.Event()
        _pending_approvals[request_id] = event

        # 推送 SSE 事件到前端
        if _sse_queue is not None:
            await _sse_queue.put({
                "type": "approval_request",
                "request_id": request_id,
                "tool_name": tool_name,
                "args": args,
                "reason": f"Agent 请求执行 {tool_name}",
            })

        try:
            # 等待前端 HTTP 回调触发 event.set()
            await asyncio.wait_for(event.wait(), timeout=timeout)
            decision = _pending_decisions.pop(request_id, False)
            return decision
        except asyncio.TimeoutError:
            return False  # 超时自动拒绝
        finally:
            _pending_approvals.pop(request_id, None)

    return approval_callback
```

**边缘情况：**
- `_sse_queue` 为 None（SSE 未初始化）时，跳过推送，等待超时后自动拒绝 — 优雅降级
- 超时后 `_pending_approvals` 清理防止内存泄漏
- `request_id` 使用 UUID4 确保唯一性

### 1.4 Computer Use 工具的 ToolGuard 永久审批标记

Computer Use 工具无论 `config.json` 如何配置都强制走审批。方案：

```python
# paladin_agent.py 中，将 Computer Use 工具名追加到 require_approval
computer_use_tools = ["computer_screenshot", "computer_click", "computer_type"]
require_approval = list(set(
    hitl_config.get("require_approval", []) + computer_use_tools
))
```

## 2. CopilotKit v2 useHumanInTheLoop

### 2.1 API 签名

[VERIFIED: source code at `node_modules/@copilotkit/react-core/dist/v2/headless.mjs:402`]
[CopilotKit version: `^1.60.1`]

```typescript
// useHumanInTheLoop 函数签名（从 headless.mjs 还原）
function useHumanInTheLoop(
  tool: {
    name: string;
    description?: string;
    parameters?: any[];         // JSON Schema 参数数组
    render: React.ComponentType<{
      status: "inProgress" | "executing" | "complete";
      args: Record<string, any>;
      respond?: (result: any) => void;  // 仅在 executing 状态可用
      name: string;
      description: string;
    }>;
    agentId?: string;
  },
  deps?: any[]                  // useEffect 风格的依赖数组
): void;
```

### 2.2 状态生命周期

```
inProgress → executing → complete
   ↓            ↓            ↓
 LLM决定      等待用户     用户已响应
 调用工具     做出决定     (结果已返回)
```

- **inProgress**: 工具刚被调用，渲染「等待中…」状态，`respond` 为 `undefined`
- **executing**: 工具等待用户交互，`respond(result)` 可用来回传决定
- **complete**: 用户已响应，工具调用结束

### 2.3 与审批流的集成方案

[ASSUMED] 基于 CONTEXT.md D-01~D-04 的架构决策，`useHumanInTheLoop` 的集成方式为：

```typescript
// ApprovalBridge.tsx — SSE 订阅 + useHumanInTheLoop 桥接
import { useHumanInTheLoop } from "@copilotkit/react-core/v2";

function useApprovalBridge() {
  useHumanInTheLoop({
    name: "hitl_approval",
    description: "请求用户批准 Agent 执行危险操作",
    parameters: [
      { name: "tool_name", type: "string", description: "待审批的工具名称" },
      { name: "args", type: "object", description: "工具参数" },
      { name: "request_id", type: "string", description: "审批请求 ID" },
    ],
    render: ({ status, args, respond }) => {
      if (status === "inProgress") {
        return <ApprovalCardSkeleton />;
      }
      if (status === "executing") {
        return (
          <ApprovalCard
            toolName={args.tool_name}
            args={args.args}
            onApprove={() => respond({ decision: true })}
            onDeny={() => respond({ decision: false })}
          />
        );
      }
      if (status === "complete") {
        return <ApprovalCardResolved decision={args.decision} />;
      }
      return null;
    },
    agentId: "default",
  });
}
```

**关键集成挑战（设计注意点）：**

`useHumanInTheLoop` 依赖 CopilotKit 的前端工具调用机制 — 它期望 Agent 通过 AG-UI 协议调用同名工具来触发渲染。但我们的审批流中，Agent 并不知道 `hitl_approval` 工具的存在（它不在工具列表中）。

**解决方案：Approval SSE Bridge 模式**

CONTEXT.md D-01 选择的是 SSE + HTTP 回调模式，而非纯 CopilotKit 前端工具模式。因此：

1. `useHumanInTheLoop` 用于**审批卡片的聊天流内嵌渲染**（满足 SPEC.md 和 D-07 约束）
2. 实际的审批请求通过**独立 SSE 通道**推送（不是 AG-UI 协议事件）
3. 前端组件 `ApprovalBridge` 同时：
   - 监听 SSE `/approval/stream` 事件
   - 管理审批队列状态
   - 调用 `POST /approval/{request_id}` 回传决策
   - 使用 `useHumanInTheLoop` 的 render 模式展示卡片

**实际实现路径（推荐）：**

由于 `useHumanInTheLoop` 紧密耦合 CopilotKit 前端工具调用生命周期，而 CONTEXT.md 的 SSE+HTTP 架构是独立的，更实际的方案是：

- 使用一个自定义 React hook `useApprovalListener` 订阅 SSE 事件
- 使用 `useHumanInTheLoop` 的 **render 组件模式**渲染审批卡片
- `respond()` 调用 `POST /approval/{request_id}` 
- 或用 `useCopilotAction`（v1 兼容方式）直接渲染自定义消息类型的审批卡片

### 2.4 shadcn AlertDialog 集成

[VERIFIED: shadcn/ui 已在 Phase 5.1 引入，`AlertDialog` 可用]

```typescript
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
```

AlertDialog 作为注意力提醒弹窗，与聊天内嵌卡片同时出现（D-05）。

## 3. AG-UI SSE 事件流

### 3.1 现有架构

[VERIFIED: source code at `apps/agent/src/server/main.py`]

当前 SSE 端点为 `/copilotkit`（POST），由 `pydantic_ai.ag_ui.handle_ag_ui_request` → `AGUIAdapter.dispatch_request` 处理。这是一个标准的 AG-UI 协议端点，生成的事件类型由 AG-UI 规范定义（`RUN_STARTED`, `TEXT_MESSAGE_CONTENT`, `TOOL_CALL_START`, `TOOL_CALL_END`, `RUN_FINISHED` 等）。

[VERIFIED: source code at `.venv/lib/python3.12/site-packages/pydantic_ai/ui/ag_ui/_adapter.py:206`]

AGUIAdapter 是封闭的事件流 — 无法在 AG-UI 协议事件流中插入自定义事件类型。

### 3.2 审批事件 SSE 端点设计

**必须新建独立 SSE 端点**（不修改 AG-UI 协议流）：

```python
# apps/agent/src/server/main.py 新增

import asyncio
import json
from fastapi.responses import StreamingResponse

# 审批事件队列（由 approval_callback 写入，SSE 端点读取）
_approval_queues: list[asyncio.Queue] = []

@app.get("/approval/stream")
async def approval_stream():
    """SSE 端点 — 推送审批请求事件到前端"""
    queue: asyncio.Queue = asyncio.Queue()
    _approval_queues.append(queue)

    async def event_generator():
        try:
            while True:
                # 检查客户端是否断开
                if await request.is_disconnected():
                    break
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=15.0)
                    yield f"data: {json.dumps(event)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"  # SSE 注释，保持连接
        finally:
            _approval_queues.remove(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
```

### 3.3 将 SSE 队列注入 approval_callback

```python
# 在 create_paladin_agent() 返回 agent 前:
agent._hitl_sse_queue = asyncio.Queue()  # 挂载到 agent 实例

# 在 approval_callback 工厂中使用:
from src.agent.paladin_agent import _sse_queue

# server/main.py 初始化时:
_sse_queue = agent._hitl_sse_queue  # 连接全局队列
```

### 3.4 HTTP 回调端点

```python
from pydantic import BaseModel

class ApprovalDecision(BaseModel):
    decision: bool

@app.post("/approval/{request_id}")
async def handle_approval(request_id: str, body: ApprovalDecision):
    """前端 HTTP 回调 — 用户审批决策"""
    from src.agent.paladin_agent import _pending_approvals, _pending_decisions

    event = _pending_approvals.get(request_id)
    if event is None:
        return JSONResponse(
            {"error": "request_id not found or already resolved"},
            status_code=404,
        )

    _pending_decisions[request_id] = body.decision
    event.set()  # 唤醒 approval_callback 中的 asyncio.Event.wait()
    return JSONResponse({"status": "ok"})
```

### 3.5 完整数据流

```
Agent 调用 write_file
  → ToolGuard.before_tool_execute 拦截
    → approval_callback(write_file, args)
      → 生成 request_id, 创建 asyncio.Event
      → 写入 SSE queue: {"type":"approval_request","request_id":"...",...}
      → await event.wait() (阻塞, 最多30s)

前端 SSE 监听器收到事件:
  → ApprovalBridge 状态更新: pendingApprovals.push(event)
  → useHumanInTheLoop render 显示审批卡片
  → AlertDialog 弹窗提醒

用户点击「批准」:
  → respond() / fetch POST /approval/{request_id} {decision:true}
  → event.set() 被触发

approval_callback 返回 True
  → ToolGuard.before_tool_execute 返回 args
  → write_file 正常执行
```

## 4. pyautogui Integration with pydantic-ai

### 4.1 pyautogui API 概览

[ASSUMED] pyautogui 尚未安装。以下基于 pyautogui 0.9.54 官方文档：

```python
import pyautogui

# 截图 — 返回 PIL Image
img = pyautogui.screenshot()  # 全屏
img = pyautogui.screenshot(region=(x, y, w, h))  # 区域

# 鼠标操作
pyautogui.click(x, y)         # 移动到 (x,y) 并左键点击
pyautogui.moveTo(x, y)        # 移动到 (x,y)
pyautogui.position()          # 当前鼠标位置

# 键盘操作
pyautogui.typewrite("hello")  # 输入文本
pyautogui.press("enter")      # 单键
pyautogui.hotkey("cmd", "c")  # 组合键

# 安全机制
pyautogui.FAILSAFE = True     # 鼠标移到角落触发 FailSafeException
pyautogui.PAUSE = 0.5         # 操作间延迟
```

### 4.2 @tool 装饰器定义

[VERIFIED: pydantic-ai `@tool` 模式来自现有代码和 pydantic-ai 文档]

```python
import io
import base64
from pathlib import Path
from pydantic_ai import RunContext, tool

# ---- Computer Use 工具函数 ----

@tool
async def computer_screenshot(ctx: RunContext) -> str:
    """截取当前屏幕截图，返回 base64 编码的 PNG 图像。

    Returns:
        base64 编码的 PNG 截图字符串，可直接用于 LLM vision 分析。
    """
    try:
        import pyautogui
    except ImportError:
        return "Error: pyautogui 未安装。请在 macOS 上运行 pip install pyautogui。"

    try:
        img = pyautogui.screenshot()
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return base64.b64encode(buf.getvalue()).decode("utf-8")
    except pyautogui.FailSafeException:
        return "Error: macOS 辅助功能权限未授予。请在 系统设置 > 隐私与安全性 > 辅助功能 中授权终端。"


@tool
async def computer_click(ctx: RunContext, x: int, y: int) -> str:
    """移动鼠标到 (x, y) 并左键点击。

    Args:
        x: 屏幕 X 坐标（像素）
        y: 屏幕 Y 坐标（像素）

    Returns:
        操作结果描述。
    """
    try:
        import pyautogui
    except ImportError:
        return "Error: pyautogui 未安装。"

    try:
        pyautogui.click(x, y)
        return f"已在屏幕坐标 ({x}, {y}) 处点击。"
    except pyautogui.FailSafeException:
        return "Error: 触发了 FailSafe。请授予 macOS 辅助功能权限。"


@tool
async def computer_type(ctx: RunContext, text: str, interval: float = 0.0) -> str:
    """模拟键盘输入文本。

    Args:
        text: 要输入的文本字符串。
        interval: 每个字符间的延迟（秒），默认 0。

    Returns:
        操作结果描述。
    """
    try:
        import pyautogui
    except ImportError:
        return "Error: pyautogui 未安装。"

    try:
        pyautogui.typewrite(text, interval=interval)
        return f"已输入文本（{len(text)} 字符）。"
    except pyautogui.FailSafeException:
        return "Error: 触发了 FailSafe。请授予 macOS 辅助功能权限。"
```

### 4.3 优雅降级模式

```python
def _create_computer_use_tools() -> list:
    """尝试创建 Computer Use 工具，失败时优雅降级"""
    try:
        import pyautogui  # noqa: F401
        logger.info("pyautogui 已加载，Computer Use 工具可用")
        return [computer_screenshot, computer_click, computer_type]
    except ImportError:
        logger.warning("pyautogui 未安装 — Computer Use 工具不可用")
        return []
```

### 4.4 注入到 create_deep_agent

```python
# paladin_agent.py 的 create_paladin_agent() 中:

# 加载 Computer Use 工具
computer_tools = _create_computer_use_tools()

# 如果 Computer Use 可用，注入到 require_approval
if computer_tools:
    computer_use_names = ["computer_screenshot", "computer_click", "computer_type"]
    require_approval = list(set(require_approval + computer_use_names))

agent = create_deep_agent(
    # ... existing kwargs ...
    tools=list(existing_tools) + computer_tools,  # 合并工具
    capabilities=[guard],
)
```

### 4.5 macOS 辅助功能权限

`pyautogui.FailSafeException` 在用户未授予辅助功能权限时抛出。需要在工具函数中捕获并提供友好提示。

[ASSUMED] macOS 辅助功能权限检查方式：
- pyautogui 默认 `FAILSAFE = True`（鼠标移到左上角触发异常）
- 未授权时调用截图/点击也会触发异常
- 无需提前检查 — 直接 `try/except` 捕获即可

## 5. Config-Driven Safety

### 5.1 config.json 结构扩展

[VERIFIED: 现有 config.json 格式来自 `apps/agent/config/config.json`]

```json
{
  "models": [
    // ... existing models ...
  ],
  "mcp_servers": [],
  "hitl": {
    "require_approval": ["execute", "write_file", "edit_file"],
    "blocked": [],
    "timeout_seconds": 30
  }
}
```

### 5.2 配置解析

在 `create_paladin_agent()` 中，紧跟现有 `raw_config = json.loads(...)` 之后：

```python
# 解析 HITL 配置（新增）
hitl_config = raw_config.get("hitl", {})
require_approval = hitl_config.get("require_approval", [])
blocked = hitl_config.get("blocked", [])
timeout_seconds = hitl_config.get("timeout_seconds", 30)

# 校验：不存在的工具名仅 warning，不崩溃
all_tool_names = _get_all_tool_names()  # 收集已注册工具名
for tool_name in require_approval:
    if tool_name not in all_tool_names:
        logger.warning(
            "hitl.require_approval 中的工具 '%s' 未注册，将忽略", tool_name
        )
for tool_name in blocked:
    if tool_name not in all_tool_names:
        logger.warning(
            "hitl.blocked 中的工具 '%s' 未注册，将忽略", tool_name
        )
```

### 5.3 超时处理

```python
# approval_callback 中的超时:
try:
    await asyncio.wait_for(event.wait(), timeout=timeout_seconds)
    return _pending_decisions.pop(request_id, False)
except asyncio.TimeoutError:
    logger.warning(
        "hitl_timeout request_id=%s tool=%s timeout=%ds",
        request_id, tool_name, timeout_seconds,
    )
    return False  # 超时自动拒绝
```

### 5.4 空配置行为

- `require_approval: []` → 无工具触发审批，ToolGuard 正常运作
- `blocked: []` → 无工具被阻止
- `hitl` 段完全缺失 → 使用空默认值，Agent 正常运行（无审批机制）

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| pydantic-ai-shields | 0.3.4 | ToolGuard + approval_callback | 已安装，API 与 pydantic-ai capabilities 原生集成 |
| @copilotkit/react-core | 1.60.1 | useHumanInTheLoop 审批 UI | 已集成，与 CopilotChat 同框架 |
| pyautogui | ≥0.9.54 | 屏幕截图 + 键鼠操作 | macOS Computer Use 标准库 |
| shadcn/ui AlertDialog | latest | 审批弹窗注意力提醒 | Phase 5.1 已引入 |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| asyncio (stdlib) | 3.12 | Event 等待模式 | approval_callback 阻塞等待 |
| uuid (stdlib) | — | 审批请求 ID 生成 | 每次审批请求唯一标识 |
| pydantic | ≥2.0 | ApprovalDecision 模型 | HTTP 回调请求体验证 |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| 自定义 SSE + HTTP 回调 | 纯 CopilotKit useHumanInTheLoop 前端工具 | HITL 需要拦截后端工具执行路径，非前端工具场景；CONTEXT.md 已锁定 D-01 |

### Installation
```bash
# Python (apps/agent)
uv add pyautogui

# Node (apps/desktop) — 无需新增依赖，CopilotKit 和 shadcn 已安装
```

## Package Legitimacy Audit

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| pydantic-ai-shields | PyPI | ~6 mo | growing | github.com/... | [ASSUMED] | Approved — 已安装于 .venv (0.3.4) |
| pyautogui | PyPI | 3+ yrs (published 2023-05) | N/A (API no data) | github.com/asweigart/pyautogui | [SUS] | Flagged — unknown-downloads: 10+ yr established package, PyPI API lacks download data. Planner add checkpoint:human-verify |
| @copilotkit/react-core | npm | latest: 2026-06-25 | 378K/wk | github.com/CopilotKit/CopilotKit | [SUS] | Flagged — too-new (latest publish 6 days ago): 1.61.2 available, project uses ^1.60.1. Planner add checkpoint:human-verify for upgrade decision |

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:**
- `pyautogui` — unknown-downloads (PyPI API limitation, not a real concern for this established package)
- `@copilotkit/react-core` — latest version published 6 days ago (2026-06-25); project has ^1.60.1, latest is 1.61.2 — planner should decide whether to upgrade

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| 工具拦截/审批 | 自定义 Agent middleware | ToolGuard.before_tool_execute | 原生 pydantic-ai capability，处理了所有边缘情况 |
| 异步等待用户决策 | 轮询/回调地狱 | asyncio.Event + SSE | 标准 async 模式，可超时，资源自动清理 |
| 审批 UI 渲染 | 手写状态机 | useHumanInTheLoop 状态生命周期 | inProgress/executing/complete 状态已定义 |
| 截图/键鼠操作 | 平台原生 API 封装 | pyautogui | 跨平台兼容（降级时），FailSafe 安全机制内置 |
| Server-Sent Events | 手写 SSE 帧格式 | FastAPI StreamingResponse | 自动处理连接管理、keepalive、客户端断开 |

## Architecture Patterns

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        Tauri Desktop App                        │
│  ┌──────────┐  ┌─────────────┐  ┌──────────────────────────┐  │
│  │ CopilotKit│  │ApprovalBridge│  │  ChatToolbar             │  │
│  │ CopilotChat│ │ (SSE listen +│  │  (审批状态栏)            │  │
│  │ (聊天UI)  │  │  useHITL)   │  │  "等待审批中…"           │  │
│  └─────┬─────┘  └──────┬──────┘  └──────────────────────────┘  │
│        │               │                                        │
│   POST /copilotkit  GET /approval/stream                        │
│   (AG-UI SSE)       (审批 SSE)                                  │
└────────┼───────────────┼────────────────────────────────────────┘
         │               │
    ┌────▼───────────────▼────┐
    │   FastAPI Server :9876  │
    │  ┌───────────────────┐  │
    │  │ /copilotkit       │  │  AG-UI 协议 (agent.run)
    │  │ /approval/stream  │  │  审批 SSE 推送
    │  │ POST /approval/{id}│  │  HTTP 回调
    │  └─────────┬─────────┘  │
    │            │             │
    │  ┌─────────▼─────────┐  │
    │  │ Paladin Agent     │  │
    │  │  ├─ ToolGuard     │◄─│── config.json (hitl 段)
    │  │  ├─ pyautogui     │  │
    │  │  └─ toolsets      │  │
    │  └───────────────────┘  │
    └──────────────────────────┘
```

### Recommended Project Structure

```
apps/agent/
├── config/
│   └── config.json              # 新增 hitl 段
├── src/
│   ├── agent/
│   │   ├── paladin_agent.py     # 修改 create_paladin_agent()
│   │   ├── hitl.py              # NEW: approval_callback 工厂 + 队列管理
│   │   └── computer_use.py      # NEW: @tool 函数定义
│   └── server/
│       └── main.py              # 新增 /approval/stream + POST /approval/{id}
└── tests/
    ├── test_hitl.py             # NEW: HITL 审批流测试
    └── test_computer_use.py     # NEW: Computer Use 工具测试

apps/desktop/
└── src/
    └── components/
        ├── approval/
        │   ├── ApprovalBridge.tsx    # NEW: SSE 订阅 + useHumanInTheLoop
        │   ├── ApprovalCard.tsx      # NEW: 审批卡片组件
        │   └── ApprovalDialog.tsx    # NEW: AlertDialog 弹窗
        └── ChatToolbar.tsx           # 修改: 新增审批状态栏
```

### Pattern 1: asyncio.Event 等待模式

**What:** approval_callback 创建 Event → 推 SSE → await Event → HTTP 回调触发 set()

**When to use:** 任何需要跨进程/跨网络等待用户决策的场景

**Example:**
```python
# Source: guardrails.py ToolGuard.before_tool_execute pattern
async def approval_callback(tool_name: str, args: dict) -> bool:
    request_id = str(uuid.uuid4())
    event = asyncio.Event()
    _pending_approvals[request_id] = event
    await _sse_queue.put({"type": "approval_request", ...})
    try:
        await asyncio.wait_for(event.wait(), timeout=30)
        return _pending_decisions.pop(request_id, False)
    except asyncio.TimeoutError:
        return False
    finally:
        _pending_approvals.pop(request_id, None)
```

### Pattern 2: 全局注册表 + 队列模式

**What:** 模块级 `dict[str, asyncio.Event]` 作为审批请求注册表

**When to use:** FastAPI 无内置 session/request 上下文时，跨请求关联的轻量方案

### Anti-Patterns to Avoid
- **在 before_tool_execute 中直接做 HTTP 请求:** 阻塞 Agent 工具执行线程，无法处理超时。应使用 asyncio.Event 解耦
- **修改 AG-UI 协议事件流:** AG-UI 是标准协议，自定义事件类型会破坏 CopilotKit 解析。应使用独立 SSE 端点
- **在 ToolGuard 之外实现审批逻辑:** 绕过 pydantic-ai capabilities 体系，难以保证在所有工具调用路径上都生效

## Runtime State Inventory

> Phase 7a 非 rename/refactor/migration phase。本节记录 HITL 运行时状态。

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | 无持久化审批状态 — 审批请求仅在内存中（asyncio.Event 注册表） | 无需数据迁移 |
| Live service config | config.json 新增 hitl 段 | 编辑文件 |
| OS-registered state | 无 | — |
| Secrets/env vars | 无新增 | — |
| Build artifacts | pyautogui 需新增 pip 依赖 | `uv add pyautogui` |

## Common Pitfalls

### Pitfall 1: SSE 连接断开时审批请求丢失
**What goes wrong:** 前端 SSE 连接断开，approval_callback 推入队列的事件无人消费，用户看不到审批卡片
**Why it happens:** SSE 是单向推送，无确认机制
**How to avoid:** approval_callback 中的 `event.wait()` 超时后自动拒绝（30s），确保 Agent 不会永久阻塞。前端重连时重新建立 SSE 订阅
**Warning signs:** Agent 日志中出现大量 `hitl_timeout` 警告

### Pitfall 2: ToolGuard 中工具名与实际工具名不匹配
**What goes wrong:** `config.json` 中配置了 `"write_file"` 但实际工具名为 `"filesystem_write_file"`
**Why it happens:** pydantic-deep 内建工具的命名规则与用户预期不一致
**How to avoid:** 启动时打印所有已注册工具名（`agent._function_tools` 字典），校验配置中的工具名是否存在
**Warning signs:** 配置了审批但工具仍然直接执行

### Pitfall 3: 审批回调中循环导入
**What goes wrong:** `paladin_agent.py` 导入 `hitl.py`，`hitl.py` 又导入 `paladin_agent.py` 的全局变量
**Why it happens:** 全局注册表 `_pending_approvals` 需要在两个模块间共享
**How to avoid:** 将全局状态放在独立模块 `src/agent/hitl.py`，所有导入单向从该模块读取
**Warning signs:** ImportError / circular import

### Pitfall 4: pyautogui 在无显示器环境崩溃
**What goes wrong:** CI/headless 环境无屏幕，pyautogui 调用直接崩溃
**Why it happens:** pyautogui 需要显示器连接（即使是虚拟的）
**How to avoid:** `try/except` 包裹所有 pyautogui 调用，导入失败时工具不注册。CI 中可通过环境变量 `PALADIN_SKIP_COMPUTER_USE=1` 跳过
**Warning signs:** ImportError 或 DisplayConnectionError

### Pitfall 5: useHumanInTheLoop 与自定义 SSE 的竞态
**What goes wrong:** SSE 事件到达时 useHumanInTheLoop 尚未完成注册
**Why it happens:** React hooks 注册是异步的，SSE 推送是即时的
**How to avoid:** ApprovalBridge 使用 `useEffect` 先注册 SSE 监听，`useHumanInTheLoop` 渲染纯展示组件（不依赖工具调用触发）
**Warning signs:** 审批事件到达但无卡片渲染

## Code Examples

### Comprehensive: approval_callback 工厂
```python
# Source: guardrails.py ToolGuard pattern + CONTEXT.md D-02
# File: apps/agent/src/agent/hitl.py

import asyncio
import logging
import uuid
from typing import Any

logger = logging.getLogger(__name__)

# 全局注册表
_pending_approvals: dict[str, asyncio.Event] = {}
_pending_decisions: dict[str, bool] = {}
_sse_queue: asyncio.Queue | None = None


def set_sse_queue(queue: asyncio.Queue) -> None:
    """由 server 层注入 SSE 队列"""
    global _sse_queue
    _sse_queue = queue


def resolve_approval(request_id: str, decision: bool) -> bool:
    """HTTP 回调触发 — 由 server 端点调用"""
    event = _pending_approvals.get(request_id)
    if event is None:
        return False
    _pending_decisions[request_id] = decision
    event.set()
    return True


def create_approval_callback(timeout: float = 30.0):
    """创建 ToolGuard.approval_callback"""

    async def callback(tool_name: str, args: dict[str, Any]) -> bool:
        request_id = str(uuid.uuid4())
        event = asyncio.Event()
        _pending_approvals[request_id] = event

        if _sse_queue is not None:
            await _sse_queue.put({
                "type": "approval_request",
                "request_id": request_id,
                "tool_name": tool_name,
                "args": args,
                "reason": f"Agent 请求执行 {tool_name}",
            })

        try:
            await asyncio.wait_for(event.wait(), timeout=timeout)
            decision = _pending_decisions.pop(request_id, False)
            logger.info(
                "hitl_decision request_id=%s tool=%s decision=%s",
                request_id, tool_name, decision,
            )
            return decision
        except asyncio.TimeoutError:
            logger.warning(
                "hitl_timeout request_id=%s tool=%s timeout=%ds",
                request_id, tool_name, timeout,
            )
            return False
        finally:
            _pending_approvals.pop(request_id, None)

    return callback
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| 无审批机制 | ToolGuard + approval_callback | Phase 7a | Agent 危险操作需用户确认 |
| 无桌面操作能力 | pyautogui screenshot/click/type | Phase 7a | Agent 可操作桌面 UI |

**Deprecated/outdated:**
- 无 — 这些能力在 Paladin 项目中是全新的

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | pyautogui 0.9.54+ API（screenshot/click/typewrite）与文档一致 | §4 | 需在 macOS 上实际验证 API 和行为 |
| A2 | useHumanInTheLoop 可通过自定义 SSE 事件 + HTTP 回调桥接（而非纯 CopilotKit 工具调用生命周期） | §2 | 可能需要降级到 useCopilotAction 自定义消息渲染 |
| A3 | AGUIAdapter 不支持注入自定义事件类型，需要独立 SSE 端点 | §3 | 如 AG-UI 协议支持自定义事件，可简化架构 |
| A4 | pydantic-deep create_deep_agent 的 `capabilities` 参数可接受 ToolGuard 实例 | §1 | 需验证 capabilities 与 pydantic-deep 内置能力的交互（如 cost_tracking） |

## Open Questions

1. **useHumanInTheLoop 与自定义 SSE 的桥接方式**
   - What we know: useHumanInTheLoop 依赖 CopilotKit 前端工具调用生命周期；CONTEXT.md 选择了 SSE+HTTP 架构
   - What's unclear: 是否可以让 useHumanInTheLoop 独立工作（不依赖 Agent 调用工具），仅作为渲染组件使用
   - Recommendation: 优先实现自定义 React 组件监听 SSE 事件 + useHumanInTheLoop render 模式；如不可行，降级为 useCopilotAction 自定义消息渲染

2. **pydantic-deep 内置工具的实际 tool_name**
   - What we know: FilesystemToolset 提供 write_file/edit_file，ExecuteToolset 提供 execute
   - What's unclear: 确切的 pydantic-ai tool_name（是 "write_file" 还是 "filesystem_write_file" 还是 "FileWrite"？）
   - Recommendation: 启动 Agent 后通过日志或 `agent._function_tools.keys()` 确认实际工具名

3. **pyautogui 在 Tauri macOS 打包环境的权限**
   - What we know: macOS 需要辅助功能权限；开发环境可通过系统设置授权
   - What's unclear: Tauri 打包后的 .app 是否需要额外的 entitlements 配置
   - Recommendation: Phase 10 (Packaging) 时处理，Phase 7a 仅处理开发环境

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| pydantic-ai-shields | ToolGuard | ✓ | 0.3.4 | — |
| @copilotkit/react-core | useHumanInTheLoop | ✓ | 1.60.1 | — |
| pyautogui | Computer Use 工具 | ✗ | — | 优雅降级：工具不注册，Agent 正常运行 |
| shadcn AlertDialog | 审批弹窗 | ✓ | latest | — |
| Python 3.12 | 全链路 | ✓ | 3.12 | — |
| Node.js | 前端构建 | ✓ | — | — |

**Missing dependencies with no fallback:**
- 无 — 所有核心依赖已就位或可优雅降级

**Missing dependencies with fallback:**
- pyautogui — 优雅降级：Computer Use 工具不注册，日志 warning

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | pytest 9.1.0 + pytest-asyncio 1.4.0 |
| Config file | `apps/agent/pyproject.toml` (dev dependency group) |
| Quick run command | `cd apps/agent && uv run pytest tests/test_hitl.py -x -v` |
| Full suite command | `cd apps/agent && uv run pytest tests/ -x -v` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| HIT-01 | 审批 UI 渲染 | e2e / manual-only | — | ❌ Wave 0 |
| HIT-02 | ToolGuard 拦截 + 审批决策 | unit | `pytest tests/test_hitl.py::test_approval_approved -x` | ❌ Wave 0 |
| HIT-02 | ToolGuard 拒绝 | unit | `pytest tests/test_hitl.py::test_approval_denied -x` | ❌ Wave 0 |
| HIT-02 | 超时自动拒绝 | unit | `pytest tests/test_hitl.py::test_approval_timeout -x` | ❌ Wave 0 |
| HIT-02 | blocked 工具不可见 | unit | `pytest tests/test_hitl.py::test_blocked_tool_hidden -x` | ❌ Wave 0 |
| HIT-02 | 空配置正常 | unit | `pytest tests/test_hitl.py::test_empty_config -x` | ❌ Wave 0 |
| HIT-03 | computer_screenshot 返回 base64 | unit | `pytest tests/test_computer_use.py::test_screenshot -x` | ❌ Wave 0 |
| HIT-03 | computer_click 执行 | unit | `pytest tests/test_computer_use.py::test_click -x` | ❌ Wave 0 |
| HIT-03 | computer_type 输入 | unit | `pytest tests/test_computer_use.py::test_typewrite -x` | ❌ Wave 0 |
| HIT-03 | pyautogui 缺失降级 | unit | `pytest tests/test_computer_use.py::test_missing_pyautogui -x` | ❌ Wave 0 |
| HIT-03 | macOS 权限缺失友好提示 | unit | `pytest tests/test_computer_use.py::test_failsafe -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `uv run pytest tests/test_hitl.py -x -v`
- **Per wave merge:** `uv run pytest tests/ -x -v`
- **Phase gate:** Full suite green before `/gsd-verify-work`

### Wave 0 Gaps
- [ ] `tests/test_hitl.py` — 创建，覆盖 HIT-02 全部 6 个测试用例
- [ ] `tests/test_computer_use.py` — 创建，覆盖 HIT-03 全部 5 个测试用例
- [ ] `tests/conftest.py` — 扩展：新增 mock ToolGuard 和 pyautogui fixtures
- [ ] Framework: 确认 pytest-asyncio 已安装（`uv run pytest --trace-config 2>&1 | grep asyncio`）

## Security Domain

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V2 Authentication | no | N/A — Phase 7a 无用户认证（Phase 8 Go Server 处理） |
| V3 Session Management | no | N/A |
| V4 Access Control | yes | ToolGuard.require_approval 列表控制哪些操作需审批 |
| V5 Input Validation | yes | ToolGuard.before_tool_execute 在参数解析后运行（已通过 pydantic tool schema 验证）；HTTP 回调使用 Pydantic ApprovalDecision 模型验证 |
| V6 Cryptography | no | N/A |

### Known Threat Patterns for HITL + Computer Use

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Agent 绕过审批直接执行工具 | Tampering | ToolGuard.before_tool_execute 在 pydantic-ai 工具调用路径中强制拦截 — 无法绕过 |
| 恶意 SSE 事件注入 | Spoofing | SSE 端点仅 localhost:9876 暴露，CORS 限制特定 origin |
| 未授权 HTTP 回调 | Spoofing | localhost-only 绑定，request_id 使用 UUID4（不可猜测） |
| Computer Use 未授权操作 | Elevation of Privilege | 所有 Computer Use 工具硬编码 require_approval，不可配置绕过 |
| 审批超时 DOS | Denial of Service | 30s 超时自动拒绝，不阻塞后续工具调用（队列串行） |

## Sources

### Primary (HIGH confidence)
- `.venv/lib/python3.12/site-packages/pydantic_ai_shields/guardrails.py` — ToolGuard 完整 API（blocked, require_approval, approval_callback, prepare_tools, before_tool_execute）
- `.venv/lib/python3.12/site-packages/pydantic_ai_shields/__init__.py` — 公开导出（ToolGuard, CostTracking, InputGuard, OutputGuard, AsyncGuardrail）
- `.venv/lib/python3.12/site-packages/pydantic_deep/agent.py:443` — create_deep_agent() 签名（capabilities, tools 参数）
- `node_modules/@copilotkit/react-core/dist/v2/headless.mjs:402` — useHumanInTheLoop 实现（handler Promise, respond, status 生命周期）
- `apps/agent/src/agent/paladin_agent.py` — create_paladin_agent() 当前实现（config 解析模式、create_deep_agent 调用）
- `apps/agent/src/server/main.py` — FastAPI 服务器结构、CORS 配置、AG-UI 端点
- `apps/desktop/src/App.tsx` — CopilotKitProvider + HttpAgent 集成
- `apps/desktop/src/components/ChatToolbar.tsx` — 当前工具调用展示组件
- `apps/desktop/src/components/ChatArea.tsx` — CopilotChat 集成位置
- `.planning/phases/07-hitl-sidecar/07-CONTEXT.md` — 15 个锁定决策
- `.planning/phases/07-hitl-sidecar/07-SPEC.md` — 5 个锁定需求 + 15 条验收标准

### Secondary (MEDIUM confidence)
- `.venv/lib/python3.12/site-packages/pydantic_ai/ui/ag_ui/_adapter.py:206` — AGUIAdapter 类（确认无法注入自定义事件类型）
- `.venv/lib/python3.12/site-packages/pydantic_ai/ag_ui.py:66` — handle_ag_ui_request 已弃用（仍可用，但推荐直接使用 AGUIAdapter）

### Tertiary (LOW confidence)
- pyautogui 0.9.54 API — 训练数据知识，未安装验证 [ASSUMED]
- useHumanInTheLoop + 自定义SSE 桥接可行性 — 理论分析，未实际集成测试 [ASSUMED]

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — 所有核心库已安装于项目中，API 签名从源码验证
- Architecture: HIGH — 数据流设计基于 CONTEXT.md 锁定决策，AG-UI 源码确认架构约束
- Pitfalls: MEDIUM — 5 个已知陷阱从类似实现经验推断，useHumanInTheLoop 桥接方案需实战验证
- Computer Use: MEDIUM — pyautogui API 从训练数据推断，未在项目中安装验证

**Research date:** 2026-07-01
**Valid until:** 2026-07-31 (tools 层 API 稳定，pyautogui 为成熟库)

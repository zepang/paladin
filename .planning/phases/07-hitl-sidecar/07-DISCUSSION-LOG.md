# Phase 07: HITL + Sidecar (7a: HITL + Computer Use) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-01
**Phase:** 07-hitl-sidecar (7a: HITL + Computer Use)
**Areas discussed:** HITL 通信桥梁, 审批 UI 设计, Computer Use 工具注册, 配置结构

---

## HITL 通信桥梁

| Option | Description | Selected |
|--------|-------------|----------|
| HTTP 轮询 | approval_callback 发审批请求到内部队列 → 每 500ms 轮询状态端点 | |
| WebSocket 双向 | 新建 WS 连接，Agent 发审批请求 → 前端通过 WS 回复 | |
| AG-UI SSE + HTTP 回调 | SSE 推送审批事件 → 前端 HTTP POST 回传决定，asyncio.Event 等待 | ✓ |

**User's choice:** AG-UI SSE + HTTP 回调（经 agent 分析推荐后确认）
**Notes:** 复用现有 SSE 通道，仅需新增 `POST /approval/{request_id}` 端点，asyncio.Event 比轮询更简洁。SSE 事件格式：`{ type: "approval_request", request_id, tool_name, args, reason }`。

---

## 审批 UI 设计

**Q1: 审批 UI 呈现方式**

| Option | Description | Selected |
|--------|-------------|----------|
| 聊天流内嵌卡片 + AlertDialog | 卡片在聊天流中（主）+ AlertDialog 作为注意力提醒 | ✓ |
| 仅聊天流卡片 | 不使用 AlertDialog | |
| 仅 AlertDialog | 弹窗审批，无聊天流记录 | |

**Q2: 审批信息展示**

| Option | Description | Selected |
|--------|-------------|----------|
| 工具名 + 参数摘要 | 「execute: rm -rf /tmp/test」 | |
| 工具名 + 参数 + 风险等级 | 加上高危/中危/低危标签 | |
| 完整上下文 | 工具名 + 完整参数 + 触发原因 | ✓ |

**Q3: 批量审批队列提示**

| Option | Description | Selected |
|--------|-------------|----------|
| 显示队列提示 | 卡片底部显示「还有 N 个待审批操作」 | ✓ |
| 不显示 | 仅展示当前审批 | |

**Q4: ChatToolbar 升级**

| Option | Description | Selected |
|--------|-------------|----------|
| 升级为审批状态栏 | 新增「等待审批中…」状态行 + 当前待审批工具名称 | ✓ |
| 保持现状 | 不修改 ChatToolbar | |

**User's choice:** 两者结合 + 完整上下文 + 显示队列提示 + 升级 ChatToolbar
**Notes:** [修订 2026-07-01] D-07 修订：因 SSE+HTTP 架构（D-01）与 useHumanInTheLoop 不兼容，改用自定义 `useApprovalBridge` hook（EventSource + fetch POST），审批卡片通过 CopilotKit 自定义消息类型嵌入 CopilotChat 消息流。AlertDialog 仍使用 shadcn。

---

## Computer Use 工具注册

**Q1: 工具注册方式**

| Option | Description | Selected |
|--------|-------------|----------|
| @tool 装饰器 | pydantic-ai @tool 定义 3 个函数（screenshot/click/type） | ✓ |
| MCP 服务器 | 包装为本地 MCP 服务器 | |
| pydantic-deep Toolset | 实现自定义 Toolset 接口 | |

**Q2: pyautogui 依赖声明**

| Option | Description | Selected |
|--------|-------------|----------|
| pyproject.toml 核心依赖 | 始终安装，非 macOS 优雅降级 | ✓ |
| pyproject.toml 可选依赖 | `[project.optional-dependencies] computer-use` | |
| 不声明依赖 | try/except import | |

**User's choice:** @tool 装饰器 + 核心依赖
**Notes:** 3 个工具通过 `create_deep_agent(tools=[...])` 注入。

---

## 配置结构

| Option | Description | Selected |
|--------|-------------|----------|
| require_approval + blocked + timeout_seconds | 与 ToolGuard 字段对齐，包含超时配置 | ✓ |
| 仅 require_approval | 最简 | |

**User's choice:** require_approval + blocked + timeout_seconds（经 agent 分析推荐后确认）
**Notes:** 结构为 `{"hitl": {"require_approval": ["execute","write_file","edit_file"], "blocked": [], "timeout_seconds": 30}}`。

---

## the agent's Discretion

- Computer Use 工具的具体 @tool 函数签名和参数设计
- SSE 事件序列化格式细节
- AlertDialog 与聊天内嵌卡片的 CSS 布局和 z-index
- 错误消息文案

## Deferred Ideas

(None — no scope creep mentioned during this discussion)

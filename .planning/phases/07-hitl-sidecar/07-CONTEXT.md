# Phase 07: HITL + Sidecar (7a: HITL + Computer Use) - Context

**Gathered:** 2026-07-01
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 7a 实现 Agent 危险操作的 Human-in-the-Loop 审批流和基于 pyautogui 的 Computer Use 桌面操作能力。Agent 执行 `require_approval` 列表中的工具时，通过 AG-UI SSE 推送审批请求，前端 CopilotKit `useHumanInTheLoop` 渲染审批 UI，用户批准/拒绝后 Agent 继续或中止。Computer Use 提供 screenshot/click/type 三个工具函数，每次操作强制走 HITL 审批。

**在 Phase 7a 内：** HITL 审批流（ToolGuard + useHumanInTheLoop）、审批 UI（聊天内嵌卡片 + AlertDialog）、Computer Use 工具（pyautogui @tool）、config.json hitl 段
**不在 Phase 7a：** Sidecar 进程管理 — 拆分为 Phase 7b
</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `07-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `07-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- CopilotKit `useHumanInTheLoop` 审批卡片（聊天流内嵌）
- `pydantic_ai_shields ToolGuard` 集成，`config.json` 驱动工具审批列表
- pyautogui `screenshot` / `click` / `typewrite` 三个工具函数
- Computer Use 操作强制走 HITL 审批
- HITL 30s 超时自动拒绝
- 审批请求排队（一次一个）
- pyautogui 缺失时优雅降级
- macOS 辅助功能权限提示

**Out of scope (from SPEC.md):**
- 审批历史/审计日志 — Phase 9 Admin Systems
- 多级审批链 — v1 仅单层批准/拒绝
- OCR 文字识别 — 超出 MVP
- Windows/Linux Computer Use 适配 — macOS 优先
- 屏幕录制/视频流 — 仅单帧截图
- Sidecar 进程管理（SDC-01~03） — 拆分为 Phase 7b
- Go Server sidecar（SDC-02） — 延后至 Phase 8 后
- Computer Use 独立 UI — 作为 Agent 工具暴露，无独立界面

</spec_lock>

<decisions>
## Implementation Decisions

### HITL 通信桥梁
- **D-01:** 采用 AG-UI SSE + HTTP 回调模式——Agent 通过现有 SSE 通道推送 `approval_request` 事件，前端通过 `POST /approval/{request_id}` 回传决定
- **D-02:** `approval_callback` 内部使用 `asyncio.Event` 等待——创建 Event → 推送 SSE → await Event → 前端 POST 触发 Event.set() → 返回 bool
- **D-03:** SSE 事件格式：`{ type: "approval_request", request_id: str, tool_name: str, args: dict, reason: str }`
- **D-04:** HTTP 回调端点：`POST /approval/{request_id}` body `{ decision: bool }`，新增到现有 `localhost:9876` 服务器

### 审批 UI 设计
- **D-05:** 聊天流内嵌审批卡片（主 UI）+ AlertDialog 弹窗（注意力提醒）——两者结合
- **D-06:** 审批卡片展示完整上下文：工具名 + 完整参数 + Agent 调用原因
- **D-07:** 使用自定义 `useApprovalBridge` hook（EventSource + fetch POST）管理审批通道，审批卡片通过 CopilotKit 自定义消息类型嵌入 CopilotChat 消息流（非固定覆盖层），AlertDialog 使用 shadcn `AlertDialog` 组件
- **D-08:** 多个审批请求排队时，卡片底部显示「还有 N 个待审批操作」队列提示
- **D-09:** `ChatToolbar` 升级为审批状态栏——新增「等待审批中…」状态行 + 当前待审批工具名称

### Computer Use 工具注册
- **D-10:** 使用 pydantic-ai `@tool` 装饰器定义 3 个工具函数：`computer_screenshot`、`computer_click`、`computer_type`
- **D-11:** pyautogui 作为 `pyproject.toml` 核心依赖（非可选）——始终安装，非 macOS 环境优雅降级
- **D-12:** 工具函数通过 `create_deep_agent(tools=[...])` 参数注入，与现有工具集并列

### 配置结构
- **D-13:** `config.json` 新增 `hitl` 顶级段：
  ```json
  {
    "models": [...],
    "mcp_servers": [],
    "hitl": {
      "require_approval": ["execute", "write_file", "edit_file"],
      "blocked": [],
      "timeout_seconds": 30
    }
  }
  ```
- **D-14:** `require_approval` 和 `blocked` 列表直接映射到 `ToolGuard()` 构造参数
- **D-15:** `timeout_seconds` 控制 `approval_callback` 中 `asyncio.Event.wait()` 的超时

### the agent's Discretion
- **Computer Use 工具的具体 @tool 函数签名和参数设计** — 由 planner/executor 自行设计
- **SSE 事件序列化格式细节** — 由 planner 根据现有 AG-UI 事件模式确定
- **AlertDialog 与聊天内嵌卡片的 CSS 布局和 z-index** — 由 implementer 自行决定
- **错误消息文案** — 由 implementer 自行编写

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Spec
- `.planning/phases/07-hitl-sidecar/07-SPEC.md` — **Locked requirements.** 5 requirements, boundaries, 15 acceptance criteria, 4 prohibitions. MUST read before planning.

### Project
- `.planning/PROJECT.md` — 项目核心价值、技术栈决策、monorepo 结构约束
- `.planning/REQUIREMENTS.md` — v1 需求追踪（HIT-01~03, SDC-01~03）

### Prior Phases
- `.planning/phases/06-agent-tools/06-CONTEXT.md` — Agent 工具链当前状态（include_execute/include_filesystem 已启用、config.json 格式、create_deep_agent() 模式）
- `.planning/phases/04-agent-desktop/04-CONTEXT.md` — AG-UI 端点配置（`localhost:9876/copilotkit`）、CopilotKit HttpAgent 集成

### Libraries
- `apps/agent/.venv/lib/python3.12/site-packages/pydantic_ai_shields/guardrails.py` — `ToolGuard` 类 API（`blocked`, `require_approval`, `approval_callback`, `before_tool_execute`）
- `apps/desktop/node_modules/@copilotkit/react-core/` — CopilotKit v2 `useHumanInTheLoop` hook + `useAgent` hook

### Code
- `apps/agent/src/agent/paladin_agent.py` — `create_paladin_agent()` 工厂函数（需接入 `ToolGuard` + Computer Use 工具）
- `apps/agent/config/config.json` — 当前配置结构（需新增 `hitl` 段）
- `apps/desktop/src/App.tsx` — CopilotKitProvider + HttpAgent 配置
- `apps/desktop/src/components/ChatToolbar.tsx` — 当前工具调用被动展示（需升级为审批状态栏）

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`create_deep_agent()`** — 通过 `tools=` 参数注入自定义工具，`capabilities=` 传入 `ToolGuard`
- **`ToolGuard` 类** — 已安装 `pydantic_ai_shields 0.3.4`，`blocked`/`require_approval`/`approval_callback` API 完整
- **`useHumanInTheLoop` hook** — CopilotKit v2 已集成，`render` 函数接收 `{ status, args, respond }`，`respond("approved"/"denied")` 回传决定
- **shadcn `AlertDialog`** — 已在 Phase 5.1 引入，可直接用于审批弹窗
- **AG-UI SSE** — 现有 `/copilotkit` 端点已支持 SSE 事件流，新增事件类型无架构变更
- **`structlog`** — 所有 Agent 操作使用结构化日志

### Established Patterns
- **JSON 配置** — `config.json` 由 `load_models()` 解析，新 `hitl` 段遵循相同模式
- **`@tool` 装饰器** — pydantic-ai 标准工具定义方式，与现有 pydantic-deep 工具集兼容
- **`asyncio` 异步** — Agent 全链路异步，`asyncio.Event` 与现有模式一致

### Integration Points
- **`paladin_agent.py:create_paladin_agent()`** — 接入 `ToolGuard`（通过 `capabilities=` 参数）和 Computer Use 工具（通过 `tools=` 参数）
- **`config.json`** — 新增 `hitl` 顶级段
- **`App.tsx`** — 注册 `useHumanInTheLoop` hooks
- **`ChatToolbar.tsx`** — 升级为展示审批状态
- **Agent server** — 新增 `POST /approval/{request_id}` 端点和 SSE `approval_request` 事件

</code_context>

---

*Phase: 07-hitl-sidecar (7a: HITL + Computer Use)*
*Context gathered: 2026-07-01*
*Next step: /gsd-plan-phase 07*

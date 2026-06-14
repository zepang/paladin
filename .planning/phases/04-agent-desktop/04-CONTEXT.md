# Phase 4: Agent ↔ Desktop - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

## Phase Boundary

实现 Agent 通过 AG-UI 与前端的通信 — 打通 CopilotKit → AG-UI → Pydantic AI 全链路。核心目标是让 Phase 2 的聊天 UI 能够真正连接到 Phase 3 创建的 Python Agent。

**在 Phase 4 内：** AGT-03（CopilotKit Runtime 对接 AG-UI 端点）、流式对话全链路通、工具调用结果可视化
**不在 Phase 4：** 工具系统扩展（→ Phase 6）、Tauri sidecar 管理（→ Phase 7）

## Implementation Decisions

### AG-UI Endpoint Connection
- **D-01:** 前端直接 HTTP 连接到 Agent 的 AG-UI 端点 `http://localhost:9876/copilotkit`
- **D-02:** 保留 Phase 2 已配置的 `runtimeUrl`，无需修改前端配置
- **D-03:** FastAPI 端配置 CORS 允许前端来源，确保跨域请求正常

### Streaming Response Handling
- **D-04:** 使用 CopilotKit 默认流式处理机制（`useAgent` hook + `CopilotChat` 组件）
- **D-05:** 保持与 Phase 2 一致的逐 token 渲染动画效果
- **D-06:** 使用 CopilotKit 默认 Markdown 渲染（代码高亮、表格等）

### Tool Call Visualization
- **D-07:** 使用 CopilotKit 默认工具调用卡片组件展示工具调用
- **D-08:** 工具参数、执行状态、返回结果均使用 CopilotKit 内置样式展示
- **D-09:** 保持工具调用 UI 与整体聊天界面风格一致

### Error Handling Strategy
- **D-10:** 实现自定义错误提示机制，捕获 AG-UI 错误事件
- **D-11:** 错误场景分类处理：
  - Agent 未启动：提示用户启动 Agent 服务
  - 网络连接失败：提示检查网络或 Agent 状态
  - LLM 调用失败：显示友好的错误消息，提供重试按钮
  - 工具执行失败：显示具体错误原因
- **D-12:** 在聊天界面内展示错误提示，不打断用户操作流程

### Agent Startup Detection
- **D-13:** 前端启动时调用 `/health` 端点检测 Agent 是否运行
- **D-14:** Agent 未运行时显示友好提示（"请先启动 Agent 服务"），而不是连接失败后才报错
- **D-15:** 健康检查逻辑复用到 Phase 7 的 sidecar 自动管理中

### Conversation History Management
- **D-16:** 使用 CopilotKit 自动管理消息历史（`useAgent` hook）
- **D-17:** Zustand chat store 作为 UI 层备份，存储对话列表和 threadId（Phase 2 已有）
- **D-18:** Phase 8 时将 CopilotKit 消息历史同步到 Go Server（WebSocket + API）

### Thread ID Management
- **D-19:** 使用 CopilotKit 自动传递 thread_id，与 AG-UI 协议原生兼容
- **D-20:** Zustand 从 CopilotKit 获取 thread_id 并同步到 conversation.threadId 字段

### Claude's Discretion
以下实现细节由 Claude 在规划/执行阶段自主决定：
- CORS 具体配置（允许的来源、方法等）
- 错误提示组件的具体样式和位置
- 重试按钮的触发条件和次数限制
- 错误日志记录策略

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Docs
- `.planning/PROJECT.md` — Core value, key decisions, constraints
- `.planning/REQUIREMENTS.md` — v1 requirements (AGT-03)
- `.planning/ROADMAP.md` — Phase 4 goal and scope

### Prior Phase Context
- `.planning/phases/02-chat-ui/02-CONTEXT.md` — CopilotKit v2 集成决策
- `.planning/phases/03-ai-agent-core/03-CONTEXT.md` — AG-UI 端点设计（`localhost:9876/copilotkit`）

### AG-UI Protocol
- [AG-UI Protocol Specification](https://ag-ui.com/) — 事件类型、SSE 格式、协议规范

## Existing Code Insights

### Reusable Assets
- Phase 2 前端 `src/App.tsx` — 已配置 `runtimeUrl="http://localhost:9876/copilotkit"`
- Phase 3 Agent `src/server/main.py` — FastAPI 服务，`/copilotkit` AG-UI 端点

### Integration Points
- `apps/desktop/src/App.tsx` — CopilotKitProvider 的 runtimeUrl 已指向正确端点
- `apps/agent/src/server/main.py` — 需要确保 CORS 配置允许前端访问
- 新增错误提示组件：`src/components/ErrorToast.tsx` 或类似

## Specific Ideas

- 参考 cc-haha/desktop 的错误提示样式
- 错误提示使用 Toast 或 inline 消息形式，不阻塞主流程

## Deferred Ideas

- Tauri IPC 转发方案 — 留到需要更高安全性时再评估
- 自定义流式处理 — 留到需要独特 UI 效果时再考虑
- 定期健康检查 — 留到 Phase 7 sidecar 管理时作为监控机制
- 前端手动传递历史 — 留到需要自定义历史格式时再考虑

---

*Phase: 4-Agent ↔ Desktop*
*Context gathered: 2026-06-14*
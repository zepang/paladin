# Phase 4: Agent ↔ Desktop - Research

**Researched:** 2026-06-14
**Status:** Complete

## Research Scope

研究 CopilotKit v2 与 Pydantic AI AG-UI 端点的对接模式、错误处理机制、健康检查模式，以及现有代码库中的可复用模式.

---

## 1. CopilotKit v2 AG-UI 集成架构

### 1.1 Proxy 模式 vs 直连模式

CopilotKit v2 标准架构采用 **Proxy 模式**：前端 → Copilot Runtime → Agent 后端。前端通过 `CopilotKitProvider` 连接到 Runtime，Runtime 再转发请求到 Agent。

**但 CopilotKit v2 也支持直连模式**：`CopilotKitProvider` 的 `runtimeUrl` 可以直接指向 AG-UI 兼容端点。框架内部使用 `HttpAgent`（AG-UI client 库中的标准实现）直接 POST 到端点并通过 SSE 接收事件流。

**Paladin 采用直连模式**：
- Phase 2 已配置 `runtimeUrl="http://localhost:9876/copilotkit"`（`apps/desktop/src/App.tsx:79`）
- Agent 端暴露标准 AG-UI POST 端点（`apps/agent/src/server/main.py:69-84`）
- 无需 Copilot Runtime 中间层，减少组件依赖

**风险**：CopilotKit v2 启动时会调用 Runtime 的 `/info` 端点获取可用 Agent 列表。直连模式下，如果 `/info` 端点不存在，CopilotKit 可能降级为默认行为。需在 Phase 4 执行时验证此行为。

### 1.2 useAgent Hook

CopilotKit v2 的 `useAgent` hook（`@copilotkit/react-core/v2`）提供：

```
const { agent } = useAgent();
// agent.messages      — 对话历史
// agent.state         — Agent 当前状态
// agent.isRunning     — 是否正在运行
// agent.threadId      — 当前线程 ID
// agent.subscribe()   — 订阅 AG-UI 事件
```

**与现有代码的关系**：
- Zustand `chat.ts` 已预留 `threadId` 字段（`apps/desktop/src/stores/chat.ts:25`）
- Phase 2 的 `ChatView` 当前显示空消息列表（`apps/desktop/src/components/ChatView.tsx:38`），Phase 4 需接入 `useAgent` 获取真实消息
- Zustand `setMessages()` 方法当前为占位实现（`apps/desktop/src/stores/chat.ts:131`）

### 1.3 AG-UI 事件类型

| 类别 | 事件 | 用途 |
|------|------|------|
| 生命周期 | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR` | Agent 运行状态 |
| 文本消息 | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END` | 流式文本输出 |
| 工具调用 | `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT` | 工具调用生命周期 |
| 状态 | `STATE_SNAPSHOT`, `STATE_DELTA` | Agent 状态同步 |
| 消息 | `MESSAGES_SNAPSHOT` | 完整消息列表快照 |

**结论**：CopilotKit 的 `CopilotChat` 组件自动处理所有这些事件的 UI 渲染（包括流式文本、工具调用卡片）。Phase 4 不需要手动处理 AG-UI 事件。

---

## 2. 错误处理机制

### 2.1 CopilotKit 内置错误处理

CopilotKit v2 提供两层 `onError` 回调：

**Provider 级别**（`apps/desktop/src/App.tsx` 中 `CopilotKitProvider` 上）：
```tsx
<CopilotKitProvider
  runtimeUrl="http://localhost:9877/copilotkit"
  onError={(event) => {
    // event.code     — 错误代码
    // event.error    — Error 对象
    // event.context  — 附加上下文
  }}
  showDevConsole={true}  // 开发环境显示可视化错误面板
>
```

**Chat 级别**（`CopilotChat` / `CopilotSidebar` 上）：
```tsx
<CopilotChat
  onError={(event) => {
    showToast(`Agent 错误: ${event.error.message}`);
  }}
/>
```

### 2.2 错误代码映射

| 错误代码 | 含义 | 应对话 |
|---------|------|--------|
| `runtime_info_fetch_failed` | 无法访问 Runtime `/info` | "无法连接到 Agent 服务" |
| `agent_connect_failed` | Agent 连接失败 | "Agent 连接失败，请检查服务状态" |
| `agent_run_failed` | Agent 运行失败 | 显示错误详情 + 重试按钮 |
| `agent_run_error_event` | Agent 发出 RUN_ERROR | 显示具体错误消息 |
| `tool_argument_parse_failed` | 工具参数解析失败 | 内部错误，静默处理 |
| `tool_handler_failed` | 前端工具处理失败 | 内部错误，静默处理 |

### 2.3 错误处理策略建议

**分层处理**：
1. **连接前**（Agent 未启动）→ `useAgentHealth` hook + ErrorToast — Phase 4 实现
2. **连接中**（AG-UI 通信错误）→ CopilotKit `onError` 回调 — **推荐**（比自定义 ErrorToast 更完善）
3. **连接后**（LLM 调用失败）→ Agent 端 fallback 链处理 — Phase 3 已有

**关键发现**：自定义 `ErrorToast` 组件仅适合处理"连接前"场景（Agent 未启动）。"连接中"场景应使用 CopilotKit 内置 `onError` 机制，因为它：
- 已覆盖所有 AG-UI 错误类型
- 与 `showDevConsole` 调试面板集成
- 支持 Sentry/Datadog 等外部错误追踪
- 无需手动维护错误处理逻辑

---

## 3. Pydantic AI AG-UI 端点

### 3.1 当前实现状态

Agent 端使用 `handle_ag_ui_request()`（`apps/agent/src/server/main.py:80`），此 API 在 Pydantic AI 2.0 中将被移除，需迁移到 `AGUIAdapter.dispatch_request()`：

```python
# 新 API（Pydantic AI 2.0）
from pydantic_ai.ui import AGUIAdapter

@app.post("/copilotkit")
async def copilotkit_endpoint(request: Request) -> Response:
    return await AGUIAdapter.dispatch_request(
        agent=agent,
        request=request,
        deps=getattr(agent, '_default_deps', None),
    )
```

**决策**：Phase 4 不阻塞于此迁移。当前 API 工作正常，迁移可安排在 Phase 6（Agent Tools）。

### 3.2 CORS 配置

Agent 端已有 CORS 配置（`apps/agent/src/server/main.py:40-50`），允许 `localhost:1420`（Tauri dev）、`localhost:5173`（Vite dev）、`tauri://localhost`（生产）。当前配置已满足 Phase 4 需求。

### 3.3 /health 端点

已有健康检查端点（`apps/agent/src/server/main.py:87-104`），返回：
```json
{"status": "ok", "agent": "paladin-agent", "models": ["deepseek-v4-pro", "deepseek-v4-flash", "lm-studio-local"]}
```

---

## 4. 现有代码库模式分析

### 4.1 Hooks 模式

现有 hooks：
- `useAgentHealth`（`apps/desktop/src/hooks/useAgentHealth.ts`）— 已创建，使用 `useState` + `useEffect` + `useCallback` 模式
- 与 Zustand stores 风格一致（`theme.ts`、`window.ts`、`chat.ts`）

**模式规范**：
```typescript
export function useXxx() {
  const [state, setState] = useState<XxxState>({ ... });
  // 副作用用 useEffect
  // 回调用 useCallback 避免重渲染
  return { ...state, action };
}
```

### 4.2 组件模式

所有组件均为 React 函数组件 + Tailwind CSS：
- 使用 `@/` 路径别名导入
- 深色模式通过 `dark:` 前缀实现
- Props 接口定义在组件文件顶部

### 4.3 Zustand Store 模式

- 使用 `create<T>()(persist(...))` 模式（`chat.ts:42`）
- localStorage key 命名：`paladin-{name}`
- `version: 0` 用于迁移兼容
- Phase 4 需要同步 `threadId`：Zustand 生成初始值 → CopilotKit 连接后更新为真实 threadId

### 4.4 ChatView 现状

`ChatView`（`apps/desktop/src/components/ChatView.tsx`）当前显示空 `MessageList`，通过 Zustand 管理对话切换。Phase 4 需改造为接入 CopilotKit 的 `useAgent` 获取消息。

---

## 5. 健康检查模式

### 5.1 启动时检测（Phase 4 实现）

当前 `useAgentHealth` hook 在组件挂载时调用 `/health` 端点：
```typescript
useEffect(() => { checkHealth(); }, [checkHealth]);
```

**问题**：仅在挂载时调用一次，如果 Agent 后启动，需要手动重试。

### 5.2 定期健康检查（Phase 7）

Phase 7（HITL + Sidecar）需要定期健康检查，用于 sidecar 自动重启。Phase 4 的 `useAgentHealth` hook 设计为可扩展：`retry` 回调可被 Phase 7 复用。

---

## 6. threadId 对接

### 6.1 当前状态

- Zustand `chat.ts` 中 `Conversation.threadId` 使用 `crypto.randomUUID()` 生成
- CopilotKit `useAgent` 的 `agent.threadId` 由 AG-UI 协议自动管理

### 6.2 对接策略

1. 用户创建新对话 → Zustand 生成 `threadId`（Phase 2 行为）
2. CopilotKit 连接后 → `agent.threadId` 可能与 Zustand 的 `threadId` 不同
3. **建议**：以 Zustand 的 `threadId` 为权威来源，不强制同步 CopilotKit 的 `threadId`

AG-UI 协议中 `threadId` 用于关联对话历史，但 Paladin 使用 Zustand 管理对话列表，threadId 的一致性不影响功能。

---

## 7. 关键技术决策总结

| 决策 | 方案 | 依据 |
|------|------|------|
| 连接模式 | 直连 AG-UI（不用 Copilot Runtime） | 减少组件依赖，Phase 2 已配置 |
| 错误处理 | CopilotKit `onError` 为主，ErrorToast 为辅 | 覆盖更全、可扩展 |
| 错误信息展示 | `showDevConsole`（dev）+ `onError` 回调（prod） | 区分开发/生产环境 |
| Pydantic AI 迁移 | 延后到 Phase 6 | Phase 4 不阻塞 |
| 健康检查 | 启动时单次检测（可手动重试） | Phase 7 才需定期检测 |
| threadId | Zustand 权威，不与 CopilotKit 强制同步 | AG-UI threadId 仅内部使用 |
| ChatView 改造 | 接入 `useAgent` 替代空消息列表 | Phase 2 占位代码需更新 |

---

## 8. 开源问题和风险

| 风险 | 等级 | 缓解措施 |
|------|------|----------|
| CopilotKit 直连模式 `/info` 端点行为未知 | 中 | Phase 4 执行时优先验证 |
| `handle_ag_ui_request` 废弃警告 | 低 | 功能正常，Phase 6 修复 |
| CopilotSidebar 与健康检查状态的交互 | 低 | Sidebar 在 Agent 在线后才渲染 |

---

## 9. 验证架构

### 9.1 单元测试
- `useAgentHealth` hook 测试：模拟 `/health` 响应（200/500/网络错误）
- `ErrorToast` 组件测试：各类型渲染、重试按钮回调

### 9.2 集成测试
- **AG-UI 全链路**：启动 Agent → 前端连接 → 发送消息 → 验证流式响应
- **错误场景**：Agent 未启动 → 验证健康检查报错 + 友好提示
- **重试场景**：Agent 后启动 → 点击重试 → 验证自动连接

### 9.3 手动验收
- [ ] Agent 启动后前端显示聊天界面
- [ ] Agent 未启动时显示友好错误提示 + 重试按钮
- [ ] 点击重试后能成功连接
- [ ] 流式消息逐 token 渲染
- [ ] 工具调用卡片正常显示
- [ ] Markdown 渲染正确（代码高亮、表格）

---

*Research completed: 2026-06-14*

# Phase 4: Agent ↔ Desktop - Plan

**Created:** 2026-06-14
**Updated:** 2026-06-14 (基于 RESEARCH.md 更新)
**Status:** Ready for execution

## Phase Boundary

实现 Agent 通过 AG-UI 与前端通信 — 打通 CopilotKit → AG-UI → Pydantic AI 全链路。

**Requirements:** AGT-03

## Research Key Findings

| 发现 | 影响的决策 |
|------|-----------|
| CopilotKit v2 支持直连 AG-UI 端点（无需 Copilot Runtime） | 保持 Phase 2 的直连 `runtimeUrl` 配置 |
| CopilotKit `onError` 比自定义 ErrorToast 更完善 | 错误处理分两层：启动前用 ErrorToast，连接中用 `onError` |
| `showDevConsole` 提供可视化调试面板 | 开发模式启用，生产关闭 |
| `handle_ag_ui_request` 将在 Pydantic AI 2.0 废弃 | 延后迁移，Phase 6 处理 |
| CopilotKit v2 启动时调用 `/info` 端点 | 需验证直连模式下的降级行为 |
| Zustand `threadId` 与 CopilotKit `agent.threadId` 可独立 | 不做强制同步，Zustand 为权威来源 |

## Wave Overview

| Wave | Focus | Est. |
|------|-------|------|
| 1 | Agent 端 CORS 配置 | 已存在 |
| 2 | 前端健康检查 + ErrorToast | 已完成 |
| 3 | CopilotKit `onError` 集成 + `showDevConsole` | 1h |
| 4 | ChatView 改造接入 `useAgent` 消息流 | 1h |
| 5 | 端到端测试验证 | 30 min |

---

## Wave 1: Agent 端 CORS 配置

**Status:** 已存在，无需修改

`apps/agent/src/server/main.py:40-50` 已配置 CORS，允许 `localhost:1420`、`localhost:5173`、`tauri://localhost`。

---

## Wave 2: 前端健康检查 + ErrorToast

**Status:** 已完成

**已创建文件：**
- `apps/desktop/src/hooks/useAgentHealth.ts` — 健康检查 hook
- `apps/desktop/src/components/ErrorToast.tsx` — 错误提示组件

**已修改文件：**
- `apps/desktop/src/App.tsx` — 集成健康检查，三种状态渲染（加载中/Agent离线/正常聊天）
- `apps/desktop/src/index.css` — 添加 `animate-slide-up` 动画

**Verification:** TypeScript 编译通过

---

## Wave 3: CopilotKit `onError` 集成 + `showDevConsole`

### 任务 3.1: 添加 CopilotKitProvider 错误处理

**Files Modified:**
- `apps/desktop/src/App.tsx`

**Implementation:**

在 `CopilotKitProvider` 上添加 `onError` 回调和 `showDevConsole`：

```tsx
<CopilotKitProvider 
  runtimeUrl="http://localhost:9877/copilotkit"
  onError={(event) => {
    // 错误码映射到友好消息
    const errorMessages: Record<string, string> = {
      runtime_info_fetch_failed: '无法连接到 Agent 服务',
      agent_connect_failed: 'Agent 连接失败，请检查服务状态',
      agent_run_failed: 'Agent 运行失败',
      agent_run_error_event: 'Agent 内部错误',
    };
    const friendly = errorMessages[event.code] || event.error.message;
    console.error(`[CopilotKit ${event.code}]`, event.error);
    // Phase 8: 发送到 Go Server 日志系统
  }}
  showDevConsole={import.meta.env.DEV}  // 开发环境启用可视化调试面板
>
```

**效果**：
- 连接中发生的 AG-UI 错误由 CopilotKit 内置机制处理
- 开发环境显示可视化错误面板
- 生产环境静默记录到控制台（Phase 8 接入日志系统）

---

## Wave 4: ChatView 改造接入 `useAgent` 消息流

### 任务 4.1: 重构 ChatView 接入 CopilotKit 消息

**Files Modified:**
- `apps/desktop/src/components/ChatView.tsx`

**Implementation:**

从 Phase 2 的空消息列表改为接入 CopilotKit 的 `useAgent`：

```tsx
import { useAgent } from '@copilotkit/react-core/v2';
import { useChatStore } from '@/stores/chat';
import { MessageList } from './MessageList';
import { WelcomePage } from './WelcomePage';

export function ChatView() {
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const conversations = useChatStore((s) => s.conversations);
  const { agent } = useAgent();  // 接入 CopilotKit Agent

  const currentConversation = conversations.find(
    (c) => c.id === currentThreadId
  );

  if (!currentThreadId || !currentConversation) {
    return <WelcomePage />;
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* 对话标题栏 */}
      <div className="flex items-center h-10 px-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-sm font-medium text-gray-700 dark:text-gray-300 truncate">
          {currentConversation.title}
        </h2>
      </div>
      {/* 消息区域 — 使用 CopilotKit agent.messages 替代空数组 */}
      <MessageList messages={agent.messages} />
    </div>
  );
}
```

**关键点**：
- `useAgent()` 必须在 `CopilotKitProvider` 内部调用，因此当 Agent 离线时不渲染此组件
- `agent.messages` 类型可能与现有 `ChatMessage` 不同，需要适配或转换
- 消息列表仍使用 CopilotSidebar 管理，ChatView 仅显示当前对话内容

### 任务 4.2: 消息类型适配

**Files Modified:**
- `apps/desktop/src/components/MessageList.tsx`

`agent.messages` 来自 AG-UI 协议（`@ag-ui/core` 的 `Message` 类型），与现有 `ChatMessage` 不同。需要适配转换或使用泛型。

**方案 A（推荐）**：修改 `MessageList` 接收 AG-UI Message 类型
**方案 B**：在 ChatView 中转换消息格式

采用方案 A，直接使用 CopilotKit 的消息类型，减少转换开销。

---

## Wave 5: 端到端测试验证

### 任务 5.1: 验证 /info 端点行为

CopilotKit v2 启动时调用 `/info` 获取 Agent 列表。直连 AG-UI 端点时此端点不存在。

**验证步骤**：
1. 启动 Agent 服务 `uv run paladin-agent serve --dev --port 9877`
2. 启动前端 `pnpm tauri dev`
3. 观察浏览器控制台是否有 `/info` 404 错误
4. 如有问题，在 Agent 端添加 `/info` 端点：
```python
@app.get("/info")
async def info():
    return JSONResponse({"agents": [{"name": "default", "type": "ag-ui"}]})
```

### 任务 5.2: 测试流式对话

1. Agent 启动后前端应显示聊天界面（非错误页面）
2. 在 CopilotSidebar 输入框中输入问题
3. 观察流式响应逐 token 渲染
4. 验证 Markdown 渲染（代码高亮、表格）

### 任务 5.3: 测试工具调用

1. 发送需要工具调用的请求（如"在当前目录创建一个 README.md"）
2. 观察工具调用卡片展示
3. 验证参数和结果正确渲染

### 任务 5.4: 测试错误场景

1. 关闭 Agent 服务 → 前端应显示"Agent 服务未启动"提示 + 重试按钮
2. 点击重试 → Agent 未启动则保持错误状态
3. 启动 Agent → 点击重试 → 前端应切换到聊天界面
4. 对话中关闭 Agent → CopilotKit `onError` 应触发

---

## Success Criteria

| Criterion | Description | Verification |
|-----------|-------------|--------------|
| AGT-03 | CopilotKit → AG-UI → Pydantic AI 全链路通 | 聊天消息正常收发 |
| 流式响应 | 逐 token 渲染正常 | 观察流式输出效果 |
| 工具调用 | 工具调用卡片正常展示 | 测试文件创建等功能 |
| 错误处理 | Agent 离线显示友好提示 + 重试 | 关闭 Agent 测试 |
| onError 集成 | CopilotKit 连接中错误由 onError 处理 | 观察控制台/调试面板 |
| showDevConsole | 开发环境显示可视化错误面板 | 观察 CopilotKit Dev Console |

---

## Security Considerations

- CORS 配置在生产环境需要限制来源
- Agent 端口仅监听 localhost
- 错误消息不暴露敏感信息
- `showDevConsole` 仅开发环境启用

---

## Risk Items

| Risk | Level | Mitigation |
|------|-------|-----------|
| CopilotKit 直连模式 `/info` 端点行为未知 | 中 | Wave 5 优先验证，必要时添加 `/info` 端点 |
| `agent.messages` 类型不兼容现有 `MessageList` | 低 | Wave 4 适配，使用 AG-UI 原生类型 |

---

*Phase: 4-Agent ↔ Desktop*
*Plan created: 2026-06-14*
*Plan updated: 2026-06-14 (based on RESEARCH.md)*
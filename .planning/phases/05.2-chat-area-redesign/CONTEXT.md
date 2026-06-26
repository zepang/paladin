# Phase 05.2 Context — Chat Area Redesign

## 目标

用 CopilotKit v2 的 `CopilotChat` 组件替换当前手写的消息组件，重构对话区域布局，新增 Agent 状态条和右侧工具栏。

## 决策

### D1: CopilotChat 替换手写组件
- **决策**：用 `CopilotChat` 替换 `MessageList` + `MessageBubble` + `ChatView` + `WelcomePage`
- **原因**：CopilotChat 自带居中窄列布局（`max-w-3xl mx-auto`）、内置输入框、欢迎屏、虚拟滚动、建议提示
- **影响**：4 个文件将被废弃/删除，App.tsx 布局重构

### D2: 移除 CopilotSidebar 浮层
- **决策**：CopilotChat 直接嵌入主区域，不再使用 CopilotSidebar 浮层
- **原因**：CopilotSidebar 是非受控组件，状态同步困难（已导致双击 bug）；直接嵌入更可控
- **影响**：ChatToggle 按钮改为控制左侧对话列表折叠/展开

### D3: 侧边栏折叠
- **决策**：左侧对话列表可折叠，完全收起（w-0），边缘留展开按钮
- **实现**：Zustand store 管理 `sidebarCollapsed` 状态，CSS transition 过渡

### D4: Agent 状态条
- **决策**：对话区域顶部显示 Agent 运行状态条
- **数据源**：`useAgent()` hook 的 `agent.isRunning` + `agent.messages`

### D5: 右侧工具栏
- **决策**：新增右侧固定工具栏，包含上下文信息和快捷操作
- **内容**：
  - 上下文：当前模型、线程 ID、消息数、工具调用列表
  - 操作：清空对话、切换模型（占位，Phase 6 实现）
- **约束**：Token 用量当前版本无法直接获取，暂不显示

### D6: Diff 渲染保留
- **决策**：CopilotChat 的 markdown 渲染可能不支持 diff 代码块解析，保留 DiffMessageCard 逻辑
- **方案**：通过 `messageView` 插槽自定义消息渲染，在 assistant 消息中检测 diff 内容并渲染 DiffMessageCard

## 范围

### 包含
- App.tsx 布局重构（三栏：折叠侧边栏 + CopilotChat + 右侧工具栏）
- CopilotChat 集成 + 自定义 messageView 插槽
- Agent 状态条组件
- 右侧工具栏组件
- 侧边栏折叠状态管理
- ChatToggle 按钮行为改为侧边栏折叠
- 删除 ChatView.tsx、MessageList.tsx、MessageBubble.tsx、WelcomePage.tsx

### 不包含
- Token 用量统计（Phase 6）
- 模型切换功能（Phase 6）
- 工具调用详情查看（Phase 6）
- CopilotSidebar 浮层模式保留（移除）

## 技术约束

- CopilotKit v2 `cpk:` CSS 前缀与 shadcn 不冲突
- `useAgent()` 必须在 `CopilotKitProvider` 内使用
- `CopilotChat` 的 `className` 透传到根 div，可用于布局
- `chatView` 插槽可完全替换默认 View，但需自行处理滚动/输入

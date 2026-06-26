# Phase 05.2 Plan — Chat Area Redesign

## 概述

用 CopilotKit v2 CopilotChat 替换手写消息组件，重构三栏布局，新增 Agent 状态条和右侧工具栏。

**5 个 Wave，顺序执行：**

---

## Wave 05.2-01: 侧边栏折叠 + 布局骨架

**目标：** 实现侧边栏折叠/展开，搭建三栏布局骨架

**文件变更：**
- `src/stores/ui.ts`（新建）— `sidebarCollapsed` 状态 + `toggleSidebar` 方法
- `src/App.tsx` — 三栏布局：折叠侧边栏 + 对话区域 + 右侧工具栏占位
- `src/components/Titlebar.tsx` — ChatToggle 按钮改为控制侧边栏折叠
- `src/components/SidebarToggle.tsx`（新建）— 侧边栏展开按钮（折叠时显示在左边缘）

**任务：**
1. 创建 `useUIStore` (Zustand) — `sidebarCollapsed: boolean` + `toggleSidebar()`
2. App.tsx: `<aside>` 从固定 `w-64` 改为条件 `w-64` / `w-0`，加 `transition-all duration-200`
3. ChatToggle 的 `onClick` 从 `toggleSidebar` (CopilotSidebar key) 改为 `useUIStore.toggleSidebar`
4. 折叠时在对话区域左边缘显示展开按钮
5. 移除 `sidebarKey` 状态和 `CopilotSidebar` 渲染（不再使用浮层）
6. 右侧工具栏区域先放占位 div

**验证：** tsc --noEmit + build 通过，侧边栏可折叠/展开

---

## Wave 05.2-02: CopilotChat 集成

**目标：** 用 CopilotChat 替换 ChatView + MessageList + MessageBubble

**文件变更：**
- `src/components/ChatArea.tsx`（新建）— CopilotChat 集成容器
- `src/App.tsx` — 用 ChatArea 替换 ChatView
- `src/components/ChatView.tsx` — 删除
- `src/components/MessageList.tsx` — 删除
- `src/components/WelcomePage.tsx` — 删除

**任务：**
1. 创建 `ChatArea.tsx` — 包含 `<CopilotChat className="flex-1" />` 
2. CopilotChat 放在主区域，使用默认 View（自带居中窄列 + 输入框 + 欢迎屏）
3. 从 `useChatStore` 获取 `currentThreadId`，传给 CopilotChat 的 `threadId`
4. 无选中对话时不渲染 CopilotChat，显示简单欢迎文字
5. App.tsx 中用 `<ChatArea />` 替换 `<ChatView />`
6. 删除 ChatView.tsx、MessageList.tsx、WelcomePage.tsx

**验证：** tsc --noEmit + build 通过，CopilotChat 正常显示消息和输入框

---

## Wave 05.2-03: 自定义消息渲染 + Diff 保留

**目标：** 通过 messageView 插槽保留 DiffMessageCard 功能

**文件变更：**
- `src/components/ChatMessageView.tsx`（新建）— 自定义消息渲染
- `src/components/MessageBubble.tsx` — 重构为 ChatMessageView 子组件，或提取 diff 检测逻辑
- `src/components/ChatArea.tsx` — 传入 `messageView` 插槽

**任务：**
1. 创建 `ChatMessageView.tsx` — 接收 `messages` 和 `isRunning`，渲染消息列表
2. 保留 MessageBubble 的 diff 检测逻辑（`extractDiffBlocks`），复用到新组件
3. 用户消息：简单气泡（右对齐）
4. AI 消息：markdown 渲染 + DiffMessageCard 内嵌
5. 在 ChatArea 中通过 `messageView` 插槽传入自定义渲染
6. 如果 CopilotChat 默认渲染已够用，可跳过此 Wave（验证后决定）

**验证：** tsc --noEmit + build 通过，diff 代码块正确渲染为 DiffMessageCard

---

## Wave 05.2-04: Agent 状态条

**目标：** 对话区域顶部显示 Agent 运行状态

**文件变更：**
- `src/components/AgentStatusBar.tsx`（新建）— Agent 状态条
- `src/components/ChatArea.tsx` — 集成状态条

**任务：**
1. 创建 `AgentStatusBar.tsx` — 使用 `useAgent()` 获取 `agent.isRunning`
2. isRunning=true 时显示状态条：脉冲圆点 + "Agent 正在思考..."
3. isRunning=false 时不渲染（高度为 0 或 display:none）
4. 状态条放在 CopilotChat 上方
5. 使用 shadcn token 配色

**验证：** tsc --noEmit + build 通过，发送消息后状态条出现

---

## Wave 05.2-05: 右侧工具栏

**目标：** 新增右侧固定工具栏，显示上下文信息和快捷操作

**文件变更：**
- `src/components/ChatToolbar.tsx`（新建）— 右侧工具栏
- `src/App.tsx` — 用 ChatToolbar 替换占位 div

**任务：**
1. 创建 `ChatToolbar.tsx` — 固定宽度 (w-56) 右侧面板
2. 上下文信息区域：
   - 当前模型（从 agent 配置或硬编码）
   - 线程 ID（截断显示）
   - 消息数（`agent.messages.length`）
3. 工具调用区域：
   - 遍历 `agent.messages` 提取 `toolCalls`
   - 显示工具名称列表
4. 快捷操作区域：
   - 清空对话（重置线程）
   - 切换模型（占位按钮，Phase 6 实现）
5. 使用 shadcn token + lucide 图标
6. 可折叠（与侧边栏折叠类似的模式，或固定显示）

**验证：** tsc --noEmit + build 通过，工具栏显示上下文信息和操作按钮

---

## 依赖关系

```
05.2-01 (侧边栏折叠) → 05.2-02 (CopilotChat)
05.2-02 (CopilotChat) → 05.2-03 (自定义渲染)
05.2-02 (CopilotChat) → 05.2-04 (状态条)
05.2-01 (布局骨架) → 05.2-05 (工具栏)
```

05.2-03、05.2-04、05.2-05 可并行，但为安全起见顺序执行。

## 废弃文件

| 文件 | Wave | 替代 |
|------|------|------|
| ChatView.tsx | 05.2-02 | ChatArea.tsx |
| MessageList.tsx | 05.2-02 | CopilotChat 内置 |
| WelcomePage.tsx | 05.2-02 | CopilotChat 内置 |
| MessageBubble.tsx | 05.2-03 | ChatMessageView.tsx (如需要) |

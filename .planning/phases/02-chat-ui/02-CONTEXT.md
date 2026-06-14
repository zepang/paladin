# Phase 2: Chat UI - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

## Phase Boundary

在 Phase 1 桌面骨架之上集成 CopilotKit — 一个可交互的聊天界面，支持流式输出、对话历史管理、CopilotSidebar 侧边栏模式。Phase 2 无真实后端，使用 BuiltInAgent + InMemoryAgentRunner 模拟 Agent 行为。

## Implementation Decisions

### Chat Layout
- **D-01:** 使用 CopilotSidebar 可折叠侧边栏模式，Titlebar 下方为主内容区 + 侧边栏
- **D-02:** Sidebar 默认关闭，宽度 400px
- **D-03:** Sidebar 关闭时展示精美欢迎页（品牌标识 + "开始新对话" 按钮 + 历史对话快捷入口）
- **D-04:** Sidebar 开关按钮放在 Titlebar 右侧区域，与 ThemeToggle 同排

### CopilotKit Integration
- **D-05:** 使用 CopilotKit v1.50+，导入路径使用 v2：`@copilotkit/react-core/v2`、`@copilotkit/react-ui/v2`
- **D-06:** Phase 2 使用 BuiltInAgent + InMemoryAgentRunner，无需后端依赖。后续 Phase 4 替换为真实 Agent
- **D-07:** CopilotKit Provider 包裹 App.tsx 最外层
- **D-08:** CopilotKit styles 在 main.tsx 中 import：`import '@copilotkit/react-ui/v2/styles.css'`

### Conversation History
- **D-09:** 对话列表用 localStorage + Zustand persist 存储，与现有 Theme store 模式一致
- **D-10:** 对话选择器放在 CopilotSidebar 内部顶部，Tab 式切换
- **D-11:** 新建对话入口：Sidebar 顶部 "+" 按钮 + 欢迎页 "开始新对话" 大按钮
- **D-12:** 自行维护对话列表（Zustand store），每条对话存储 `threadId` 字段供 Phase 4 CopilotKit 线程管理对接
- **D-13:** 对话数据结构：`{ id, threadId, title, createdAt, lastMessage, messageCount }`
- **D-14:** 对话标题可编辑（点击重命名），默认标题为首条用户消息截断

### Chat State Management
- **D-15:** 职责分工 — Zustand chat store 管理对话列表/当前 threadId/UI 状态；CopilotKit useAgent 管理消息/流式/运行状态

### Streaming Experience
- **D-16:** 使用 CopilotKit 默认 Markdown 渲染（代码高亮、表格等），不做额外自定义
- **D-17:** 消息工具栏：CopilotKit 默认按钮 + 重新生成按钮
- **D-18:** 流式输出使用 CopilotKit 默认动画（逐 token 渲染 + 闪烁光标）

### Dark Mode Compatibility
- **D-19:** 通过 CopilotKit slots 系统轻度定制关键颜色（背景、文字、边框），使其与 Paladin 的 `gray-900`/`gray-100` 色系呼应

### Error & Empty State
- **D-20:** 发消息失败使用 CopilotKit 默认错误处理
- **D-21:** Sidebar 初始空状态展示 3-4 个建议卡片 + 输入框（"解释这段代码" / "帮我调试" / "重构建议"）

### Input Area
- **D-22:** 键盘快捷键保持 CopilotKit 默认行为
- **D-23:** 输入框占位符文案：`"Ask anything..."`

### Conversation Switching
- **D-24:** 切换对话时滚动到最新消息（底部）

### Delete Confirmation
- **D-25:** 删除对话需二次确认，删除后自动切换到下一个最近对话（无对话则新建）

### Timestamps & Avatars
- **D-26:** 时间分组显示（"今天"/"昨天"/日期分隔线）
- **D-27:** 使用 CopilotKit 默认 Avatar 显示

### Performance
- **D-28:** 消息列表使用 react-virtuoso 虚拟滚动，保证长对话流畅

### Labels & Copy
- **D-29:** CopilotKit labels 保持英文默认

### Claude's Discretion
以下决定由 Claude 在讨论中选择（用户明确说 "你决定"）：
- Sidebar 开关按钮放 Titlebar、BuiltInAgent+InMemoryAgentRunner、localStorage+Zustand persist、侧边栏内 Tab 式对话选择器、Zustand+CopilotKit 职责分工、暗色模式轻度定制、建议卡片空状态、"Ask anything..." placeholder、滚动到底部、删除确认弹窗

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### CopilotKit
- [CopilotKit v1.50 Release](https://www.copilotkit.ai/blog/copilotkit-v1-50-release-announcement-whats-new-for-agentic-ui-builders) — useAgent hook, thread persistence, InMemoryAgentRunner
- [CopilotKit Prebuilt Components (Pydantic AI)](https://docs.copilotkit.ai/pydantic-ai/prebuilt-components) — CopilotChat, CopilotSidebar, CopilotPopup usage
- [CopilotSidebar Props Reference](https://www.mintlify.com/CopilotKit/CopilotKit/components/copilot-sidebar) — defaultOpen, width, header, toggleButton
- [CopilotKit Slots System](https://docs.copilotkit.ai/integrations/agent-spec/custom-look-and-feel/slots) — 3-level customization (Tailwind classes, props override, custom components)

### Existing System
- `apps/desktop/src/App.tsx` — Current layout with Titlebar + empty `<main>`
- `apps/desktop/src/components/Titlebar.tsx` — Titlebar with ThemeToggle, needs chat toggle button
- `apps/desktop/src/stores/theme.ts` — Zustand store pattern to follow for chat store
- `apps/desktop/src/index.css` — Tailwind 4 + dark mode variant

### Requirements
- `.planning/REQUIREMENTS.md` — CHT-01 through CHT-04

## Existing Code Insights

### Reusable Assets
- **Zustand persist pattern**: `theme.ts` demonstrates persist middleware with localStorage — directly applicable to chat store
- **Titlebar component**: Has a right-side control area where ThemeToggle lives — chat toggle button goes here
- **Tailwind dark mode**: `class="dark"` strategy already proven — CopilotKit components will follow automatically

### Established Patterns
- Biome single quotes, 2-space indent, no non-null assertions, a11y (SVG titles, button types)
- Zustand stores in `src/stores/`, components in `src/components/`
- Tauri window event listeners in useEffect (App.tsx)
- TypeScript strict mode

### Integration Points
- `App.tsx` → wrap with `<CopilotKit>`
- `Titlebar.tsx` → add chat toggle button
- `main.tsx` → import CopilotKit styles
- New `src/stores/chat.ts` → conversation list + current threadId
- New files in `src/components/` → custom CopilotKit sub-components as needed

## Specific Ideas

- 欢迎页参考 Cursor/VS Code 启动页风格
- 新对话按钮统一用 "+" 加号图标

## Deferred Ideas

None — discussion stayed within phase scope.

---

*Phase: 2-Chat UI*
*Context gathered: 2026-06-14*

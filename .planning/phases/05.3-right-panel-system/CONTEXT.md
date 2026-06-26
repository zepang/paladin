# Phase 05.3 Context — Right Panel System

## 目标

将右侧的 RightDrawer（Sheet 浮层）替换为固定的多视图面板，支持终端/文件预览/Diff 审查三种可切换视图。

## 决策

### D1: 固定面板替代 Sheet 浮层
- **决策**：用固定宽度面板替代当前 `Sheet`（shadcn Dialog side="right"）
- **原因**：Sheet 是浮层，会覆盖内容；固定面板与左侧栏/对话区域/工具栏平级，布局更清晰
- **影响**：删除 `RightDrawer.tsx`，新建 `RightPanel.tsx`

### D2: 三种视图类型
- **决策**：`activeView: 'terminal' | 'file-preview' | 'diff'`
- **扩展**：`terminal` store 的 `activePanel` 从 `'terminal' | 'diff'` 扩展为 `'terminal' | 'file-preview' | 'diff'`

### D3: 文件预览需要 Rust 后端支持
- **决策**：新增 Tauri command `read_text_file` 读取文件内容
- **原因**：Tauri 2 不含 `@tauri-apps/plugin-fs`，需自行实现或添加插件
- **方案**：在 `lib.rs` 中注册 `read_text_file` command，用标准库 `std::fs::read_to_string`

### D4: 代码高亮方案
- **决策**：使用 `shiki`（VS Code 同款，已内置在 CopilotKit 依赖树中）
- **备选**：`highlight.js`（更轻量但效果差）
- **约束**：需验证 shiki 是否已作为传递依赖可用，否则需要安装

### D5: 面板宽度
- **决策**：固定 400px，支持拖拽调整（复用已有 `panelWidth` store 状态）
- **约束**：最小 300px，最大 800px

### D6: 视图切换触发
- **Titlebar 按钮**：终端按钮 → terminal 视图，Diff 按钮 → diff 视图
- **Agent 文件路径**：Agent 回复中包含文件路径时，自动切换到 file-preview 视图
- **手动点击**：文件树中的文件点击（文件树本身不在本 Phase 范围，仅预留接口）

## 范围

### 包含
- 固定右侧面板容器（替代 Sheet）
- 三种视图切换：终端 / 文件预览 / Diff 审查
- Rust `read_text_file` command
- 文件预览组件（代码高亮 + Markdown 渲染 + 图片）
- 视图切换 Tab 栏
- Titlebar 按钮适配新视图类型

### 不包含
- 文件树组件（Phase 6 或更后）
- Agent 自动检测文件路径并打开预览（需 Agent Tools 支持，留待 Phase 6）
- 面板拖拽调整宽度（可选，优先级低）
- Token 用量统计（Phase 6）

## 技术约束

- Tauri 2 后端需新增 `read_text_file` command
- `shiki` 可能需要额外安装（验证依赖树）
- 终端面板的 PTY 逻辑（spawn/write/resize/close）保持不变
- Diff 面板当前为占位，实际 diff 数据来自聊天消息中的 `DiffMessageCard`

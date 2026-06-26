# Phase 05.3 Plan — Right Panel System

## 概述

将 RightDrawer（Sheet 浮层）替换为固定多视图面板，支持终端/文件预览/Diff 审查三种视图。

**4 个 Wave，顺序执行：**

---

## Wave 05.3-01: 固定面板容器 + 视图切换

**目标：** 用固定面板替代 Sheet 浮层，实现视图切换 Tab 栏

**文件变更：**
- `src/stores/terminal.ts` — `activePanel` 类型扩展为 `'terminal' | 'file-preview' | 'diff'`
- `src/components/layout/RightPanel.tsx`（新建）— 固定面板容器 + Tab 切换栏
- `src/App.tsx` — 用 `RightPanel` 替换 `RightDrawer`
- `src/components/layout/RightDrawer.tsx` — 删除

**任务：**
1. `terminal.ts`：`activePanel` 类型从 `'terminal' | 'diff'` 改为 `'terminal' | 'file-preview' | 'diff'`
2. 创建 `RightPanel.tsx`：
   - 固定宽度 `w-[400px]` 面板（替代 Sheet 浮层）
   - 顶部 Tab 栏：终端 / 文件 / Diff 三个图标按钮
   - 根据 `activePanel` 切换内容区域
   - 面板可通过 `isOpen` 控制显示/隐藏
3. 将 RightDrawer 中的终端 PTY 逻辑（spawn/write/channel）迁移到 RightPanel
4. App.tsx 中用 `<RightPanel />` 替换 `<RightDrawer />`
5. 删除 `RightDrawer.tsx`
6. Titlebar 按钮逻辑适配：终端按钮设 `activePanel: 'terminal'`，Diff 按钮设 `activePanel: 'diff'`

**验证：** tsc --noEmit + build 通过，终端面板正常工作，Tab 切换正常

---

## Wave 05.3-02: Rust read_text_file command

**目标：** 新增 Tauri command 读取文件内容

**文件变更：**
- `src-tauri/src/lib.rs` — 注册 `read_text_file` command
- `src-tauri/src/file_commands.rs`（新建）— 文件读取逻辑

**任务：**
1. 创建 `file_commands.rs`：
   ```rust
   #[tauri::command]
   fn read_text_file(path: String) -> Result<String, String> {
       std::fs::read_to_string(&path).map_err(|e| e.to_string())
   }
   ```
2. 在 `lib.rs` 中 `mod file_commands;` 并注册到 `invoke_handler`
3. 前端类型声明：`src/lib/tauri-commands.ts`（新建）— `invoke('read_text_file', { path })` 封装

**验证：** `cargo build` 通过，前端可调用 `read_text_file` 读取文件

---

## Wave 05.3-03: 文件预览组件

**目标：** 实现文件预览视图，支持代码高亮 + Markdown + 图片

**文件变更：**
- `src/components/panel/FilePreview.tsx`（新建）— 文件预览组件
- `src/stores/file-preview.ts`（新建）— 文件预览状态（当前文件路径、内容、加载状态）
- `src/components/layout/RightPanel.tsx` — 集成 FilePreview

**任务：**
1. 创建 `useFilePreviewStore`：
   - `filePath: string | null`
   - `content: string | null`
   - `isLoading: boolean`
   - `error: string | null`
   - `openFile(path: string)` — 调用 `read_text_file`，设置 content
   - `closeFile()`
2. 创建 `FilePreview.tsx`：
   - 文件路径标题栏（显示文件名 + 关闭按钮）
   - 加载状态 spinner
   - 错误状态
   - 代码文件：语法高亮（使用 `shiki` 或 fallback 到 `<pre>` 纯文本）
   - Markdown 文件（.md）：用 `react-markdown` 或简单解析渲染
   - 图片文件（.png/.jpg/.svg 等）：`<img>` 标签显示 `convertFileSrc`
   - 其他文件：纯文本 `<pre>`
3. RightPanel 中 `activePanel === 'file-preview'` 时渲染 `<FilePreview />`
4. 无文件打开时显示空状态提示

**验证：** tsc --noEmit + build 通过，手动调用 `openFile` 可显示文件内容

---

## Wave 05.3-04: Diff 审查视图

**目标：** 实现独立的 Diff 审查视图（替代当前占位文字）

**文件变更：**
- `src/components/panel/DiffReview.tsx`（新建）— Diff 审查视图
- `src/components/layout/RightPanel.tsx` — 集成 DiffReview
- `src/stores/diff.ts` — 扩展，支持右侧面板的 Diff 数据

**任务：**
1. 创建 `DiffReview.tsx`：
   - 复用 `@git-diff-view/react` 的 `DiffView` 组件
   - 从 `useDiffStore` 获取 diff 数据
   - 支持多文件 diff 切换（文件列表 + 当前 diff 展示）
   - Unified/Split 模式切换
   - 空状态提示："在聊天消息中查看代码变更"
2. RightPanel 中 `activePanel === 'diff'` 时渲染 `<DiffReview />`
3. 当聊天消息中的 `DiffMessageCard` 被点击"在面板中查看"时，切换到 diff 视图

**验证：** tsc --noEmit + build 通过，Diff 面板显示 diff 内容

---

## 依赖关系

```
05.3-01 (面板容器) → 05.3-03 (文件预览)
05.3-01 (面板容器) → 05.3-04 (Diff 审查)
05.3-02 (Rust command) → 05.3-03 (文件预览)
```

05.3-02 可与 05.3-01 并行，05.3-03 和 05.3-04 可并行。

## 废弃文件

| 文件 | Wave | 替代 |
|------|------|------|
| RightDrawer.tsx | 05.3-01 | RightPanel.tsx |

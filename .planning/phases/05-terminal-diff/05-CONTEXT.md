# Phase 5: Terminal + Diff - Context

**Gathered:** 2026-06-15
**Status:** Ready for planning

## Phase Boundary

Phase 5 交付内嵌终端面板（Rust portable-pty + xterm.js）和代码 Diff 展示（@git-diff-view/react）。终端作为底部面板支持多 Tab，Diff 嵌入聊天消息中展示，通过 AG-UI 工具调用事件触发。

**在 Phase 5 内：** TRM-01~04（portable-pty、Tauri IPC、xterm.js 渲染、多 Tab）、DIF-01~03（Diff 组件、Side-by-side/Unified 视图、聊天消息关联）
**不在 Phase 5：** 工具系统扩展（→ Phase 6）、终端命令执行工具（→ Phase 6）、权限审批（→ Phase 7）

## Implementation Decisions

### 底部面板布局
- **D-01:** 底部面板方案 — 终端和 Diff 作为底部可切换面板，聊天区域在上方自动收缩
- **D-02:** 默认高度 250px，最小 100px，最大可拖拽至 50% 屏幕高度
- **D-03:** 面板内终端和 Diff 通过顶部 Tab 栏切换，Tab 栏类似浏览器 Tab 样式
- **D-04:** 应用启动时面板默认关闭，状态栏显示终端运行状态指示器（绿色圆点），悬停提示快捷键 Ctrl+`
- **D-05:** 可拖拽分隔条（4px），hover 显示拖拽手柄图标，即时跟随拖拽，高度存入 Zustand 临时状态
- **D-06:** 面板打开/关闭使用 200ms ease-in-out 平滑滑动动画，聊天区域同步收缩/扩展
- **D-07:** CopilotSidebar 打开时底部面板宽度同步收缩，与聊天区域等宽

### 终端 Tab 管理
- **D-08:** 面板顶部横向 Tab 栏，每个 Tab 显示 shell 名称 + 当前目录（截断），`+` 按钮新建 Tab
- **D-09:** 关闭最后一个 Tab 时自动隐藏底部面板，下次打开创建新默认终端
- **D-10:** 新终端从项目根目录启动，用户可 cd 到任意目录
- **D-11:** Tab 自动命名（显示 shell 类型），双击可手动重命名，关闭即丢弃不持久化
- **D-12:** 系统等宽字体 13px（macOS Menlo / Windows Consolas），无需额外安装字体
- **D-13:** 回滚缓冲区 10000 行
- **D-14:** 终端颜色跟随应用深色/浅色模式自动切换，与 theme store 同步
- **D-15:** 终端聚焦时所有键盘输入（包括 Ctrl+C/V/W）发送给终端，应用级快捷键使用 Cmd

### 终端 Tab 切换与交互
- **D-16:** Tab 切换快捷键：Ctrl+Tab 下一个，Ctrl+Shift+Tab 上一个
- **D-17:** 终端右键菜单包含：复制、粘贴、新建 Tab、关闭 Tab
- **D-18:** 智能跟随滚动：用户在底部时自动跟随新输出，上翻查看历史时不自动滚动

### Diff 集成
- **D-19:** Diff 嵌入聊天消息中展示 — 默认显示紧凑摘要（'修改了 N 个文件，+M/-K'），点击展开完整 Diff
- **D-20:** 使用 @git-diff-view/react 作为 Diff 组件（替代 ROADMAP 原定的 react-diff-viewer-continued，前者虚拟滚动性能更好）
- **D-21:** Unified 视图为默认模式，用户可切换至 Side-by-side 视图
- **D-22:** 根据文件扩展名自动检测语言进行语法高亮
- **D-23:** Phase 5 仅展示 Diff，不涉及接受/拒绝等操作交互
- **D-24:** 长代码行水平滚动，不软换行
- **D-25:** 未变更的上下文块默认折叠，显示 '展开 N 行' 可点击展开
- **D-26:** Agent 返回标准 unified diff 文本格式，前端解析渲染
- **D-27:** 二进制文件变更仅显示 '二进制文件变更' 提示
- **D-28:** 深色/浅色模式跟随应用主题
- **D-29:** 大文件（>500 行变更）默认折叠，使用虚拟滚动渲染

### 面板交互
- **D-30:** 快捷键：Ctrl+` 切换终端面板开关，Ctrl+Shift+D 打开 Diff
- **D-31:** Titlebar 上 ThemeToggle 旁边添加终端和 Diff 图标按钮
- **D-32:** 打开终端面板时焦点自动跳到终端输入区域
- **D-33:** 关闭面板时终端进程保持后台运行，状态栏绿色圆点指示运行中，重新打开恢复之前的终端会话

### PTY 实现与跨平台
- **D-34:** macOS 默认 /bin/zsh，Windows 默认 PowerShell，portable-pty Command::new() 自动检测系统 shell
- **D-35:** PTY 进程崩溃时自动重启，终端清屏并显示 '[进程已重启]' 提示
- **D-36:** 使用 Tauri Channel 传输终端数据 — Rust 通过 Channel 推送终端输出到前端，前端通过 invoke 发送用户输入
- **D-37:** ANSI 转义序列直接传给 xterm.js 原生处理，Rust 端不做过滤或转码

### Claude's Discretion
以下实现细节由 Claude 在规划/执行阶段自主决定：
- xterm.js fit addon 的具体集成代码和 resize 响应
- @git-diff-view/react 的具体 API 调用方式
- 底部状态栏指示器的具体样式和位置
- Tab 栏的具体 CSS/Tailwind 实现
- Zustand terminal store（TerminalState）的具体数据结构
- Tauri Channel 的具体创建和生命周期管理
- portable-pty spawn 的具体参数配置
- 快捷键注册的具体实现方式（全局键盘事件监听 vs Tauri 快捷键 API）
- 面板高度拖拽的具体实现（mousedown/mousemove 事件处理）
- Diff 展开/折叠的具体动画效果

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 项目文档
- `.planning/PROJECT.md` — 核心价值、关键决策、约束条件
- `.planning/REQUIREMENTS.md` — v1 需求（TRM-01~04、DIF-01~03）
- `.planning/ROADMAP.md` — Phase 5 目标和范围

### 前一阶段上下文
- `.planning/phases/02-chat-ui/02-CONTEXT.md` — CopilotSidebar 布局、Zustand 模式、深色模式
- `.planning/phases/04-agent-desktop/04-CONTEXT.md` — ErrorToast 模式、Agent 健康检查模式

### Rust / PTY
- [portable-pty crate](https://crates.io/crates/portable-pty) — 跨平台 PTY 创建和管理
- [Tauri 2 Channel API](https://tauri.app/develop/calling-frontend/#channels) — 流式数据从前端到 Rust 通信

### 前端终端
- [xterm.js](https://xtermjs.org/) — 终端模拟器，Addons（FitAddon、WebLinksAddon 等）
- [Tauri 2 Calling Frontend](https://tauri.app/develop/calling-frontend/) — Rust 端向 WebView 推送数据的 API 参考

### Diff
- [@git-diff-view/react](https://www.npmjs.com/package/@git-diff-view/react) — React Diff 组件，支持虚拟滚动

### 现有代码
- `apps/desktop/src/App.tsx` — CopilotSidebar 布局、Agent 健康检查流程
- `apps/desktop/src/components/Titlebar.tsx` — Titlebar 组件，ThemeToggle 按钮位置
- `apps/desktop/src/stores/theme.ts` — Zustand store 模式参考
- `apps/desktop/src-tauri/Cargo.toml` — Rust 依赖配置（需添加 portable-pty）

## Existing Code Insights

### Reusable Assets
- **Titlebar 组件**：右侧控制区域已有 ThemeToggle，终端/Diff 按钮添加在同一排
- **Zustand persist 模式**：theme.ts 的 persist 模式可复制到 terminal store
- **ErrorToast 组件**：PTY 崩溃、连接失败等场景可复用错误提示组件
- **CopilotSidebar 布局**：底部面板需要与 Sidebar 的宽度变化联动

### Established Patterns
- Biome 代码风格（单引号、2 空格缩进、严格 TypeScript）
- Zustand stores 在 `src/stores/`，组件在 `src/components/`
- Tauri window 事件在 useEffect 中初始化
- Tailwind CSS 4 + class="dark" 深色模式策略

### Integration Points
- `apps/desktop/src/App.tsx` — 底部面板容器插入点在 CopilotSidebar 的 children 下方
- `apps/desktop/src/components/Titlebar.tsx` — 添加终端/Diff 切换按钮
- `apps/desktop/src-tauri/src/lib.rs` — 注册 PTY 相关 Tauri commands 和 Channel
- `apps/desktop/src-tauri/Cargo.toml` — 添加 portable-pty 依赖
- `apps/desktop/package.json` — 添加 xterm.js、@git-diff-view/react 依赖
- 新增目录：`src/components/terminal/`、`src/components/diff/`、`src/stores/terminal.ts`

## Specific Ideas

- 终端面板交互参考 VS Code 内置终端的行为（快捷键、Tab 管理、拖拽调整高度）
- Diff 展示参考 GitHub PR 的 unified diff 视图
- 状态栏指示器参考 VS Code 底部状态栏的终端状态显示

## Deferred Ideas

- 终端会话持久化（关闭应用时保存 Tab 列表和工作目录）— 可在后续迭代中添加
- 分屏终端（一个 Tab 内左右分屏）— 属于增强功能，Phase 5 只做基本多 Tab
- Diff 操作交互（接受/拒绝变更、应用到文件）— Phase 6 工具系统扩展时考虑
- 终端历史命令搜索 — 增强体验功能
- 自定义终端颜色方案（独立于应用主题）— 后续用户设置

---

*Phase: 5-Terminal + Diff*
*Context gathered: 2026-06-15*

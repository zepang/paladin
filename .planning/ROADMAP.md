# Roadmap: Paladin

**Created:** 2026-06-14
**Granularity:** Fine (10 phases)
**Core Value:** AI 编程助手桌面端

## Phase Overview

| Phase | Name | Focus | Dependencies |
|-------|------|-------|-------------|
| 1 | Desktop Shell | Tauri 2 + React + Tailwind 骨架 | — |
| 2 | Chat UI | CopilotKit 聊天界面 | Phase 1 |
| 3 | AI Agent Core | Pydantic AI + AG-UI 端点 | — |
| 4 | Agent ↔ Desktop | AG-UI 流式通信对接 | Phase 2 + 3 |
| 5 | Terminal + Diff | PTY 终端面板 + 代码 Diff | Phase 1 |
| 5.1 | UI Library Upgrade | shadcn/ui + lucide-icons | Phase 5 |
| 5.2 | Chat Area Redesign | CopilotChat + 侧边栏折叠 + 状态条 + 工具栏 | Phase 5.1 |
| 5.3 | Right Panel System | 多视图右侧面板：终端/文件预览/Diff审查 | Phase 5.2 |
| 6 | Agent Tools | 文件/终端/MCP/Skills/子Agent | Phase 4 |
| 7 | HITL + Sidecar | 权限审批 + 进程管理 | Phase 4 + 5 |
| 8 | Go Server | 认证/数据库/WebSocket Hub | — |
| 9 | Admin Systems | 审计日志 + 配额管理 | Phase 8 |
| 10 | Packaging | 打包发布 + 文档 | Phase 1-9 |

## Phase Details

### Phase 1: Desktop Shell

**Goal:** 可启动的 Tauri 2 桌面应用骨架
**Requirements:** DSK-01, DSK-02, DSK-03, DSK-04

- Tauri 2 + React 19 + Vite + TypeScript 项目初始化
- Tailwind CSS 4 配置，深色/浅色模式
- 窗口管理、系统托盘
- Zustand 状态管理基础

### Phase 2: Chat UI

**Goal:** CopilotKit 聊天界面可交互
**Requirements:** CHT-01, CHT-02, CHT-03, CHT-04

- CopilotKit CopilotChat 组件集成
- 流式输出渲染框架
- 对话历史管理
- CopilotSidebar 侧边栏模式

### Phase 3: AI Agent Core

**Goal:** Python Agent 可独立运行
**Requirements:** AGT-01, AGT-02, AGT-04

- Pydantic AI Agent 创建 + LLM 调用
- AG-UI 端点（`agent.to_ag_ui()`）
- pydantic-deepagents 基础集成

### Phase 4: Agent ↔ Desktop

**Goal:** Agent 通过 AG-UI 与前端通信
**Requirements:** AGT-03 (CopilotKit → AG-UI → Pydantic AI 全链路)

- CopilotKit Runtime 对接 AG-UI 端点
- 流式对话全链路通
- 工具调用结果可视化

### Phase 5: Terminal + Diff

**Goal:** 内嵌终端 + 代码变更可视化
**Requirements:** TRM-01~04, DIF-01~03
**Plans:** 1 plan

Plans:

- [x] 05-01-PLAN.md — Terminal + Diff core (PTY Channel, right drawer, chat-embedded DiffView)

- Rust portable-pty 终端
- Tauri IPC 传输到 xterm.js
- 多 tab 终端
- @git-diff-view/react 集成

### Phase 05.1: UI Library Upgrade — 引入 shadcn/ui + lucide-icons 图标库，替换手写 SVG 和自定义组件 (INSERTED)

**Goal:** [Urgent work - to be planned]
**Requirements**: TBD
**Depends on:** Phase 5
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 05.1 to break down)

### Phase 05.2: Chat Area Redesign — 对话区域重构 (INSERTED)

**Goal:** 用 CopilotChat 替换手写消息组件，新增侧边栏折叠、Agent 状态条、右侧工具栏
**Requirements**: TBD
**Depends on:** Phase 5.1
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 05.2 to break down)

- 侧边栏可折叠（完全收起 + 展开按钮）
- CopilotChat 组件替换 MessageList + MessageBubble + ChatView + WelcomePage
- 对话区域居中窄列布局
- Agent 状态条（运行状态、当前步骤、进度指示）
- 右侧工具栏（上下文信息：模型/Token/工具调用 + 快捷操作：清空/导出/切换模型）

### Phase 05.3: Right Panel System — 右侧多视图面板 (INSERTED)

**Goal:** 新增可切换视图的右侧面板，支持终端/文件预览/Diff审查三种模式
**Requirements**: TBD
**Depends on:** Phase 5.2
**Plans:** 0 plans

Plans:

- [ ] TBD (run /gsd-plan-phase 05.3 to break down)

- 保留 ChatToolbar，右侧面板在工具栏右边新增
- Titlebar 按钮 → 终端/Diff 视图切换
- Agent 回复含文件路径 → 自动打开文件预览
- 手动点击文件 → 文件预览
- 文件预览支持代码高亮 + Markdown 渲染 + 图片
- 替换当前 RightDrawer (Sheet 浮层) 为固定面板

### Phase 6: Agent Tools

**Goal:** Agent 具备完整工具链
**Requirements:** TLS-01~05
**Plans:** 6 plans

Plans:

- [ ] 06-01-PLAN.md — Config 迁移：models.yaml → config.json + load_models() JSON 重写 (TDD)
- [ ] 06-02-PLAN.md — Skills 目录 + code-review.md 示例技能 + system.md 更新
- [ ] 06-03-PLAN.md — MCP 依赖安装：pydantic-ai-slim[mcp]
- [ ] 06-04-PLAN.md — Agent 工具激活：5 个工具集一键启用 + MCP 按需加载 (TDD)
- [ ] 06-05-PLAN.md — 综合测试套件：test_tools.py + test_agent.py + test_server.py
- [ ] 06-06-PLAN.md — Prohibition 验证：沙箱越权禁止测试

- 文件系统操作工具
- 终端命令执行
- MCP 工具集成
- Skills 系统（Markdown 驱动）
- 子 Agent 委派

### Phase 7: HITL + Sidecar

**Goal:** Agent 危险操作需审批确认后才能执行，Agent 具备桌面操作能力（截图、键鼠）
**Requirements:** HIT-01~03 (7a), SDC-01~03 (7b — deferred)
**Plans:** 6 plans (Phase 7a only)

Plans:

- [ ] 07-01-PLAN.md — HITL 审批回调工厂 + asyncio.Event 状态管理 (TDD)
- [ ] 07-02-PLAN.md — config.json hitl 段 + ToolGuard 集成到 create_paladin_agent()
- [ ] 07-03-PLAN.md — GET /approval/stream SSE 端点 + POST /approval/{id} HTTP 回调
- [ ] 07-04-PLAN.md — Computer Use @tool 函数（screenshot/click/typewrite）+ pyautogui
- [ ] 07-05-PLAN.md — 前端审批 UI：ApprovalBridge + ApprovalCard + ApprovalDialog
- [ ] 07-06-PLAN.md — ChatToolbar 审批状态栏升级 + App.tsx 集成

**Phase 7a (this phase):**
- CopilotKit HITL 审批流（SSE + HTTP 回调 + asyncio.Event 等待）
- config.json 驱动工具审批列表 + ToolGuard 守卫
- Computer Use (pyautogui screenshot / click / typewrite)
- 前端审批卡片（聊天流内嵌 + AlertDialog 弹窗）+ ChatToolbar 审批状态

**Phase 7b (deferred):**
- Tauri sidecar 管理 Python Agent (SDC-01)
- Tauri sidecar 管理 Go Server (SDC-02) — deferred after Phase 8
- 健康检查 + 自动重启 (SDC-03)

### Phase 8: Go Server

**Goal:** 业务层基础能力就绪
**Requirements:** SRV-01~04

- Go 项目骨架 + PostgreSQL + Redis
- 用户注册/登录
- RBAC 权限控制
- WebSocket Hub

### Phase 9: Admin Systems

**Goal:** 运维管理能力完整
**Requirements:** ADM-01~03

- 审计日志持久化
- 配额管理（Redis 计数）
- WebSocket Hub 完善

### Phase 10: Packaging

**Goal:** 可分发的桌面应用
**Requirements:** PKG-01~03

- macOS .dmg 打包
- Windows .msi 打包
- README + 项目文档

## Parallel Execution Opportunities

Phases that can run in parallel:

- Phase 3 (Agent) ∥ Phase 5 (Terminal + Diff) — 无依赖冲突
- Phase 8 (Go Server) ∥ Phase 2-7 — Go 层完全独立
- Phase 6 (Agent Tools) 部分可平行于 Phase 5

## Risk Items

| Risk | Impact | Mitigation |
|------|--------|-----------|
| AG-UI 版本兼容性（Pydantic AI ↔ CopilotKit） | Phase 4 阻塞 | Phase 3 先验证 `agent.to_ag_ui()` 与 CopilotKit 对接 |
| Tauri sidecar 跨平台编译 | Phase 7/10 延迟 | 尽早验证 macOS sidecar 打包 |
| portable-pty Windows 行为差异 | Phase 5 Windows 兼容 | 优先 macOS 开发，Windows 适配延后 |

---
*Roadmap created: 2026-06-14*

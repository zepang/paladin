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
- Rust portable-pty 终端
- Tauri IPC 传输到 xterm.js
- 多 tab 终端
- @git-diff-view/react 集成

### Phase 6: Agent Tools
**Goal:** Agent 具备完整工具链
**Requirements:** TLS-01~05
- 文件系统操作工具
- 终端命令执行
- MCP 工具集成
- Skills 系统（Markdown 驱动）
- 子 Agent 委派

### Phase 7: HITL + Sidecar
**Goal:** 危险操作需审批，进程管理稳定
**Requirements:** HIT-01~03, SDC-01~03
- CopilotKit HITL 审批流
- Computer Use (pyautogui)
- Tauri sidecar 管理 Python Agent
- Tauri sidecar 管理 Go Server
- 健康检查 + 自动重启

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

# Requirements: Paladin

**Defined:** 2026-06-14
**Core Value:** AI 编程助手桌面端 —— 聊天式 AI 编码交互、终端面板、代码 Diff 查看、HITL 权限审批

## v1 Requirements

### Desktop Shell

- [ ] **DSK-01**: Tauri 2 + React 19 + Vite + TypeScript 项目骨架可启动
- [ ] **DSK-02**: Tailwind CSS 4 深色/浅色模式自动切换
- [ ] **DSK-03**: 应用窗口管理（最小化/最大化/关闭、自定义标题栏）
- [ ] **DSK-04**: 系统托盘图标与应用生命周期

### Chat UI

- [ ] **CHT-01**: CopilotKit CopilotChat 组件集成，聊天界面可交互
- [ ] **CHT-02**: 流式输出响应，逐 token 渲染
- [ ] **CHT-03**: 对话历史管理（查看、切换、删除）
- [ ] **CHT-04**: CopilotKit CopilotSidebar 侧边栏模式
- [ ] **CHT-05**: 主工作区与对话区隔离（聊天交互归拢至右侧，中间保留为工作区画布）
- [ ] **CHT-06**: 集成式历史会话入口（移除左侧独立对话栏，在聊天侧边栏内提供历史记录视图）
- [ ] **CHT-07**: 侧边栏可拖拽且宽度持久化（右侧聊天边栏支持拖拽调整宽度，且宽度状态重启后保持）

### Agent Core

- [ ] **AGT-01**: Pydantic AI Agent 创建，基础 LLM 调用可工作
- [ ] **AGT-02**: AG-UI 端点暴露（`agent.to_ag_ui()`），HTTP/SSE 可访问
- [ ] **AGT-03**: CopilotKit Runtime 对接 AG-UI 端点，Agent ↔ Frontend 通信通
- [ ] **AGT-04**: pydantic-deepagents 集成（TodoToolset、FilesystemToolset）

### Terminal

- [ ] **TRM-01**: Rust portable-pty 创建终端进程，跨平台工作
- [ ] **TRM-02**: 通过 Tauri IPC 将终端流发送到前端
- [ ] **TRM-03**: xterm.js 渲染终端界面，支持输入输出
- [ ] **TRM-04**: 多 tab 终端管理

### Code Diff

- [ ] **DIF-01**: @git-diff-view/react 集成，展示代码变更
- [ ] **DIF-02**: Side-by-side 和 unified diff 两种视图
- [ ] **DIF-03**: Diff 视图关联聊天消息（Agent 修改了什么）

### Agent Tools

- [ ] **TLS-01**: Agent 文件系统操作（读/写/编辑项目文件）
- [ ] **TLS-02**: Agent 终端命令执行（通过 pydantic-deepagents）
- [ ] **TLS-03**: MCP 工具集成（连接外部 MCP 服务器）
- [ ] **TLS-04**: Skills 系统（Markdown 驱动，可扩展 Agent 能力）
- [ ] **TLS-05**: 子 Agent 委派（SubAgentToolset）

### Human-in-the-Loop

- [ ] **HIT-01**: CopilotKit useHumanInTheLoop 审批 UI
- [ ] **HIT-02**: 危险操作标记与拦截（文件删除、命令执行等需审批）
- [ ] **HIT-03**: Computer Use 基础能力（Python pyautogui 截图与操作）

### Sidecar Management

- [x] **SDC-01**: Tauri sidecar 配置，管理 Python Agent 子进程
- [x] **SDC-02**: Tauri sidecar 配置，管理 Go Server 子进程
- [x] **SDC-03**: Sidecar 健康检查与自动重启

### Go Server - Auth

- [ ] **SRV-01**: Go 项目骨架 + PostgreSQL + Redis 连接
- [ ] **SRV-02**: 用户注册/登录 API
- [ ] **SRV-03**: RBAC 角色权限控制
- [ ] **SRV-04**: WebSocket Hub 实时通信

### Go Server - Admin

- [ ] **ADM-01**: 审计日志持久化存储
- [ ] **ADM-02**: 配额管理（按用户维度控制 AI 调用量）
- [ ] **ADM-03**: WebSocket Hub 实时通信

### Packaging

- [x] **PKG-01**: macOS 打包（.dmg）
- [x] **PKG-02**: Windows 打包（.msi）
- [ ] **PKG-03**: README + 项目文档

## Out of Scope

| Feature | Reason |
|---------|--------|
| OAuth / 第三方登录 | v1 仅 RBAC 内部认证 |
| 移动端（iOS/Android） | 桌面端优先 |
| 视频/语音交互 | 纯文本 Agent 交互 |
| A2A 协议 | 留到未来版本 |
| 插件市场 | 生态维护成本高 |
| Git 图形化操作 | 终端已覆盖 |
| 实时协作/多人编辑 | 学习项目不需要 |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| DSK-01 ~ DSK-04 | Phase 1 | Pending |
| CHT-01 ~ CHT-07 | Phase 2 | Pending |
| AGT-01 ~ AGT-04 | Phase 3 | Pending |
| AGT-01~04 + CHT 对接 | Phase 4 | Pending |
| TRM-01 ~ TRM-04 | Phase 5 | Pending |
| DIF-01 ~ DIF-03 | Phase 5 | Pending |
| TLS-01 ~ TLS-04 | Phase 6 | Pending |
| HIT-01 ~ HIT-03 | Phase 7 | Pending |
| SDC-01 ~ SDC-03 | Phase 7 | Pending |
| SRV-01 ~ SRV-04 | Phase 8 | Pending |
| ADM-01 ~ ADM-03 | Phase 9 | Pending |
| PKG-01 ~ PKG-03 | Phase 10 | Pending |

**Coverage:**

- v1 requirements: 41 total
- Mapped to phases: 38
- Unmapped: 0

---
*Requirements defined: 2026-06-14*
*Last updated: 2026-06-14 after research*

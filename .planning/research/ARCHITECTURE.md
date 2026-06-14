# Architecture Research: AI 编程助手桌面端

**Research Date:** 2026-06-14

## 整体架构模式

采用 **三层解耦 + Sidecar 管理** 的桌面端 Agent 架构：

```
┌──────────────────────────────────────────────────────────┐
│            Tauri 2 Desktop App                            │
│  Rust Backend + React(Vite) + Zustand + Tailwind         │
│  ├─ 聊天界面（CopilotKit CopilotChat/Sidebar）             │
│  ├─ 终端面板 │ 代码 Diff │ 权限审批（HITL）               │
│  ├─ Computer Use                                          │
│  ├─ 终端 PTY: Rust portable-pty + xterm.js               │
│  └─ Sidecar: Python Agent + Go Server                    │
└──────────────────────┬───────────────────────────────────┘
                       │ AG-UI（Agent-User 交互协议，SSE/WebSocket）
       ┌───────────────┼───────────────┐
       ▼               ▼               ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ Python Agent │ │  Go Server   │ │  Tauri Rust  │
│ (AI 推理层)  │ │  (业务层)    │ │  原生能力    │
└──────────────┘ └──────────────┘ └──────────────┘
```

## 组件边界

### Desktop（桌面端）
- **Tauri Rust Backend**: IPC 通信、窗口管理、PTY 终端、系统托盘、Sidecar 管理、文件监听、加密存储
- **React Frontend**: CopilotKit UI、终端面板（xterm.js）、Diff 视图、设置界面

### Agent（AI 推理层）
- **Pydantic AI**: Agent Loop、工具调用、流式输出
- **pydantic-deepagents**: TodoToolset、FilesystemToolset、SubAgentToolset、DockerSandbox、Skills
- **AG-UI 端点**: `agent.to_ag_ui()` 暴露标准协议端口

### Server（Go 业务层）
- **认证授权**: RBAC 权限控制
- **数据持久化**: MySQL + Redis
- **WebSocket Hub**: 实时通信中转
- **配额/审计**: 用量控制和操作追溯

## 数据流

```
用户输入 → CopilotKit Chat UI
    │
    ▼
CopilotKit Runtime → AG-UI Client → HTTP/SSE → Pydantic AI Agent
    │                                               │
    │                                               ├─ 调用工具（文件/终端/Web）
    │                                               ├─ MCP 外部工具
    │                                               └─ 子 Agent 委派
    │                                               │
    ▼                                               ▼
流式响应 ← AG-UI Events ← Pydantic AI
    │
    ▼
CopilotKit 渲染（文本/工具调用卡片/Generative UI）

权限审批流:
Agent 危险操作 → HITL 标记 → CopilotKit useHumanInTheLoop
    → 用户审批 → Agent 继续或拒绝

配额流:
每次 AI 调用 → Go Server WebSocket → Redis 计数
    → 超配额 → 拒绝请求
```

## 推荐的构建顺序（依赖关系驱动）

```
Phase 1: Desktop Shell（Tauri 2 + React + Tailwind 项目骨架）
    ↓
Phase 2: Chat UI（CopilotKit 集成 + 聊天界面）
    ↓
Phase 3: AI Agent 内核（Pydantic AI + AG-UI 端点）
    ↓
Phase 4: Agent ↔ Desktop 通信（AG-UI 流式对接）
    ↓
Phase 5: 终端面板（PTY + xterm.js）
    ↓
Phase 6: Agent 工具集成（文件操作、终端命令、MCP）
    ↓
Phase 7: HITL + Computer Use
    ↓
Phase 8: Go 业务层（认证 + 数据库）
    ↓
Phase 9: 配额 + 审计
    ↓
Phase 10: 打包与优化
```

**关键依赖:**
- CopilotKit 集成依赖 Tauri 项目骨架
- AG-UI 通信依赖 Agent 内核就绪
- HITL 依赖 AG-UI 流式通信已通
- Go 业务层相对独立，可在 Agent 开发同步进行

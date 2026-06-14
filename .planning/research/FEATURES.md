# Features Research: AI 编程助手桌面端

**Research Date:** 2026-06-14

## Table Stakes（必须有，否则用户不会用）

| 功能 | 复杂度 | 说明 |
|------|--------|------|
| 聊天式 AI 交互 | MEDIUM | 流式输出、多轮对话、上下文保持 |
| 终端面板 | HIGH | 内嵌终端，支持多 tab、命令执行 |
| 代码 Diff 视图 | MEDIUM | Side-by-side / unified diff |
| 文件读写 | MEDIUM | Agent 能读项目文件、写修改 |
| 深色模式 | LOW | Tailwind CSS 4 原生支持 |

## Differentiators（差异化竞争力）

| 功能 | 复杂度 | 说明 |
|------|--------|------|
| **AG-UI 协议对接** | MEDIUM | Pydantic AI → AG-UI → CopilotKit，流式 + 结构化通信 |
| **Human-in-the-Loop** | HIGH | 危险操作审批流，CopilotKit useHumanInTheLoop |
| **Computer Use** | HIGH | Python pyautogui，屏幕截图 + 操作 |
| **Skills 系统** | MEDIUM | Markdown 驱动，可扩展 Agent 能力 |
| **MCP 集成** | MEDIUM | 连接外部工具生态（Claude Code/Cursor 兼容） |
| **三层解耦架构** | MEDIUM | Desktop ↔ Agent ↔ Server 独立可测 |
| **Sidecar 进程管理** | MEDIUM | Tauri 原生管理 Python/Go 子进程 |
| **配额管理** | MEDIUM | 按用户/组织维度控制 AI 调用量 |
| **审计日志** | LOW | Go 业务层持久化所有操作 |
| **RBAC 权限** | MEDIUM | 企业级角色权限控制 |

## Anti-Features（刻意不做的）

| 功能 | 原因 |
|------|------|
| 内嵌代码编辑器（VS Code 级别） | 复杂度极高，非核心定位 |
| 实时协作/多人编辑 | 学习项目不需要 |
| 视频/语音交互 | 纯文本定位 |
| OAuth 第三方登录 | v1 范围外 |
| 移动端 | 桌面优先 |
| 插件市场 | 生态维护成本高 |
| Git 图形化操作 | 终端已覆盖 |

## 功能依赖关系

```
聊天 UI ──→ Agent 通信 ──→ 流式输出
    │
    └──→ 工具调用可视化 ──→ HITL 审批
    │
    └──→ 代码 Diff 视图

终端面板 ──→ PTY 管理 ──→ IPC 通信
    │
    └──→ Computer Use

Go 业务层 ──→ RBAC ──→ 审计日志
    │
    └──→ 配额管理 ──→ Redis 计数
```

## 生态对标

| 产品 | 定位 | 参考价值 |
|------|------|---------|
| cc-haha/desktop | Electron AI 桌面助手 | 交互体验参考 |
| Claude Code | CLI Agent | Agent Loop 模式参考 |
| Cursor | AI-Native IDE | 产品理念参考 |
| OpenCode | 终端 AI 编码助手 | Agent 架构参考 |
| CopilotKit | Agent UI 框架 | 前端 Agent UI 实现 |

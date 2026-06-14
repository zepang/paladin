# Paladin

## What This Is

Paladin 是一个 AI 编程助手桌面端应用，仿 cc-haha/desktop 的交互体验。集 AI Agent、桌面端工作台、企业业务层于一体，一个 monorepo 展示 TypeScript + Python + Go + Rust 四种语言的全栈能力。定位为学习性质项目，目标为展示全栈架构能力和求职亮点。

## Core Value

AI 编程助手桌面端 —— 聊天式 AI 编码交互、终端面板、代码 Diff 查看、Human-in-the-Loop 权限审批，一个桌面应用完成完整编码工作流。

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] 桌面端：Tauri 2 + React + Vite + Tailwind，CopilotKit 聊天 UI + AG-UI 协议
- [ ] 桌面端：终端面板（Rust portable-pty + xterm.js）
- [ ] 桌面端：代码 Diff 视图（react-diff-viewer-continued）
- [ ] 桌面端：Computer Use 能力
- [ ] 桌面端：Tauri sidecar 管理 Python Agent + Go Server 进程
- [ ] AI Agent 层：Pydantic AI + pydantic-deepagents，AG-UI 端点
- [ ] AI Agent 层：任务规划、文件操作、子 Agent、沙箱、Skills、MCP 集成
- [ ] AI Agent 层：流式输出 → AG-UI → CopilotKit
- [ ] Go 业务层：用户认证/授权（RBAC）
- [ ] Go 业务层：数据库（MySQL + Redis）
- [ ] Go 业务层：WebSocket Hub、审计日志、配额管理
- [ ] 三层通信：localhost WebSocket

### Out of Scope

- OAuth / 第三方登录 — v1 仅 RBAC 内部认证
- 移动端 — 桌面端优先
- 视频/语音交互 — 纯文本 Agent 交互
- A2A 协议 — 留到未来版本

## Context

- 参考项目：cc-haha/desktop（交互体验、Electron→Tauri 迁移思路）、wps-cowork（Go 业务层架构）
- 技术栈详见 DESIGN.md（19 项技术决策）
- 项目结构：monorepo，apps/desktop + apps/agent + apps/server
- 从零自建，参考项目作为设计参考而非代码基础
- 开发顺序：桌面端体验优先 → AI Agent 层 → Go 业务层

## Constraints

- **语言栈**: TypeScript（桌面 UI）+ Rust（桌面壳）+ Python（AI Agent）+ Go（业务层）
- **桌面框架**: Tauri 2（不可更换，核心卖点）
- **AI 框架**: Pydantic AI + pydantic-deepagents（不可更换）
- **前端 Agent UI**: CopilotKit + AG-UI 协议
- **项目结构**: Monorepo，apps/ 下单仓管理
- **部署形态**: 桌面端打包 10-50MB，内存 80-120MB

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Tauri 2 替代 Electron | 打包体积小、Rust 后端技术含金量、sidecar 原生支持 Python/Go | — Pending |
| Pydantic AI 替代 LangChain | 类型安全、性能优 44%、错误少 5x、学习曲线低 | — Pending |
| CopilotKit + AG-UI | Pydantic AI 原生 `agent.to_ag_ui()`，开箱即用聊天/HITL/工具可视化 | — Pending |
| Go 业务层独立 | 高并发、RBAC/审计/配额需要 Go 的类型安全和性能 | — Pending |
| localhost WebSocket 三层通信 | 解耦清晰、流式输出天然支持、各层独立可测 | — Pending |
| Monorepo 结构 | 一个 GitHub 链接展示全栈能力 | — Pending |
| 从零自建非 fork | 最大化学习价值，代码完全自主 | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-06-14 after initialization*

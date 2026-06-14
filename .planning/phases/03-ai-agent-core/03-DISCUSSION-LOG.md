# Phase 3: AI Agent Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 03-ai-agent-core
**Areas discussed:** 项目结构与依赖管理, LLM 提供商与配置, AG-UI 端点设计, Agent 行为与 System Prompt

---

## 项目结构与依赖管理

| Option | Description | Selected |
|--------|-------------|----------|
| uv (推荐) | Rust 写的极速工具，替代 pip+venv+setuptools，Pydantic AI 官方推荐 | ✓ |
| poetry | 成熟稳定，pyproject.toml 标准 | |
| pip + venv | 最简单，零额外依赖 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 3.12 (推荐) | 最新稳定版，Pydantic AI 完全支持 | ✓ |
| 3.11 | 当前最广泛部署的版本 | |
| 3.10 | Pydantic AI 最低要求 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 模块化 (推荐) | src/agent/ + src/server/ + src/tools/ | ✓ |
| 单体 | 所有代码在一个模块 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 最新稳定版 (推荐) | pydantic-ai>=0.0.30 | ✓ |
| 锁定具体版本 | 固定当前验证过的版本 | |

**User's choice:** uv + Python 3.12 + 模块化 + 最新稳定版
**Notes:** 用户全部选择了推荐选项

---

## LLM 提供商与配置

| Option | Description | Selected |
|--------|-------------|----------|
| 两者都支持 | 通过配置切换，Agent 代码与模型解耦 | ✓ |
| Anthropic (推荐) | Claude 模型，编程能力突出 | |
| OpenAI | GPT-4o 系列，生态最大 | |

| Option | Description | Selected |
|--------|-------------|----------|
| .env 文件 (推荐) | python-dotenv 加载，Phase 7 通过 Tauri env 注入 | ✓ |
| 命令行参数传入 | 启动时通过 --api-key 参数 | |
| 配置文件 | JSON/YAML 配置文件存储 key | |

**User's default models:** DeepSeek V4 Flash, DeepSeek V4 Pro, 本地 Llama Studio
**User's choice:** 多提供商 + .env 管理 + fallback 降级策略
**Notes:** DeepSeek 走 OpenAI 兼容 API，Llama Studio 也是 OpenAI 兼容（localhost:8080）。需要 fallback 链机制。

---

## AG-UI 端点设计

| Option | Description | Selected |
|--------|-------------|----------|
| FastAPI (推荐) | Pydantic AI 官方示例，SSE 原生支持 | ✓ |
| Starlette | FastAPI 底层，更轻量 | |
| Litestar | 新兴 ASGI 框架 | |

| Option | Description | Selected |
|--------|-------------|----------|
| localhost:9876 /copilotkit (推荐) | 与 Phase 2 占位一致 | ✓ |
| localhost:8000 /ag-ui | Pydantic AI 官方默认 | |
| 可配置 | 通过 .env 配置 | |

| Option | Description | Selected |
|--------|-------------|----------|
| Pydantic AI 内置 (推荐) | agent.to_ag_ui() 自带 SSE | ✓ |
| 自定义 SSE | 自己管理 SSE 连接 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 需要 (推荐) | /health 返回 agent 状态 + LLM 连通性 | ✓ |
| 不需要 | 独立开发阶段不必要 | |

**User's choice:** 全部推荐选项
**Notes:** 端点与前端占位一致，Phase 4 零改动

---

## Agent 行为与 System Prompt

| Option | Description | Selected |
|--------|-------------|----------|
| 通用 Agent | 不限定领域，聊天/问答/编程都做 | ✓ |
| 编程助手 (推荐) | 定位为专业编程伙伴 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 独立文件 (推荐) | prompts/system.md 存放 System Prompt | ✓ |
| 代码内嵌 | 直接写在 Python 代码中 | |
| 组合式 | 基础 prompt + 模型特定 prompt | |

| Option | Description | Selected |
|--------|-------------|----------|
| 安全优先 (推荐) | 默认询问用户确认，危险操作强制审批 | ✓ |
| 自动执行 | Agent 自行判断直接执行 | |
| 分模式 | plan 模式 + act 模式 | |

| Option | Description | Selected |
|--------|-------------|----------|
| structlog + 控制台 (推荐) | 结构化日志，Phase 7 可扩展 | ✓ |
| print + 简单日志 | 最简单 | |
| OpenTelemetry | 完整可观测性 | |

**User's choice:** 通用 Agent + 独立文件 System Prompt + 安全优先 + structlog
**Notes:** 用户选择通用 Agent 而非编程专用，System Prompt 可通过 prompts/system.md 自定义

---

## Deferred Ideas

无 — Phase 3 讨论未产生范围外 idea

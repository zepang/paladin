# Phase 3: AI Agent Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 03-ai-agent-core
**Areas discussed:** 项目结构与依赖管理, LLM 提供商与配置, AG-UI 端点设计, Agent 行为与 System Prompt, pydantic-deepagents 集成深度, AG-UI 事件类型, 模型配置管理, Session 管理, 本地开发体验

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

## pydantic-deepagents 集成深度

| Option | Description | Selected |
|--------|-------------|----------|
| 安装+注册 (推荐) | 注册 TodoToolset + FilesystemToolset，验证可被发现 | ✓ |
| 完整集成 | Agent 能实际调用工具操作本地文件 | |
| 仅安装依赖 | Phase 6 再注册和连线 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 项目目录沙箱 (推荐) | FilesystemToolset 限制在 apps/agent/ | ✓ |
| Home 目录 | 允许访问整个 home 目录 | |
| 暂不限制 | Phase 7 HITL 统一加权限 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 启用 (推荐) | TodoToolset 立即启用，Agent 可管理子任务 | ✓ |
| 暂不启用 | Phase 6 再启用 | |

**User's choice:** 安装+注册 + 项目目录沙箱 + 启用 TodoToolset

---

## AG-UI 事件类型

| Option | Description | Selected |
|--------|-------------|----------|
| 完整覆盖 (推荐) | TEXT_MESSAGE + TOOL_CALL + RUN lifecycle | ✓ |
| 仅文本消息 | 只支持 TEXT_MESSAGE 系列 | |
| Pydantic AI 默认 | 跟随 to_ag_ui() 默认输出 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 结构化错误 (推荐) | RUN_ERROR 含错误码、消息、可恢复标识 | ✓ |
| 不暴露 | Phase 4 前端自己处理 HTTP 错误 | |
| 透传原始错误 | 不做结构化封装 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 需要 (推荐) | RUN_STARTED/FINISHED 完整生命周期事件 | ✓ |
| 不需要 | 端点启动即有响应 | |

**User's choice:** 完整事件覆盖 + 结构化错误 + 生命周期事件

---

## 模型配置管理

| Option | Description | Selected |
|--------|-------------|----------|
| YAML 配置文件 (推荐) | config/models.yaml 定义模型列表和参数 | ✓ |
| .env 环境变量 | 拼模型列表字符串 | |
| 代码内定义 | 硬编码模型列表 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 优先级链 (推荐) | DeepSeek V4 Pro → Flash → Llama Studio 逐一尝试 | ✓ |
| 并发竞速 | 多模型并发，取最快结果 | |
| 手动选择 | 用户每次手动选模型 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 独立参数 (推荐) | 每个模型独立 temperature/max_tokens/top_p | ✓ |
| 全局参数 | 所有模型共用一套参数 | |
| 使用默认值 | Pydantic AI 默认值 | |

**User's choice:** YAML 配置 + 优先级链 fallback + 独立参数

---

## Session 管理

| Option | Description | Selected |
|--------|-------------|----------|
| 无状态 (推荐) | 每次请求独立，前端传入完整历史 | ✓ |
| 有状态 | Pydantic AI 内置 session，Agent 维护上下文 | |
| 内存会话 | EphemeralMemory，不持久化 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 前端管理 (推荐) | Zustand persist 管理对话历史 | ✓ |
| Agent 端存储 | SQLite 存储对话历史 | |
| 不持久化 | 进程重启丢失 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 前端传入 (推荐) | 复用 Phase 2 conversation.threadId | ✓ |
| Agent 生成 | Agent 生成 thread_id 返回前端 | |

**User's choice:** 无状态 Agent + 前端管理持久化 + 前端传入 threadId

---

## 本地开发体验

| Option | Description | Selected |
|--------|-------------|----------|
| CLI REPL (推荐) | `uv run paladin-agent` 交互式对话 | ✓ |
| 测试脚本 | Python 脚本调用 Agent API | |
| curl 测试 | 只启动 HTTP 服务 | |

| Option | Description | Selected |
|--------|-------------|----------|
| dev 模式 (推荐) | `uv run paladin-agent serve --dev` 热重载 | ✓ |
| 无热重载 | 手动重启 | |
| 暂不启动 | Phase 4 一起启动 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 启用 (推荐) | 保留 /docs Swagger UI | ✓ |
| 关闭 | 用 curl/脚本测试 | |

| Option | Description | Selected |
|--------|-------------|----------|
| pyproject.toml scripts (推荐) | [project.scripts] 注册命令 | ✓ |
| 直接运行模块 | python -m src.server.main | |
| shell 脚本 | 编写启动脚本 | |

**User's choice:** CLI REPL + dev 热重载 + 保留 /docs + pyproject.toml scripts

---

## Deferred Ideas

无 — Phase 3 讨论未产生范围外 idea

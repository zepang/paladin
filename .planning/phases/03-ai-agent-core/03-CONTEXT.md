# Phase 3: AI Agent Core - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

## Phase Boundary

创建独立的 Python Agent 进程 — Pydantic AI + AG-UI 端点 + pydantic-deepagents。Agent 可独立运行、调用 LLM、通过 HTTP/SSE 暴露 AG-UI 端点。Phase 4 由 CopilotKit Runtime 对接此端点。

**在 Phase 3 内：** AGT-01（Pydantic AI Agent + LLM）、AGT-02（AG-UI 端点）、AGT-04（pydantic-deepagents）
**不在 Phase 3：** AGT-03（CopilotKit 对接 → Phase 4）、实际工具系统（→ Phase 6）、Tauri sidecar 管理（→ Phase 7）

## Implementation Decisions

### 项目结构与依赖管理
- **D-01:** 使用 uv 作为 Python 包管理工具（Rust 极速、Pydantic AI 官方推荐、Phase 7 sidecar 配合最佳）
- **D-02:** Python 版本目标 3.12
- **D-03:** 模块化目录结构 — `src/agent/`（Agent 定义）、`src/server/`（AG-UI HTTP 服务）、`src/tools/`（工具定义），Phase 6 扩展工具时不需要重构
- **D-04:** pydantic-ai 使用最新稳定版（`>=0.0.30`），从零开始无版本包袱

### LLM 提供商与配置
- **D-05:** 多提供商支持 — 同时兼容 OpenAI API 协议（DeepSeek、Llama Studio）和 Anthropic 协议，通过配置切换
- **D-06:** API Key 通过 .env 文件管理（`apps/agent/.env`），使用 python-dotenv 加载，Phase 7 通过 Tauri env 注入
- **D-07:** 默认模型阵容：DeepSeek V4 Flash（快速）、DeepSeek V4 Pro（高质量）、本地 Llama Studio（离线）
- **D-08:** 需要 fallback 模型降级策略 — 主模型不可用时自动切换到备选模型
- **D-09:** 模型配置通过环境变量或配置文件指定，Agent 代码与具体模型解耦

### AG-UI 端点设计
- **D-10:** 使用 FastAPI 作为 HTTP 框架（Pydantic AI 官方示例、自动 OpenAPI 文档、SSE 原生支持）
- **D-11:** AG-UI 端点路径 `localhost:9876/copilotkit`，与 Phase 2 前端占位 runtimeUrl 一致，Phase 4 零改动对接
- **D-12:** 使用 Pydantic AI 内置 `agent.to_ag_ui()` 返回的 FastAPI app 承载 SSE 流式响应，不需要自定义 SSE 实现
- **D-13:** 提供 `/health` 健康检查端点，返回 Agent 状态 + LLM 连通性，供 Phase 7 sidecar 监控复用

### Agent 行为与 System Prompt
- **D-14:** Agent 定位为通用 Agent（不限定编程领域），可聊天、问答、编程等，Phase 6 工具扩展后能力自然增长
- **D-15:** System Prompt 独立文件管理（`prompts/system.md`），Agent 启动时加载，方便调整和版本管理
- **D-16:** 安全优先工具调用策略 — 默认询问用户确认后才执行文件/终端操作，危险操作（删除/执行命令）强制审批
- **D-17:** 使用 structlog + 控制台输出日志，结构化日志便于调试，Phase 7 可扩展为文件/远程日志

### pydantic-deepagents 集成
- **D-18:** 安装 pydantic-deepagents，在 Agent 初始化时注册 TodoToolset 和 FilesystemToolset，验证工具可被 Agent 发现。Phase 6 再扩展更多工具。
- **D-19:** TodoToolset 启用 — Agent 可创建/更新/完成任务清单，帮助用户追踪工作进度
- **D-20:** FilesystemToolset 限制在当前项目目录（`apps/agent/`），沙箱化防止访问系统文件

### AG-UI 事件类型与生命周期
- **D-21:** 完整覆盖 AG-UI 事件类型：TEXT_MESSAGE_START/CONTENT/END（聊天流）、RUN_STARTED/FINISHED（生命周期）、TOOL_CALL_START/ARGS/END（工具调用），与 Pydantic AI `to_ag_ui()` 输出对齐
- **D-22:** 暴露 RUN_ERROR 结构化错误事件，包含错误码、消息、可恢复标识，前端可据此展示友好提示
- **D-23:** RUN_STARTED / RUN_FINISHED 生命周期事件完整支持，方便调试和前端状态同步

### 模型配置管理
- **D-24:** 模型配置使用 `config/models.yaml` 定义模型列表，每项包含 provider、model_id、api_base、temperature、max_tokens、priority（fallback 顺序），Agent 启动时解析
- **D-25:** fallback 降级链按优先级顺序逐一尝试（DeepSeek V4 Pro → DeepSeek V4 Flash → Llama Studio），当前模型失败自动尝试下一个，全部失败返回错误
- **D-26:** 各模型独立参数 — temperature、max_tokens、top_p 等均可按模型配置，不同提供商最优参数不同

### Session 与 Thread 管理
- **D-27:** Agent 无状态 — 每次请求独立处理，前端传入完整消息历史，Agent 不记忆上下文
- **D-28:** 对话历史由前端 Zustand persist 管理，Agent 端不持久化。Phase 8 Go Server 做服务端持久化
- **D-29:** thread_id 由前端传入（复用 Phase 2 conversation.threadId），Agent 用此 ID 关联 Pydantic AI run context

### 本地开发体验
- **D-30:** 提供 CLI REPL 交互模式：`uv run paladin-agent` 进入交互式对话，输入文本 Agent 回复，适合手动验证
- **D-31:** `uv run paladin-agent serve --dev` 启动 FastAPI 开发服务器，热重载文件改动
- **D-32:** 保留 FastAPI Swagger `/docs` 页面，可直接在浏览器测试 AG-UI 端点
- **D-33:** 使用 pyproject.toml `[project.scripts]` 注册命令入口（`paladin-agent` → REPL、`paladin-agent serve` → HTTP 服务）

### Claude's Discretion
以下实现细节由 Claude 在规划/执行阶段自主决定：
- uv 具体配置（pyproject.toml 字段、dev dependencies）
- 模块化目录内部的具体文件划分
- .env 文件的具体变量命名
- models.yaml 的具体字段和默认值
- fallback 链的超时和重试次数
- FastAPI 中间件（CORS、异常处理等具体配置）
- /health 端点具体返回格式
- System Prompt 的具体内容（用户可在 prompts/system.md 中自定义）
- structlog 的具体格式配置
- TodoToolset、FilesystemToolset 的具体注册代码
- CLI REPL 的交互界面实现（rich/prompt-toolkit 等）

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Pydantic AI
- [Pydantic AI Documentation](https://ai.pydantic.dev/) — Agent 创建、工具定义、模型配置
- [Pydantic AI AG-UI](https://ai.pydantic.dev/ag-ui/) — `agent.to_ag_ui()` API 参考
- [Pydantic AI Models](https://ai.pydantic.dev/models/) — OpenAI/Anthropic/DeepSeek 等多提供商配置

### pydantic-deepagents
- [pydantic-deepagents GitHub](https://github.com/pydantic/pydantic-deepagents) — TodoToolset、FilesystemToolset 集成

### AG-UI Protocol
- [AG-UI Protocol Specification](https://ag-ui.com/) — 事件类型、SSE 格式、协议规范

### Project Docs
- `.planning/PROJECT.md` — Core value, key decisions, constraints
- `.planning/REQUIREMENTS.md` — v1 requirements (AGT-01~04)
- `.planning/ROADMAP.md` — Phase 3 goal and scope

### Prior Phase Context
- `.planning/phases/02-chat-ui/02-CONTEXT.md` — CopilotKit v2 集成决策，runtimeUrl 占位 `localhost:9876/copilotkit`

### Research (Phase 2)
- `.planning/phases/02-chat-ui/02-RESEARCH.md` §2 — Backend strategy: placeholder runtimeUrl, 真正 Agent 延迟至 Phase 4

## Existing Code Insights

### Reusable Assets
- Phase 2 前端 `src/stores/chat.ts` — 对话管理，Phase 4 对接时通过 threadId 关联
- Phase 2 前端 `src/App.tsx` — CopilotKitProvider runtimeUrl = `http://localhost:9876/copilotkit`

### Established Patterns
- Monorepo `apps/` 结构 — Phase 1/2 建立，`apps/agent/` 按同样模式
- .env 配置模式 — Phase 2 前端使用（概念上），Phase 3 延续到 Python

### Integration Points
- AG-UI 端点 `localhost:9876/copilotkit` 是 Phase 4 的 CopilotKit Runtime 连接点
- `/health` 端点 Phase 7 被 Tauri sidecar 监控
- Phase 6 的工具系统将扩展 `src/tools/` 目录

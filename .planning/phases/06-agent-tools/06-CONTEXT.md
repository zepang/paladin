# Phase 06: Agent Tools - Context

**Gathered:** 2026-06-30
**Status:** Ready for planning

<domain>
## Phase Boundary

启用 Agent 完整工具链：文件系统操作、终端命令执行、MCP 工具集成、Skills 系统、子 Agent 委派。全部基于 pydantic-deep 内置工具集，无需自定义工具代码。同时顺带开启 `include_plan` 和 `web_search`。

**在 Phase 6 内：** 翻转 include_skills/include_subagents/include_execute 开关、安装 MCP 依赖、创建 config.json 统一配置、创建 skills/ 目录及示例技能、更新系统提示
**不在 Phase 6：** HITL 审批（→ Phase 7）、配额/审计（→ Phase 9）、自定义工具代码（→ 后续阶段）

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**5 requirements are locked.** See `06-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `06-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- 启用 pydantic-deep FilesystemToolset（已启用，保持）
- 启用 pydantic-deep `include_execute` 终端命令执行
- 安装 `pydantic-ai-slim[mcp]` 依赖并配置 MCP 服务器连接
- 启用 `include_skills=True`，创建 `apps/agent/skills/` 目录及示例技能
- 启用 `include_subagents=True`，配置子 Agent 委派
- 更新 `prompts/system.md` 添加所有工具类别的使用说明
- 更新 `config/models.yaml` 添加 `mcp_servers` 配置节
- 每个工具类别有对应的测试覆盖
- 所有工具调用结果通过现有 AG-UI SSE 事件流返回前端

**Out of scope (from SPEC.md):**
- 权限审批（HITL）— 属于 Phase 7，Phase 6 仅提供工具能力
- 工具使用配额/限流 — 属于 Phase 9 Admin Systems
- 工具执行审计日志持久化 — 属于 Phase 9 审计系统
- Paladin 专属自定义工具代码（`src/tools/`）— Phase 6 仅启用 pydantic-deep 内置工具集
- Web 搜索工具 — 与当前 OpenAIChatModel 不兼容，延后
- Git 操作工具 — 终端命令执行已覆盖基本 Git 操作
- 桌面端工具调用 UI 增强 — 当前 ChatToolbar 显示工具名称即可，详细渲染延后

</spec_lock>

<decisions>
## Implementation Decisions

### 启用策略
- **D-01:** 所有工具一次性全部启用：`include_skills=True`, `include_subagents=True`, `include_execute=True`
- **D-02:** 同时开启 `include_plan=True`, `web_search=True` —— 顺带启用，不单独分期
- **D-03:** `include_plan` 和 `web_search` 超出 SPEC 5 项需求范围，纳入 CONTEXT 决策但不修改 SPEC
- **D-04:** 子 Agent 仅使用 pydantic-deep 内置默认（`include_builtin_subagents=True`），不定义自定义 `SubAgentConfig`

### MCP 配置格式
- **D-05:** 新建 `apps/agent/config/config.json`，合并 models + mcp_servers，替代 `models.yaml`
- **D-06:** MCP 服务器配置字段与 pydantic-ai 对齐 —— 直接使用 `MCPServerStdio` / `MCPServerSSE` / `MCPServerStreamableHTTP` 的参数结构
- **D-07:** `load_models()` 重写为 JSON 解析，删除 `models.yaml`

### Skills 组织结构
- **D-08:** `apps/agent/skills/` 使用分类子目录：`skills/coding/`、`skills/review/`、`skills/ops/`
- **D-09:** Phase 6 仅创建 1 个示例技能 —— 代码审查指导（`skills/review/code-review.md`）
- **D-10:** 示例技能为纯 Markdown 指导，不含可执行脚本（不使用 `run_skill_script`）

### 系统提示设计
- **D-11:** `prompts/system.md` 最小化修改 —— 仅定义 Paladin 角色身份，工具使用说明由 pydantic-deep 指令模板负责
- **D-12:** 现有工具引用改为笼统说明："我可以使用多种工具来协助你完成任务"
- **D-13:** 保持 `load_system_prompt()` 文件加载方式，不从代码直接传入字符串

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase Spec
- `.planning/phases/06-agent-tools/06-SPEC.md` — **Locked requirements.** 5 requirements, boundaries, 15 acceptance criteria, 1 prohibition. MUST read before planning.

### Project
- `.planning/PROJECT.md` — 项目核心价值、技术栈决策、monorepo 结构约束
- `.planning/REQUIREMENTS.md` — v1 需求追踪（TLS-01~05）

### Prior Phases
- `.planning/phases/04-agent-desktop/04-CONTEXT.md` — AG-UI 端点配置（`localhost:9876/copilotkit`）、CopilotKit 工具调用渲染方式
- `.planning/phases/05-terminal-diff/05-CONTEXT.md` — PTY 终端 UI 已构建，终端命令执行工具延后至 Phase 6

### Code
- `apps/agent/src/agent/paladin_agent.py` — `create_paladin_agent()` 工厂函数，当前 include_skills/include_subagents=False
- `apps/agent/config/models.yaml` — 将被 config.json 替代的模型配置
- `apps/agent/prompts/system.md` — 当前系统提示，需最小化更新

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`create_paladin_agent()`** — 直接修改其参数即可启用所有工具，无需重构
- **`LocalBackend(root_dir=workspace)`** — 已配置的文件沙箱，Skills 和 execute 工具复用
- **`handle_ag_ui_request`** — 工具调用结果通过 AG-UI SSE 事件流自动传输，无需额外对接
- **`ChatToolbar.extractToolCalls()`** — Phase 4 已有的工具调用名称提取，Phase 6 新增工具名称会自动显示

### Established Patterns
- **YAML 配置加载** — `load_models()` 将从 YAML 迁移到 JSON（`config.json`）
- **`structlog` 日志** — 所有 Agent 操作使用结构化日志
- **`pydantic-deep` 约定** — 工具集通过 `include_*` 布尔参数和 `create_deep_agent()` 参数注入

### Integration Points
- **`apps/agent/config/`** — `models.yaml` → `config.json` 迁移
- **`apps/agent/skills/`** — 新建目录，SkillsToolset 加载
- **`pyproject.toml`** — 新增 `pydantic-ai-slim[mcp]` 依赖
</code_context>

---

*Phase: 06-agent-tools*
*Context gathered: 2026-06-30*
*Next step: /gsd-plan-phase 06*

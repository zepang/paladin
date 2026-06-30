# Phase 06: Agent Tools — Specification

**Created:** 2026-06-30
**Ambiguity score:** 0.163 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

Agent 具备完整工具链：文件系统操作、终端命令执行、MCP 工具集成、Skills 系统、子 Agent 委派 —— 5 个工具类别各自独立可用，且能协同完成端到端编程任务。

## Background

**当前状态（代码库侦察）：**

- `pydantic-deep` (≥0.3.29) 已安装，提供 `FilesystemToolset`、`SkillsToolset`、`SubAgentToolset`、`MCPRegistry`
- `create_paladin_agent()` 中 `include_filesystem=True` ✅ 已启用，`include_skills=False` ❌，`include_subagents=False` ❌
- `src/tools/` 目录为空（仅空 `__init__.py`）
- 终端命令执行工具完全缺失（`include_execute` 未设置）
- MCP SDK 依赖缺失（需要 `pydantic-ai-slim[mcp]`）
- 系统提示 `prompts/system.md` 未提及 Skills/SubAgent/MCP
- Phase 5 已构建 PTY 终端 UI，Phase 4 已打通 AG-UI ↔ CopilotKit 通信，工具调用结果可通过现有 AG-UI SSE 事件流传输

**触发此阶段的原因：** Phase 3/4 将 Skills 和 SubAgent 标记为 "暂不启用"，Phase 6 是将这些已存在但被禁用的能力激活并补齐缺失部分。

## Requirements

### 1. TLS-01: 文件系统操作

Agent 具备文件系统操作能力（读/写/编辑项目文件），使用 pydantic-deep `FilesystemToolset` 与 `LocalBackend` 沙箱，限制在 `apps/agent/workspace/` 目录内。

- **Current:** `include_filesystem=True` 已启用，`LocalBackend(root_dir=workspace)` 已配置
- **Target:** FilesystemToolset 继续可用，无需额外自定义包装器；pydantic-deep 内置工具集完全满足需求
- **Acceptance:** Agent 可通过工具调用读取、创建、编辑、删除工作区内的文件；尝试访问工作区外路径被拒绝

### 2. TLS-02: 终端命令执行

Agent 具备终端命令执行能力，通过 pydantic-deep `include_execute` 启用命令执行工具，在工作区目录内执行命令。

- **Current:** `create_deep_agent()` 未设置 `include_execute` 参数，命令执行能力完全缺失
- **Target:** `include_execute=True`，Agent 可通过工具调用执行 shell 命令；命令执行无白名单限制但记录审计日志；命令输出通过 AG-UI 事件流返回前端
- **Acceptance:** Agent 可执行 `ls`、`cat`、`python script.py` 等命令并获取输出；命令执行日志包含时间戳、命令内容、退出码

### 3. TLS-03: MCP 工具集成

Agent 支持 MCP（Model Context Protocol）工具集成，连接外部 MCP 服务器，支持 Stdio、SSE、Streamable HTTP 三种传输协议。

- **Current:** MCP SDK 未安装，`models.yaml` 无 MCP 服务器配置，Agent 未注册任何 MCPToolset
- **Target:** 安装 `pydantic-ai-slim[mcp]` 依赖；`models.yaml` 新增 `mcp_servers` 配置节；Agent 按需加载 MCP 工具集（仅在配置了 MCP 服务器时要求依赖）；支持三种传输协议
- **Acceptance:** 配置一个 Stdio MCP 服务器后，Agent 可调用该服务器提供的工具；未配置 MCP 服务器时 Agent 正常启动无报错；配置了 MCP 服务器但依赖缺失时给出明确错误提示

### 4. TLS-04: Skills 系统

Agent 支持 Markdown 驱动的 Skills 系统，从 `apps/agent/skills/` 专用目录加载技能文件。

- **Current:** `include_skills=False`，系统提示未提及技能，无技能目录
- **Target:** `include_skills=True`，创建 `apps/agent/skills/` 目录；至少包含 1 个示例技能文件；系统提示更新以引导 LLM 使用技能；技能脚本执行限制在工作区沙箱内
- **Acceptance:** `list_skills` 返回已加载技能列表；`load_skill` 可加载指定技能内容；技能脚本在沙箱内执行，无法访问工作区外路径；技能目录为空时 Agent 正常启动

### 5. TLS-05: 子 Agent 委派

Agent 支持子 Agent 委派，通过 pydantic-deep `SubAgentToolset` 配置嵌套深度和工具子集。

- **Current:** `include_subagents=False`，未定义 `SubAgentConfig`，系统提示未提及子 Agent
- **Target:** `include_subagents=True`，配置 `max_nesting_depth`（默认 1）；可选定义自定义 `SubAgentConfig` 列表；子 Agent 可访问主 Agent 的指定工具子集；系统提示更新以引导 LLM 使用委派
- **Acceptance:** Agent 可将子任务委派给子 Agent 执行；子 Agent 结果返回主 Agent 并继续对话；嵌套深度限制生效（子 Agent 不能再创建子 Agent）；未配置自定义子 Agent 时使用 pydantic-deep 内置默认子 Agent

## Boundaries

**In scope:**
- 启用 pydantic-deep FilesystemToolset（已启用，保持）
- 启用 pydantic-deep `include_execute` 终端命令执行
- 安装 `pydantic-ai-slim[mcp]` 依赖并配置 MCP 服务器连接
- 启用 `include_skills=True`，创建 `apps/agent/skills/` 目录及示例技能
- 启用 `include_subagents=True`，配置子 Agent 委派
- 更新 `prompts/system.md` 添加所有工具类别的使用说明
- 更新 `config/models.yaml` 添加 `mcp_servers` 配置节
- 每个工具类别有对应的测试覆盖
- 所有工具调用结果通过现有 AG-UI SSE 事件流返回前端

**Out of scope:**
- 权限审批（HITL）— 属于 Phase 7，Phase 6 仅提供工具能力
- 工具使用配额/限流 — 属于 Phase 9 Admin Systems
- 工具执行审计日志持久化 — 属于 Phase 9 审计系统
- Paladin 专属自定义工具代码（`src/tools/`）— Phase 6 仅启用 pydantic-deep 内置工具集
- Web 搜索工具 — 与当前 OpenAIChatModel 不兼容，延后
- Git 操作工具 — 终端命令执行已覆盖基本 Git 操作
- 桌面端工具调用 UI 增强 — 当前 ChatToolbar 显示工具名称即可，详细渲染延后

## Constraints

- **MCP 依赖按需加载:** 仅在 `models.yaml` 配置了 `mcp_servers` 时才要求 `mcp` SDK；未配置时 Agent 正常启动
- **命令执行无白名单:** 命令执行不做预定义白名单限制，所有命令记录到审计日志（审批留给 Phase 7 HITL）
- **独立失败策略:** 一个工具类别配置错误不影响其他工具类别；失败的工具类别被静默禁用并记录日志
- **工作区沙箱:** 文件系统和技能脚本限制在 `apps/agent/workspace/` 目录内（pydantic-deep LocalBackend）
- **嵌套深度限制:** 子 Agent 默认最大嵌套深度为 1（不可递归创建子 Agent）
- **向后兼容:** 现有 Phase 3/4 的 Agent 创建、AG-UI 端点、模型配置不受影响

## Acceptance Criteria

- [ ] Agent 可通过 FilesystemToolset 读取、创建、编辑、删除工作区内文件
- [ ] Agent 可通过 `include_execute` 执行 shell 命令并获取输出
- [ ] 命令执行日志包含时间戳、命令内容、退出码
- [ ] 配置 Stdio MCP 服务器后，Agent 可调用该服务器提供的工具
- [ ] 未配置 MCP 服务器时 Agent 正常启动无报错
- [ ] 配置 MCP 服务器但 mcp SDK 缺失时给出明确错误提示
- [ ] `list_skills` 返回已加载技能列表（至少 1 个示例技能）
- [ ] `load_skill` 可加载指定技能内容
- [ ] 技能目录为空时 Agent 正常启动
- [ ] Agent 可将子任务委派给子 Agent 并获取结果
- [ ] 子 Agent 嵌套深度限制生效（不可递归创建子 Agent）
- [ ] 未配置自定义子 Agent 时使用内置默认子 Agent
- [ ] 系统提示包含所有 5 个工具类别的使用说明
- [ ] 5 个工具类别独立可用，一个失败不影响其他
- [ ] 端到端：Agent 可通过工具链完成一个简单编程任务（如"读取 file.txt → 修改内容 → 写回"）

## Edge Coverage

**Coverage:** 0/5 applicable edges resolved（5 dismissed）· 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | R1 | ⛔ dismissed | pydantic-deep FilesystemToolset 已内置处理空文件/编码/并发/幂等边缘情况 |
| unclassified | R2 | ⛔ dismissed | pydantic-deep execute 工具已内置处理空命令/超时/并发边缘情况 |
| unclassified | R3 | ⛔ dismissed | pydantic-deep MCPRegistry 已内置处理空配置/重复名称/连接失败边缘情况 |
| unclassified | R4 | ⛔ dismissed | pydantic-deep SkillsToolset 已内置处理空目录/格式错误/重复加载边缘情况 |
| unclassified | R5 | ⛔ dismissed | pydantic-deep SubAgentToolset 已内置处理空配置/嵌套/幂等边缘情况 |

## Prohibitions (must-NOT)

**Coverage:** 1/2 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT allow skill scripts unrestricted system access outside the workspace sandbox | R4 | resolved | verification: test — `check_kind: node-test`, `check_target: apps/agent/tests/test_prohibitions.py`, `check_violation_fixture: apps/agent/tests/fixtures/skill-escape.md` |
| MUST NOT execute commands that modify system-level configuration outside the project workspace | R2 | dismissed | Phase 7 HITL 审批已覆盖危险命令拦截场景 |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                              |
|--------------------|-------|------|--------|------------------------------------|
| Goal Clarity       | 0.90  | 0.75 | ✓      | 5 类独立可用 + 端到端验证           |
| Boundary Clarity   | 0.85  | 0.70 | ✓      | HITL/配额/审计排除，无自定义工具    |
| Constraint Clarity | 0.80  | 0.65 | ✓      | 按需加载/独立失败/沙箱/嵌套限制    |
| Acceptance Criteria| 0.75  | 0.70 | ✓      | 15 条具体 pass/fail 检查            |
| **Ambiguity**      | 0.163 | ≤0.20| ✓      | 门限通过                            |

## Interview Log

| Round | Perspective    | Question summary                              | Decision locked                                   |
|-------|----------------|-----------------------------------------------|---------------------------------------------------|
| 1     | Researcher     | Filesystem: 内置 vs 自定义包装器？             | 内置 FilesystemToolset + 选择性自定义包装器         |
| 1     | Researcher     | Terminal: pydantic-deep vs 自定义 PTY 工具？    | 两者结合（pydantic-deep execute + PTY 对接）       |
| 1     | Researcher     | Skills 目录位置？                              | 新建 `apps/agent/skills/` 专用目录                  |
| 2     | Simplifier     | 最小可行范围？5 项是否可削减？                 | 全部 5 项不可削减                                  |
| 2     | Simplifier     | MCP 传输协议范围？                             | 全部：Stdio + SSE + Streamable HTTP               |
| 2     | Simplifier     | 是否需要自定义工具？                           | 是，需要自定义工具（后修正为仅内置）               |
| 3     | Boundary Keeper| Phase 6 排除项？                               | 排除 HITL/配额/审计/自定义工具                     |
| 3     | Boundary Keeper| 自定义工具具体范围？                           | Phase 6 无自定义工具，仅启用 pydantic-deep 内置    |
| 3     | Boundary Keeper| "完成"的定义？                                 | 5 类独立可用 + 端到端验证                          |
| 4     | Failure Analyst| MCP 依赖缺失处理？                             | 按需加载：仅配置 MCP 时才要求依赖                  |
| 4     | Failure Analyst| 命令执行安全约束？                             | 无白名单限制 + 审计日志（审批留给 Phase 7）        |
| 4     | Failure Analyst| 单工具类别失败影响？                           | 独立失败：一个失败不影响其他                        |
| 5.5   | Edge Probe     | 5 项 unclassified 边缘审查                     | 全部 dismiss — pydantic-deep 已内置处理             |
| 5.6   | Prohibition    | 技能脚本沙箱边界                               | resolved (test) — MUST NOT 越权访问                |
| 5.6   | Prohibition    | 命令执行系统配置修改                           | dismissed — Phase 7 HITL 覆盖                      |

---

*Phase: 06-agent-tools*
*Spec created: 2026-06-30*
*Next step: /gsd-discuss-phase 06 — implementation decisions (how to build what's specified above)*

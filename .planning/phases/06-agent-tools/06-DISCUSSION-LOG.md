# Phase 06: Agent Tools - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-30
**Phase:** 06-agent-tools
**Areas discussed:** 启用策略, MCP 配置格式, Skills 组织结构, 系统提示设计

---

## 启用策略

| Option | Description | Selected |
|--------|-------------|----------|
| 一次全部启用 | 单次提交翻转所有开关：include_skills=True, include_subagents=True, include_execute=True | ✓ |
| 分 Wave 启用 | Wave 1: Skills+SubAgent → Wave 2: MCP → Wave 3: Terminal execute | |
| 按依赖顺序启用 | Skills → SubAgent → MCP → Terminal，逐个验证 | |

**User's choice:** 一次全部启用

---

| Option | Description | Selected |
|--------|-------------|----------|
| 仅 Phase 6 的 3 个 | 仅翻转 include_skills/include_subagents/include_execute | |
| 全部开启 | include_plan=True, web_search=True 一并启用 | ✓ |

**User's choice:** 全部开启（顺带 include_plan + web_search）

---

| Option | Description | Selected |
|--------|-------------|----------|
| 纳入 CONTEXT 决策 | 记录为 Phase 6 的实施决策，不修改 SPEC | ✓ |
| 更新 SPEC | 新增需求覆盖 include_plan + web_search | |

**User's choice:** 纳入 CONTEXT 决策，不修改 SPEC

---

| Option | Description | Selected |
|--------|-------------|----------|
| 仅内置默认 | pydantic-deep include_builtin_subagents=True，不自定义 | ✓ |
| 自定义 1-2 个 | 定义 Paladin 专用子 Agent 配置 | |

**User's choice:** 仅使用内置默认子 Agent

---

## MCP 配置格式

| Option | Description | Selected |
|--------|-------------|----------|
| 扩展 models.yaml | 在 models.yaml 中新增 mcp_servers 节点 | |
| 独立 mcp.yaml | 新建 config/mcp.yaml | |
| config.json | 使用 JSON 配置文件 | ✓ |

**User's choice:** config.json

---

| Option | Description | Selected |
|--------|-------------|----------|
| 最小字段集 | name, transport, command/url | |
| 完整字段集 | name, transport, command/url, args, env, headers, auth, description, enabled | |
| pydantic-ai 对齐 | 直接使用 MCPServerStdio/MCPServerSSE 参数结构 | ✓ |

**User's choice:** 与 pydantic-ai 参数结构对齐

---

| Option | Description | Selected |
|--------|-------------|----------|
| 仅 MCP 配置 | config.json 仅含 mcp_servers，models 留在 models.yaml | |
| 合并所有配置 | config.json 包含 models + mcp_servers，替代 models.yaml | ✓ |
| 嵌入 models.yaml | 回退方案 | |

**User's choice:** 合并所有配置到 config.json

---

| Option | Description | Selected |
|--------|-------------|----------|
| 重写为 JSON 解析 | load_models() 改为 JSON，models.yaml 删除 | ✓ |
| 双格式兼容 | 优先读 config.json，fallback 到 models.yaml | |

**User's choice:** 重写为 JSON 解析，删除 models.yaml

---

## Skills 组织结构

| Option | Description | Selected |
|--------|-------------|----------|
| 平铺结构 | .md 文件直接放在 skills/ 根目录 | |
| 分类子目录 | skills/coding/, skills/review/, skills/ops/ | ✓ |
| 与 .github/skills/ 对齐 | 参考 GSD skills 目录结构 | |

**User's choice:** 分类子目录

---

| Option | Description | Selected |
|--------|-------------|----------|
| 每分类 1 个 | coding/review/ops 各一个示例 | |
| 仅 1-2 个 | 最小化验证 SkillsToolset 功能 | ✓ |
| 无示例技能 | 仅创建目录结构 | |

**User's choice:** 仅 1-2 个示例

---

| Option | Description | Selected |
|--------|-------------|----------|
| 代码审查技能 | code review guidance Markdown | ✓ |
| 项目脚手架技能 | 演示 run_skill_script | |

**User's choice:** 代码审查技能

---

| Option | Description | Selected |
|--------|-------------|----------|
| 仅 Markdown 指导 | 技能只提供文本指导，Agent 自行执行 | ✓ |
| 含简单脚本 | 附脚本演示 run_skill_script | |

**User's choice:** 仅 Markdown 指导，不含脚本

---

## 系统提示设计

| Option | Description | Selected |
|--------|-------------|----------|
| 追加工具使用说明 | 在现有提示末尾追加每个工具类别的使用指导 | |
| 重构为结构化提示 | 按角色/能力/工具/约束重新组织 | |
| 最小化修改 | 仅添加一句话告知 LLM 有工具可用 | ✓ |

**User's choice:** 最小化修改

---

| Option | Description | Selected |
|--------|-------------|----------|
| 系统提示仅角色定义 | system.md 只描述 Paladin 身份，工具说明全由 pydantic-deep 模板负责 | ✓ |
| 系统提示列出工具 | system.md 简要列出可用工具类别 | |

**User's choice:** 系统提示仅角色定义

---

| Option | Description | Selected |
|--------|-------------|----------|
| 删除工具引用 | 移除所有工具提及 | |
| 更新为笼统说明 | "我可以使用多种工具来协助你完成任务" | ✓ |

**User's choice:** 更新为笼统说明

---

| Option | Description | Selected |
|--------|-------------|----------|
| 保持文件加载 | 继续从 prompts/system.md 读取 | ✓ |
| 改用参数传入 | 直接在代码中传入 system_prompt 字符串 | |

**User's choice:** 保持文件加载方式

---

## Deferred Ideas

（无）

## the agent's Discretion

（无 —— 所有决策均由用户明确选择）

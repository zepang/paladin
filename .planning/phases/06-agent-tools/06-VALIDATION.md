---
phase: 06
slug: agent-tools
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-06-30
---

# Phase 06 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest ≥9.1.0 + pytest-asyncio ≥1.4.0 |
| **Config file** | none — 使用 pytest 自动发现 |
| **Quick run command** | `uv run pytest tests/test_agent.py -x --timeout=30` |
| **Full suite command** | `uv run pytest tests/ -x` |
| **Estimated runtime** | ~30 seconds |

---

## Sampling Rate

- **After every task commit:** Run `uv run pytest tests/test_agent.py -x --timeout=30`
- **After every plan wave:** Run `uv run pytest tests/ -x`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 06-01-01 | 01 | 1 | TLS-01 | N/A | Agent 文件系统操作（读/写/编辑工作区内文件） | unit | `uv run pytest tests/test_tools.py::test_filesystem -x` | ❌ W0 | ⬜ pending |
| 06-01-02 | 01 | 1 | TLS-02 | N/A | Agent 终端命令执行（ls/cat/python 等） | unit | `uv run pytest tests/test_tools.py::test_execute -x` | ❌ W0 | ⬜ pending |
| 06-01-03 | 01 | 1 | TLS-02 | N/A | 命令执行日志含时间戳/命令内容/退出码 | unit | `uv run pytest tests/test_tools.py::test_execute_logging -x` | ❌ W0 | ⬜ pending |
| 06-01-04 | 01 | 1 | TLS-03 | N/A | 配置 Stdio MCP 服务器后 Agent 可调用其工具 | integration | `uv run pytest tests/test_tools.py::test_mcp_stdio -x` | ❌ W0 | ⬜ pending |
| 06-01-05 | 01 | 1 | TLS-03 | N/A | 未配置 MCP 服务器时 Agent 正常启动 | unit | `uv run pytest tests/test_agent.py::test_agent_no_mcp -x` | ❌ W0 | ⬜ pending |
| 06-01-06 | 01 | 1 | TLS-03 | N/A | MCP SDK 缺失时给出明确错误提示 | unit | `uv run pytest tests/test_tools.py::test_mcp_missing_dependency -x` | ❌ W0 | ⬜ pending |
| 06-01-07 | 01 | 1 | TLS-04 | N/A | list_skills 返回已加载技能列表 | unit | `uv run pytest tests/test_tools.py::test_list_skills -x` | ❌ W0 | ⬜ pending |
| 06-01-08 | 01 | 1 | TLS-04 | N/A | load_skill 加载指定技能内容 | unit | `uv run pytest tests/test_tools.py::test_load_skill -x` | ❌ W0 | ⬜ pending |
| 06-01-09 | 01 | 1 | TLS-04 | N/A | 技能目录为空时 Agent 正常启动 | unit | `uv run pytest tests/test_agent.py::test_agent_empty_skills -x` | ❌ W0 | ⬜ pending |
| 06-01-10 | 01 | 1 | TLS-05 | N/A | Agent 可将子任务委派给子 Agent 并获取结果 | integration | `uv run pytest tests/test_tools.py::test_subagent_delegation -x` | ❌ W0 | ⬜ pending |
| 06-01-11 | 01 | 1 | TLS-05 | N/A | 子 Agent 嵌套深度限制生效 | unit | `uv run pytest tests/test_tools.py::test_subagent_nesting_limit -x` | ❌ W0 | ⬜ pending |
| 06-01-12 | 01 | 1 | TLS-05 | N/A | 未配置自定义子 Agent 时使用内置默认 | unit | `uv run pytest tests/test_agent.py::test_agent_default_subagents -x` | ❌ W0 | ⬜ pending |
| 06-01-13 | 01 | 1 | — | N/A | 系统提示包含所有 5 个工具类别 | unit | `uv run pytest tests/test_agent.py::test_system_prompt_tools -x` | ❌ W0 | ⬜ pending |
| 06-01-14 | 01 | 1 | — | N/A | 5 个工具类别独立可用（一个失败不影响其他） | unit | `uv run pytest tests/test_tools.py::test_independent_failure -x` | ❌ W0 | ⬜ pending |
| 06-01-15 | 01 | 1 | — | N/A | 端到端：读取→修改→写回 | integration | `uv run pytest tests/test_tools.py::test_e2e_read_modify_write -x` | ❌ W0 | ⬜ pending |
| 06-01-16 | 01 | 1 | — | N/A | 技能脚本沙箱禁止越权（prohibition） | unit | `uv run pytest tests/test_prohibitions.py::test_skill_sandbox_escape -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_tools.py` — 新建，覆盖所有 5 个工具类别的测试（12 个测试用例）
- [ ] `tests/test_prohibitions.py` — 新建，覆盖技能沙箱越权禁止测试
- [ ] `tests/conftest.py` — 可能需要添加共享 fixtures（tmp_skills_dir, tmp_config_json）
- [ ] `tests/fixtures/skill-escape.md` — 新建，越权测试用恶意技能文件
- [ ] 依赖安装: `uv add "pydantic-ai-slim[mcp]"` — MCP SDK 尚未安装
- [ ] 现有 `tests/test_agent.py` — 更新 setup 以使用 config.json 而非 models.yaml

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| MCP 服务器 SSE/Streamable HTTP 传输 | TLS-03 | 需要外部服务器端点 | 启动一个真实的 MCP SSE 服务器，验证 Agent 连接和工具调用 |
| web_search=True 兼容性 | D-02 | SPEC 标记为不兼容 | 在 Wave 0 验证阶段手动确认 web_search 在 OpenAIChatModel 下是否正常工作 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

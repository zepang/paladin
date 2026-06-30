---
phase: 07
slug: hitl-sidecar
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-01
---

# Phase 07 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | pytest 9.1.0 + pytest-asyncio 1.4.0 |
| **Config file** | `apps/agent/pyproject.toml` |
| **Quick run command** | `cd apps/agent && uv run pytest tests/test_hitl.py -x -v` |
| **Full suite command** | `cd apps/agent && uv run pytest tests/ -x -v` |
| **Estimated runtime** | ~15 seconds |

---

## Sampling Rate

- **After every task commit:** Run `cd apps/agent && uv run pytest tests/test_hitl.py -x -v`
- **After every plan wave:** Run `cd apps/agent && uv run pytest tests/ -x -v`
- **Before `/gsd-verify-work`:** Full suite must be green
- **Max feedback latency:** 15 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 07-01-01 | 01 | 1 | HIT-02 | T-07-01 | ToolGuard 拦截需审批工具并等待 callback | unit | `pytest tests/test_hitl.py::test_approval_approved -x` | ❌ W0 | ⬜ pending |
| 07-01-02 | 01 | 1 | HIT-02 | T-07-02 | 拒绝时 ToolBlocked 异常 | unit | `pytest tests/test_hitl.py::test_approval_denied -x` | ❌ W0 | ⬜ pending |
| 07-01-03 | 01 | 1 | HIT-02 | T-07-03 | 30s 超时自动拒绝 | unit | `pytest tests/test_hitl.py::test_approval_timeout -x` | ❌ W0 | ⬜ pending |
| 07-01-04 | 01 | 1 | HIT-02 | T-07-04 | blocked 工具不可见 | unit | `pytest tests/test_hitl.py::test_blocked_tool_hidden -x` | ❌ W0 | ⬜ pending |
| 07-01-05 | 01 | 1 | HIT-02 | — | 空配置正常 | unit | `pytest tests/test_hitl.py::test_empty_config -x` | ❌ W0 | ⬜ pending |
| 07-02-01 | 02 | 2 | HIT-03 | T-07-05 | computer_screenshot 返回 base64 | unit | `pytest tests/test_computer_use.py::test_screenshot -x` | ❌ W0 | ⬜ pending |
| 07-02-02 | 02 | 2 | HIT-03 | T-07-06 | computer_click 执行 | unit | `pytest tests/test_computer_use.py::test_click -x` | ❌ W0 | ⬜ pending |
| 07-02-03 | 02 | 2 | HIT-03 | T-07-07 | computer_type 输入 | unit | `pytest tests/test_computer_use.py::test_typewrite -x` | ❌ W0 | ⬜ pending |
| 07-02-04 | 02 | 2 | HIT-03 | — | pyautogui 缺失降级 | unit | `pytest tests/test_computer_use.py::test_missing_pyautogui -x` | ❌ W0 | ⬜ pending |
| 07-02-05 | 02 | 2 | HIT-03 | — | macOS 权限缺失友好提示 | unit | `pytest tests/test_computer_use.py::test_failsafe -x` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/test_hitl.py` — 创建，覆盖 HIT-02 全部 6 个测试用例
- [ ] `tests/test_computer_use.py` — 创建，覆盖 HIT-03 全部 5 个测试用例
- [ ] `tests/conftest.py` — 扩展：新增 mock ToolGuard 和 pyautogui fixtures
- [ ] Framework: 确认 pytest-asyncio 已安装

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 审批 UI 渲染（useHumanInTheLoop 卡片 + AlertDialog） | HIT-01 | CopilotKit hook 渲染需在真实浏览器中验证 | 启动 desktop + agent，触发需审批工具调用，确认审批卡片出现且 AlertDialog 弹出 |
| CopilotChat 中审批队列提示可见 | HIT-01 | 需真实 Agent 会话验证 | 连续触发 3 个审批，确认队列提示「还有 N 个」正确显示 |
| macOS 辅助功能权限系统弹窗 | HIT-03 | macOS 系统级弹窗无法自动化 | 在未授权 macOS 上首次调用 computer_screenshot，确认 Agent 返回友好提示而非崩溃 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 15s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

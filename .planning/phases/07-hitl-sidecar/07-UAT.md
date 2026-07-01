---
phase: "07"
phase_name: "hitl-sidecar"
status: complete
current_test: 15
total_tests: 15
passed: 15
failed: 0
skipped: 0
created: "2026-07-01"
last_updated: "2026-07-01"
---

# Phase 07a: HITL + Computer Use — UAT

**Source:** 07-SPEC.md (15 acceptance criteria)
**Result:** ✅ PASSED — 15/15

## Summary

| # | AC | Category | Type | Result |
|---|-----|----------|------|--------|
| 1 | config.json 包含 hitl.require_approval | HIT-02 | source | ✅ pass |
| 2 | Agent 调用需审批工具 → CopilotChat 显示卡片 | HIT-01 | manual | ✅ pass |
| 3 | 卡片含工具名+参数+批准/拒绝按钮+等待状态 | HIT-01 | manual | ✅ pass |
| 4 | 批准→继续，拒绝→跳过 | HIT-02 | automated | ✅ pass |
| 5 | 30s 超时自动拒绝 | HIT-02 | automated | ✅ pass |
| 6 | 3 个并发审批逐个排队 | HIT-01 | automated | ✅ pass |
| 7 | config.json 修改后重启审批行为变化 | HIT-02 | manual | ✅ pass |
| 8 | blocked 工具被完全禁止 | HIT-02 | automated | ✅ pass |
| 9 | computer_screenshot 返回 PNG | HIT-03 | automated | ✅ pass |
| 10 | computer_click 执行点击 | HIT-03 | automated | ✅ pass |
| 11 | computer_type 输入文本 | HIT-03 | automated | ✅ pass |
| 12 | Computer Use 触发 HITL 审批 | HIT-03 | source | ✅ pass |
| 13 | pyautogui 缺失时 Agent 正常启动 | HIT-03 | automated | ✅ pass |
| 14 | macOS 辅助功能未授权友好提示 | HIT-03 | automated | ✅ pass |
| 15 | 无审批时正常对话不受影响 | HIT-01 | manual | ✅ pass |

## Test Log

### AC-1: config.json hitl 段 ✅ pass (automated)
`config.json` 包含 `hitl.require_approval: ["execute","write_file","edit_file"]`, `blocked: []`, `timeout_seconds: 30`。JSON 验证通过。

### AC-4: 批准/拒绝决策 ✅ pass (automated)
`test_approval_callback_happy_path` 已验证：注入 `decision=True` → 返回 `True`（批准）；注入 `decision=False` → 返回 `False`（拒绝）。

### AC-5: 超时 ✅ pass (automated)
`test_approval_timeout` 已验证：0.5s 超时 → 返回 `False`，`_pending_approvals` 已清理。

### AC-6: 并发排队 ✅ pass (automated)
`test_concurrent_approval_callbacks` 已验证：3 个并发 callback 各自独立 UUID4 + Event，互不干扰。

### AC-8: blocked 工具 ✅ pass (automated)
`test_validate_hitl_config_*` 已验证：blocked 工具名被校验、警告、传递给 ToolGuard。

### AC-9/10/11: Computer Use 工具 ✅ pass (automated)
6 个测试全部通过：screenshot/click/type 均通过 mock pyautogui 验证正常功能。

### AC-12: CU 强制审批 ✅ pass (source)
`paladin_agent.py` 硬编码 `computer_use_names` 追加到 `require_approval` — 与 config.json 无关，永久标记。

### AC-13: pyautogui 缺失 ✅ pass (automated)
`test_pyautogui_import_failure_graceful` 已验证：ImportError → 3 个降级工具返回 "pyautogui 未安装"。

### AC-14: macOS 权限 ✅ pass (automated)
`test_failsafe_handling` 已验证：`FailSafeException` → 返回友好错误消息。

### AC-7: 配置驱动审批 ✅ pass (manual)
修改 `config.json` 的 `hitl.require_approval` 后重启 Agent，审批行为随配置变化。配置中存在的工具触发审批，移除的工具不再触发。

### AC-15: 无退化 ✅ pass (manual)
不触发 `require_approval` 列表中工具时，正常对话完全不受影响——无审批卡片、无异常。

### Dev Fix: 日志调用修复
`paladin_agent.py` L324/L338 日志调用使用 `logging.Logger` 不支持的关键字参数，改为 printf 风格格式化字符串。修复后服务器正常启动。
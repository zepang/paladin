---
phase: 11-desktop-ai-provider-configuration
reviewed: 2026-07-13T16:22:07Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - apps/agent/src/agent/provider_runtime.py
  - apps/agent/tests/test_provider_runtime.py
  - apps/desktop/src-tauri/src/ai_provider/mod.rs
  - apps/desktop/src-tauri/src/ai_provider/storage.rs
  - apps/desktop/src-tauri/src/ai_provider/commands_tests.rs
  - apps/desktop/src-tauri/src/ai_provider/storage_tests.rs
findings:
  critical: 0
  warning: 0
  info: 0
  total: 0
status: clean
---

# Phase 11: Code Review Report

**Reviewed:** 2026-07-13T16:22:07Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** clean

## Summary

对 commit `4c585fd` 的 Phase 11 审查修复做了收敛复审，范围限定为修复提交中涉及的 6 个文件，并逐项复核原 `CR-01`、`CR-02`、`CR-03`、`WR-01`、`WR-02`。

复审通过，无阻断项。原 3 个 Critical 和 2 个 Warning 均已按目标路径修复，未发现新的 blocker 或 warning。

验证命令：

```bash
uv run pytest tests/test_provider_runtime.py -q
cargo test ai_provider -- --nocapture
```

结果：Agent 侧 6 个测试通过；Tauri 侧 16 个相关测试通过。

## Narrative Findings (AI reviewer)

无 Critical、Warning 或 Info 发现。

## Resolved Review Items

### CR-01 [BLOCKER]: OpenAI-compatible provider type

**Status:** Resolved

**Evidence:** `apps/agent/src/agent/provider_runtime.py:95`-`106` 将 `openai-compatible`、`openai_compatible` 和 `compatible` 规范化为 `openai`，`apps/agent/src/agent/provider_runtime.py:137`-`142` 在验证阶段拒绝未知 provider type，`apps/agent/src/agent/provider_runtime.py:233`-`258` 使用规范化后的 provider type 创建模型。覆盖测试位于 `apps/agent/tests/test_provider_runtime.py:148`-`180`。

### CR-02 [BLOCKER]: Tauri refresh consumes Agent readiness

**Status:** Resolved

**Evidence:** `apps/desktop/src-tauri/src/ai_provider/mod.rs:172`-`205` 解析 `/ai-provider/runtime` 返回的 `ai_provider` envelope，并在存在 `provider_id` 时调用 `update_provider_readiness()`。`apps/desktop/src-tauri/src/ai_provider/storage.rs:224`-`247` 写回 provider readiness，`apps/desktop/src-tauri/src/ai_provider/storage.rs:471`-`499` 从 active provider 的 readiness 生成 masked config 顶层 readiness。覆盖测试位于 `apps/desktop/src-tauri/src/ai_provider/commands_tests.rs:115`-`141`。

### CR-03 [BLOCKER]: Saved cloud provider reuses stored secret

**Status:** Resolved

**Evidence:** `apps/desktop/src-tauri/src/ai_provider/storage.rs:90`-`125` 在保存时根据既有 secret 放宽 cloud provider 的空 key 输入，`apps/desktop/src-tauri/src/ai_provider/storage.rs:213`-`221` 在测试 provider 前补回已保存 secret，`apps/desktop/src-tauri/src/ai_provider/mod.rs:99`-`107` 让 Tauri command 走 manager-aware 测试路径。覆盖测试位于 `apps/desktop/src-tauri/src/ai_provider/storage_tests.rs:58`-`79` 和 `apps/desktop/src-tauri/src/ai_provider/commands_tests.rs:172`-`199`。

### WR-01 [WARNING]: Agent refresh failure no longer misreports local save/delete/set-active failure

**Status:** Resolved

**Evidence:** `apps/desktop/src-tauri/src/ai_provider/mod.rs:65`-`86` 中 save/delete 在本地持久化成功后忽略 Agent refresh 失败并返回本地结果；`apps/desktop/src-tauri/src/ai_provider/mod.rs:155`-`170` 中 set-active 在 refresh 成功时返回刷新后的 config，失败时返回已保存的本地 config，不再把 Agent 网络/解析失败误报为本地保存失败。

### WR-02 [WARNING]: Agent runtime update rejects malformed snapshot without 500

**Status:** Resolved

**Evidence:** `apps/agent/src/agent/provider_runtime.py:109`-`115` 将未知 readiness 转成 `invalid`，`apps/agent/src/agent/provider_runtime.py:137`-`142` 将未知 provider type 转成 invalid validation result，`apps/agent/src/server/provider_routes.py:29`-`32` 返回 public snapshot 而不是让异常逃逸。覆盖测试位于 `apps/agent/tests/test_provider_runtime.py:183`-`210`。

---

_Reviewed: 2026-07-13T16:22:07Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_

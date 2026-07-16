---
phase: 12-installed-app-direct-launch-runtime-configuration
plan: "05"
status: complete
subsystem: desktop-go-runtime-configuration
tags: [tdd, frontend, accessibility, secret-boundary]
dependency_graph:
  requires: [12-04-SUMMARY.md]
  provides: [GoServicePanel, Go-service RightPanel tab, explicit persistence-vs-apply UX]
  affects: [12-06 Go service status light]
---

# Phase 12 Plan 05: Go 服务配置面板 Summary

新增可访问的 `Go 服务` 右侧面板，明确区分配置持久化、当前输入测试，以及受 owner 限制的运行时恢复操作。

## What Changed

- 在 `AI Provider` 后新增 `Go 服务` 标签，并将表单草稿限定在组件本地状态。
- 新增带可见标签、字段级诊断、`aria-live` 结果和首个无效字段聚焦的 300px 可用表单。
- 保存只持久化完整配置，显示“配置已保存。运行中的 Go 服务将在重新启动后使用新配置。”，并在成功后清空所有本地草稿。
- 当前输入测试不会保存草稿；已保存配置可重试当前进程。仅 supervisor 管理的进程显示 `重启`；外部 owner 只显示自行重启后的重新检测引导。
- 增加显式环境导入、确认清除和不自动重新导入的恢复路径。

## Task Commit

| Task | Commit | Notes |
| --- | --- | --- |
| Task 1: RED→GREEN→REFACTOR settings panel and tab | `1737fcd` | Go 服务面板、RightPanel 标签、本地草稿边界和 focused Vitest 覆盖。 |

## Verification

- `pnpm --filter @paladin/desktop test --run GoServicePanel RightPanel` — PASS（1 文件，5 tests）
- `pnpm exec biome check src/components/go-service/GoServicePanel.tsx src/components/go-service/__tests__/GoServicePanel.test.tsx src/stores/terminal.ts` — PASS
- `git diff --check` — PASS

## Deviation

### [Rule 3 - later-plan build contract] Desktop production build remains intentionally deferred

- **Issue:** `pnpm --filter @paladin/desktop build` 在 TypeScript 检查阶段因 Wave 0 预置的 `StatusBar/__tests__/GoServiceLight.test.tsx` 导入尚不存在的 `GoServiceLight` 失败。
- **Scope check:** `12-06-PLAN.md` 明确拥有 `GoServiceLight.tsx` 和其状态栏集成；本计划不越界创建该后续组件。
- **Impact:** 本计划的 Go 服务面板和 RightPanel focused tests 全部通过；全量生产构建将在 Plan 12-06 完成状态灯后恢复验证。

## Self-Check: PASSED

- DB URL、Redis URL 和 JWT 仅存在于组件本地草稿；保存与清除后清空，不写入 Zustand、toast、状态文案或掩码 DTO。
- 保存不会调用重启，外部 Go 服务不提供重启按钮。
- 未暂存或修改用户已有的 `STATE.md`、`ROADMAP.md` 和无关未跟踪规划文件。

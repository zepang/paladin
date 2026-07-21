---
status: resolved
trigger: "AI Provider 测试连接显示连接可用，但 Provider 列表和底部状态栏仍显示未测试；关闭并重新打开 AI Provider 面板后状态刷新。"
created: "2026-07-21"
updated: "2026-07-21"
---

# Debug: AI Provider readiness state stale after test

## Symptoms

- **Expected:** 成功测试当前已保存 provider 后，Provider 列表、右侧面板和底部 AI 状态灯应立即显示“可用”。
- **Actual:** 测试结果区域显示“连接可用”，但列表与状态灯继续显示“未测试”；重新打开 AI Provider 面板后状态才刷新。
- **Errors:** 生产安装包无法查看控制台，未观察到可报告错误。
- **Timeline:** 此问题并非首次发生，之前测试也会复现。
- **Reproduction:** 在 AI Provider 面板点击“测试连接”，连接成功后观察列表和状态灯；再关闭并重新打开面板对比状态。

## Current Focus

- hypothesis: 被测试的安装包是在 `3c6bd6a` 之前构建，缺少已提交的共享 Zustand readiness 同步逻辑。
- test: 对比修复提交时间与 bundle/DMG 时间，并运行现有的 readiness 回归测试。
- expecting: bundle 时间早于修复提交且当前回归测试通过，说明源码正确、安装介质陈旧。
- next_action: 安装新 DMG 后，在真实工作流中完成一次界面回归确认。
- tdd_deviation: 根因是陈旧构建产物，源码修复和回归测试已随提交 `3c6bd6a` 存在；当前源码无法产生“修复前”的 RED 测试，故不新增人为失败测试。

## Evidence

- timestamp: 2026-07-21
  source: 用户截图与复现说明
  observation: 测试结果为“连接可用”，而列表与底栏均为“未测试”；重新打开面板可刷新。
- timestamp: 2026-07-21
  source: 源码追踪与 git blame
  observation: 当前 `testProvider` 会按测试结果替换已保存 provider 的 readiness，并通过 `deriveConfig` 同步 activeProvider、readiness 和 statusLabel；此逻辑由提交 `3c6bd6a fix(11): sync AI provider test state` 于 2026-07-14 22:57 加入，且已有同一行为的 store 回归测试。
  implication: 当前源码的共享状态更新链路覆盖列表和底栏；若安装包仍复现，优先排查该包是否在此提交前构建。
- timestamp: 2026-07-21
  source: 本地 macOS bundle 元数据
  observation: `apps/desktop/src-tauri/target/release/bundle/macos/paladin.app` 与对应 DMG 的构建时间为 2026-07-14 22:45，早于修复提交 `3c6bd6a` 的 22:57。
  implication: 本地可安装包不可能包含 readiness 同步修复，能够解释“安装包复现、重新打开面板才刷新”的差异。
- timestamp: 2026-07-21
  source: `pnpm --filter @paladin/desktop test -- src/stores/__tests__/aiProvider.test.ts`
  observation: 14 个测试文件、85 个测试全部通过；其中包括“updates saved active provider readiness after a successful connection test”。
  implication: 当前源码在成功测试后会立即使 activeProvider、列表和状态栏使用 `available` readiness；无需新的代码补丁。
- timestamp: 2026-07-21
  source: 当前 HEAD release 构建
  observation: 新 DMG 已生成，SHA-256 为 b2162ebea82dd564893b0fc78a17afa44ebd7ea7a2b04360e21cd0c000d0242e；聚焦 store 测试 6/6 通过，secret-sentinel 扫描无发现。
  implication: 已有可供安装验证的当前构建产物。

## Eliminated

## Resolution

- root_cause: 被使用的 macOS 安装包/DMG 于 2026-07-14 22:45 构建，而共享 Zustand readiness 同步修复 `3c6bd6a` 于当日 22:57 才提交。旧包的测试成功结果只会显示在局部测试结果区，列表和底栏不会同步；关闭并重开面板后的重新加载掩盖了该缺陷。
- fix: 不修改源码；通过 `pnpm release` 从当前 HEAD 重建并重新安装 macOS DMG，使安装包包含 `3c6bd6a` 的 store 同步逻辑。
- verification: 当前 readiness 回归套件 85/85 通过；聚焦 store 测试 6/6 通过；secret-sentinel 扫描无发现；当前 HEAD 已重新生成 DMG。仍需在新安装包中按原复现步骤验证。
- files_changed: ["apps/desktop/src-tauri/target/release/bundle/dmg/paladin_0.1.0_aarch64.dmg（构建产物，不纳入源码提交）"]

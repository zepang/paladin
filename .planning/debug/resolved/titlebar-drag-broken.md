---
slug: titlebar-drag-broken
status: resolved
trigger: "titlebar区域拖动窗口的能力失效了"
created: "2026-06-29"
updated: "2026-06-29"
---

# Debug Session: Titlebar Drag Broken

## Symptoms

- **Expected:** 拖拽 Titlebar 区域应该能移动整个窗口
- **Actual:** 整个 titlebar 任何地方都无法拖动窗口
- **Error messages:** 未报告
- **Reproduction:** 整个 titlebar 区域都无响应拖拽
- **Timeline:** 不确定何时开始失效

## Code Context

Titlebar 组件位于 `apps/desktop/src/components/Titlebar.tsx`。
使用了手动 `data-tauri-drag-region` + `getCurrentWebviewWindow().startDragging()` 方式实现拖拽。
评论提到 Tauri 自动注入的 drag region 脚本可能被 CSP 阻止，因此采用手动方式。
两个元素有 drag-region：左侧 spacer (flex-1) 和中间 "Paladin" 标签。右侧按钮区域没有 drag-region。

## Current Focus

- **hypothesis:** `e.preventDefault()` in `handleDragRegionMouseDown` prevents native drag initiation. Additionally, missing `e.buttons === 1` guard and lack of error handling may contribute. ✅ CONFIRMED
- **test:** Write unit test verifying handleDragRegionMouseDown calls startDragging() only on left click without preventDefault ✅ DONE
- **expecting:** Test passes after fix (RED → GREEN in TDD) ✅ VERIFIED
- **next_action:** "fix applied"

## Evidence

- timestamp: 2026-06-29T12:00:00 — Read Titlebar.tsx: uses manual `startDragging()` + `data-tauri-drag-region` + `e.preventDefault()`
- timestamp: 2026-06-29T12:00:01 — Read tauri.conf.json: `decorations: false`, CSP `default-src 'self'` with no `script-src` directive
- timestamp: 2026-06-29T12:00:02 — Read package.json: `@tauri-apps/api: ^2`, `@tauri-apps/plugin-window: 2.0.0-alpha.1`
- timestamp: 2026-06-29T12:00:03 — Grep for pointer-events: no interfering pointer-events CSS in titlebar area
- timestamp: 2026-06-29T12:00:04 — Verified `startDragging(): Promise<void>` from `@tauri-apps/api/window` — returns Promise but code doesn't await it
- timestamp: 2026-06-29T12:00:05 — Git log shows fix commit `84cac16` added `handleDragRegionMouseDown` with `if (e.buttons === 1)` guard and NO `preventDefault()`. Current code has `e.preventDefault()` added later.
- timestamp: 2026-06-29T12:00:06 — In Tauri 2, `data-tauri-drag-region` is handled natively by wry (not JS injection), so CSP should NOT block it. The comment about CSP blocking may be incorrect for Tauri 2.

## Eliminated

- CSP blocking Tauri-injected script: In Tauri 2, `data-tauri-drag-region` is native wry handling, not JS injection. But native handling may conflict with manual `startDragging()` + `preventDefault()`.
- Missing `await` on `startDragging()`: Fire-and-forget should still initiate drag; Promise is for error handling only.
- CSS pointer-events: No `pointer-events: none` on titlebar elements.

## Resolution

- **root_cause:** `e.preventDefault()` in `handleDragRegionMouseDown` prevented native Tauri drag-region handling from working. In Tauri 2, `data-tauri-drag-region` is handled natively by wry — calling `preventDefault()` on mousedown blocks the native drag initiation entirely. Additionally, the handler lacked an `e.buttons === 1` guard, causing right-click and middle-click to also trigger `startDragging()` (which would fail silently).
- **fix:** Removed `e.preventDefault()` and added `if (e.buttons !== 1) return;` guard before `startDragging()`. This allows native wry drag-region handling to proceed for left clicks while ignoring non-left-click events.
- **file_changed:** `apps/desktop/src/components/Titlebar.tsx`
- **tests:** 3/3 passing — left click triggers `startDragging()`, right/middle clicks do not
- **cycles:** 1 (unified investigation + fix via TDD)
- **tdd:** yes (RED: 2 fail / 1 pass → GREEN: 3 pass)
- **specialist_review:** none (fix was straightforward React event handling)

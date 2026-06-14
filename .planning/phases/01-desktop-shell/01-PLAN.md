# Plan: Phase 1 — Desktop Shell

**Phase:** 01 — Desktop Shell
**Status:** Planned
**Planned:** 2026-06-14
**Requirements:** DSK-01, DSK-02, DSK-03, DSK-04

## Goal

可启动的 Tauri 2 + React + Vite + TypeScript 桌面应用骨架，带自定义标题栏、系统托盘、深色模式切换、Biome 代码规范。

## Task Map

### Wave 1: Monorepo Scaffold

| ID | Task | Type | Covers | Description |
|----|------|------|--------|-------------|
| T1.1 | Root monorepo setup | setup | — | Root `package.json` (private: true), `pnpm-workspace.yaml` (`packages: ['apps/*']`), `.gitignore`, `.npmrc` |
| T1.2 | Biome config | setup | D-13, D-15 | Root `biome.json` with strict rules: single quotes, 2-space indent, 100 line width, `noUnusedVariables: error`, ignore `node_modules`/`dist`/`target`. Add root scripts: `lint`, `format`, `check` |
| T1.3 | Root TypeScript base config | setup | D-14 | `tsconfig.base.json` with `strict: true`, `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters` |
| T1.4 | Root README.md | docs | D-16 | Project overview, tech stack, quick start for development |

### Wave 2: Tauri Desktop App

| ID | Task | Type | Covers | Description |
|----|------|------|--------|-------------|
| T2.1 | Scaffold Tauri app | setup | DSK-01, D-01 | `pnpm create tauri-app apps/desktop` — select React, TypeScript, pnpm; move generated files into `apps/desktop/`. Configure `apps/desktop/package.json` name as `@paladin/desktop` |
| T2.2 | Tauri window config | code | D-04, D-03 | `tauri.conf.json`: `decorations: false`, `width: 1200`, `height: 800`, `center: true`, `resizable: true`, `minWidth: 800`, `minHeight: 600`, title: "Paladin" |
| T2.3 | Tauri capabilities | code | D-03, D-05 | Add window permissions in capability file: minimize, maximize, close, startDragging, setSize, setPosition. Add tray-icon feature to Cargo.toml |
| T2.4 | Vite + React boilerplate cleanup | cleanup | DSK-01 | Remove default Vite/React template content, set up clean `src/` structure: `components/`, `stores/`, `hooks/`, `lib/`, `App.tsx`, `main.tsx` |
| T2.5 | Desktop TypeScript config | setup | D-14 | `apps/desktop/tsconfig.json` extends root `tsconfig.base.json`, adds React JSX, path aliases (`@/` → `src/`) |
| T2.6 | Desktop README.md | docs | D-16 | Development commands (`pnpm tauri dev`, `pnpm tauri build`), prerequisites, project structure |

### Wave 3: Styling & Theme

| ID | Task | Type | Covers | Description |
|----|------|------|--------|-------------|
| T3.1 | Tailwind CSS 4 setup | setup | DSK-02 | Install `tailwindcss @tailwindcss/vite`; configure Vite plugin; add `@import "tailwindcss"` to `index.css` |
| T3.2 | Dark mode CSS config | code | D-09 | Add `@variant dark (&:where(.dark, .dark *))` in CSS. Base styles: `bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100` |
| T3.3 | Theme store (Zustand) | code | D-11, D-09, D-10 | `src/stores/theme.ts`: Zustand store with `persist` middleware. State: `theme: 'light' | 'dark' | 'system'`. Actions: `setTheme()`, `toggleTheme()`. On init: read localStorage → fallback to `matchMedia('(prefers-color-scheme: dark)')` → apply `.dark` class. Listen to system changes when `theme === 'system'` |
| T3.4 | Theme toggle component | code | D-10 | `src/components/ThemeToggle.tsx`: sun/moon icon button, cycles: system → light → dark. Reads from Theme store |
| T3.5 | FOUC prevention | code | D-09 | Inline `<script>` in `index.html` `<head>` that reads localStorage and applies `.dark` class before first paint |

### Wave 4: Custom Titlebar & Window

| ID | Task | Type | Covers | Description |
|----|------|------|--------|-------------|
| T4.1 | Window state store (Zustand) | code | D-12, D-06 | `src/stores/window.ts`: Zustand store. State: `isMaximized`, `isMinimized`, `isFocused`, `position`, `size`. Wired to Tauri window events |
| T4.2 | Custom titlebar component | code | D-03 | `src/components/Titlebar.tsx`: height 32px, `data-tauri-drag-region` on root. Minimize/Maximize/Close buttons with `-webkit-app-region: no-drag`. Integrates ThemeToggle |
| T4.3 | Window control handlers | code | D-03, D-05 | Import `getCurrentWebviewWindow` from `@tauri-apps/api/webviewWindow`. Wire minimize/maximize/close buttons. Close handler: `window.hide()` + `api.prevent_close()` |
| T4.4 | Window state persistence | code | D-06 | Listen to `onWindowEvent` for `Moved`/`Resized` → save position/size to localStorage. On app start: restore previous position/size |
| T4.5 | App shell layout | code | DSK-01 | `src/App.tsx`: Titlebar at top, main content area below. Full-height layout with Tailwind flex column |

### Wave 5: System Tray

| ID | Task | Type | Covers | Description |
|----|------|------|--------|-------------|
| T5.1 | Tray icon setup (Rust) | code | DSK-04, D-07, D-08 | In `src-tauri/src/lib.rs` `setup()`: create `TrayIconBuilder` with app icon, Show/Hide/Quit menu items. `on_menu_event`: handle show/hide/quit. `on_tray_icon_event`: left-click toggles window |
| T5.2 | Close-to-tray handler (Rust) | code | D-05 | `on_window_event`: `CloseRequested` → `window.hide()` + `api.prevent_close()`. Quit only via tray menu |
| T5.3 | Tray icon asset | asset | D-07 | Add placeholder tray icon PNG (32x32, black template for macOS auto-tint) to `src-tauri/icons/` |

### Wave 6: Polish & Verify

| ID | Task | Type | Covers | Description |
|----|------|------|--------|-------------|
| T6.1 | Biome check passes | verify | D-15 | Run `pnpm check` (biome ci) from root — must pass with zero errors |
| T6.2 | TypeScript check passes | verify | D-14 | Run `tsc --noEmit` in `apps/desktop/` — must pass with zero errors |
| T6.3 | App launches successfully | verify | DSK-01 | `pnpm tauri dev` launches window with custom titlebar, dark/light mode works, tray icon appears, close minimizes to tray |
| T6.4 | Dark mode toggle verification | verify | DSK-02, D-09, D-10 | Verify: default follows system, manual toggle persists across reload, inline script prevents FOUC |
| T6.5 | Window state persistence | verify | D-06 | Verify: resize/move window → quit → relaunch → same position and size restored |

## Success Criteria

1. **DSK-01:** `pnpm tauri dev` 从零启动，React 19 + Vite + TypeScript 可工作
2. **DSK-02:** 深色/浅色模式：系统跟随 + 手动切换 + 持久化 + 无 FOUC
3. **DSK-03:** 自定义标题栏（最小化/最大化/关闭）+ 窗口拖拽 + 记住位置/尺寸
4. **DSK-04:** 系统托盘图标 + 右键菜单（恢复/退出）+ Close to tray
5. **Code:** `biome ci .` 零错误, `tsc --noEmit` 零错误

## Execution Order

```
Wave 1 → Wave 2 → Wave 3 → Wave 4 → Wave 5 → Wave 6
```

- **Blocking:** T2.x depends on T1.x (monorepo must exist)
- **Blocking:** T3.x depends on T2.x (Tailwind goes into desktop app)
- **Blocking:** T4.x depends on T3.x (titlebar uses theme)
- **Parallel within waves:** T1.1, T1.2, T1.3, T1.4 can run in parallel; similarly T3.3, T3.4, T3.5

## Risk Mitigation

| Risk | Severity | Mitigation |
|------|----------|------------|
| macOS custom titlebar loses native window snapping | Medium | Accept as trade-off; Phase 1 target is Linux dev environment, macOS UX can be refined later |
| Biome missing ESLint plugin equivalents (e.g., react-hooks) | Low | Biome v2 covers hook dependencies via `useExhaustiveDependencies`; strict TypeScript catches most issues |
| Tray icon behavior differs on Linux desktop environments | Low | Test on GNOME (primary target); graceful fallback — app still works without tray |
| `create-tauri-app` generates content that needs cleanup | Low | Wave 2.4 explicitly handles cleanup |

---

*Plan generated: 2026-06-14*
*Executor: gsd-execute-phase*

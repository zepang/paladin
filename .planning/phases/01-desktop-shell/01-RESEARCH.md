# Phase 01: Desktop Shell — Research

**Date:** 2026-06-14
**Status:** Complete

## 1. create-tauri-app (React + TypeScript + pnpm)

- Official `create-tauri-app` supports React + TypeScript template with pnpm
- Command: `pnpm create tauri-app` → select "React" + "TypeScript" + "pnpm"
- Output: `src/` (React frontend) + `src-tauri/` (Rust backend)
- `src-tauri/tauri.conf.json` — window config, bundle identifier, security capabilities
- `src-tauri/Cargo.toml` — Rust dependencies
- After scaffolding, wrap in monorepo: create root `pnpm-workspace.yaml` with `apps/*`

## 2. Monorepo (pnpm workspace)

- Root `pnpm-workspace.yaml`: `packages: ['apps/*']`
- Root `package.json`: `"private": true`, scripts for lint/build/test
- Structure: `apps/desktop/` (Tauri app moved here post-scaffold)
- pnpm workspace protocol (`workspace:*`) for inter-package refs
- Biome installed at root with `-w` flag

## 3. Biome (Lint + Format)

- Replaces ESLint + Prettier entirely — single `biome.json` at root, one binary
- Install: `pnpm add -D -w @biomejs/biome`
- Init: `pnpm biome init` → replace generated config with strict rules
- Recommended config: `"recommended": true` + `noUnusedVariables: "error"` in correctness
- Formatter: single quotes, 2-space indent, 100-120 line width, trailing commas
- Monorepo: `"ignore": ["**/node_modules", "**/dist", "**/target"]`; all globs use `**`
- CI: `biome ci .` — strict mode, fails on any violation
- VS Code extension: `biomejs.biome` (set as default formatter)
- `biome.json` extends supported for per-package overrides (e.g., Node scripts disallow `noConsoleLog`)

## 4. Custom Titlebar (Tauri 2 decorations: false)

- Set `"decorations": false` in `tauri.conf.json` → removes native titlebar
- Add `"window"` permissions in capability file for minimize/maximize/close/startDragging
- Use `data-tauri-drag-region` CSS attribute for drag region on custom titlebar
- Library option: `@waruhachi/tauri-controls-react` — provides native-looking WindowControls (Windows/macOS/Gnome) with auto-platform detection
  - Install: `@waruhachi/tauri-controls-react` + peer deps `@tauri-apps/plugin-os` `@tauri-apps/api` `clsx` `tailwind-merge`
  - Rust side: `cargo add tauri-plugin-window tauri-plugin-os`
- Shadow on macOS: use `"transparent": true` + `window-vibrancy` crate for acrylic effect on Windows
- Manual approach also viable — simpler, no extra dependency, full control

## 5. Window Config (1200x800, center, resizable)

- `tauri.conf.json` window config:
  ```json
  { "width": 1200, "height": 800, "center": true, "resizable": true, "minWidth": 800, "minHeight": 600 }
  ```
- Window state persistence: listen to `on_window_event` → `WindowEvent::Moved` / `Resized` → save to local storage
- OR use `tauri-plugin-window-state` (community plugin)

## 6. System Tray (Close to Tray)

- Add `tray-icon` feature to Tauri dependency: `tauri = { version = "2", features = ["tray-icon"] }`
- Use `TrayIconBuilder` in Rust `setup()`:
  - Icon: reuse app default icon or custom template icon (black-only PNG for macOS auto-tint)
  - Menu: Show / Hide / Quit items
  - `on_menu_event`: handle show/hide/quit
  - `on_tray_icon_event`: left-click toggles window visibility
- Close to tray pattern:
  ```rust
  .on_window_event(|window, event| {
    if let WindowEvent::CloseRequested { api, .. } = event {
      window.hide().ok();
      api.prevent_close();
    }
  })
  ```
- macOS Dock hiding: set `LSUIElement: true` in `Info.plist` (not needed for normal window app — Paladin uses normal window, not menu bar app)
- Auto-hide on focus loss: `WindowEvent::Focused(false)` → `.hide()` (but careful with child windows/dialogs)

## 7. Theme (System Sync + Manual Toggle)

- Tailwind CSS v4: `@variant dark (&:where(.dark, .dark *))` in CSS
- Two strategies combined:
  1. On load: check `localStorage.theme`; if absent, fallback to `window.matchMedia('(prefers-color-scheme: dark)').matches`
  2. Manual toggle: set/remove `.dark` on `<html>`, persist to `localStorage`
  3. Listen to system changes: `matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ...)` — only apply if no manual preference stored
- Avoid FOUC: inline script in `<head>` before stylesheets load, reading localStorage
- Zustand `persist` middleware for theme state: storage → `localStorage`, key → `"theme-storage"`

## 8. Zustand Stores

- Theme store: `theme` ('light' | 'dark' | 'system'), `setTheme()`, `toggleTheme()`
  - Wrapped with `persist` middleware → auto-sync to localStorage
- Window state store: `position`, `size`, `isMaximized`, `isFocused`
  - Updated via Tauri `on_window_event` listener
  - Persisted to localStorage for restore on next launch

## 9. TypeScript (Strict)

- `tsconfig.json`: `"strict": true` → enables all strict checks
- Additional: `"noUncheckedIndexedAccess": true`, `"noUnusedLocals": true`, `"noUnusedParameters": true`
- Root `tsconfig.base.json` shared across packages, per-package `tsconfig.json` extends it

## Key Risks

1. **macOS titlebar caveat**: Custom titlebar loses native window snapping/mission control features on macOS. Alternative: transparent titlebar with custom background (keeps native behaviors).
2. **Biome vs ESLint ecosystem**: Some ESLint plugins (e.g., `eslint-plugin-react-hooks`) have no Biome equivalent. Biome's React rules cover hooks deps via `useExhaustiveDependencies`.
3. **Tray icon on Linux**: Not all desktop environments support system tray uniformly (GNOME needs extension). Graceful fallback needed.

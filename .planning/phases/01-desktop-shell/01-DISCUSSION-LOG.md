# Phase 1: Desktop Shell - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-14
**Phase:** 01-desktop-shell
**Areas discussed:** Scaffolding, Package manager, Titlebar, System tray, Code quality, Monorepo structure, Dark mode, Zustand stores, Window size, Documentation, Biome init check

---

## Tauri Scaffolding

| Option | Description | Selected |
|--------|-------------|----------|
| create-tauri-app | `pnpm create tauri-app .` 在 apps/desktop/ 内生成，react-ts 模板 | ✓ |
| Manual setup | 手动创建 Vite React + cargo tauri init | |

**User's choice:** create-tauri-app

---

## Package Manager

| Option | Description | Selected |
|--------|-------------|----------|
| pnpm | Tauri 社区默认，原生 workspace 支持 monorepo | ✓ |
| npm | 生态最大，但 monorepo 需额外配置 | |
| bun | 性能好 | |
| yarn | 已边缘化 | |

**User's choice:** pnpm

---

## Titlebar

| Option | Description | Selected |
|--------|-------------|----------|
| Custom titlebar | Phase 1 自绘标题栏，Tauri decorations: false | ✓ |
| Native | 保留系统原生标题栏，快速看到窗口 | |

**User's choice:** Custom titlebar

---

## System Tray Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Close to tray | 点 X 最小化到托盘，右键恢复/退出 | ✓ |
| Close to quit | 点 X 直接退出 | |

**User's choice:** Close to tray

---

## Code Quality

| Option | Description | Selected |
|--------|-------------|----------|
| Biome | Lint + format 一体化，比 ESLint+Prettier 更快 | ✓ |

**User's choice:** Biome + TypeScript strict: true

---

## Monorepo Structure

| Option | Description | Selected |
|--------|-------------|----------|
| apps/* wildcard | 后续加 apps/agent、apps/server 自动纳入 | ✓ |
| Explicit listing | 逐个列出，更精确但手动维护 | |

**User's choice:** apps/* wildcard in pnpm-workspace.yaml

---

## Dark Mode

| Option | Description | Selected |
|--------|-------------|----------|
| Both system + manual | 默认跟随系统，提供手动切换覆盖并持久化 | ✓ |

**User's choice:** Both system sync + manual toggle with persistence

---

## Zustand Stores

| Option | Description | Selected |
|--------|-------------|----------|
| Theme store | 管理 theme、同步 Tailwind class、持久化 | ✓ |
| Window state store | 窗口最大化/最小化/位置 | ✓ |
| Settings store | 用户偏好 | |
| Minimal skeleton | 最小化结构 | |

**User's choice:** Theme store + Window state store

---

## Window Size/Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| 1200x800 default | cc-haha 风格编码工作台尺寸 | ✓ |
| Remember position | 启动时恢复上次位置和大小 | ✓ |
| Min size 800x600 | 防止 UI 破碎 | ✓ |
| Center on startup | 窗口居中 | ✓ |

**User's choice:** All four options

---

## Documentation

| Option | Description | Selected |
|--------|-------------|----------|
| README only | 根 + apps/desktop README | ✓ |
| More detailed | 额外开发环境文档 | |

**User's choice:** README is enough

---

## Biome Init Check

| Option | Description | Selected |
|--------|-------------|----------|
| Yes | Phase 1 结束后 biome check 通过 | ✓ |
| Skip | 只配置不检查 | |

**User's choice:** Run biome check at Phase 1 completion

---

## Claude's Discretion

- Desktop 内部目录结构
- Vite 详情配置
- Tailwind CSS 4 具体配置

## Deferred Ideas

- Rspack 评估
- 托盘图标设计

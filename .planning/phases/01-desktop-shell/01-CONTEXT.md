# Phase 1: Desktop Shell - Context

**Gathered:** 2026-06-14
**Status:** Ready for planning

## Phase Boundary

创建 Tauri 2 + React + Vite + TypeScript 项目骨架。输出一个可启动的桌面应用窗口，带自定义标题栏、系统托盘、深色模式，以及 Biome 代码规范。

## Implementation Decisions

### Scaffolding
- **D-01:** 使用 `pnpm create tauri-app .` 在 `apps/desktop/` 内生成，选 react-ts 模板
- **D-02:** 包管理器使用 pnpm，根目录 `pnpm-workspace.yaml` 配置 `apps/*`

### Window Behavior
- **D-03:** 自绘标题栏（非系统原生），Phase 1 即实现
- **D-04:** 默认窗口尺寸 1200x800，最小 800x600，启动时居中
- **D-05:** 关闭窗口时最小化到系统托盘（Close to tray），非直接退出
- **D-06:** 记住上次窗口位置和尺寸（persist window state）

### System Tray
- **D-07:** 系统托盘图标，右键菜单包含"恢复"/"退出"
- **D-08:** 托盘中点击图标恢复窗口

### Dark Mode
- **D-09:** 默认跟随系统主题（prefers-color-scheme）
- **D-10:** 提供手动切换开关，用户选择覆盖系统设置并持久化到 localStorage

### Zustand Stores
- **D-11:** Theme store — 管理 theme 状态（light/dark/system），同步 Tailwind CSS class
- **D-12:** Window state store — 管理窗口状态（最大化/最小化/位置）

### Code Quality
- **D-13:** Biome 作为 lint + format 工具（替代 ESLint + Prettier）
- **D-14:** TypeScript strict: true
- **D-15:** Phase 1 结束时 `biome check` 必须通过

### Documentation
- **D-16:** 根目录 README.md + apps/desktop/README.md（开发环境、启动命令）

### Claude's Discretion
- Desktop 内部目录结构（`src/components/`, `src/stores/`, `src/hooks/` 等具体组织方式）
- Vite 配置细节（端口、HMR、Tauri 集成）
- Tailwind CSS 4 具体配置方式

## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Project Docs
- `.planning/PROJECT.md` — Core value, key decisions, constraints
- `.planning/REQUIREMENTS.md` — v1 requirements (DSK-01 ~ DSK-04)
- `.planning/ROADMAP.md` — Phase 1 goal and scope

### Research
- `.planning/research/STACK.md` — Recommended stack versions and constraints
- `.planning/research/PITFALLS.md` — Known pitfalls for Tauri + desktop shell

## Existing Code Insights

### Integration Points
- 纯绿场项目，无现有代码。从 `apps/desktop/` 开始搭建
- 后续 Phase 2 (Chat UI) 会在此骨架之上集成 CopilotKit
- 后续 Phase 5 (Terminal) 会复用 Tauri Rust 端的 IPC 通道

## Specific Ideas

- 参考 cc-haha/desktop 的 Electron 实现，但用 Tauri 2 对应方案替代
- 自绘标题栏风格参考 cc-haha 的暗色主题设计
- 系统托盘行为参考常见桌面工具（如 VS Code、Discord）的 close-to-tray 模式

## Deferred Ideas

- Desktop 内部目录结构的具体规范 — Claude 决定
- Biome 规则集细调 — 先用默认，后续按需调整
- 托盘图标设计 — 先用占位图标，后续 Phase 处理
- Rspack 替代 Vite — 将来评估，Phase 1 用 Vite

---

*Phase: 1-Desktop Shell*
*Context gathered: 2026-06-14*

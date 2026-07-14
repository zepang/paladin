# Roadmap: Paladin

**Created:** 2026-06-14
**Granularity:** Fine (10.1 phases)
**Core Value:** AI 编程助手桌面端

## Phase Overview

| Phase | Name | Focus | Dependencies |
|-------|------|-------|-------------|
| 1 | Desktop Shell | Tauri 2 + React + Tailwind 骨架 | — |
| 2 | Chat UI | CopilotKit 聊天界面 | Phase 1 |
| 3 | AI Agent Core | Pydantic AI + AG-UI 端点 | — |
| 4 | Agent ↔ Desktop | AG-UI 流式通信对接 | Phase 2 + 3 |
| 5 | Terminal + Diff | PTY 终端面板 + 代码 Diff | Phase 1 |
| 5.1 | UI Library Upgrade | shadcn/ui + lucide-icons | Phase 5 |
| 5.2 | Chat Area Redesign | CopilotChat + 侧边栏折叠 + 状态条 + 工具栏 | Phase 5.1 |
| 5.3 | Right Panel System | 多视图右侧面板：终端/文件预览/Diff审查 | Phase 5.2 |
| 6 | Agent Tools | 文件/终端/MCP/Skills/子Agent | Phase 4 |
| 7 | HITL + Computer Use | 权限审批 + 桌面操作能力 | Phase 4 + 5 |
| 7.1 | Official AG-UI Deferred Tool Approval | Pydantic AI 官方 interrupt/resume 审批路径 | Phase 7 |
| 7.2 | Legacy SSE Approval Cleanup | 移除旧 SSE 审批 fallback，保留官方 AG-UI interrupt/resume | Phase 7.1 |
| 7.3 | Sidecar Process Management | Tauri 托管 Agent + Go Server 子进程生命周期 | Phase 7 + 8 |
| 7.4 | Sidecar Runtime Mode | dev Hybrid attach/spawn 运行模式与 ownership 语义 | Phase 7.3 |
| 8 | Go Server | 认证/数据库/WebSocket Hub | — |
| 9 | Admin Systems | 审计日志 + 配额管理 | Phase 8 |
| 10 | Packaging | Complete (9/9) | Phase 9 |
| 10.1 | 5/5 | Complete    | 2026-07-14 |
| 11 | Desktop AI Provider Configuration | Complete (8/8) | Phase 10 |

## Phase Details

### Phase 1: Desktop Shell

**Goal:** 可启动的 Tauri 2 桌面应用骨架
**Requirements:** DSK-01, DSK-02, DSK-03, DSK-04

- Tauri 2 + React 19 + Vite + TypeScript 项目初始化
- Tailwind CSS 4 配置，深色/浅色模式
- 窗口管理、系统托盘
- Zustand 状态管理基础

### Phase 2: Chat UI

**Goal:** CopilotKit 聊天界面可交互
**Requirements:** CHT-01, CHT-02, CHT-03, CHT-04

- CopilotKit CopilotChat 组件集成
- 流式输出渲染框架
- 对话历史管理
- CopilotSidebar 侧边栏模式

### Phase 3: AI Agent Core

**Goal:** Python Agent 可独立运行
**Requirements:** AGT-01, AGT-02, AGT-04

- Pydantic AI Agent 创建 + LLM 调用
- AG-UI 端点（`agent.to_ag_ui()`）
- pydantic-deepagents 基础集成

### Phase 4: Agent ↔ Desktop

**Goal:** Agent 通过 AG-UI 与前端通信
**Requirements:** AGT-03 (CopilotKit → AG-UI → Pydantic AI 全链路)

- CopilotKit Runtime 对接 AG-UI 端点
- 流式对话全链路通
- 工具调用结果可视化

### Phase 5: Terminal + Diff

**Goal:** 内嵌终端 + 代码变更可视化
**Requirements:** TRM-01~04, DIF-01~03
**Plans:** 1 plan

Plans:

- [x] 05-01-PLAN.md — Terminal + Diff core (PTY Channel, right drawer, chat-embedded DiffView)

- Rust portable-pty 终端
- Tauri IPC 传输到 xterm.js
- 多 tab 终端
- @git-diff-view/react 集成

### Phase 05.1: UI Library Upgrade — 引入 shadcn/ui + lucide-icons 图标库，替换手写 SVG 和自定义组件 (INSERTED)

**Goal:** 引入 shadcn/ui + lucide-icons，替换手写 SVG 和自定义组件
**Requirements**: TBD
**Depends on:** Phase 5
**Plans:** 5/5 plans complete

Plans:

- [x] 05.1-01-PLAN.md — lucide icon migration
- [x] 05.1-02-PLAN.md — shadcn/ui initialization
- [x] 05.1-03-PLAN.md — Button + Sonner integration
- [x] 05.1-04-PLAN.md — ScrollArea integration
- [x] 05.1-05-PLAN.md — Sheet integration

### Phase 05.2: Chat Area Redesign — 对话区域重构 (INSERTED)

**Goal:** 用 CopilotChat 替换手写消息组件，新增侧边栏折叠、Agent 状态条、右侧工具栏
**Requirements**: TBD
**Depends on:** Phase 5.1
**Plans:** 1/1 plans complete

Plans:

- [x] PLAN.md — CopilotChat replacement, collapsible sidebar, ChatToolbar

- 侧边栏可折叠（完全收起 + 展开按钮）
- CopilotChat 组件替换 MessageList + MessageBubble + ChatView + WelcomePage
- 对话区域居中窄列布局
- Agent 状态条（运行状态、当前步骤、进度指示）
- 右侧工具栏（上下文信息：模型/Token/工具调用 + 快捷操作：清空/导出/切换模型）

### Phase 05.3: Right Panel System — 右侧多视图面板 (INSERTED)

**Goal:** 新增可切换视图的右侧面板，支持终端/文件预览/Diff审查三种模式
**Requirements**: TBD
**Depends on:** Phase 5.2
**Plans:** 1/1 plans complete

Plans:

- [x] PLAN.md — Fixed RightPanel with terminal/file preview/diff review

- 保留 ChatToolbar，右侧面板在工具栏右边新增
- Titlebar 按钮 → 终端/Diff 视图切换
- Agent 回复含文件路径 → 自动打开文件预览
- 手动点击文件 → 文件预览
- 文件预览支持代码高亮 + Markdown 渲染 + 图片
- 替换当前 RightDrawer (Sheet 浮层) 为固定面板

### Phase 6: Agent Tools

**Goal:** Agent 具备完整工具链
**Requirements:** TLS-01~05
**Plans:** 6/6 plans complete

Plans:

- [x] 06-01-PLAN.md — Config 迁移：models.yaml → config.json + load_models() JSON 重写 (TDD)
- [x] 06-02-PLAN.md — Skills 目录 + code-review.md 示例技能 + system.md 更新
- [x] 06-03-PLAN.md — MCP 依赖安装：pydantic-ai-slim[mcp]
- [x] 06-04-PLAN.md — Agent 工具激活：5 个工具集一键启用 + MCP 按需加载 (TDD)
- [x] 06-05-PLAN.md — 综合测试套件：test_tools.py + test_agent.py + test_server.py
- [x] 06-06-PLAN.md — Prohibition 验证：沙箱越权禁止测试

- 文件系统操作工具
- 终端命令执行
- MCP 工具集成
- Skills 系统（Markdown 驱动）
- 子 Agent 委派

### Phase 7: HITL + Computer Use

**Goal:** Agent 危险操作需审批确认后才能执行，Agent 具备桌面操作能力（截图、键鼠）
**Requirements:** HIT-01~03 (7a), SDC-01~03 (7b — deferred)
**Plans:** 6/6 plans complete (Phase 7a only)

Plans:

- [x] 07-01-PLAN.md — HITL 审批回调工厂 + asyncio.Event 状态管理 (TDD)
- [x] 07-02-PLAN.md — config.json hitl 段 + ToolGuard 集成到 create_paladin_agent()
- [x] 07-03-PLAN.md — GET /approval/stream SSE 端点 + POST /approval/{id} HTTP 回调
- [x] 07-04-PLAN.md — Computer Use @tool 函数（screenshot/click/typewrite）+ pyautogui
- [x] 07-05-PLAN.md — 前端审批 UI：ApprovalBridge + ApprovalCard + ApprovalDialog
- [x] 07-06-PLAN.md — ChatToolbar 审批状态栏升级 + App.tsx 集成

**Phase 7a (this phase):**

- CopilotKit HITL 审批流（SSE + HTTP 回调 + asyncio.Event 等待）
- config.json 驱动工具审批列表 + ToolGuard 守卫
- Computer Use (pyautogui screenshot / click / typewrite)
- 前端审批卡片（聊天流内嵌 + AlertDialog 弹窗）+ ChatToolbar 审批状态

**Phase 7b (deferred):**

- Tauri sidecar 管理 Python Agent (SDC-01)
- Tauri sidecar 管理 Go Server (SDC-02) — deferred after Phase 8
- 健康检查 + 自动重启 (SDC-03)

### Phase 07.3: Sidecar Process Management (INSERTED)

**Goal:** Tauri sidecar 管理 Python Agent + Go Server 两子进程 —— 端口预检/健康探针/崩溃重启(指数退避)/优雅关闭/日志脱敏与落盘/6 Tauri 命令 + 前端 process store + StatusBar + LogsPanel + StartupMask
**Requirements**: SDC-01, SDC-02, SDC-03
**Depends on:** Phase 7
**Plans:** 10/10 plans complete

Plans:

- [x] 07.3-01-PLAN.md
- [x] 07.3-02-PLAN.md
- [x] 07.3-03-PLAN.md
- [x] 07.3-04-PLAN.md
- [x] 07.3-05-PLAN.md
- [x] 07.3-06-PLAN.md
- [x] 07.3-07-PLAN.md
- [x] 07.3-08-PLAN.md
- [x] 07.3-09-PLAN.md
- [x] 07.3-10-PLAN.md

- **Status:** Code-complete. 自动化源门全绿(cargo test 54/54 + tsc 0 errors + clippy 0 errors + build ✓). SPEC 21 Acceptance + 13 Edge + 4 Prohibitions 逐条验证完成. 三平台 UAT deferred 至 Phase 10 Packaging.

### Phase 07.4: Sidecar Runtime Mode (INSERTED)

**Goal:** 在 dev 模式下实现 Hybrid sidecar runtime：先探测已有健康 Agent/Go Server 并 attach 为 external；未运行且端口空闲时再由 supervisor spawn；端口占用但健康失败时进入 conflict。明确区分 service health 与 process ownership，避免手动启动服务和桌面端托管语义互相冲突。
**Requirements**: TBD
**Depends on:** Phase 07.3
**Plans:** 4 plans

Plans:
**Wave 1**

- [x] 07.4-01-PLAN.md — Runtime tuple model/classifier/config validation foundation (TDD)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 07.4-02-PLAN.md — Rust supervisor dev hybrid attach/spawn/conflict + ownership safety

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 07.4-03-PLAN.md — Frontend process tuple store + StatusBar/StartupMask UX

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 07.4-04-PLAN.md — Verification matrix, source audit, validation closure

- 扩展 process status：`state + owner + health`，新增 conflict 表达。
- 启动前执行健康探测：Agent `/health`，Go `/healthz` + `/readyz`。
- dev 模式优先 attach healthy external service；absent 时才 spawn supervisor-owned child。
- external 服务不可 stop/kill/restart；UI 显示「已连接外部服务」并提供重新检测/切换托管路径。
- StartupMask / StatusBar 显示真实失败分类：可执行文件缺失、cwd 缺失、端口冲突、健康失败、启动 grace 内退出、readiness degraded。
- 保留 packaged 模式走 supervisor-owned bundled sidecar 的方向，不依赖 `uv` / `go` / login-shell PATH。
- Design note: `.planning/notes/sidecar-runtime-mode.md`

- **Status:** Complete. Automated gates green: Rust process tests 70/70, full `cargo test`, `cargo clippy --all-targets -- -D warnings`, desktop build, and Vitest 43/43. Manual packaged/platform UAT remains deferred to Phase 10 Packaging.

### Phase 07.1: Official AG-UI Deferred Tool Approval (INSERTED)

**Goal:** Consolidate approval flow on the official AG-UI deferred interrupt/resume path.
**Requirements**: TBD
**Depends on:** Phase 7
**Plans:** 1/1 plans complete

Plans:

- [x] 07.1-01-PLAN.md — Official AG-UI deferred approval consolidation + verification

**Follow-up:** Phase 07.2 should remove the retained legacy SSE approval path after Phase 07.1 verification passes. Cleanup candidates are tracked in `07.1-07.2-HANDOFF.md`.

### Phase 07.2: Legacy SSE Approval Cleanup (INSERTED)

**Goal:** Remove the retained legacy SSE approval fallback now that the official AG-UI interrupt/resume path is verified.
**Requirements**: TBD
**Depends on:** Phase 07.1
**Plans:** 5/5 plans complete

Plans:

**Wave 1**

- [x] 07.2-01-PLAN.md — Backend approval mode supports only `agui_interrupt`
- [x] 07.2-03-PLAN.md — Desktop legacy bridge/dialog/provider/status cleanup

**Wave 2 *(blocked on Wave 1 backend completion)***

- [x] 07.2-02-PLAN.md — Backend legacy SSE routes, store, callback, and tests removal

**Wave 3 *(blocked on backend and frontend cleanup)***

- [x] 07.2-04-PLAN.md — Active docs cleanup for legacy fallback references

**Wave 4 *(blocked on all implementation waves)***

- [x] 07.2-05-PLAN.md — Final source gates, regression verification, and validation update

- Remove the legacy `/approval/stream` and `/approval/{request_id}` approval routes if no longer needed.
- Remove legacy approval store/callback code and old frontend bridge/dialog components.
- Remove or rewrite legacy SSE-only approval tests and stale Phase 07 references.
- Preserve Computer Use approval behavior through the remaining official AG-UI path.

### Phase 8: Go Server

**Goal:** 业务层基础能力就绪
**Requirements:** SRV-01, SRV-02, SRV-03, SRV-04, SRV-05
**Plans:** 7/7 plans complete

Plans:

- [x] 08-01-PLAN.md — Go toolchain install + module scaffold + config + .env.example
- [x] 08-02-PLAN.md — docker-compose.server.yml + golang-migrate CLI + auth schema migrations
- [x] 08-03-PLAN.md — sqlc codegen + pgx pool + go-redis connectivity layer
- [x] 08-04-PLAN.md — Gin engine + health/readiness probes + unified error middleware
- [x] 08-05-PLAN.md — JWT auth + bcrypt + RBAC middleware (TDD)
- [x] 08-06-PLAN.md — WebSocket Hub + coder/websocket gateway (TDD)
- [x] 08-07-PLAN.md — README + end-to-end integration + phase verification

- Go 项目骨架 + PostgreSQL + Redis (SRV-01)
- golang-migrate 幂等迁移 + 重复拒绝约束 (SRV-02)
- 用户注册/登录 (SRV-03)
- RBAC 权限控制 (SRV-04)
- WebSocket Hub (SRV-05)

### Phase 9: Admin Systems

**Goal:** 运维管理能力完整
**Requirements:** ADM-01~03
**Spec:** 09-SPEC.md (locked, ambiguity 0.15)
**Depends on:** Phase 8
**Plans:** 5/5 plans complete ✅

Plans:

- [x] 09-01-PLAN.md — Audit log storage schema + sqlc queries + recording service + middleware/hooks (TDD)
- [x] 09-02-PLAN.md — Quota config + Redis sliding-window counter + Lua check-and-consume + Gin gate middleware with admin bypass (TDD)
- [x] 09-03-PLAN.md — WebSocket Hub dual-index upgrade + structured envelope + per-user/role delivery (TDD)
- [x] 09-04-PLAN.md — Audit query API (cursor pagination + filtering) + admin event fan-out wiring (TDD)
- [x] 09-05-PLAN.md — End-to-end integration verification + scope gates + README + VALIDATION update

Wave structure:

- **Wave 1 (parallel):** 09-01 ∥ 09-02 ∥ 09-03 — no inter-dependencies
- **Wave 2 (depends on Wave 1):** 09-04 — audit query API + admin fan-out wiring
- **Wave 3 (depends on all):** 09-05 — E2E verification + scope gates

- 审计日志持久化（PostgreSQL `audit_logs` + 管理 API）
- 配额管理（Redis 滑动窗口 + Lua 原子 check-and-consume + 超限 429 网关）
- WebSocket Hub 完善（双索引 + 结构化信封 / 定向推送 / Admin 事件流）

### Phase 10: Packaging

**Goal:** 可分发的桌面应用
**Requirements:** PKG-01~03
**Plans:** 9/9 plans complete

- macOS .dmg 打包
- Windows .msi 打包
- README + 项目文档

Plans:

- [x] 10-01-PLAN.md — Release sidecar pipeline
- [x] 10-02-PLAN.md — Packaged resource wiring
- [x] 10-03-PLAN.md — Packaged environment boundary
- [x] 10-04-PLAN.md — Bounded sidecar log rotation
- [x] 10-05-PLAN.md — Windows MSI buildability evidence
- [x] 10-06-PLAN.md — macOS installed-app UAT
- [x] 10-07-PLAN.md — Final verification and release honesty closure
- [x] 10-08-PLAN.md — Packaged process UI diagnostics
- [x] 10-09-PLAN.md — macOS artifact checkpoint and sentinel gate

### Phase 10.1: macOS/Linux Packaging Workflows

**Goal:** 将 Windows x64 packaging workflow 的 native buildability 能力扩展到 macOS 和 Linux，产出最小可审计安装包 artifact 与 manifest，但不宣称 release-ready。
**Requirements:** PKG-01~03 extension
**Depends on:** Phase 10
**Plans:** 5/5 plans complete

Plans:
**Wave 1**

- [x] 10.1-01-PLAN.md — Cross-platform build manifest validation (TDD)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 10.1-02-PLAN.md — macOS arm64 packaging workflow
- [x] 10.1-03-PLAN.md — Linux x86_64 packaging workflow

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 10.1-04-PLAN.md — Packaging documentation honesty updates

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 10.1-05-PLAN.md — Final validation and CI artifact-count evidence

**Cross-cutting constraints:**

- macOS buildability artifacts contain exactly one DMG and one build-manifest.json.
- Linux buildability artifacts contain exactly one AppImage, exactly one deb, and one build-manifest.json.
- Missing required Linux installer type fails manifest validation.
- Unsupported target triples fail manifest validation.
- Wrong sidecar and installer filenames fail manifest validation.
- Missing paths and directories fail manifest validation.
- Workflow upload boundaries exclude full build trees, standalone sidecars, caches, logs, dependency directories, and .env files.
- Documentation and evidence separate buildability from signing, notarization, installed-app UAT, and release-ready status.

- macOS workflow：真实 macOS runner，通过 `pnpm release -- --target current --verify` 构建 DMG，并上传 DMG + `build-manifest.json`。
- Linux workflow：真实 Ubuntu runner，安装 Tauri Linux build dependencies，通过 `pnpm release -- --target current --verify` 构建 AppImage + deb，并上传两个 installer + `build-manifest.json`。
- manifest 扩展：支持 macOS/Linux target 与多个 installer，记录 commit SHA、runner OS、architecture、target triple、两个 sidecar、安装包文件名/大小/SHA-256。
- artifact 边界：只上传安装包与 manifest，不上传完整 build tree、`.env`、secret 或中间产物。
- 文档诚实：macOS/Linux workflow 成功只代表 buildability；installed-app UAT 和 release-ready 仍按后续验证单独判定。

Acceptance draft:

- [ ] 手动触发 Windows workflow 仍可产出 MSI + manifest。
- [ ] 手动触发 macOS workflow 可产出 DMG + manifest。
- [ ] 手动触发 Linux workflow 可产出 AppImage + deb + manifest。
- [ ] `apps/desktop/scripts/build-manifest.mjs` 与测试覆盖 Windows/macOS/Linux、多 installer、缺失 artifact、错误文件名 fail-closed。
- [ ] `docs/packaging.md` 与根 `README.md` 的平台状态说明同步更新，且不把 buildability 描述为 release-ready。

### Phase 11: Desktop AI Provider Configuration

**Goal:** 将 AI provider 配置从启动前必须依赖环境变量，升级为桌面应用内可配置、可切换、可持久化的产品能力；缺配置时应用和 sidecar 仍可启动，并在用户首次对话时给出可操作配置入口。
**Requirements:** TBD
**Depends on:** Phase 10
**Plans:** 8/8 plans complete

Plans:
**Wave 1**

- [x] 11-01-PLAN.md — Wave 0 RED validation scaffold for provider runtime, persistence, UI, and readiness contracts
- [x] 11-02-PLAN.md — Agent lazy provider runtime, no-key startup, provider API, and request-time snapshot semantics
- [x] 11-03-PLAN.md — Rust/Tauri app-data provider authority, atomic saves, masked readback, and env bootstrap
- [x] 11-04-PLAN.md — PALADIN_AI env forwarding, macOS wrapper no-key semantics, and provider secret redaction

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 11-05-PLAN.md — Tauri provider command bridge, Agent runtime refresh, and typed frontend wrappers

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 11-06-PLAN.md — Frontend provider store and RightPanel AI Provider settings surface

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 11-07-PLAN.md — ChatArea configure-provider CTA, StatusBar AI readiness, and App error mapping

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 11-08-PLAN.md — Docs, smoke matrix, secret scan, source audit, and final verification evidence

**Cross-cutting constraints:**

- R1 edge concurrency: concurrent health/chat probes during unconfigured startup cannot crash Agent.

Expected behavior:

- Agent 服务启动不依赖 AI provider 已配置；缺配置时 `/health` 仍返回 OK，但模型状态标记为未配置或不可用。
- 用户发起对话时，如果当前 provider/model 未配置或 key 无效，聊天区显示可操作提示，而不是让 Agent 进程退出。
- 提示中提供入口打开桌面端配置页面。
- 配置页面支持新增/编辑 DeepSeek、OpenAI-compatible、本地 LM Studio 等 provider，包含 base URL、API key、默认模型 ID、可选显示名称和优先级。
- 启动环境变量提供配置时，作为初始/default 配置导入或覆盖运行时默认值。
- 桌面应用中可以切换当前使用的 provider 和模型，不需要重启 app。
- Secret 值不出现在日志、诊断面板、UAT evidence 或前端普通文本中。

Architecture notes:

- 环境变量只作为首次启动、CI、UAT 的 bootstrap 来源，不作为唯一配置来源。
- 运行时配置优先落到本机 app data 目录，不写回打包内置的 `apps/agent/config/config.json`。
- Agent 可暴露配置读取/更新 API，Desktop 负责 UI 与持久化交互；也可由 Desktop 持久化配置后传递给 Agent，边界在设计阶段锁定。
- DeepSeek 分支必须尊重配置中的 `api_base`，不继续硬编码 `https://api.deepseek.com/v1`。
- 统一命名语义，例如 `PALADIN_AI_PROVIDER`、`PALADIN_AI_BASE_URL`、`PALADIN_AI_API_KEY`、`PALADIN_AI_MODEL`。

Acceptance draft:

- [ ] 不设置任何 AI key 时，Paladin app、Agent sidecar、Go sidecar 均可启动；用户发送消息时看到“请配置 AI provider”的产品提示。
- [ ] 通过桌面配置页填入 DeepSeek key/base/model 后，不重启即可成功对话。
- [ ] 环境变量预设 DeepSeek 配置时，首次启动可直接对话，并且配置页能展示当前 provider/model，key 脱敏。
- [ ] 切换到 OpenAI-compatible provider 后，Agent 使用新 base URL/model 发起请求。
- [ ] 缺 DB/Redis 与缺 AI provider 的降级语义互不混淆：DB/Redis 影响 Go readiness；AI provider 影响对话可用性。

## Parallel Execution Opportunities

Phases that can run in parallel:

- Phase 3 (Agent) ∥ Phase 5 (Terminal + Diff) — 无依赖冲突
- Phase 8 (Go Server) ∥ Phase 2-7 — Go 层完全独立
- Phase 6 (Agent Tools) 部分可平行于 Phase 5

## Risk Items

| Risk | Impact | Mitigation |
|------|--------|-----------|
| AG-UI 版本兼容性（Pydantic AI ↔ CopilotKit） | Phase 4 阻塞 | Phase 3 先验证 `agent.to_ag_ui()` 与 CopilotKit 对接 |
| Tauri sidecar 跨平台编译 | Phase 7/10 延迟 | 尽早验证 macOS sidecar 打包 |
| portable-pty Windows 行为差异 | Phase 5 Windows 兼容 | 优先 macOS 开发，Windows 适配延后 |

---
*Roadmap created: 2026-06-14*

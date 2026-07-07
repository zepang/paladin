---
phase: 10
slug: packaging
status: approved
shadcn_initialized: true
preset: existing-desktop
created: 2026-07-07
reviewed_at: 2026-07-07T13:01:59Z
---

# Phase 10 — UI Design Contract

> Phase 10 是 packaging phase，不新增产品级 UI。这里只锁定已存在界面在 packaged startup、Go readiness degraded、log rotation、release/UAT 文案上的视觉与交互契约，供 planner / executor / checker 使用。

---

## Scope

- 允许触达的现有界面：
  - `StartupMask`
  - `StatusBar`
  - `StatusBar/ProcessLight`
  - `LogsPanel`
  - 文档中的 release / UAT status copy
- 不在本 phase 新增：
  - 新设置页
  - 新诊断中心
  - 新营销页/首屏
  - 新视觉风格或新组件体系

默认值（default）：
- 若 packaged 诊断需要新增文案，直接复用当前 shadcn/ui + Tailwind token + lucide 模式。
- 若 docs 与 in-app 诊断都可承载同一状态说明，优先 docs 详细、UI 简明。

---

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn/ui（existing） |
| Preset | existing desktop muted-neutral preset |
| Component library | shadcn/ui primitives |
| Icon library | lucide-react |
| Font | Geist Variable (`--font-sans`) |

---

## Existing Visual Tokens

本 phase 必须沿用 `apps/desktop/src/index.css` 与现有组件 token，不自定义新色盘。

| Role | Token / Value | Usage |
|------|---------------|-------|
| App background | `bg-background` | 首屏遮罩、主工作区 |
| Surface | `bg-card`, `bg-popover`, `bg-muted` | 状态面板、popover、日志区域 |
| Border | `border-border` | 卡片、日志框、状态块 |
| Primary | `text-primary`, `bg-primary/10` | 启动中、重检中的正向等待态 |
| Warning | `amber-500/600/400` existing usage | Go degraded、readiness 未就绪、恢复中 |
| Destructive | `text-destructive`, `bg-destructive/10` | Agent blocking failure、冲突、停止 |

禁止：
- 新增品牌色
- 新增渐变、插画、hero、装饰性背景
- 用纯颜色表达状态而无文字

---

## Spacing Scale

沿用现有 4px 网格与组件节奏。

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | 图标与文内微间距 |
| sm | 8px | 状态行、按钮内边距、小块间距 |
| md | 16px | 默认块间距 |
| lg | 24px | 面板内主间距 |
| xl | 32px | 首屏主要留白 |

Exceptions: none

---

## Typography

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 14px | 400 | 1.5 |
| Label | 12px | 600 | 1.4 |
| Heading | 18px | 600 | 1.3 |
| Mono diagnostic | 12px | 400 | 1.5 |

规则：
- `StartupMask` 标题固定为 18px / 600，不升级为 hero。
- 诊断正文、popover 说明、日志空态统一用小号正文，不使用夸张 display 字号。

---

## Visual Contract

### 1. StartupMask

- 保持现有单卡片居中结构。
- 图标 -> eyebrow -> title -> description -> diagnostics -> action 的层级不可打乱。
- 诊断块只允许两层：
  - `错误信息`
  - `stderr 摘要`
- 若同时存在 `error` 与 `stderrTail`，`error` 在上，`stderrTail` 在下。
- 主按钮始终只有一个：
  - `重启 Agent`
  - 或 `重新检测 Agent`
- 不增加第二主按钮，不增加链接组，不引入复杂决策树。

### 2. StatusBar / ProcessLight

- 继续保留紧凑底栏，不改变高度级别（现为 24px 高度语义）。
- Agent 与 Go 都必须有颜色 + 文本标签 + popover 详情。
- popover 继续作为轻量诊断入口，不扩成独立面板。

### 3. LogsPanel

- 继续保持双 tab、单列、等宽字体、行流式追加模型。
- log rotation 对用户不可见，不出现“日志已轮转”横幅、modal、toast。
- 仅在真实流中断时才允许显示异常；单纯轮转不是异常。

---

## Interaction Contract

### Agent vs Go Server Semantics

这是本 phase 最重要的交互锁定：

1. Agent 是 blocking service。
2. Go Server readiness 不是 blocking gate。
3. PG/Redis 不可用时，Go 可以 `degraded`，但用户仍可进入主工作区，只要 Agent 已 running。
4. installed app 中不得把 “Go degraded” 表达成 “应用启动失败”。
5. `StartupMask` 只为 Agent blocking 状态服务；不要因为 Go `/readyz` 失败而展示全屏阻断。

状态映射：

| Surface | Agent starting/stopped/conflict/unhealthy | Go degraded/readiness fail |
|---------|-------------------------------------------|----------------------------|
| StartupMask | 显示，阻止进入主工作区 | 不显示 |
| StatusBar 灯 | 显示对应状态 | 显示 `降级` |
| ProcessLight Popover | 可展示错误、stderr、动作 | 展示 degraded 原因与非阻塞说明 |
| LogsPanel | 持续可看日志 | 持续可看日志 |

### ProcessLight Actions

- `external` owner:
  - `重启`、`停止` disabled
  - 保留 `重新检测`
- `supervisor` owner:
  - 允许 `重启`
  - 允许 `停止`
  - 允许 `重新检测`
- `查看日志` 永远可用

---

## Copywriting Contract

### Packaged Startup Diagnostic Tone

文案基调：
- 直接
- 可执行
- 不归咎用户
- 不暴露源码路径、shell 细节、环境变量值、secret 值

禁止文案：
- “未知错误，请重装全部依赖”
- “请运行 uv/go/pnpm/cargo”
- “请编辑 `src-tauri/processes.json`” 这类仅对源码开发者成立的路径提示，除非 UI 明确只在开发模式显示

packaged / installed app 中默认（default）应改用以下措辞：
- `运行时配置无效` -> “应用内置运行时配置无效”
- `可执行文件缺失` -> “应用缺少必需的内置服务文件”
- `cwd 错误` -> “应用运行目录配置无效”
- `端口冲突` -> “本机已有进程占用了 Paladin 需要的端口，但未通过健康检查”

### StartupMask Copy Hierarchy

| Situation | Eyebrow | Title | Description |
|-----------|---------|-------|-------------|
| packaged config invalid | 配置错误 | 内置运行时配置无效 | Paladin 无法读取有效的内置启动配置。请查看诊断信息，并按文档中的排查步骤处理。 |
| packaged executable missing | 安装不完整 | 必需服务文件不可用 | 当前安装包缺少 Agent 或 Server 所需文件。请重新安装，或使用已验证的发布包。 |
| packaged cwd invalid | 路径错误 | 应用运行目录无效 | 当前安装中的运行目录配置不可用。请查看诊断信息，并参考文档中的已知问题说明。 |
| port conflict / unhealthy foreign process | 端口冲突 | Agent 端口被占用 | 本机已有进程占用了 Agent 端口，但该进程未通过 Paladin 健康检查。 |
| startup-window exit | 启动失败 | Agent 在启动时退出 | Agent 未能在启动窗口内保持运行。请查看错误信息和日志后重试。 |
| generic stopped | 进程已停止 | Agent 未成功启动 | Paladin 暂时无法连接本地 Agent，因此主工作区尚不可用。 |
| starting | 启动中 | 正在启动 Agent | Paladin 正在连接本地 Agent，完成后会自动进入工作区。 |

要求：
- description 最多 2 句。
- `错误信息` 为简要原因；`stderr 摘要` 为原始脱敏片段。
- 按钮文案只用动词短语，不用长句。

### Go Degraded Copy

Go readiness 降级统一语义：

| Surface | Required copy |
|---------|----------------|
| Status light text | `Go · 托管 · 降级` 或 `Go · 外部 · 降级` |
| Popover status row | `状态: 降级 · 所有权: {x} · 健康: 降级` |
| Popover explanatory copy | `Go 服务已启动，但依赖未完全就绪；Agent 仍可继续使用。` |
| last_error 常见文案 | `启动 5s 内 /readyz 未就绪` 或更具体但不泄密的依赖不可用说明 |

要求：
- 必须明确“Agent 仍可继续使用”或等价非阻塞说明。
- 不得把 Go degraded 写成 “Paladin 无法使用”。

### LogsPanel Copy

| Element | Copy |
|---------|------|
| Empty state | 暂无日志 |
| Pause title/aria | 暂停 |
| Resume title/aria | 继续 |
| Clear title/aria | 清空 |

规则：
- 不增加“显示 secret 已隐藏”之类提示文案；安全应体现在输出结果本身。
- 若未来需要显示 rotation 失败，只能作为低优先级诊断文本出现在日志流或 popover，不得盖住日志主视图。

### Release / UAT Honesty Copy

文档或 UI 若涉及发布状态，必须使用下列诚实表达：

| State | Required wording |
|-------|------------------|
| platform passed installed UAT | `已完成安装包构建与已安装应用验证` |
| artifact built but no installed UAT | `已构建，未完成已安装应用验证，不视为 release-ready` |
| UAT failed | `验证未通过，不视为 release-ready` |
| platform not targeted in this phase | `本 phase 非阻塞目标` |

禁止：
- “支持 macOS/Windows” 若没有 installed-app UAT 证据
- “已发布” 若只有构建产物没有安装验证
- 模糊表达如 “基本可用”“理论支持”

---

## Logs Rotation UX Contract

Phase 10 对 `LogsPanel` 的体验要求：

1. 轮转前后继续接收新行。
2. 不清空当前内存 buffer。
3. 不插入可见分隔线。
4. 不显示文件名切换。
5. 不暴露 `.1/.2/...` 轮转文件命名。
6. 不出现 secret、token、密码、DSN、环境变量值。
7. `stderr` 仍以前缀方式可见，现有 `⚠ ` 模式可保留。

若磁盘轮转失败（但事件流仍在）：
- UI 主行为不改变；
- 不中断 live stream；
- 允许通过 `ProcessLight` 的 `last_error` 或 docs troubleshooting 说明“磁盘日志可能已降级”，但不能遮挡工作流。

---

## Accessibility Requirements

1. 状态表达必须“颜色 + 文字”双通道，不可只有红绿灯。
2. `StartupMask` 标题层级保持单一主标题，诊断块有明确标签。
3. `stderr 摘要` 与日志正文必须允许换行、滚动、文本选择。
4. 所有 icon-only 按钮必须保留 `title` 与 `aria-label`。
5. 对比度继续依赖现有 shadcn token，不可把 warning 文本降到低对比度装饰色。
6. `Popover` 中动作顺序保持稳定，避免键盘焦点跳跃。
7. Go degraded 不可只靠 amber dot 表达，必须伴随 `降级` 文字。
8. release/UAT 状态文案必须能被屏幕阅读器直接读懂，不依赖表情或颜色。

---

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official / existing local components | existing Button / Popover / layout primitives only | not required |
| third-party registries | none | forbidden in this phase |

本 phase 禁止：
- 引入第三方 UI blocks
- 引入新的 registry 组件
- 为 packaging 诊断单独接一个外部可视化库

---

## Implementation Notes For Planner / Executor

- 优先改 copy 与状态映射，不改布局骨架。
- `StartupMask` 若需区分 dev 与 packaged 文案，可根据 runtime mode 选择 copy，但视觉层级不变。
- `ProcessLight` 中 Go degraded 的说明要补足“非阻塞”语义。
- `LogsPanel` 如无需 UI 改动即可满足 rotation continuity，则不要为了“让用户知道发生了轮转”而新增提示。
- docs 中必须有平台状态表，且与真实 UAT 证据一致。

---

## Checker Sign-Off

- [ ] Dimension 1 Copywriting: PASS
- [ ] Dimension 2 Visuals: PASS
- [ ] Dimension 3 Color: PASS
- [ ] Dimension 4 Typography: PASS
- [ ] Dimension 5 Spacing: PASS
- [ ] Dimension 6 Registry Safety: PASS

**Approval:** pending

## UI-SPEC COMPLETE

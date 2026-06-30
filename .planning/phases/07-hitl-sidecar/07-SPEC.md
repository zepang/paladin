# Phase 07a: HITL + Computer Use — Specification

**Created:** 2026-06-30
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 5 locked

## Goal

Agent 执行危险操作时通过 CopilotKit 聊天内嵌审批卡片获得用户授权，同时 Agent 具备基于 pyautogui 的桌面 Computer Use 能力（截图 + 键鼠操作），每次 Computer Use 操作强制走 HITL 审批。

## Background

**当前状态（代码库侦察）：**
- Phase 6 已完成，Agent 具有 6 个工具类别：filesystem、execute、MCP、skills、subagents、plan
- `pydantic_ai_shields` 已存在于 .venv 中，提供 `ToolGuard` + `approval_callback` API，但 `create_paladin_agent()` 未调用
- CopilotKit v1.60+ 已集成于桌面端聊天，`useHumanInTheLoop` hook 可用但未使用
- Computer Use：零实现，项目代码中无 pyautogui 引用
- Phase 5.3（右侧面板）尚未实现，审批 UI 需依赖 CopilotChat 聊天流

**触发原因：** Phase 6 激活了文件删除和终端命令执行能力，Agent 可在无人工干预下执行危险操作。需在 Agent 工具执行路径中插入审批闸门。

**Phase 拆分：** 原 Phase 7 拆分为 7a（HITL-01~03 + Computer Use）和 7b（Sidecar SDC-01~03）。Phase 7b 的 SDC-02（Go Server sidecar）延后至 Phase 8 之后。

## Requirements

### 1. HITL 审批 UI（HIT-01）
Agent 调用需审批工具时，CopilotKit `useHumanInTheLoop` 在聊天流中渲染审批卡片（含工具名称、参数摘要、批准/拒绝按钮），用户决策后 Agent 继续或中止。

- **Current:** 无审批机制——Agent 直接执行所有工具调用
- **Target:** 审批卡片以特殊消息类型嵌入 CopilotChat 流，含「批准」「拒绝」按钮和「等待审批中…」状态展示
- **Acceptance:** Agent 调用 `require_approval` 列表中的工具时，前端聊天流出现审批卡片；点击「批准」→ Agent 收到 `true` 继续执行；点击「拒绝」→ Agent 收到 `false` 跳过操作

### 2. 可配置工具守卫（HIT-02）
`config.json` 中声明哪些工具需要 HITL 审批，Agent 启动时加载配置并注入 `pydantic_ai_shields ToolGuard`。

- **Current:** `pydantic_ai_shields` 存在但 `ToolGuard` 未实例化；`config.json` 无 HITL 配置段
- **Target:** `config.json` 新增 `hitl` 段：`{"require_approval": ["execute", "write_file", "edit_file"], "blocked": []}`；`create_paladin_agent()` 读取配置并传入 ToolGuard
- **Acceptance:** 修改 `config.json` 中 `require_approval` 添加/移除工具名后，重启 Agent，仅配置中的工具触发审批；`blocked` 列表中的工具被完全禁止调用

### 3. Computer Use 工具（HIT-03）
Agent 可调用 pyautogui 的 `screenshot()`（返回 PNG bytes）、`click(x,y)`、`typewrite(text)` 三个 MVP 函数，macOS 优先。

- **Current:** pyautogui 未安装，无任何 Computer Use 代码
- **Target:** `pyproject.toml` 新增 `pyautogui>=0.9.5` 依赖；Agent 注册 3 个工具函数（`computer_screenshot`、`computer_click`、`computer_type`），均标记为需 HITL 审批
- **Acceptance:** Agent 调用 `computer_screenshot` → 返回当前屏幕 PNG 截图；`computer_click(100,200)` → 鼠标移至 (100,200) 并点击；`computer_type("hello")` → 键盘输入 "hello"

### 4. HITL 超时与排队
审批请求 30s 无响应自动视为拒绝；多个并发审批请求排队处理，一次仅显示一个审批卡片。

- **Current:** 无审批机制，无超时/排队逻辑
- **Target:** `approval_callback` 内部维护审批队列；30s 超时返回 `False`（拒绝）；并发工具调用串行排队
- **Acceptance:** 发起审批后 30s 内不操作 → Agent 收到拒绝；同时触发 3 个需审批工具 → 审批卡片逐个出现，不会同时显示多个

### 5. Computer Use 安全集成
每次 Computer Use 操作强制走 HITL 审批；pyautogui 缺失（非 macOS 或未安装）时 Agent 优雅降级，Computer Use 工具不可用但不崩溃。

- **Current:** 无 Computer Use 代码，无 macOS 权限检查
- **Target:** Computer Use 工具在 ToolGuard 中永久标记为 `require_approval`；Agent 启动时 `try: import pyautogui` → 失败则 Computer Use 工具不注册，日志 warning；macOS 辅助功能权限未授予时 `pyautogui.FailSafeException` 被捕获并提示用户
- **Acceptance:** 在非 macOS 或未安装 pyautogui 环境启动 Agent → Computer Use 工具不可用，Agent 正常运行；macOS 未授权辅助功能 → 调用 `computer_screenshot` 时返回友好错误消息

## Boundaries

**In scope:**
- CopilotKit `useHumanInTheLoop` 审批卡片（聊天流内嵌）
- `pydantic_ai_shields ToolGuard` 集成，`config.json` 驱动工具审批列表
- pyautogui `screenshot` / `click` / `typewrite` 三个工具函数
- Computer Use 操作强制走 HITL 审批
- HITL 30s 超时自动拒绝
- 审批请求排队（一次一个）
- pyautogui 缺失时优雅降级
- macOS 辅助功能权限提示

**Out of scope:**
- 审批历史/审计日志 — Phase 9 Admin Systems
- 多级审批链 — v1 仅单层批准/拒绝
- OCR 文字识别 — 超出 MVP
- Windows/Linux Computer Use 适配 — macOS 优先
- 屏幕录制/视频流 — 仅单帧截图
- Sidecar 进程管理（SDC-01~03） — 拆分为 Phase 7b
- Go Server sidecar（SDC-02） — 延后至 Phase 8 后
- Computer Use 独立 UI — 作为 Agent 工具暴露，无独立界面

## Constraints

- **框架**: CopilotKit `useHumanInTheLoop`（不可更换，与现有 CopilotChat 集成一致）
- **工具守卫**: `pydantic_ai_shields ToolGuard`（不可更换，已存在于 .venv）
- **Computer Use 库**: pyautogui >= 0.9.5（不可更换）
- **平台**: macOS 优先，Computer Use 非 macOS 仅优雅降级
- **超时**: HITL 审批 30s 超时自动拒绝
- **并发**: 审批请求串行排队，不同时显示多个审批卡片
- **配置**: `config.json` 中 `hitl.require_approval` 和 `hitl.blocked` 列表驱动
- **Agent 进程**: Phase 7a 期间 Agent 仍手动启动（Sidecar 属 Phase 7b）

## Acceptance Criteria

- [ ] `config.json` 包含 `hitl.require_approval` 列表（如 `["execute", "write_file", "edit_file"]`）
- [ ] Agent 调用 `require_approval` 列表中的工具时，CopilotChat 消息流中显示审批卡片
- [ ] 审批卡片包含工具名称、参数摘要、「批准」「拒绝」按钮、「等待审批中…」状态
- [ ] 用户点击「批准」→ Agent 继续执行；点击「拒绝」→ Agent 跳过该工具调用
- [ ] 审批请求 30s 无响应 → 自动视为拒绝
- [ ] 同时触发 3 个需审批工具 → 审批卡片逐个排队显示
- [ ] `config.json` 中修改 `require_approval` 列表后重启 Agent → 审批行为相应变化
- [ ] `config.json` 中 `blocked` 列表中的工具被完全禁止调用
- [ ] Agent 可调用 `computer_screenshot` 获取 PNG 截图
- [ ] Agent 可调用 `computer_click(x,y)` 执行鼠标点击
- [ ] Agent 可调用 `computer_type(text)` 输入文本
- [ ] Computer Use 操作触发 HITL 审批（不可绕过）
- [ ] pyautogui 未安装或非 macOS → Agent 正常启动，Computer Use 工具不可用，日志 warning
- [ ] macOS 辅助功能未授权 → 调用 Computer Use 返回友好错误消息
- [ ] Agent 不触发审批时正常对话不受影响（无退化）

## Edge Coverage

**Coverage:** 7/7 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| 并发 | R4 | ✅ covered | AC: 3 个并发审批请求逐个排队显示 |
| 超时 | R4 | ✅ covered | AC: 30s 无响应自动视为拒绝 |
| 空配置 | R2 | ✅ covered | `require_approval: []` → 无工具触发审批，Agent 正常运行 |
| 无效配置 | R2 | ✅ covered | `config.json` 中不存在的工具名 → 日志 warning，不崩溃 |
| 权限缺失 | R3 | ✅ covered | AC: macOS 辅助功能未授权返回友好错误 |
| 依赖缺失 | R3 | ✅ covered | AC: pyautogui 未安装时优雅降级 |
| 降级无影响 | R5 | ✅ covered | AC: Computer Use 不可用时正常对话不受影响 |

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT 绕过 HITL 审批执行 `require_approval` 列表中的工具 | R1, R2 | resolved / test | ToolGuard 在工具执行前拦截，审批失败则工具不执行 |
| MUST NOT 在审批卡片未决策时继续执行后续工具调用 | R4 | resolved / test | 审批队列阻塞后续工具调用直至当前审批完成或超时 |
| MUST NOT 在非 macOS 环境因 pyautogui 导入失败导致 Agent 崩溃 | R3, R5 | resolved / test | `try: import pyautogui` 包裹，失败仅 skip 注册 Computer Use 工具 |
| MUST NOT 允许 Computer Use 操作不经 HITL 直接执行 | R5 | resolved / judgment | Computer Use 工具在 ToolGuard 中硬编码 `require_approval`，与配置无关 |

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes                              |
|--------------------|-------|------|--------|------------------------------------|
| Goal Clarity       | 0.92  | 0.75 | ✓      | 三个子目标具体、可衡量            |
| Boundary Clarity   | 0.90  | 0.70 | ✓      | Phase 拆分明确，in/out scope 清晰  |
| Constraint Clarity | 0.72  | 0.65 | ✓      | 框架/超时/并发/平台约束已锁定     |
| Acceptance Criteria| 0.80  | 0.70 | ✓      | 15 条 falsifiable 验收标准         |
| **Ambiguity**      | 0.15  | ≤0.20| ✓      | 通过阈值                           |

## Interview Log

| Round | Perspective    | Question summary                          | Decision locked                              |
|-------|----------------|-------------------------------------------|----------------------------------------------|
| 1     | Researcher     | Phase 7 的触发点是什么？                   | 三个触发点均相关：危险操作审批 + Computer Use + Sidecar 管理 |
| 1     | Researcher     | 哪些工具需要审批？                         | 可配置——由 config.json 驱动                   |
| 1     | Researcher     | Go Server 不存在时 SDC-02 如何处理？       | Phase 7b 仅管理 Python Agent，SDC-02 延后     |
| 2     | Simplifier     | HITL MVP 不可削减的核心？                  | 完整审批决策循环（提议→弹窗→批准/拒绝→继续/中止） |
| 2     | Simplifier     | Computer Use MVP？                         | pyautogui screenshot + click + type            |
| 2     | Simplifier     | Sidecar MVP？                              | spawn + health check + restart                 |
| 2     | Simplifier     | Phase 7 是否拆分？                         | 拆分为 7a（HITL+Computer Use）和 7b（Sidecar）  |
| 3     | Boundary Keeper| HITL 排除项？                              | 全部排除：审批历史、多级审批、超时自动拒绝已纳入 |
| 3     | Boundary Keeper| HITL UI 方案？                             | 聊天消息内嵌（CopilotKit useHumanInTheLoop 原生模式） |
| 3     | Boundary Keeper| Computer Use 库选择？                       | pyautogui 0.9.54，macOS 优先                   |
| 4     | Failure Analyst| HITL 断连最坏情况？                        | 30s 超时自动拒绝                                |
| 4     | Failure Analyst| 多个审批请求并发？                         | 排队处理，一次一个                              |
| 4     | Failure Analyst| Sidecar 崩溃循环？                         | 指数退避 1s→2s→4s→8s→16s，最多 5 次            |
| 4     | Failure Analyst| Computer Use 与用户操作冲突？              | 每次 Computer Use 操作强制走 HITL 审批          |
| 5     | Seed Closer    | HITL 验收标准补充？                        | 补充「等待审批中…」状态展示                     |
| 5     | Seed Closer    | Computer Use 验收标准补充？                 | 补充 macOS 辅助功能权限提示                     |
| 5     | Seed Closer    | Sidecar 验收标准补充？                      | 补充 stdout/stderr 日志捕获（移至 Phase 7b）    |

---

*Phase: 07-hitl-sidecar (7a: HITL + Computer Use)*
*Spec created: 2026-06-30*
*Next step: /gsd-discuss-phase 07 — 实现决策（如何构建上述规范）*

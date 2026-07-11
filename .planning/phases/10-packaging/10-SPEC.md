# Phase 10: Packaging — Specification

**Created:** 2026-07-11
**Ambiguity score:** 0.10 (gate: ≤ 0.20)
**Requirements:** 7 locked

## Goal

Paladin 产出可安装的 macOS `.dmg` 和可构建的 Windows `.msi`，在不依赖开发工具或源码目录的情况下启动内置 Agent 与 Go Server sidecar；macOS 完成真实安装后 UAT，Windows UAT 可延后但必须明确标记为未验证且非 release-ready。

## Background

Paladin 已有可运行的 Tauri 桌面应用、Python Agent 和 Go Server。Phase 07.3 实现了由 `apps/desktop/src-tauri/processes.json` 驱动的 Rust `ProcessSupervisor`，Phase 07.4 增加了 dev attach/spawn/conflict 语义以及 packaged 模式校验。

当前 `processes.json` 仍为 `mode: "dev"`，Agent 通过 `uv` 启动，Go Server 通过 `go run` 启动；`tauri.conf.json` 虽已启用 bundle，但尚无 sidecar 构建链、`externalBin` 或等效资源布局、安装包资源查找、日志轮转和安装后 UAT 证据。当前执行环境只有 macOS，因此本阶段要求 macOS 完成真实安装后 UAT；Windows 必须具备 `.msi` 构建能力，但真实 Windows UAT 可以延后，并保持非 release-ready 状态。

## Requirements

1. **macOS 安装包与验证**：从仓库生成 macOS `.dmg`，并在真实安装位置完成安装后启动验证。
   - Current: Tauri bundle 配置存在，但没有 Phase 10 `.dmg` 产物或已安装应用 UAT 记录。
   - Target: `.dmg` 可从仓库构建、安装并首次启动；运行时不依赖开发工具、源码目录或仓库状态。
   - Acceptance: 在全新安装位置启动 Paladin，Agent 与 Go Server 均从安装包资源启动，且无需 `pnpm`、`cargo`、`uv`、`go run` 或源码 checkout。

2. **Windows 安装包与延后验证状态**：从仓库生成 Windows `.msi`；真实 Windows UAT 可以延后，但构建状态与验证状态必须分开记录。
   - Current: Tauri 配置声明跨平台 bundle，但没有 `.msi` 构建产物或 Windows 安装后 UAT 记录。
   - Target: 仓库具备 `.msi` 构建能力；若当前环境无法完成真实 Windows UAT，则文档明确标记“已构建、未完成已安装应用验证、非 release-ready”。
   - Acceptance: 构建记录能够分别证明 `.msi` 是否生成、Windows 安装后 UAT 是否完成、Windows 是否 release-ready；成功构建本身不得自动将 Windows 标记为 release-ready。

3. **Packaged sidecar 二进制**：将 Python Agent 与 Go Server 构建为由 packaged supervisor 管理的内置可执行文件。
   - Current: Agent 通过 `uv` 启动，Go Server 通过 `go run` 启动；packaged 校验会拒绝这些命令，但尚无真实 packaged sidecar 产物。
   - Target: PyInstaller 产出逻辑名为 `paladin-agent-sidecar` 的 Agent，Go build 产出逻辑名为 `paladin-server-sidecar` 的 Server；允许 Tauri 所需的 target-triple 命名或 Windows `.exe` 后缀，运行时必须解析到安装包内的正确二进制。
   - Acceptance: packaged 配置使用两个锁定逻辑名并通过校验；macOS 和 Windows 构建布局中的实际文件名符合平台规则；运行时不依赖 PATH 即可解析并启动安装包内二进制。

4. **启动环境配置契约**：安装后的 sidecar 仅在进程启动时继承 Paladin 启动环境提供的 API Key、PostgreSQL、Redis 和 JWT 配置，本阶段不新增用户配置入口。
   - Current: Agent 和 Go Server 依赖环境配置，现有产品没有 packaged 用户配置入口或明确的继承契约。
   - Target: 每次 sidecar 启动时读取 Paladin 进程继承的环境；运行期间外部环境变化不热加载，重新启动 Paladin 后生效；缺失配置时显示脱敏且可操作的诊断。
   - Acceptance: 使用完整环境启动时 sidecar 能读取所需配置；缺失配置时诊断只指出缺失项或失败类别而不显示值；Paladin 运行期间修改外部环境不会改变已启动 sidecar，重启 Paladin 后新环境生效。

5. **安装后 sidecar UAT**：使用统一矩阵验证安装后的 sidecar 启动、liveness、readiness 与 degraded 行为。
   - Current: Rust 与前端自动化门禁通过，但 Phase 07.3/07.4 的 packaged/platform UAT 仍处于 deferred 状态。
   - Target: macOS 完成真实安装后 UAT；Windows 使用同一矩阵但允许延后。Agent liveness 与 Go liveness 必须通过；依赖可用时 Go readiness 通过；PostgreSQL、Redis 分别缺失或同时缺失时 Go 为 degraded，但 Agent 与主工作区仍可使用。
   - Acceptance: macOS UAT 记录覆盖依赖全部可用、仅 PostgreSQL 缺失、仅 Redis 缺失、两者均缺失四种场景；Windows 若未执行同一矩阵，明确记录为 deferred 且非 release-ready。

6. **有界 packaged 日志**：packaged sidecar 日志在逐行脱敏后按每服务每文件 10 MB、最多 5 个文件轮转。
   - Current: 日志会脱敏并写入应用日志目录，但文件无限追加，Phase 07.3 将轮转与长时间运行加固留给 Phase 10。
   - Target: 日志在恰好达到或超过 10 MB 时，于完整日志行边界轮转；每个服务最多保留 5 个文件；轮转或磁盘写入失败不打断脱敏后的 `process-log` UI 事件流。
   - Acceptance: 自动化测试证明 10 MB 边界、最多 5 个文件、完整行不拆分、落盘内容已脱敏，并证明轮转失败时 LogsPanel 仍持续收到新行。

7. **用户安装与首次运行文档**：提供可验证的安装、环境配置、故障排查和平台发布状态文档。
   - Current: 仓库 README 存在，但没有 packaged 安装、启动环境、sidecar 排障或逐平台 UAT 状态说明。
   - Target: 文档覆盖 macOS/Windows 安装、所需启动环境变量名称但不包含真实值、首次启动、PostgreSQL/Redis readiness、日志位置、常见 sidecar/config 失败，并分别展示两个平台的构建、安装后 UAT 与 release-ready 状态。
   - Acceptance: 文档检查能找到所有目标章节，且 macOS 与 Windows 状态分开呈现；任何未完成或失败的安装后 UAT 均明确标记为非 release-ready。

## Boundaries

**In scope:**
- macOS `.dmg` 构建、安装与真实已安装应用 UAT。
- Windows `.msi` 构建能力及可审计产物状态；真实 Windows UAT 允许延后。
- PyInstaller Agent sidecar 与 Go Server sidecar 的平台构建产物。
- packaged 配置、安装包资源查找及 supervisor-owned sidecar 启动。
- sidecar 启动时继承 Paladin 的环境配置及缺失配置诊断。
- Phase 07.3/07.4 deferred packaged UAT 的 macOS 闭环与 Windows 延后记录。
- packaged sidecar 日志轮转、脱敏和 UI 流连续性。
- 用户安装、首次运行、排障及逐平台发布状态文档。

**Out of scope:**
- Windows 真实安装后 UAT 作为本阶段完成的硬门槛 — 当前只有 macOS 环境，Windows UAT 延后且保持非 release-ready。
- 新增设置页、配置文件编辑器或其他用户配置入口 — 本阶段只锁定启动环境继承与文档说明。
- 代码签名、公证和自动更新 — 不属于 v1 本地打包范围。
- 公共发布托管或更新渠道 — 本阶段以本地产物和验证证据为交付。
- Linux 作为阻塞打包目标 — PKG-01/PKG-02 只要求 macOS 和 Windows。
- 替换现有 `cmd: string[]` 进程配置 schema — 继续保留 argv 语义。
- 重构 Agent 或 Go Server 产品功能 — 仅处理 packaged 启动所需改动。
- Phase 9 的桌面管理 UI — 与打包目标无关。

## Constraints

- 安装后的 packaged runtime 不得依赖 `pnpm`、`cargo`、`uv`、`go run`、login-shell PATH 或源码 checkout。
- Python Agent 本阶段使用 PyInstaller；Go Server 构建为平台原生可执行文件。
- 逻辑 sidecar 名称保持 `paladin-agent-sidecar` 与 `paladin-server-sidecar`，实际文件可按 Tauri target triple 和 Windows `.exe` 规则命名。
- packaged 校验继续拒绝 `uv`、`go` 和 repo-relative dev `cwd`。
- macOS 是真实 UAT 阻塞目标；Windows 必须可构建，但 UAT 可延后且在完成前非 release-ready；Linux 非阻塞。
- 本阶段不持久化或提供 UI 编辑运行配置；sidecar 在每次启动时继承 Paladin 的启动环境。
- PostgreSQL 与 Redis 是 Go `/readyz` 通过路径的前提；依赖不可用不得阻塞 Agent 或主工作区。
- sidecar 日志限制为每服务每文件 10 MB、最多 5 个文件，并保持先脱敏后落盘。

## Acceptance Criteria

- [ ] 从仓库生成 macOS `.dmg`，并在全新安装位置完成真实启动验证。
- [ ] 已安装 macOS 应用无需 `pnpm`、`cargo`、`uv`、`go run` 或源码 checkout 即可启动内置 sidecar。
- [ ] Windows `.msi` 构建路径可执行并记录是否生成产物。
- [ ] Windows 的构建、安装后 UAT、release-ready 三种状态分别记录；未执行 UAT 时明确标记 deferred 且非 release-ready。
- [ ] PyInstaller 生成逻辑名为 `paladin-agent-sidecar` 的平台产物。
- [ ] Go build 生成逻辑名为 `paladin-server-sidecar` 的平台产物。
- [ ] packaged runtime 能解析 target-triple 文件名及 Windows `.exe` 后缀，并从安装包资源启动 sidecar。
- [ ] packaged 配置拒绝 `uv`、`go` 与 repo-relative dev `cwd`，并接受两个锁定 sidecar 逻辑名。
- [ ] sidecar 每次启动时继承 Paladin 启动环境，运行期间不热加载外部环境变化，重启 Paladin 后使用新环境。
- [ ] 缺失 API Key、数据库、Redis 或 JWT 配置时，诊断指出缺失项或失败类别但不显示配置值。
- [ ] macOS 已安装应用 UAT 记录 Agent liveness 与 Go liveness 通过。
- [ ] macOS UAT 覆盖 PostgreSQL/Redis 全部可用、仅 PostgreSQL 缺失、仅 Redis 缺失、两者均缺失四种场景。
- [ ] 依赖不可用时 Go 显示 degraded，但 Agent 与主工作区仍可使用。
- [ ] 日志在恰好达到或超过 10 MB 时于完整行边界轮转，并且每服务最多保留 5 个文件。
- [ ] 日志轮转前完成逐行脱敏，不拆分或丢失完整日志行。
- [ ] 轮转或磁盘写入失败不打断脱敏后的 LogsPanel 实时日志流。
- [ ] 文档覆盖 macOS/Windows 安装、启动环境配置、首次启动、readiness、日志位置、常见失败与逐平台 UAT 状态。
- [ ] 文档分别展示 macOS 与 Windows 的构建状态、安装后 UAT 状态和 release-ready 状态。
- [ ] 不得把仅成功构建或 UAT 未通过的平台标记为 release-ready。
- [ ] 不得把继承的 API Key、数据库、Redis 或 JWT 配置值写入日志、UI 诊断、文档示例或打包资源。
- [ ] packaged 模式诊断不得要求用户运行 `uv`、`go`、`pnpm`、`cargo` 或编辑源码目录中的配置。
- [ ] stop/restart/shutdown 只能操作 supervisor 持有的子进程句柄，不得按端口或进程名终止用户管理的外部进程。

## Edge Coverage

**Coverage:** 7/7 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| unclassified | R1 | ✅ resolved / explicit | AC：`.dmg` 在全新安装位置首次启动，不读取源码目录或依赖开发工具。 |
| unclassified | R2 | ✅ resolved / explicit | AC：`.msi` 构建、Windows UAT、release-ready 状态分别记录。 |
| unclassified | R3 | ✅ resolved / explicit | AC：运行时解析 Tauri target-triple 命名和 Windows `.exe` 后缀。 |
| concurrency | R4 | ✅ resolved / explicit | AC：环境在 sidecar 启动时继承，运行期间不热加载，重启应用后生效。 |
| unclassified | R5 | ✅ resolved / explicit | AC：PG/Redis 分别缺失及同时缺失均为 Go degraded、Agent 非阻塞。 |
| unclassified | R6 | ✅ resolved / explicit | AC：10 MB 边界按完整行轮转，轮转失败不打断 UI 日志流。 |
| unclassified | R7 | ✅ resolved / explicit | AC：逐平台分别展示构建、UAT 与 release-ready 状态。 |

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT 将仅成功构建、未完成或未通过安装后 UAT 的平台标记为 release-ready。 | R1/R2/R5/R7 | resolved | verification: judgment |
| MUST NOT 将继承的 API Key、数据库、Redis 或 JWT 配置值写入日志、UI 诊断、文档示例或打包资源。 | R4/R6/R7 | resolved | verification: test；尚无已接线的负向测试描述符，verify 阶段须 fail-closed 定位或补充。 |
| MUST NOT 在 packaged 模式诊断中要求用户运行 `uv`、`go`、`pnpm`、`cargo` 或编辑源码目录中的配置。 | R4/R7 | resolved | verification: test；尚无已接线的负向测试描述符，verify 阶段须 fail-closed 定位或补充。 |
| MUST NOT 按端口或进程名终止用户管理的外部进程；生命周期操作只能作用于 supervisor 持有的子进程句柄。 | R5 | resolved | verification: test；尚无已接线的负向测试描述符，verify 阶段须 fail-closed 定位或补充。 |

通用 OWASP、命令注入和凭据安全属于规范安全检查范围，由 `$gsd-secure-phase` 负责，不在本 SPEC 重复生成禁令。

## Ambiguity Report

| Dimension | Score | Min | Status | Notes |
|-----------|-------|-----|--------|-------|
| Goal Clarity | 0.94 | 0.75 | ✓ | macOS 必须真实 UAT；Windows 可延后但状态明确。 |
| Boundary Clarity | 0.90 | 0.70 | ✓ | Windows UAT 与新用户配置入口均明确排除为本阶段硬交付。 |
| Constraint Clarity | 0.88 | 0.65 | ✓ | 启动环境继承、平台命名、无开发依赖和日志限制均锁定。 |
| Acceptance Criteria | 0.86 | 0.70 | ✓ | 22 条 pass/fail 标准覆盖产物、环境、UAT、日志、文档和禁令。 |
| **Ambiguity** | **0.10** | **≤ 0.20** | **✓** | 加权清晰度 0.90，门槛通过。 |

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 1 | Researcher | 当前平台能力与 packaged 运行配置来源 | macOS 完成真实安装后 UAT；Windows UAT 延后且非 release-ready；sidecar 只继承启动环境，不新增配置入口。 |
| Gate | Ambiguity scoring | 是否按 0.10 歧义分数写入 | 用户确认门槛通过并写入 SPEC。 |
| Edge Probe | Completeness | 7 个安装、平台、环境、依赖、日志与文档边缘 | 7 项全部转为明确 acceptance criteria。 |
| Prohibition Probe | Must-NOT | 发布诚实、配置隐私、packaged 诊断与外部进程安全 | 4 条 bespoke 禁令全部保留并锁定。 |

---

*Phase: 10-packaging*
*Spec updated: 2026-07-11*
*Next step: `$gsd-discuss-phase 10` — implementation decisions (how to build what is specified above)*

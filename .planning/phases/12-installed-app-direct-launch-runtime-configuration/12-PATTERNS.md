# Phase 12：已安装应用直启与运行时配置 — 模式映射

**映射日期：** 2026-07-16  
**分析文件：** 25 个候选修改/新增文件  
**已找到类比：** 25 / 25

本文件只记录应复用的现有实现模式，不定义实现方案。来源为第 12 阶段 CONTEXT、RESEARCH、UI-SPEC，以及 Phase 10/11 已落地代码和计划总结。

## 文件分类

| 候选文件 | 角色 | 数据流 | 最接近类比 | 匹配 |
|---|---|---|---|---|
| apps/desktop/src-tauri/src/go_config/{types,storage,bootstrap,mod}.rs | Rust 配置模型/服务 | file-I/O、请求响应 | src-tauri/src/ai_provider/* | 精确 |
| apps/desktop/src-tauri/src/go_config/*_tests.rs | Rust 单测 | file-I/O | ai_provider/{storage,bootstrap,commands}_tests.rs | 精确 |
| apps/desktop/src-tauri/src/lib.rs | Tauri 组合根 | 生命周期 | 现有 AI manager 注册与 command handler | 精确 |
| apps/desktop/src-tauri/src/process/supervisor.rs | supervisor | 事件驱动、spawn | environment_for_process / spawn_child_to_slot | 精确 |
| apps/desktop/src-tauri/src/process/{commands,log_redact}.rs | Tauri 命令/安全工具 | 请求响应、transform | server commands / redact_log_line | 精确 |
| apps/desktop/src-tauri/src/process/*_tests.rs | Rust 集成/单测 | spawn、transform | supervisor_tests.rs、log_redact_tests.rs | 精确 |
| apps/server/cmd/server/{main,main_test}.go | Go 启动/测试 | env、HTTP readiness | 现有 packaged degraded 逻辑 | 精确 |
| apps/desktop/src/lib/tauri-commands.ts | 前端 DTO/命令网关 | 请求响应 | AI provider command wrappers | 精确 |
| apps/desktop/src/stores/goService.ts + tests | Zustand store | 请求响应、状态同步 | stores/aiProvider.ts + tests | 精确 |
| apps/desktop/src/components/go-service/GoServicePanel.tsx + tests | React 表单/诊断 | 请求响应 | provider/AiProviderPanel.tsx + tests | 精确 |
| apps/desktop/src/components/layout/RightPanel.tsx、stores/terminal.ts | 面板导航状态 | UI 状态 | 既有 AI Provider 标签 | 精确 |
| apps/desktop/src/components/StatusBar/{ProcessLight,GoServiceLight}.tsx + tests | 状态 Popover | 事件驱动 | ProcessLight.tsx + test | 精确 |
| apps/desktop/src/components/StatusBar.tsx | 状态栏组合 | UI 组合 | 现有三灯布局 | 精确 |
| apps/desktop/src/components/{StartupMask,ChatArea}.tsx + tests | 非阻塞保护 | UI 状态 | Agent-only startup/provider CTA 测试 | 角色匹配 |
| scripts/launch-paladin-macos.sh、scripts/test-launch-paladin-macos.sh | launcher/UAT shell harness | 进程、文件 I/O | 当前 wrapper 与 fake .app 测试 | 精确 |
| apps/desktop/scripts/{secret-sentinel,release,build-manifest}.mjs + tests | 打包验证/证据 | batch、文件 I/O | Phase 10 sentinel/manifest | 精确 |
| README.md、docs/packaging.md、docs/supervisor-startup-chain.md | 产品/运行文档 | transform | Phase 10/11 文档与状态矩阵 | 精确 |
| .planning/phases/12-…/evidence/*.json、12-VERIFICATION.md | 无秘密证据 | batch | Phase 10 evidence/macos-build.json、10-VERIFICATION.md | 精确 |

## 模式分配

### Rust app-data 配置：apps/desktop/src-tauri/src/go_config/

**类比：** ai_provider/types.rs、storage.rs、bootstrap.rs、mod.rs（Phase 11 的已落地配置权威）。

- 对外 DTO 只含配置完整性、来源、逐字段诊断、readiness 和固定指纹；runtime snapshot 才能携带 DB URL、Redis URL、JWT，且只留在 Rust。
- metadata 与 secrets 分文件；单个 manager 用 Arc<tokio::sync::Mutex<()>> 串行读改写；写入用临时文件再 rename。
- 保存、测试/readiness、显式环境导入、清除是独立命令；清除必须记录用户已处理，不能让 bootstrap 自动复活配置。
- 复用 AI bootstrap 的 Clean / AlreadyImported / LocalConfigExists 门槛，只接受完整有效的三项环境组；D-07 会话覆盖只产生本次 spawn snapshot，不能写入任一 JSON。

关键摘录，storage.rs 80–88：

    pub async fn new_for_app_data(app_data_dir: impl AsRef<Path>) -> Result<Self> {
        let app_data_dir = app_data_dir.as_ref().to_path_buf();
        std::fs::create_dir_all(&app_data_dir)?;
        Ok(Self { app_data_dir, write_lock: Arc::new(Mutex::new(())) })
    }

同文件 165–210 的双视图模式必须保持：load_masked_config 返回前端安全模型，runtime_snapshot 读取 secret 但不离开 Rust。测试复用 storage_tests 的原子写、掩码读回、并发写；bootstrap_tests 的一次导入/本地优先；commands_tests 的 JSON 无 raw key。Go 版本要用 DB/Redis/JWT 哨兵断言读接口、错误、日志和序列化都不含哨兵。

### Tauri 注册与 Go 命令：src-tauri/src/lib.rs、go_config/mod.rs

**类比：** ai_provider/mod.rs 及 Phase 11 的 11-03、11-05 计划。

调用链固定为：setup 解析 app-data → manager new_for_app_data → app.manage → generate_handler 的 get/save/test/import/clear → 前端 invoke。命令接收写入输入，返回 masked DTO 或无秘密测试结果；不能把 runtime snapshot 作为 command 返回值。保持 Rust snake_case serde 与前端桥接的既有转换风格；新增 manager 必须在 supervisor 可用前注入或由 supervisor 受控读取。

### 显式 sidecar 环境与 readiness：src-tauri/src/process/supervisor.rs

**类比：** 同文件 environment_for_process 101–135 与 spawn 1107–1138。

关键摘录：

    for (name, value) in configured {
        if !value.is_empty() && BUSINESS_ENV_ALLOWLIST.contains(&name.as_str())
            && name != "PALADIN_RUNTIME_MODE" {
            result.insert(OsString::from(name), OsString::from(value));
        }
    }
    cmd.env_clear().envs(process_env);

Go snapshot 应在 configured 覆盖路径进入 server spawn；保留 PALADIN_RUNTIME_MODE 最终由 supervisor 写死（122–127）与 packaged LOGFIRE_PYDANTIC_RECORD=off。当前函数会先复制 parent allowlist（107–111），所以来源选择必须在此之前完整解析：正常 installed 直启不得混合 parent Go 环境和已保存记录。不要新增第二套 Go runner 或绕开 env_clear。

ProcessInfoDTO（449–473）和 process-status event 已是 agent/server 共享状态通道。Go 配置/readiness DTO 应补充结构化分类，不让 UI 从 last_error 文本推断字段缺失；保留 state_machine 的 healthz liveness 成功与 readyz 非 200 → Degraded、且不重启语义。

### supervisor 操作与日志脱敏：process/commands.rs、process/log_redact.rs

**命令类比：** commands.rs 35–50。

    #[tauri::command]
    pub async fn restart_server(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
        supervisor.restart_one(ProcessName::Server).await
    }
    #[tauri::command]
    pub async fn redetect_server(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
        supervisor.redetect_one(ProcessName::Server).await
    }

保留 owner 规则：external 可重新检测，但不可 stop/restart；托管 server 才可 restart。测试/重试 readiness 应复用 supervisor 的 status/probe 真相，而不是 React 直接请求 sidecar 后伪造 process 状态。

**脱敏类比：** log_redact.rs 24–83 和 supervisor 420–446 的顺序：先 redact_log_line，再 event/tail，最后 best-effort 落盘。扩展匹配必须覆盖 DB DSN、Redis URL 和 PALADIN_JWT_SECRET，并同时保护 last_error、stderr_tail、process-log、UI diagnostic、测试证据；不能仅在渲染时掩码。

    let redacted = redact_log_line(raw_line);
    emit(&chunk);
    stderr_tail.push_back(redacted.clone());
    let _ = writer.write_line(&persisted);

### Go 启动与 readyz：apps/server/cmd/server/main.go、main_test.go

**类比：** main.go 23–65、108–181。Go 仍只从当前进程 env 加载，desktop 负责解析持久配置与向 spawn 注入。

    if err != nil {
        if shouldStartPackagedDegraded(err) {
            degradedCfg, degradedErr := config.LoadPackagedDegraded()
            runDegradedServer(degradedCfg, dependencyStatus{ ... })
            return
        }
    }

loadDotenvForRuntime（175–181）是不可回退边界：packaged 模式必须立即 return；测试复用 main_test.go 的 .env lure，证明 packaged 不读取 dotenv、dev 仍读取。诊断保持 missing / unknown / up / down 等非敏感类别，不回显 URL、JWT 或错误字符串中的连接凭据。

### 前端 command 与 Zustand：src/lib/tauri-commands.ts、src/stores/goService.ts

**类比：** tauri-commands.ts 7–80、92–129，stores/aiProvider.ts 94–127、142–271。

调用链：typed DTO/wrapper → useGoServiceStore.refresh → GoServicePanel 与 status light selector；保存/测试/导入/清除分别维护 isSaving、isTesting、最新结构化结果与 error，成功后以后端 masked response 刷新状态。

    set({ isLoading: true, error: null });
    try {
      const config = await getAiProviderConfig();
      set({ ...deriveConfig(config), isLoading: false });
    } catch (error) {
      set({ isLoading: false, error: error instanceof Error ? error.message : String(error) });
    }

不得把 raw 三字段保存在全局 store、localStorage、URL 或测试快照；编辑表单值限组件内存，store 保持 masked DTO。复用 aiProvider.ts 265–269 的 openSettingsPanel，但改为 Go panel id。

### 设置面板和右侧标签：GoServicePanel.tsx、RightPanel.tsx、terminal.ts

**类比：** provider/AiProviderPanel.tsx 与 RightPanel.tsx 128–134、153–167，stores/terminal.ts 9、45、49。

将 go-service 加入 RightPanelId，并放在 ai-provider 后；复用 h-9 tab bar、hidden sm:inline、title 和 panelWidth: Math.max(300, w)。表单复用 AI panel 的 Button/AlertDialog/ScrollArea/sonner、受控 input、inline 结果和测试组件结构；但 UI-SPEC 的 write-only 输入规定优先于 AI provider 的 API-key 回填行为：旧 secret 只能显示 presence/fixed fingerprint，绝不作为 input value。

测试类比：provider/__tests__/AiProviderPanel.test.tsx 负责 DOM 文案、禁用、提交流程；Go 面板增加保存不依赖网络、未保存测试不落盘、清除后不自动导入、哨兵不在 DOM/aria/toast 断言。

### 状态栏与非阻塞 UX：ProcessLight.tsx、StatusBar.tsx、StartupMask.tsx

**类比：** ProcessLight.tsx 8–107，StatusBar.tsx 36–41，Phase 11 AiProviderLight.tsx 与 ChatArea provider CTA。

    const isExternal = status.owner === 'external';
    <Button size="sm" disabled={isExternal} onClick={() => invoke(...)}>重启</Button>
    <Button size="sm" variant="outline" onClick={() => invoke(...)}>重新检测</Button>

必须保留 ProcessLight 的 state + owner + health 文本和 external 限制；Go status 专属 copy/动作应建立在这一组件或受控扩展上。当前已有的关键降级文案是：Go 服务已启动，但依赖未完全就绪；Agent 仍可继续使用。未配置、字段无效、会话覆盖、端口冲突也须保持 Agent 非阻塞。StartupMask 只观察 agent 阻塞状态，Go readiness 不得接入遮罩条件；AI provider 灯仍独立呈现。

测试复用 StatusBar/__tests__/ProcessLight.test.tsx 的 Popover 操作/DOM 断言，新增可访问名称、外部 owner disabled、Go 降级文字和不泄密断言。

### launcher、打包验证和无秘密证据：scripts/*、apps/desktop/scripts/*

**launcher 类比：** scripts/launch-paladin-macos.sh 1–87、test-launch-paladin-macos.sh 33–75。现有 shell wrapper 用 set -euo pipefail、只接收非秘密 --app、fake .app 作为测试夹具。Phase 12 要保留其诊断/UAT用途，但文档与 primary evidence 改为 DMG 安装到 /Applications 后 Finder 双击；不要把 wrapper 删除或当正常启动依赖。

**安全类比：** apps/desktop/scripts/secret-sentinel.mjs 7–17、40–82。复用四种 raw sentinel、missing/empty/symlink fail-closed、只报告 target/category/hash 的输出。证据 JSON 只记录 version/commit/hash、artifact manifest、launch entry point、场景结果、诊断类别、manual UAT/release-ready 状态；不可记录 DSN/JWT/环境值/raw log。

**发布类比：** release.mjs、build-manifest.mjs 和 Phase 10 的 10-09-PLAN.md/evidence/macos-build.json：先 fast packaged staging + sentinel，再 artifact identity；Windows/Linux 自动化证据明确 manual_uat: pending、release_ready: false，不可声称真实 installed UAT。

### README 与运行文档

**类比：** README.md 35–75、docs/packaging.md 的平台矩阵/运行环境/日志诊断章节，以及 docs/supervisor-startup-chain.md 的配置真相源、启动顺序、前端状态消费。

保持平台状态表格明确 buildability、installed-app UAT、release-ready；配置来源与 runtime mode 在专章说明；Agent liveness、AI readiness、Go readiness 三者分别叙述；日志章节只提变量名或类别。替换 README/packaging 当前必须 wrapper 的过时文案时，保留开发和显式 UAT wrapper 命令，但不可把 shell env 写成正常 GUI 启动要求，也不可给用户 developer command/path 排障指令。

## 共享模式与注意事项

| 主题 | 权威来源 | 对第 12 阶段的约束 |
|---|---|---|
| 持久配置权威 | ai_provider/storage.rs | app-data 是唯一持久化源；资源包只读，environment 仅为完整一次 bootstrap 或受标记 session override。 |
| 原子与并发 | ai_provider/storage.rs 90–125、313–319 | 同一 mutex 覆盖 metadata+secrets 的 read-modify-write；临时文件+rename，不得半写。 |
| spawn 环境 | supervisor.rs 101–135、1124–1128 | 只通过 allowlist + env_clear().envs(...)；不得依赖 Finder/Start Menu 的 shell。 |
| Go 降级 | main.go 112–173；state_machine.rs | health 可用、ready 不可用为降级且不重启；Agent 继续启动。 |
| 进程所有权 | ProcessLight.tsx 43、71–107 | external 不 stop/restart；仍可 redetect/log；不能把 Go config 错误伪装为 owner 问题。 |
| 脱敏顺序 | log_redact.rs + supervisor.rs 420–446 | source 处先脱敏，再 event/tail/disk/UI/evidence；DB/Redis/JWT 全链路哨兵测试。 |
| 前端局部秘密 | AiProviderPanel + aiProvider.ts | draft secret 仅组件内存；Zustand 只存 masked DTO 和 operation state。 |
| 文档/证据诚实性 | docs/packaging.md、Phase 10 evidence | 明确 Finder macOS UAT 与 Windows/Linux automation 的差异；不以 buildability 冒充 release-ready。 |

## 无需新增类比的文件

无。所有候选均有成熟的同角色实现；Go service 配置的唯一新语义是三字段完整快照、清除防自动重导入、显式受标记会话覆盖，应在上述 AI config manager 的形状内表达，而不是引入新的存储、进程或 UI 架构。

## 供计划器使用的调用关系

GoServicePanel（局部 draft） → tauri-commands.ts → go_config Tauri command → GoConfigManager（masked response / runtime snapshot） → ProcessSupervisor environment_for_process → env_clear + Go server → healthz、readyz → ProcessInfoDTO/process-status + Go config DTO → useGoServiceStore / ProcessLight / StatusBar。

日志、诊断和证据支路：sidecar output / error → redact_log_line → event、tail、disk、Popover、sentinel scan；任何节点都不允许反向传递 secret。

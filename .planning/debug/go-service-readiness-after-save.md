---
status: awaiting_human_verify
trigger: "本地开发模式中，Paladin 托管 Go 服务处于 degraded；保存完整 Go 配置并测试后，Go 状态仍不变。"
created: "2026-07-21"
updated: "2026-07-21"
---

# Debug: Go service readiness after saving configuration

## Symptoms

- **Expected:** 保存完整 Go 配置后自动测试连接，并更新托管 Go 服务状态为就绪或明确失败类别。
- **Actual:** 配置保存到设备后，面板仍显示 sidecar/健康检查 degraded、readiness untested；点击重新检测也不改变状态。
- **Errors:** 未提供可见控制台错误。
- **Timeline:** 首次进行此验证。
- **Reproduction:** 本地开发模式启动 Paladin，Go 服务由 Paladin 托管；输入完整配置、保存，再测试/重新检测，观察状态不更新。
- **Additional request:** 在 JWT 输入处新增安全随机生成按钮和显隐切换按钮。

## Investigation History

reasoning_checkpoint:
  hypothesis: "受 supervisor 管理的子进程在 spawn 后立刻被 wait_exit 从 slot.child 取走并持有至退出；因此关闭或重启时 graceful_shutdown_slot 找不到 Child，虽 state 仍是 supervisor 却无法向实际进程组发送终止信号，最终留下孤儿 sidecar。"
  confirming_evidence:
    - "spawn_child_to_slot 先将 Child 写入 slot.child，随后启动 wait_exit。"
    - "wait_exit 的第一步是 slot.child.lock().await.take()，然后 await child.wait()；运行中的 child 因而不再保存在 slot 中。"
    - "graceful_shutdown_slot 在 owner=supervisor 后只从 slot.child.take() 取得目标；None 时立即返回。"
    - "运行时观察到比主应用更早、PPID=1 的 9876/9880 sidecar，与关闭路径无法终止托管树的机制一致。"
  falsification_test: "让 wait task 观察一个仍在运行的受控子进程；若该期间 slot.child 仍保存同一 PID，且关闭能够取走该 handle，则旧的 take-and-wait 不是缺陷。"
  fix_rationale: "wait_exit 改为以 spawn 时捕获的 PID 轮询 slot 中同一 Child 的 try_wait；只有确认该 PID 已退出时才移除 handle。关闭/重启仍能原子取走并终止受追踪的 child，PID 不匹配时旧 wait task 退出，不会触碰新一代 child。"
  blind_spots: "此修复不能终止已经脱离旧版本监督器的外部 orphan；它只防止新启动的托管 child 在正常关闭或重启时丢失追踪。"
next_action: "以 PID 绑定的非转移式 wait 取代 wait_exit 的 take+await，并加入 Unix 回归，验证运行期间 handle 始终在 slot 中。"

hypothesis: "当前桌面进程面对的 9876/9880 sidecar 是前一实例遗留的孤儿进程；它们没有当前 supervisor 的 Child handle，启动阶段会安全 Attach/external，保存后自动重启被权限门控跳过，因而配置只能处于待应用状态。"
test: "核对实际 PID、PPID、监听端口与主进程启动时间；再追踪 Attach/external 的 allowed_actions 与 GoServicePanel 保存分支。"
expecting: "若 sidecar 的 PPID 为 1、早于主进程，且 owner=external 的 restart=false，则这不是 restart 实现未清 pending 的 bug，而是必须先释放遗留进程才能让当前实例 Spawn/supervisor。"
next_action: "执行只读 ps/lsof 取证，并在源码中验证 Attach/external 与 restart 拒绝的因果链。"

hypothesis: "已验证：先前的端口占用来自遗留的已安装应用 sidecar；开发 supervisor 将健康且占用端口的服务安全标为 external，不会接管它。"
test: "已终止遗留 sidecar 并复核 9876/9880；审查当前 spawn、正常退出、SIGINT/SIGTERM 的进程组终止路径。"
expecting: "在已安装应用完全退出且端口释放后，开发实例走 Spawn/supervisor，而非 Attach/external；保存配置会调用既有 restart_go_service。"
next_action: "由用户执行一次真实桌面端冷启动与保存配置 UAT，确认 owner=supervisor、自动重启和 readiness 刷新。"

fault_tree:
  symptom: "真实 DMG 中点击保存完整 Go 配置后，UI 显示通用保存失败。"
  branches:
    - "前端在调用 Tauri 前的草稿校验失败"
    - "save_go_service_configuration 的 Rust 输入反序列化或字段校验失败"
    - "配置加密/持久化写入失败"
    - "保存成功但返回 JSON 反序列化/前端后续刷新抛错，被同一 catch 误报为保存失败"
  first_test: "完整追踪 GoServicePanel 保存处理器、Tauri 命令与其测试，定位 catch 覆盖的精确异步范围，并写出可观察的失败原因。"
hypothesis: "待检验：保存失败可能来自 Tauri 命令返回的具体错误，但 GoServicePanel 将整个 save→refresh→restart 链路的任何拒绝统一吞为通用提示；需先隔离每个 await 的失败点。"
test: "阅读完整保存调用链与现有回归，随后以受控 mock 分别拒绝 save、refresh、restart，观察当前 UI 是否产生相同提示。"
expecting: "若三种拒绝都显示同一提示，则 UI 不能区分真正的保存命令错误，先补安全的阶段化错误可观测性；若只有 save 拒绝才显示该提示，则向 Rust 命令/存储层追踪。"
next_action: "读取 GoServicePanel、goService store、tauri command wrapper、Rust save 命令和相关测试的完整实现。"

investigation_update:
  observation: "save() 的 try/catch 覆盖 saveConfiguration 和条件 restartService；两者均会被同一条‘保存配置失败’覆盖。Rust save 命令将存储错误转换为字符串并拒绝 Tauri Promise，而 store 会原样 rethrow。"
  hypothesis: "已支持：真实 DMG 的具体 Tauri 拒绝已到达前端，但 GoServicePanel 丢弃了该错误；这阻断了区分输入反序列化、持久化或自动重启失败的能力。"
  test: "新增仅 mock save_go_service_configuration 拒绝的面板回归，期望 UI 可见经脱敏的错误原因且不包含草稿秘密。"
  expecting: "修复前该用例会因仅显示通用文案而失败；修复后通过，证明实际 Tauri 失败类别不再被吞掉。"
  next_action: "写入并运行最小 RED 回归。"

reasoning_checkpoint:
  hypothesis: "GoServicePanel 的 save() 捕获了来自 save_go_service_configuration 的 Tauri 拒绝但未读取 error，因此真实 DMG 中的错误原因被替换成通用文案，无法诊断实际失败。"
  confirming_evidence:
    - "GoServicePanel.tsx 的 catch 块没有错误参数，且固定设置‘保存配置失败，请检查字段后重试。’。"
    - "store.saveConfiguration 在捕获 invoke 拒绝后用 throw error 原样向上传播。"
    - "新增的仅保存命令拒绝回归稳定失败：UI 找不到拒绝消息，只显示通用提示。"
  falsification_test: "修改后，让保存命令拒绝一个明确的存储错误；若 UI 仍不能显示该原因，或任一草稿值出现在结果文本中，假设不成立。"
  fix_rationale: "将捕获错误转换为受长度限制、按当前草稿值脱敏的诊断文本，保留失败来源而不把数据库 URL、Redis URL 或 JWT 渲染给用户。"
  blind_spots: "当前未掌握真实 DMG 返回的具体错误，因此本修复只能揭露其安全诊断；需要安装该构建后重新执行 UAT 才能确认底层失败类别。"
next_action: "在 GoServicePanel 增加错误安全格式化并让保存 catch 显示该格式化结果。"

verification_plan:
  original_reproduction: "仅让 save_go_service_configuration 的 invoke Promise 拒绝；确认 UI 显示拒绝原因且不显示任一草稿秘密。"
  adjacent_checks:
    - "GoServicePanel 完整回归（含 supervisor 自动重启与旧 DTO 兼容）"
    - "GoServiceLight 与 goService store 相邻测试"
    - "TypeScript/Vite 生产构建与 git diff --check"
  next_action: "检查 DMG 发布脚本和现有 DMG 内的前端资源，搜索新旧保存失败文案并比对产物生成时间。"

packaging_hypothesis:
  hypothesis: "已确认：用户 UAT 使用的 DMG 含旧前端 bundle；当前发布入口本身声明 beforeBuildCommand=pnpm build，因此重新经 release 入口构建后，DMG 内应含新错误诊断文案。"
  evidence:
    - "已安装 /Applications/paladin.app 的可执行资源命中旧文案。"
    - "当前 apps/desktop/dist 的 JS 命中新文案，未命中旧文案。"
    - "当前 DMG（16:05:07）只命中旧文案；tauri.conf.json 指定 beforeBuildCommand=pnpm build、frontendDist=../dist。"
  falsification_test: "运行 pnpm release -- --target aarch64-apple-darwin 后，只读挂载新 DMG；若仍只命中旧文案，发布入口未把当前 dist 带入 Tauri 产物。"
  next_action: "通过 release 入口重新生成 DMG，并检查其中的新旧文案。"

reasoning_checkpoint:
  hypothesis: "已确认：Rust 的 ProcessInfoDTO 和 ProcessAllowedActions 使用 serde 默认 snake_case 序列化，Tauri 实际返回 `allowed_actions`；TypeScript 只读取 `allowedActions`，因此 canRestartGoService 返回 false，导致 supervisor 所有的 Go 服务在保存后不会调用 restart_go_service。"
  confirming_evidence:
    - "用户从真实 Tauri 命令响应确认字段为 `allowed_actions`，而 TypeScript DTO、store 与权限函数读取 `allowedActions`。"
    - "ProcessInfoDTO 与 ProcessAllowedActions Rust 字段分别声明为 `allowed_actions` 和动作字段，当前定义没有 serde rename_all camelCase。"
  falsification_test: "已执行：GoServiceActionResult 的 Rust serde 回归证明 process.allowedActions.restart=true；该真实 JSON 经 TypeScript store 与面板回归后调用 restart_go_service。"
  fix_rationale: "为 Rust DTO 统一声明 camelCase 序列化合同，并用跨层回归把真实 Rust JSON 直接输入 TypeScript store；这样前端不必推断 snake_case 兼容性，保存响应中的 supervisor 权限会正确触发既有重启命令。"
  blind_spots: "单元测试不能替代真实桌面端的完整网络 readiness 检测；但能验证命令响应的字段形状、owner/权限及保存后的重启调用链。"
  next_action: "已完成真实桌面端 UAT；补充核查端口冲突中的遗留 sidecar 退出链路。"

  reasoning_checkpoint:
    hypothesis: "GoServicePanel 以 `state=running && health=healthy` 作为唯一正常条件，未先判断 `config.configured=false/readiness=unconfigured`；因此清除本地配置后，仍存活且健康的进程会被错误宣称为服务完全正常，违反 D-08 的未配置降级语义。"
    confirming_evidence:
      - "当前代码在 GoServicePanel.tsx 中将 `liveProcessReady` 直接渲染为“Go 服务运行正常”，没有检查 `config?.configured` 或 `config?.readiness`。"
      - "GoConfigManager 在未配置时稳定输出 `configured=false` 与 `readiness=unconfigured`；GoServiceLight 对相同输入已优先显示“Go · 未配置 · 降级”。"
      - "现有面板回归仅覆盖 running+healthy+configured+untested，未覆盖 D-08 清除配置后的 running+healthy+unconfigured 组合。"
    falsification_test: "加入 running+healthy+unconfigured 回归后，若旧实现不渲染完整正常文案，或修复后 configured+ready 与依赖失败的预期分支不再正确，假设不成立。"
    fix_rationale: "先按持久化配置状态判定未配置/降级，再以实时健康度描述进程 liveness；仅在配置存在且进程健康时声明服务运行正常，避免把可用进程与完整服务配置混为一谈。"
    blind_spots: "前端合同可验证 DTO 组合和文案，无法单独证明实际数据库或 Redis 的网络连通性；该部分仍由 Rust supervisor 探针负责。"
- next_action: "已完成：真实桌面端 UAT 已确认通过。"

reasoning_checkpoint:
  hypothesis: "状态灯使用不完整 optional chaining 访问 process.allowedActions.restart，旧 DTO 缺失 allowedActions 时会同步抛出 TypeError；此前面板已用可选链避免该问题，但两处未共享安全策略。"
  confirming_evidence:
    - "新增的状态灯回归测试在当前代码上稳定失败，并直接报告 GoServiceLight.tsx:95 读取 undefined.restart。"
    - "面板对相同字段已使用 allowedActions?.restart === true，且其旧 DTO 回归测试已通过。"
  falsification_test: "将状态灯判断替换为‘仅显式 true’后，若缺失 allowedActions 的回归仍抛出该错误，或仍出现重启操作，则该假设不成立。"
  fix_rationale: "把权限判断集中为仅显式授予才返回 true，可直接消除未定义解引用，且不会把旧 DTO 或外部服务提升为可重启。"
  blind_spots: "无法仅凭组件测试验证真实 Tauri 事件传输的所有历史 DTO 变体；需通过本地开发运行时烟雾测试补充确认。"

## Current Focus

hypothesis: "已确认的托管 sidecar 孤儿根因已修复：wait_exit 不再在运行期间从 slot.child 取走 Child，正常关闭与重启因此能取得受追踪句柄并终止其 Unix 进程组。"
test: "已复跑 PID 绑定 wait 回归、完整 Rust 单元测试、前端相关回归、格式检查、Rust/前端构建与差异检查。"
expecting: "真实桌面端以新构建启动并正常退出后，9876/9880 不应遗留由已退出 Paladin 创建的监听进程。"
next_action: "等待用户完成一次新构建的桌面端冷启动→保存 Go 配置→正常退出→检查端口的端到端确认。"

verification_summary:
  managed_child_regression: "通过：等待任务运行时 slot.child 仍保留同一 PID；关闭路径可 take、终止并回收该进程，观察任务安全退出。"
  rust: "cargo test --lib：128/128 通过；cargo fmt --check 与 cargo build 通过。"
  frontend: "GoServicePanel、GoServiceLight、goService store：28/28 通过；npm run build 通过。"
  scope: "未启动、停止、接管或修改任何外部桌面/sidecar 进程。"

## Evidence

- timestamp: 2026-07-21
  source: runtime ps/lsof + supervisor.rs + go_config/commands.rs
  observation: 当前 `/Applications/paladin.app` 主进程 PID 5595 于 16:44 启动；9876 上的 agent（89112/89130）和 9880 上的 server（89549）均于 16:30 启动且 PPID=1，早于主进程。开发启动路径对健康占用端口无条件 Attach，并清空 child handle、设置 owner=external；external 的 allowed_actions.restart=false，而 `restart_go_service` 会返回 RestartUnavailable。
  implication: 已确认的症状来自前一实例遗留的孤儿 sidecar，不是保存后的 Rust restart 或 readiness 探针失效。当前实例不能也不应接管/终止这些外部进程；配置会等待这些服务由其所有者退出后，再由当前实例 Spawn/supervisor 应用。
- timestamp: 2026-07-21
  source: go_config/storage.rs:masked + go_config/commands.rs:action_result + phase 12 D-03 contract
  observation: `masked()` 无条件返回 `pending_apply=false`，而 `action_result()` 仅在 save/import/clear 这一次响应中覆盖为 true；后续 get/retry/restart 响应立即恢复 false。D-03 要求 store 维护明确的 pending-apply 状态，且 external owner 只能返回 restart-unavailable。
  implication: 孤儿 external sidecar 是本次不能应用配置的根因；另有独立 UI 状态缺口：外部服务未重启前，刷新会丢掉“待应用”提示，可能错误显示 ready。该缺口需通过持久的配置版本/已应用版本或 supervisor-owned pending 标记解决，不能靠放宽 external restart 权限。

- timestamp: 2026-07-21
  source: GoServicePanel.tsx、goService.ts、go_config/commands.rs
  observation: save() 的 catch 覆盖保存和条件重启，且不读取 error；store 将 invoke 的原始拒绝向上 rethrow，Rust save 则把存储错误字符串作为 Tauri 拒绝返回。
  implication: 真实失败原因已到达 UI 边界但被前端丢弃；在没有新 UAT 错误文本前，不能把实际故障归因于字段、存储或进程重启。
- timestamp: 2026-07-21
  source: GoServicePanel 保存失败回归（RED→GREEN）
  observation: 仅 mock 保存命令拒绝时，旧实现稳定只显示通用提示；改为显示脱敏、最多 240 字符的错误后，回归通过，并确认三个草稿值不在结果文本中。
  implication: Tauri 错误类别现在可在真实 DMG 中安全观察，且不会通过该结果区域泄露当前写入专用值。
- timestamp: 2026-07-21
  source: Vitest、npm run build、git diff --check
  observation: GoServicePanel/GoServiceLight/goService store 28/28 通过；TypeScript/Vite 生产构建成功；差异检查无输出。Vite 仅报告既有 node-fetch 浏览器外置模块提示。
  implication: 保存失败诊断修复未破坏保存、自动重启、旧 DTO 兼容、状态灯/store 合同或生产打包。
- timestamp: 2026-07-21
  source: 最新 DMG UAT 截图文案与当前源码比对
  observation: 当前源码保存失败文案包含“保存配置失败：”及脱敏详情；截图显示旧的“保存配置失败，请检查字段后重试。”。
  implication: 当前 DMG 的前端资源可能未包含本次源码；必须先检查打包脚本、产物时间与 DMG 内资源，不能把该截图归因给当前 Rust 保存命令。

- timestamp: 2026-07-21
  source: 用户截图与复现说明
  observation: 配置已保存，表单不回填机密值，sidecar 与健康检查均为 degraded，readiness 为 untested；重新检测无变化。
- timestamp: 2026-07-21
  source: apps/desktop/src-tauri/src/go_config/commands.rs、apps/desktop/src-tauri/src/go_config/types.rs、apps/desktop/src-tauri/src/go_config/storage.rs
  observation: save_go_service_configuration 保存后返回 SavedPendingRestart；retry_go_service_readiness 仅返回当前快照；两者均不调用 supervisor.restart_one 或 redetect_one。配置 readiness 枚举仅有 Unconfigured/Untested，持久化配置读取也固定生成 Untested。
  implication: 保存和重新检测缺少让托管 Server 以新配置启动并产生新的实时健康/readiness 状态的机制；UI 不可能从这些命令得到 ready/failed 类别。
- timestamp: 2026-07-21
  source: apps/desktop/src-tauri/src/process/supervisor.rs
  observation: 只有 Server 的 future managed spawn 会从 GoConfigManager 读取私密运行时快照；restart_one 会终止并重启受 supervisor 管理的 Server，status() 会通过 /healthz 与 /readyz 校正当前快照。
  implication: 对 supervisor 所有的服务，保存后调用 restart_one 再读取 status 是直接、可验证的因果修复路径，且不会泄漏配置秘密。
- timestamp: 2026-07-21
  source: apps/desktop/src/components/go-service/__tests__/GoServicePanel.test.tsx、apps/desktop/src/stores/__tests__/goService.test.ts、apps/desktop/src-tauri go_config 测试
  observation: 现有前端合同和 Rust 配置测试均通过，但它们刻意断言“保存仅持久化、不得自动重启”；Rust 端 save/retry/restart 命令实现与此完全一致。
  implication: 这是可稳定复现的产品行为缺口，而非偶发状态竞争或保存失败；旧测试合同必须替换为新需求的回归合同。
- timestamp: 2026-07-21
  source: npm test -- --run src/components/go-service/__tests__/GoServicePanel.test.tsx
  observation: 新增的两项合同稳定失败：保存后仍显示“配置已保存。运行中的 Go 服务将在重新启动后使用新配置。”且没有调用 restart_go_service；页面没有“生成安全 JWT 密钥”按钮。
  implication: RED 阶段已直接复现保存后不应用配置和缺失 JWT 交互能力；可进入最小实现阶段。
- timestamp: 2026-07-21
  source: GREEN 阶段 npm test -- --run src/components/go-service/__tests__/GoServicePanel.test.tsx
  observation: 6 项面板测试全部通过；保存托管服务时依次调用 save_go_service_configuration 与 restart_go_service，生成的 JWT 为 43 字符 base64url，显隐按钮能切换输入类型。
  implication: 最小修复已满足原始回归合同，且测试未将示例连接串或 JWT 内容渲染进文本结果区。
- timestamp: 2026-07-21
  source: npm test -- --run src/stores/__tests__/goService.test.ts 与 npm run build（apps/desktop）
  observation: store 测试 4/4 通过；TypeScript 检查与 Vite 生产构建通过；git diff --check 无输出。
  implication: 相邻的命令封装/store 合同、类型检查和生产打包未出现回归。
- timestamp: 2026-07-21
  source: 用户真实本地开发环境验证
  observation: 保存后 UI 显示“Go · 外部 · 降级”，并提示外部服务需自行重启；因此此前仅对 owner=supervisor 的自动重启分支没有执行。
  implication: 需要定位 Server 在本地开发启动阶段为何被归类为 external，并修复归属判定或托管启动路径，而不是放宽外部服务的重启权限。
- timestamp: 2026-07-21
  source: apps/desktop/src-tauri/src/process/supervisor.rs: resolve_dev_runtime_path/start_one_runtime
  observation: dev 预检在 9880 的 /healthz 返回 200 时无条件返回 Attach；start_one_runtime 对 Attach 清空 child handle 并调用 apply_external_state。只有端口空闲时才返回 Spawn，spawn_child_to_slot 才记录 Child 并设置 supervisor owner。
  implication: owner=external 不是保存或 readiness 状态机的误判；它是当前开发实例未启动该服务时的安全归属语义。
- timestamp: 2026-07-21
  source: 运行时端口检查（lsof/ps）
  observation: 9880 正由 PID 24587 的 /Applications/paladin.app/Contents/MacOS/paladin-server-sidecar 监听，父 PID 为 1；该进程不属于当前开发会话。
  implication: 当前开发实例无法持有其 Child 句柄。把它改标为 supervisor 或调用 restart 会错误地接管/终止独立应用的进程，违反 external-owner 安全边界。
- timestamp: 2026-07-21
  source: apps/desktop/src-tauri/src/process/supervisor_tests.rs、docs/supervisor-startup-chain.md
  observation: 既有回归测试与设计文档明确规定健康但已占用的端口必须 Attach/external；external restart 只重新检测，stop/shutdown 不得终止。
  implication: 不应通过代码把本例外部进程伪装为托管进程；正确修复是释放前一个 Paladin 实例后，让本开发实例执行既有 Spawn→保存后重启→探测链路。
- timestamp: 2026-07-21
  source: 用户授权的运行时恢复操作
  observation: 遗留 /Applications/paladin.app sidecar（Go PID 24587，Agent 父 PID 24849，均 PPID 1）已终止；端口 9876/9880 已确认无监听。
  implication: 下次启动开发实例不应再进入 Attach/external 分支，可验证 Spawn/supervisor、保存后 restart 与 readiness 刷新链路。
- timestamp: 2026-07-21
  source: 新 UAT 控制台错误与 GoServicePanel.tsx:110、148
  observation: 旧版或事件 DTO 的 process 可能不含 allowedActions；这两处直接读取 allowedActions.restart，UAT 已观察到第 148 行 TypeError 并导致 Go 服务面板白屏。
  implication: 这是 Null/Undefined Access 与数据协议兼容性问题；缺失权限字段必须按“没有权限”处理，而不能推断为 supervisor 可重启。
- timestamp: 2026-07-21
  source: apps/desktop/src/components/go-service/__tests__/GoServicePanel.test.tsx（新增旧 DTO 回归）
  observation: "npm test -- --run src/components/go-service/__tests__/GoServicePanel.test.tsx" 在当前实现下 7 项中 1 项失败，未捕获 TypeError 精确指向 GoServicePanel.tsx:148，DOM 仅剩空 div。
  implication: 已获得 RED 最小复现；缺失 allowedActions 是充分触发条件，并且修复必须同时覆盖渲染路径与保存路径。
- timestamp: 2026-07-21
  source: GREEN 阶段面板回归测试
  observation: "npm test -- --run src/components/go-service/__tests__/GoServicePanel.test.tsx" 7/7 通过；新用例验证初始刷新和保存响应均缺 allowedActions 时页面不中断、显示“重试 readiness”、保存不会调用 restart_go_service。
  implication: 缺失字段被安全降级为无重启权限，同时仍保留已有 supervisor=true 自动重启和 external 无重启的合同。
- timestamp: 2026-07-21
  source: 相邻 store 测试与生产构建
  observation: "npm test -- --run src/stores/__tests__/goService.test.ts" 4/4 通过；"npm run build" 的 TypeScript 检查和 Vite 生产构建通过（仅已有浏览器外置模块和大 chunk 警告）。
  implication: 命令封装/store 合同、类型检查和生产打包均未因兼容修复回归。
- timestamp: 2026-07-21
  source: git diff --check
  observation: 未输出错误。
  implication: 此次改动没有空白错误。
- timestamp: 2026-07-21
  source: apps/desktop/src/components/StatusBar/__tests__/GoServiceLight.test.tsx
  observation: 新增旧 DTO 缺失 allowedActions 的状态灯回归，在修复前稳定失败，报错精确指向 GoServiceLight.tsx:95 读取 undefined.restart。
  implication: 状态灯白屏的充分触发条件已独立复现；此前面板修复并未覆盖该渲染路径。
- timestamp: 2026-07-21
  source: apps/desktop/src/lib/go-service-permissions.ts、GoServicePanel.tsx、GoServiceLight.tsx
  observation: 两个组件已改用共享 canRestartGoService 策略，仅 allowedActions.restart 严格等于 true 才允许重启；字段缺失返回 false。
  implication: 兼容修复不会推断或放宽实际进程权限，并消除了状态灯的未定义属性访问。
- timestamp: 2026-07-21
  source: npm test -- --run src/components/go-service/__tests__/GoServicePanel.test.tsx；npm test -- --run src/components/StatusBar/__tests__/GoServiceLight.test.tsx；npm test -- --run src/stores/__tests__/goService.test.ts
  observation: 分别通过 7/7、9/9（含新增状态灯旧 DTO 回归）、4/4。
  implication: 面板、状态灯与 store 相邻合同均无回归，且缺失 allowedActions 的两条 UI 路径已被覆盖。
- timestamp: 2026-07-21
  source: npm run build；本地 Vite 烟雾测试
  observation: tsc 与 Vite 生产构建完成并生成 dist/index.html；默认 1420 端口已被既有 node 进程占用，改用 npm run dev -- --host 127.0.0.1 --port 1421 后启动成功，curl http://127.0.0.1:1421/ 返回 HTML；临时服务已停止。
  implication: 前端开发服务器与打包产物均可用，但该环境没有 Tauri GUI/事件注入自动化通道，无法在真实桌面窗口直接复现历史 DTO 事件。
- timestamp: 2026-07-21
  source: 新 UAT 截图与复现说明
  observation: 状态栏显示“Go · 已就绪”，sidecar 为 running、健康检查为 healthy，但面板上方仍显示“Go 服务未完全就绪”，唯一不一致字段为持久化配置的 readiness=untested；保存后机密字段按设计清空，使“测试连接”无法通过草稿必填校验。
  implication: 这是 UI 双数据源优先级错误与已保存配置检测路径缺失，不是实时 Go 进程不健康或秘密持久化失败。
- timestamp: 2026-07-21
  source: 新增 RED 回归（GoServicePanel 与 go_config::commands_tests）
  observation: 面板在 running/healthy/untested 时仍渲染“Go 服务未完全就绪”，且不存在“测试已保存配置”按钮；Rust 编译报 GoConfigManager 缺少 validate_saved_configuration。
  implication: 该问题可通过最小前端和 Rust 内部存储边界测试稳定复现，修复需要同时覆盖两层。
- timestamp: 2026-07-21
  source: GREEN 回归（GoServicePanel、GoServiceLight、go_config::commands_tests）
  observation: 面板 9/9 与状态灯/相邻 store 共 22 项通过；Rust 命令测试 4/4 通过，其中新用例只调用 Rust 内部的持久化配置校验并确认掩码 DTO 不含秘密。
  implication: 实时健康文案和写入专用的已保存配置检测路径均已实现，且未降低既有 process 权限或秘密边界。
- timestamp: 2026-07-21
  source: 最终自动验证
  observation: GoServicePanel/GoServiceLight/goService store 23/23 通过；go_config::commands_tests 4/4 通过；cargo fmt --check、cargo build、npm run build 与 git diff --check 均通过。
  implication: 前后端命令注册、TypeScript 类型、Rust 编译和生产包均与新合同一致；剩余验证仅限真实 Tauri 工作流。
- timestamp: 2026-07-21
  source: GoServicePanel.tsx 与 GoServicePanel.test.tsx
  observation: 面板原先只以 running+healthy 渲染“Go 服务运行正常”；现已要求同时满足已配置。新回归明确覆盖 running+healthy+unconfigured、running+healthy+configured、以及已配置但 health=degraded。
  implication: 进程 liveness 与本地配置/service readiness 已在面板展示层分离，D-08 的未配置降级语义优先于实时进程健康度。
- timestamp: 2026-07-21
  source: npm test -- --run src/components/go-service/__tests__/GoServicePanel.test.tsx src/components/StatusBar/__tests__/GoServiceLight.test.tsx src/stores/__tests__/goService.test.ts；cargo test go_config::commands_tests --lib；cargo fmt --check；cargo build
  observation: 前端三个相关测试文件 25/25 通过；Rust go_config 命令测试 4/4 通过，格式检查和构建均成功。
  implication: 新展示合同、相邻状态灯/store 合同与秘密写入专用的 Rust 命令边界均未回归。
- timestamp: 2026-07-21
  source: npm run build；git diff --check
  observation: TypeScript 检查与 Vite 生产构建完成，git diff --check 无输出。构建仅产生既有 node-fetch 浏览器外置模块提示。
  implication: 新的语义条件可通过生产打包，且变更没有空白错误。
- timestamp: 2026-07-21
  source: 用户真实桌面端 UAT
  observation: Go 服务配置相关流程已确认通过，包括托管状态、状态灯兼容、实时健康与未配置降级文案，以及写入专用秘密的已保存配置检测路径。
  implication: 修复在真实 Tauri 工作流中成立，调试会话可关闭。
- timestamp: 2026-07-21
  source: ProcessInfoDTO、ProcessAllowedActions、MaskedGoServiceConfig、GoFieldDiagnostic 与 TestGoServiceResult 的 serde 合同审查
  observation: 对外 Rust DTO 之前保留默认 snake_case，实际 Tauri JSON 产生 allowed_actions、pending_apply、field_diagnostics；前端 GoServiceActionResult 类型只读取 allowedActions、pendingApply、fieldDiagnostics。
  implication: 数据形状不匹配使 supervisor 已授予的重启权限在前端被安全策略判为 false，保存后不会调用 restart_go_service。
- timestamp: 2026-07-21
  source: 新增 Rust 命令响应序列化回归与 TypeScript store/GoServicePanel 跨层回归
  observation: Rust 序列化真实 GoServiceActionResult 时 process.owner=supervisor、process.allowedActions.restart=true，且不存在 snake_case 同名字段；同一 JSON 经 store 写入后，面板保存流程调用 restart_go_service 并显示“Go 服务已重新启动”。测试数据不含配置秘密。
  implication: Rust→Tauri JSON→TypeScript store→保存重启的完整契约已得到自动回归保护。
- timestamp: 2026-07-21
  source: cargo fmt --check、cargo test --lib、cargo build、Vitest GoServicePanel/GoServiceLight/goService store、npm run build
  observation: Rust 127/127 通过，前端相关 27/27 通过，Rust 构建和前端生产构建均成功；前端构建仅有既有浏览器外置模块与大 chunk 警告。
  implication: 修复通过格式、Rust、前端相邻功能及生产打包验证；仍需真实桌面端最终确认。
- timestamp: 2026-07-21
  source: 绿色阶段复跑（cargo fmt --check、cargo test --lib、cargo build、Vitest GoServicePanel/GoServiceLight/goService store、npm run build、git diff --check）
  observation: Rust 127/127 通过；前端相关 27/27 通过；格式、Rust 构建、TypeScript/Vite 生产构建与差异空白检查均通过。Vite 仅报告既有 node-fetch 浏览器外置模块提示。
  implication: camelCase DTO 合同与 Rust JSON→TypeScript store→保存自动重启调用链已经过绿色阶段复验；最终只缺真实 Tauri 窗口确认。
- timestamp: 2026-07-21
  source: apps/desktop/src-tauri/src/lib.rs、process/supervisor.rs、运行时 ps/lsof
  observation: 正常关闭、SIGINT 与 SIGTERM 都 await graceful_shutdown_all；spawn 的 Unix 子进程会单独建进程组，graceful_shutdown_slot 以保存的 PID 对该组发 SIGTERM/SIGKILL。当前未发现 9876/9880 监听，但仍有一个 PPID=1 的 /Applications/paladin.app 主进程（PID 81185）在运行。
  implication: 当前源代码的正常关闭路径会杀死受追踪的 sidecar；此前 PPID=1 的 sidecar 更符合旧构建/非正常退出后的遗留进程，而非保存后 readiness 链路。运行中的已安装应用仍可能在后续启动时重新占用端口，开发 UAT 前应先显式退出它。
- timestamp: 2026-07-21
  source: apps/desktop/src-tauri/src/process/supervisor.rs: spawn_child_to_slot + wait_exit + graceful_shutdown_slot
  observation: spawn 后的 wait_exit 原先立即对 slot.child 执行 take 并 await child.wait，使运行中的受监督 child 不再可被 graceful_shutdown_slot 取得；后者在 owner=supervisor 但 child=None 时直接返回。已改为以 spawn 时 PID 轮询同一 slot 中的 Child.try_wait，只有确认退出后才在同一把锁内移除 handle；PID 不匹配或 handle 已被关闭/重启路径取走时，旧观察 task 直接退出。
  implication: 关闭、重启能继续仅对受追踪的 child/进程组发信号，修复 managed orphan 的直接机制；external owner 的既有早退与不接管边界未变。
- timestamp: 2026-07-21
  source: cargo test wait_exit_keeps_running_child_handle_tracked_for_graceful_shutdown --lib; cargo test --lib; cargo fmt --check; cargo build; git diff --check
  observation: 新 Unix 回归确认 wait observer 运行期间 slot 仍保存同一 PID，模拟 graceful shutdown 能 take 该 handle、终止并回收子进程，observer 随后无崩溃地退出。定向回归 1/1、完整 Rust 测试 128/128、格式检查、构建与差异空白检查均通过；既有 external 生命周期测试仍通过。
  implication: P4 已被自动化回归覆盖，并保留外部进程不接管/不终止的安全合同；仍需在真实桌面端关闭一次新构建以确认不存在历史 orphan。

## Eliminated

## Resolution

- root_cause: supervisor 的 wait_exit 在 spawn 后立即从 slot.child.take() 获取 Child 并 await 退出；运行中的托管子进程因而不再可被 graceful_shutdown_slot 取得。关闭或重启时 supervisor owner 虽仍存在，但没有 Child handle 可以向其 Unix 进程组发终止信号，可能留下孤儿 sidecar；随后开发实例只能把占用端口的服务安全附加为 external，保存配置不能自动重启。
- fix: wait_exit 改为以 spawn 时捕获的 PID 轮询 slot 中相同 Child 的 try_wait，仅在确认该 PID 已退出时移除 handle；关闭/重启拿走或替换 handle 时旧观察任务退出。补充 Unix 回归，验证运行期间 handle 保留在 slot，graceful shutdown 能取得、终止并回收它。同步保留并验证 Go 配置的 camelCase DTO、保存重启、旧 DTO 兼容、已保存配置检测和未配置降级修复。
- verification: 定向 Unix 回归 1/1、cargo test --lib 128/128、cargo fmt --check、cargo build、Vitest 相关 28/28、npm run build 与 git diff --check 均通过。仍需用户在真实桌面端验证一次新构建的正常退出后，端口 9876/9880 未留下新 sidecar。
- files_changed:
  - apps/desktop/src/components/go-service/GoServicePanel.tsx
  - apps/desktop/src/components/go-service/__tests__/GoServicePanel.test.tsx
  - apps/desktop/src/components/StatusBar/GoServiceLight.tsx
  - apps/desktop/src/components/StatusBar/__tests__/GoServiceLight.test.tsx
  - apps/desktop/src/lib/go-service-permissions.ts
  - apps/desktop/src/stores/goService.ts
  - apps/desktop/src/lib/tauri-commands.ts
  - apps/desktop/src-tauri/src/go_config/storage.rs
  - apps/desktop/src-tauri/src/go_config/commands.rs
  - apps/desktop/src-tauri/src/go_config/mod.rs
  - apps/desktop/src-tauri/src/go_config/commands_tests.rs
  - apps/desktop/src-tauri/src/lib.rs
  - apps/desktop/src-tauri/src/process/supervisor.rs
  - apps/desktop/src-tauri/src/process/supervisor_tests.rs
  - apps/desktop/src-tauri/src/go_config/types.rs

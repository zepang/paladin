# Supervisor 启动链路设计

本文记录 Paladin desktop 中 `ProcessSupervisor` 的上下游链路，以及当前 `pnpm tauri dev` 下 Agent 与 Go Server 的启动过程。

## 总览

`ProcessSupervisor` 是 desktop 本地 sidecar 的运行时编排层。它从 `src-tauri/processes.json` 读取命令、端口、健康检查路径，然后在 Tauri `setup()` 阶段被创建并托管。前端不直接管理 sidecar 生命周期，而是通过 Tauri command 和 `process-status` 事件消费 supervisor 的状态。

核心链路：

```text
processes.json
  -> Tauri setup()
  -> ProcessSupervisor::start()
  -> dev preflight attach/spawn/conflict
  -> capture_lines / probe_loop / wait_exit
  -> process-status event + get_process_status()
  -> Zustand process store
  -> StartupMask / StatusBar / CopilotKitProvider
```

## 配置真相源

配置文件：`apps/desktop/src-tauri/processes.json`

当前 dev 配置包含两个进程：

- `agent`
  - 命令：`uv run paladin-agent serve --dev`
  - 工作目录：`../../agent`
  - 端口：`9876`
  - liveness：`GET /health == 200`

- `server`
  - 命令：`go run ./cmd/server`
  - 工作目录：`../../server`
  - 端口：`9880`
  - liveness：`GET /healthz == 200`
  - readiness：`GET /readyz == 200`

这份文件是端口、命令、健康检查路径的 Rust 真相源。前端通过 `get_runtime_config()` 获取 `agent_url` 和 `server_url`，不应该散落硬编码端口。

## Tauri setup 阶段

入口：`apps/desktop/src-tauri/src/lib.rs`

Tauri 启动时做以下事情：

1. 注册 terminal、file、process 等 Tauri commands。
2. 加载 `processes.json`。
3. 计算 log 目录，优先使用 Tauri `app_log_dir()`，失败时降级到 `src-tauri/logs`。
4. 创建 `ProcessSupervisor`。
5. `app.manage(supervisor)`，把 supervisor 放入 Tauri 全局状态。
6. 安装 SIGINT/SIGTERM handler。
7. 后台异步调用 `supervisor.start()`。

如果配置加载失败，代码会创建 diagnostic fallback supervisor。此时不启动 sidecar，而是把 agent/server 状态置为失败，并把配置错误暴露给前端。

## 启动顺序

核心方法：`ProcessSupervisor::start()`

当前顺序是：

1. 先处理 Go Server。
2. 如果 Go Server 是 supervisor 托管启动的，则等待 `/readyz` 最多 5 秒。
3. 再处理 Agent。

Server readiness 失败不会阻止 Agent 启动。它只会把 Server 标记为 `degraded`，因为 `/readyz` 依赖 Postgres/Redis，可能稍后恢复。

## Dev 模式启动策略

在 dev 模式下，supervisor 对每个进程先做 preflight，而不是直接 spawn。

结果有三种：

- `Attach`
  - 端口上已有服务，并且 liveness 健康检查通过。
  - supervisor 标记 `owner=external`。
  - Paladin 不会停止或重启这个外部服务。

- `Spawn`
  - 端口空闲。
  - supervisor 使用配置中的命令启动子进程。
  - supervisor 标记 `owner=supervisor`。

- `Conflict`
  - 端口被占用，但 liveness 健康检查没有通过。
  - supervisor 标记 `state=conflict, owner=none, health=failed`。
  - 前端显示端口冲突，并提供“重新检测”。

这个设计允许开发者手动启动 sidecar，也允许 Paladin 自动启动 sidecar，同时避免误接管不健康或未知的端口占用者。

## Spawn 后的后台任务

当 supervisor 真正 spawn 一个子进程后，会创建三个后台任务。

### capture_lines

读取子进程 stdout/stderr：

- 每行日志会先脱敏。
- 日志会写入 app log 文件。
- stderr 的末尾 50 行会保存在 `stderr_tail`。
- 日志也会通过 `process-log` 事件发给前端日志面板。

### probe_loop

每 10 秒执行健康检查：

- Agent 探 `/health`。
- Server 探 `/healthz`，再探 `/readyz`。
- liveness 失败计入连续失败次数。
- Server readiness 失败进入 `degraded`，但不触发重启。
- 连续 3 次 liveness 失败进入 `unhealthy`。

### wait_exit

等待子进程退出：

- 退出发生在启动 grace 窗口内，视为 `SpawnFailed`，进入 `stopped`，不自动重启。
- 运行超过 grace 后退出，视为 `Crashed`，进入 `unhealthy`，按退避策略重启。
- 退避序列为 `1s, 2s, 4s, 8s, 16s`，最多 5 次。
- 手动 stop 或 app shutdown 期间的退出不会被当作崩溃。

## 状态模型

每个进程由一个 `ProcessSlot` 表示，包含以下关键维度：

- `state`
  - `starting`
  - `running`
  - `degraded`
  - `unhealthy`
  - `stopped`
  - `conflict`

- `owner`
  - `supervisor`：由 Paladin 启动和管理。
  - `external`：已有健康服务，Paladin 只观察不管理。
  - `none`：没有接管，常见于配置错误或端口冲突。

- `health`
  - `healthy`
  - `degraded`
  - `failed`
  - `unknown`

这三个维度分开建模，避免把“端口上有健康外部服务”和“Paladin 托管子进程”混为一谈。

## 前端状态消费

前端入口：`apps/desktop/src/main.tsx`

应用启动时调用 `initProcessListeners()`，它做三件事：

1. `listen('process-status')` 订阅 Rust 事件。
2. 调用 `get_process_status()` 拉取初始快照。
3. 每 2 秒轮询 `get_process_status()`，用 Rust supervisor 的快照校准前端状态。

状态保存在 `apps/desktop/src/stores/process.ts` 的 Zustand store 中。组件通过 `useProcessStatus(name)` 读取状态。

主要消费方：

- `App.tsx`
  - 调用 `get_runtime_config()` 获取 `agent_url/server_url`。
  - 如果 Agent 不是 `running`，渲染 `StartupMask`。
  - 如果 Agent 是 `running`，挂载 `CopilotKitProvider` 并连接 `${agent_url}/copilotkit`。

- `StartupMask.tsx`
  - 根据 Agent 状态展示启动中、停止、冲突、异常、降级等页面。
  - 显示 `last_error` 和 `stderr_tail`。
  - 提供重启或重新检测入口。

- `StatusBar/ProcessLight.tsx`
  - 底部常驻显示 Agent 和 Go Server 状态。
  - 提供重启、停止、重新检测、查看日志按钮。
  - 对 `owner=external` 的进程禁用停止和重启。
  - 对 `owner=external` 的进程也禁用查看日志，因为 Paladin 没有捕获外部进程 stdout/stderr；日志应查看启动该服务的终端。

## 手动控制命令

Tauri commands 位于 `apps/desktop/src-tauri/src/process/commands.rs`。

- `restart_agent` / `restart_server`
  - 只适用于 `owner=supervisor`。
  - 先 graceful shutdown，再重新 spawn。

- `stop_agent` / `stop_server`
  - 只适用于 `owner=supervisor`。
  - SIGTERM + 5 秒 grace，超时后强制 kill。

- `redetect_agent` / `redetect_server`
  - 重新执行 dev preflight。
  - 可用于端口冲突、外部服务刚刚启动、或状态需要重新接管时。

- `get_process_status`
  - 返回 agent/server 双路状态快照。

- `get_runtime_config`
  - 从 `processes.json` 的端口生成运行时 URL。

## 关闭链路

关闭来源包括：

- 窗口 close。
- tray quit。
- SIGINT/SIGTERM。
- `ProcessSupervisor` 最后一个共享 owner drop。

关闭时按反向顺序停止：

1. Agent
2. Server

对 supervisor 托管的进程，关闭路径只使用记录的 child handle，不通过 PID 文件或系统进程名匹配停止进程。Unix 下会尝试停止整个进程组，以覆盖 `uv` / `go run` 派生出的真实服务进程。

## 最近修复的生命周期问题

`ProcessSupervisor` 是 `Clone`，内部共享 `Arc<ProcessSlot>`。Tauri setup 中会为了后台任务和 signal handler clone supervisor。

问题是：如果每个 clone 的 `Drop` 都执行 shutdown，那么临时 clone 离开作用域时就会把刚启动的 sidecar 停掉。表现为：

- Paladin 窗口仍然存在。
- `target/debug/paladin` 仍在。
- `9876/9880` 没有监听。
- 前端显示 Agent/Go 已停止。

当前修复策略是：

- `Drop` 先检查 agent/server 两个 slot 的 `Arc::strong_count()`。
- 只有最后一个共享 owner drop 时才执行兜底 shutdown。
- 临时 clone drop 不会停止 sidecar。

对应回归测试：`test_drop_shutdown_only_for_final_shared_owner`。

## 一句话理解

Paladin desktop 的启动链路不是“前端直接连两个固定端口”，而是：

```text
Rust supervisor 根据 processes.json 决定 attach / spawn / conflict，
持续探测并维护状态，
前端只消费 supervisor 事件和快照，
Agent running 后才挂载 CopilotKit。
```

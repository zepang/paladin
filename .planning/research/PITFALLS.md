# Pitfalls Research: AI 编程助手桌面端

**Research Date:** 2026-06-14

## 常见坑点 & 避免策略

### 1. Tauri Sidecar 管理

| 坑 | 影响 | 避免策略 |
|----|------|---------|
| Python/Go sidecar 编译产物未正确打包 | 应用启动失败 | 使用 Tauri `externalBin` 配置，构建脚本验证 sidecar 存在 |
| Sidecar 进程崩溃无自动重启 | 功能中断 | 实现健康检查 + 自动重启，cc-haha 参考 `sidecarManager.ts` |
| 跨平台编译 sidecar（macOS ARM/x86） | 部署困难 | CI/CD 多平台构建矩阵 |

### 2. AG-UI 协议对接

| 坑 | 影响 | 避免策略 |
|----|------|---------|
| Pydantic AI `agent.to_ag_ui()` 与 CopilotKit 版本不匹配 | 通信失败 | 锁定版本，参考 CopilotKit 官方 Pydantic AI 集成示例 |
| SSE 在 localhost 上断连问题 | 流式中断 | 实现重连机制，WebSocket 作为备选传输 |
| 大量事件轰炸前端 | UI 卡顿 | 事件节流、批量更新、虚拟滚动 |

### 3. PTY 终端集成

| 坑 | 影响 | 避免策略 |
|----|------|---------|
| portable-pty 跨平台行为差异（信号处理、编码） | 终端异常 | 参考 wezterm 实现，统一 UTF-8 编码 |
| Tauri IPC 传输大量终端输出 | 内存/性能问题 | 限制回滚缓冲区，增量传输 |
| Windows PTY 需要特殊处理（conpty） | Windows 兼容性 | portable-pty 已封装，但仍需测试 |

### 4. AI Agent 上下文管理

| 坑 | 影响 | 避免策略 |
|----|------|---------|
| 长时间对话导致上下文溢出 Token 限制 | Agent 忘记早期指令 | pydantic-deepagents 内置自动摘要，必要时主动压缩 |
| 多文件修改时上下文丢失 | 不一致的代码修改 | 明确文件列表，分段处理 |
| 工具调用结果过大 | 上下文爆炸 | 截断大型输出，关键信息提取 |

### 5. 安全边界

| 坑 | 影响 | 避免策略 |
|----|------|---------|
| Agent 执行任意 Shell 命令 | 系统安全风险 | pydantic-deepagents DockerSandbox，HITL 审批危险操作 |
| 文件操作越界 | 删除/修改系统文件 | 限制工作目录白名单 |
| WebSocket localhost 无认证 | 本地攻击面 | Token 认证，仅监听 localhost |

### 6. 性能陷阱

| 坑 | 影响 | 避免策略 |
|----|------|---------|
| Rust PTY 读取阻塞 Tauri 主线程 | UI 卡顿 | tokio 异步任务处理 |
| Python Agent 启动慢 | 首次交互延迟高 | 预加载模型、预热连接 |
| 大型 Diff 渲染 | 界面卡死 | 虚拟化渲染、按需加载 |

### 7. 开发流程陷阱

| 坑 | 影响 | 避免策略 |
|----|------|---------|
| Tauri dev 模式下 frontend + Rust + sidecar 三进程调试复杂 | 开发效率低 | 各层独立可测，mock 相邻层 |
| Monorepo 下 Rust/Python/Go/TypeScript 四个工具链管理 | 环境混乱 | 明确各 app 的 README，统一 Docker 开发环境 |
| 过早优化架构 | 过度工程 | v1 先跑通核心链路，不要追求完美抽象 |

## 各层风险等级

| 层级 | 总体风险 | 最大风险点 |
|------|---------|-----------|
| Desktop (Tauri + React) | LOW | Tauri sidecar 管理 |
| Agent (Pydantic AI) | MEDIUM | AG-UI 协议兼容性 |
| Server (Go) | LOW | 独立可测，耦合度低 |
| 集成（三层通信） | HIGH | 进程生命周期协调 |

# Paladin 安装与打包状态

## 平台状态

| 平台 | 安装包构建 | 已安装应用 UAT | Release-ready |
| --- | --- | --- | --- |
| macOS arm64 | 构建链已接通 | deferred：必须完成计划中的真实安装 UAT | 否；UAT 前不视为 release-ready |
| Windows x86_64 | native Windows CI 构建链已接通 | deferred | 否；已构建，未完成已安装应用验证，不视为 release-ready |
| Windows ARM64 | 本 phase 非阻塞目标 | 本 phase 非阻塞目标 | 否 |

CI 中成功生成 MSI 只证明 buildability。它不等于安装验证，也不等于发布批准。

## macOS 首次运行与 UAT

首次运行和 macOS 已安装应用 UAT 必须使用同一个仓库 wrapper：

```bash
scripts/launch-paladin-macos.sh
```

默认应用位置为 `/Applications/Paladin.app`。若安装到其他位置，明确传入：

```bash
scripts/launch-paladin-macos.sh --app "/自定义位置/Paladin.app"
```

不要绕过 wrapper 直接运行包内可执行文件；wrapper 是首次运行和 UAT 的一致入口。

## 运行环境

安装态 sidecar 只接收 supervisor 明确允许的非空变量；不会读取工作目录 `.env`，也不会热加载环境。修改配置后请完整退出并重新启动 Paladin。

当前 Agent 模型配置使用 DeepSeek provider，因此模型服务密钥变量是 `DEEPSEEK_API_KEY`。Go Server 依赖外部 PostgreSQL 与 Redis，变量名分别是 `PALADIN_DATABASE_URL` 和 `PALADIN_REDIS_URL`。其他允许转发的业务配置包括：`PALADIN_PORT`、`PALADIN_JWT_SECRET`、`PALADIN_JWT_TTL`、`PALADIN_BCRYPT_COST`、`PALADIN_ADMIN_EMAIL`、`PALADIN_ADMIN_PASSWORD`、`PALADIN_AUTO_MIGRATE`、`PALADIN_QUOTA_LIMIT`、`PALADIN_QUOTA_WINDOW`。应用还会按 allowlist 转发必要的 home、临时目录、locale 和 TLS 证书发现变量。文档、诊断输出和 build manifest 只可出现变量名称，不可复制 secret、token、密码、DSN 或变量值。

启动时 Agent 与 Server 必须通过 readiness 探测后，主窗口才进入正常工作流。Go Server 依赖不可用时允许以 `降级（非阻塞）` 继续；核心 Agent 失败仍会阻塞启动并显示诊断。

## 日志与诊断

- macOS：`~/Library/Logs/com.worsmer.paladin/`
- Windows：`%LOCALAPPDATA%\\dev.paladin.desktop\\logs\\`

日志采用有界轮转；应用持续显示 live stream，不展示轮转文件名，也不会清空当前内存日志。若磁盘日志降级，实时日志仍可能继续，请先从启动诊断中的失败步骤、退出码和 `stderr 摘要` 定位问题。

常见问题：

- `缺少必要配置：DEEPSEEK_API_KEY`：退出应用，按部署渠道安全配置该变量后重新启动。不要把值粘贴到 issue、日志或聊天中。
- `Agent 未就绪`：检查 Agent 日志中的退出码与摘要；核心 Agent 未通过 readiness 时不会进入主工作流。
- `Server 降级（非阻塞）`：依赖服务暂不可用时核心 Agent 仍可继续；恢复依赖后通过应用内重试重新探测。
- `磁盘日志可能已降级`：检查上述日志目录权限和可用空间；不要删除或终止按端口/进程名匹配的外部服务。

开发命令仅适用于仓库贡献者，不是已安装应用用户的修复步骤。

## Windows buildability 审计

`.github/workflows/packaging-windows.yml` 在 `windows-latest` 上运行真实 `x86_64-pc-windows-msvc` PyInstaller、Go、Tauri/WiX 链。它支持手动触发，并仅在 packaging 相关 PR 路径变化时自动运行。

上传 artifact 只包含一个 MSI 和 `build-manifest.json`。manifest 固定记录 commit SHA、runner OS、x86_64 target，以及两个 sidecar 与 MSI 的文件名、大小和 SHA-256；不会读取环境变量，也不会上传整个 build tree。

# Paladin 安装与打包状态

## 平台状态

| 平台 | 安装包构建 | 已安装应用 UAT | Release-ready |
| --- | --- | --- | --- |
| Windows x86_64 | native Windows CI buildability：一个 MSI + `build-manifest.json` | deferred | 否；已构建，未完成已安装应用验证，不视为 release-ready |
| macOS arm64 | native macOS CI buildability：一个 DMG + `build-manifest.json` | deferred：Phase 10.1 CI 不等于真实安装 UAT | 否；未签名/未公证，UAT 前不视为 release-ready |
| Linux x86_64 | native Linux CI buildability：一个 AppImage、一个 deb + `build-manifest.json` | deferred：Phase 10.1 CI 不包含 installed-app UAT 或发行版兼容性矩阵 | 否；未做安装态验证、仓库发布或发布批准 |
| Windows ARM64 | 本 phase 非阻塞目标 | 本 phase 非阻塞目标 | 否 |

CI 中成功生成 Windows MSI、macOS DMG、Linux AppImage/deb 只证明对应平台的 buildability。它不等于签名、公证、安装验证、发行版兼容性确认、软件仓库发布，也不等于发布批准。

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

上传 artifact 只包含一个 MSI 和 `build-manifest.json`。manifest 固定记录 commit SHA、runner OS、architecture、target、role、filename、size 和 SHA-256；artifact entries 覆盖两个 sidecar 与 MSI。manifest 不读取环境变量值，不复制 secret、API key、数据库 DSN、Redis 密码、JWT secret、token 或日志，也不会上传整个 build tree。

上传边界只允许：

- `windows-artifact/*.msi`
- `windows-artifact/build-manifest.json`

不得上传完整 `src-tauri/target/**`、`src-tauri/binaries/**`、独立 sidecar、依赖目录、缓存、日志或 `.env*` 文件。

## macOS buildability 审计

`.github/workflows/packaging-macos.yml` 在 `macos-14` 上运行真实 `aarch64-apple-darwin` PyInstaller、Go 和 Tauri 打包链。workflow 通过 `pnpm release -- --target aarch64-apple-darwin --verify` 进入共享 release 路径，不在 workflow 中绕过该入口重做 sidecar 或 Tauri 打包逻辑。

上传 artifact 只包含一个 DMG 和 `build-manifest.json`。workflow 在上传前要求 `apps/desktop/src-tauri/target/release/bundle/dmg/*.dmg` 精确匹配一个文件；manifest 记录 commit SHA、runner OS、architecture、target、role、filename、size 和 SHA-256，artifact entries 覆盖 `paladin-agent-sidecar-aarch64-apple-darwin`、`paladin-server-sidecar-aarch64-apple-darwin` 和 DMG。

上传边界只允许：

- `macos-artifact/*.dmg`
- `macos-artifact/build-manifest.json`

macOS CI 成功只说明 DMG buildability。Phase 10.1 不声明这些 artifact 已签名、已 notarized、公证 staple 已验证、Gatekeeper 分发就绪、installed-app UAT 完成或 release-ready。

## Linux buildability 审计

`.github/workflows/packaging-linux.yml` 在 `ubuntu-22.04` 上运行真实 `x86_64-unknown-linux-gnu` PyInstaller、Go 和 Tauri 打包链。workflow 内联安装 Linux Tauri packaging 依赖后，通过 `pnpm release -- --target x86_64-unknown-linux-gnu --verify` 进入共享 release 路径。

上传 artifact 只包含一个 AppImage、一个 deb 和 `build-manifest.json`。workflow 在上传前分别要求 `apps/desktop/src-tauri/target/release/bundle/appimage/*.AppImage` 和 `apps/desktop/src-tauri/target/release/bundle/deb/*.deb` 各精确匹配一个文件；缺少任一安装包类型都会失败。manifest 记录 commit SHA、runner OS、architecture、target、role、filename、size 和 SHA-256，artifact entries 覆盖 `paladin-agent-sidecar-x86_64-unknown-linux-gnu`、`paladin-server-sidecar-x86_64-unknown-linux-gnu`、AppImage 和 deb。

上传边界只允许：

- `linux-artifact/*.AppImage`
- `linux-artifact/*.deb`
- `linux-artifact/build-manifest.json`

Linux CI 成功只说明 AppImage/deb buildability。Phase 10.1 不声明这些 artifact 已完成 installed-app UAT、发行版兼容性矩阵、桌面环境 QA、软件仓库发布、自动 GitHub Release 发布或 release-ready 批准。

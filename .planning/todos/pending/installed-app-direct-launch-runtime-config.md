---
title: Installed app direct launch should not require repository wrapper
date: 2026-07-14
priority: high
---

# Installed app direct launch should not require repository wrapper

## 背景

当前生产包即使通过 `pnpm release` 成功打包并安装，macOS installed-app UAT 仍要求从仓库 wrapper 启动：

```bash
scripts/launch-paladin-macos.sh --app "/Applications/Paladin.app"
```

这个入口适合开发验证和诊断，但不是最终用户预期的安装态启动方式。Finder、Windows Start Menu/Explorer、Linux desktop launcher/AppImage 双击通常不会继承交互 shell 的环境变量，因此只靠 wrapper 注入运行配置会让“已安装应用直接启动”不可验证或不完整。

Phase 11 已经让 AI provider/key 不再阻塞应用启动，并把 AI provider 配置迁移到桌面端 app data；但 Go server 相关运行配置仍可能依赖启动环境，例如 `PALADIN_DATABASE_URL`、`PALADIN_REDIS_URL`、`PALADIN_JWT_SECRET` 等。

## 目标

让 macOS、Windows、Linux 的已安装应用可以从系统 GUI 直接启动，并进入可诊断、可配置、可恢复的产品状态；仓库 wrapper 只作为 UAT/诊断工具，而不是普通安装态使用的唯一入口。

## 期望行为

- [ ] macOS Finder 双击 `/Applications/Paladin.app` 可以启动 Paladin，并自动启动 packaged sidecars。
- [ ] Windows 通过 Start Menu 或 Explorer 启动安装后的 Paladin，可以进入同等产品状态。
- [ ] Linux 通过 AppImage、`.desktop` launcher 或 deb 安装后的菜单入口启动 Paladin，可以进入同等产品状态。
- [ ] 缺少 DB/Redis/JWT 等 Go server 依赖配置时，应用显示明确的 Go readiness/配置提示，而不是要求用户回到仓库 wrapper。
- [ ] AI provider 配置继续使用桌面端 app data 权威来源，不依赖 shell 环境。
- [ ] 如果仍支持环境变量 bootstrap，应明确区分开发/UAT wrapper、系统级 launcher 环境、以及安装态本地持久配置。
- [ ] 文档不再把 wrapper 描述为普通已安装应用的唯一启动方式；wrapper 保留为诊断和 UAT 入口。

## 验收草案

- [ ] macOS：安装 DMG 后，从 Finder 双击启动；无 AI key 时应用可启动并提示配置 AI provider；缺 Go 依赖时仅 Go readiness 降级。
- [ ] Windows：安装 MSI 后，从 Start Menu/Explorer 启动，达到与 macOS 同等状态分类。
- [ ] Linux：AppImage 双击或 deb 菜单入口启动，达到与 macOS 同等状态分类。
- [ ] 三端日志位置、启动诊断、状态栏提示能说明缺失的是 AI provider、Go DB/Redis/JWT、还是 sidecar 进程失败。
- [ ] `docs/packaging.md` 明确区分 buildability、installed-app direct-launch UAT、release-ready。

## 设计问题

- [ ] Go server 的 DB/Redis/JWT 配置最终应该来自桌面端配置页、安装器/系统级配置、本地默认服务，还是允许 Go 以更完整的降级模式运行？
- [ ] Windows/Linux 是否需要各自的 launcher/env 配置机制，还是统一迁移到 app data 配置。
- [ ] wrapper 是否继续作为 CI/UAT smoke 的受控入口，或增加专门的 direct-launch smoke。

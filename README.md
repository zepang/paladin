# Paladin

AI 编程助手桌面端应用。

## 技术栈

- **桌面端:** Tauri 2 + React 19 + Vite + TypeScript
- **AI Agent:** Python (Pydantic AI + AG-UI)
- **服务端:** Go
- **包管理:** pnpm (monorepo)
- **代码规范:** Biome + TypeScript strict

## 快速开始

### 前置条件

- Node.js >= 20
- pnpm >= 9
- Rust (for Tauri)

### 开发

```bash
# 安装依赖
pnpm install

# 启动桌面应用
cd apps/desktop && pnpm tauri dev

# 代码检查
pnpm check
pnpm format
```

## Packaging / 安装

安装、首次运行、逐平台验证状态和排障说明见 [Packaging 文档](docs/packaging.md)。CI 生成的 Windows MSI、macOS DMG、Linux AppImage/deb 只表示对应平台 buildability；在完成签名/公证要求、installed-app UAT 和发布批准前，不视为 release-ready。

### 生产包启动（macOS）

生产/安装态应用不要从 Finder 直接双击验证，也不要直接运行包内可执行文件。请从仓库根目录使用统一 wrapper 启动；这样环境变量、诊断行为和 UAT 入口保持一致。Paladin 可以在未配置 AI credentials 的情况下启动；首次对话会在桌面端显示 `配置 AI provider` 入口。

```bash
# 1. 可选：用环境变量为首次启动播种 AI provider
# 首选桌面端右侧 AI Provider 设置；这些变量不是启动前提。
export PALADIN_AI_PROVIDER='deepseek'
export PALADIN_AI_BASE_URL='https://api.deepseek.com/v1'
export PALADIN_AI_MODEL='deepseek-chat'
export PALADIN_AI_API_KEY='<your-api-key>'

# 兼容旧路径：只设置 DEEPSEEK_API_KEY 时，会作为 DeepSeek provider 的首次启动种子。
# export DEEPSEEK_API_KEY='<your-api-key>'

# 2. 可选：配置 Go Server 外部依赖
# PostgreSQL 和 Redis 不是安装包内置服务；即使已用 Docker 启动，也需要把连接 URL 传给 Paladin。
export PALADIN_DATABASE_URL='postgres://paladin:change-me@localhost:5432/paladin?sslmode=disable'
export PALADIN_REDIS_URL='redis://localhost:6379/0'

# 3. 可选：配置 Go Server JWT secret；必须至少 32 字节
export PALADIN_JWT_SECRET='<at-least-32-byte-secret>'

# 4. 启动已安装 app
scripts/launch-paladin-macos.sh --app "/Applications/Paladin.app"
```

如果安装到自定义目录，替换 `--app` 路径，例如：

```bash
scripts/launch-paladin-macos.sh --app "/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app"
```

注意事项：

- 这些变量必须在启动 Paladin 的同一个 shell/session 中设置；Finder 双击不会继承终端环境变量。
- AI provider 的主要配置路径是桌面端右侧 `AI Provider` 面板，支持 DeepSeek、OpenAI-compatible endpoint 和 LM Studio。保存配置与测试连接是两个动作；保存会影响后续请求，测试只验证当前配置。
- 保存后的本地 provider 配置是运行时权威来源。`PALADIN_AI_PROVIDER`、`PALADIN_AI_BASE_URL`、`PALADIN_AI_API_KEY`、`PALADIN_AI_MODEL` 和 legacy `DEEPSEEK_API_KEY` 只用于干净本地配置的首次 bootstrap，不会在用户显式保存后悄悄切换 provider。
- Agent liveness、AI readiness 和 Go DB/Redis readiness 是三条线：未配置 AI provider 不会阻止 Agent/Go sidecar 启动；缺 DB/Redis/JWT 会影响 Go readiness；无效 API key 会显示为 AI provider 不可用。
- Go 显示“降级”通常表示 Go sidecar 已启动但 `/readyz` 未通过。先检查 `PALADIN_DATABASE_URL`、`PALADIN_REDIS_URL`、`PALADIN_JWT_SECRET` 是否在当前启动 shell 中有效。
- API key 在普通 UI 中只显示是否已配置和固定短 fingerprint，不会回显原值。不要把 API key、数据库 DSN、Redis 密码或 JWT secret 粘贴到日志、issue、截图或聊天中。

## 项目结构

```
paladin/
├── apps/
│   └── desktop/          # Tauri 2 桌面应用 (React + Vite)
├── .planning/            # 项目规划与决策 (GSD)
├── pnpm-workspace.yaml   # monorepo 工作区配置
├── biome.json            # 代码规范 (lint + format)
└── tsconfig.base.json    # TypeScript 基础配置
```

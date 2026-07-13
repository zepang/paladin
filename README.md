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

生产/安装态应用不要从 Finder 直接双击验证，也不要直接运行包内可执行文件。请从仓库根目录使用统一 wrapper 启动；这样环境变量、诊断行为和 UAT 入口保持一致。

```bash
# 1. 配置 Agent 的 AI 服务密钥
# 当前 DeepSeek 路径实际读取 DEEPSEEK_API_KEY；base URL 由内置配置/代码路径决定。
export DEEPSEEK_API_KEY='你的 deepseek key'

# 2. 配置 Go Server 外部依赖
# PostgreSQL 和 Redis 不是安装包内置服务；即使已用 Docker 启动，也需要把连接 URL 传给 Paladin。
export PALADIN_DATABASE_URL='postgres://paladin:change-me@localhost:5432/paladin?sslmode=disable'
export PALADIN_REDIS_URL='redis://localhost:6379/0'

# 3. 配置 Go Server JWT secret；必须至少 32 字节
export PALADIN_JWT_SECRET='0123456789abcdef0123456789abcdef0123456789'

# 4. 启动已安装 app
scripts/launch-paladin-macos.sh --app "/Applications/Paladin.app"
```

如果安装到自定义目录，替换 `--app` 路径，例如：

```bash
scripts/launch-paladin-macos.sh --app "/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app"
```

注意事项：

- 这些变量必须在启动 Paladin 的同一个 shell/session 中设置；Finder 双击不会继承终端环境变量。
- Agent AI 配置和 Go Server 依赖配置是两条线：缺 AI key 会影响对话能力；缺 DB/Redis/JWT 会影响 Go readiness。
- Go 显示“降级”通常表示 Go sidecar 已启动但 `/readyz` 未通过。先检查 `PALADIN_DATABASE_URL`、`PALADIN_REDIS_URL`、`PALADIN_JWT_SECRET` 是否在当前启动 shell 中有效。
- 不要把 API key、数据库 DSN、Redis 密码或 JWT secret 粘贴到日志、issue、截图或聊天中。

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

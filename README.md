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

安装、首次运行、逐平台验证状态和排障说明见 [Packaging 文档](docs/packaging.md)。Windows native MSI 构建成功仅表示 buildability；在完成 installed-app UAT 前不视为 release-ready。

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

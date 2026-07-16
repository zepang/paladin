# Phase 12: Installed App Direct Launch Runtime Configuration - Discussion Log

> **仅供审计参考。** 规划、研究和执行应读取 `12-CONTEXT.md`，本记录只保留备选方案。

**日期：** 2026-07-16  
**阶段：** 12-installed-app-direct-launch-runtime-configuration  
**讨论项：** Go 配置入口与安全边界、bootstrap 与覆盖规则、direct-launch 验证证据

---

## Go 配置入口与安全边界

| 议题 | 选择 | 备选 |
|---|---|---|
| 设置入口 | 右侧面板独立 `Go 服务` 视图 | AI Provider 高级设置；仅降级诊断弹窗 |
| 敏感值显示 | 只写、不可回显、固定脱敏指纹 | 暴露主机端口；明文回显 |
| 保存与验证 | 分离保存和 readiness 测试/重试 | 保存即强制验证；下次启动再检测 |
| 静态保护 | 沿用本地受保护 app-data 与脱敏 | 加密 vault；系统密钥链 |

**用户选择：** 独立 Go 服务视图、只写机密、分离保存/测试、保持现有本地保护。  
**备注：** Keychain、Credential Manager、Secret Service 与 vault 均留待安全强化阶段。

---

## Bootstrap 与覆盖规则

| 议题 | 选择 | 备选 |
|---|---|---|
| 首次导入 | 本地空配置时一次性导入完整有效环境变量 | 每次启动覆盖；从不导入 |
| 部分/无效环境 | 不落盘，保持降级并逐项诊断 | 写入半配置；sidecar 失败 |
| wrapper/CI/UAT | 显式标记下使用仅本进程临时覆盖 | 忽略环境变量；持久化覆盖 |
| 清除配置后 | 不自动重新导入，用户显式导入 | 立即自动导入；禁止清除 |

**用户选择：** 一次性有效导入、拒绝半配置、临时覆盖不持久化、清除后手动再导入。

---

## Direct-launch 验证证据

| 议题 | 选择 | 备选 |
|---|---|---|
| macOS 入口 | DMG 安装到 `/Applications` 后 Finder 双击 | `open -a`；仓库 wrapper |
| macOS 场景 | 全未配置、AI 可用但 Go 缺失、已保存 Go 配置 | 只测全未配置；所有 DB/Redis/JWT 排列 |
| Windows/Linux | 干净环境 + 临时 app-data 自动化验证，人工 UAT 待办 | 仅单元测试；把 CI 构建当真人 UAT |
| 证据形式 | 无秘密的结构化验证记录 | 仅截图；完整原始日志 |

**用户选择：** Finder 直启、三场景 macOS UAT、Windows/Linux 自动化验证且非 release-ready、结构化无秘密证据。

---

## the agent's Discretion

- 具体命令、DTO、文件名、遮罩格式与测试实现，只要保持 `12-CONTEXT.md` 的安全和运行时边界。

## Deferred Ideas

- 系统密钥链或 encrypted vault 集成。
- 内置或自动部署 PostgreSQL/Redis。
- Windows/Linux 真实安装态人工 UAT。

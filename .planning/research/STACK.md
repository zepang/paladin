# Stack Research: AI 编程助手桌面端

**Research Date:** 2026-06-14
**Domain:** AI Coding Assistant Desktop Application

## 推荐技术栈

### 桌面框架

| 选择 | 版本 | 置信度 | 理由 |
|------|------|--------|------|
| **Tauri 2** | 2.x stable | HIGH | 安装包 3-10MB（Electron 100MB+），内存低（80-120MB），Rust 后端性能优异。2024 年正式发布，API 稳定。系统原生 WebView 而非内嵌 Chromium |

**避免:** Electron —— 包体积大、内存高，不适合学习展示项目追求"小而美"
**避免:** Neutralino.js —— 生态不成熟，缺少 PTY/sidecar 等效方案

### 前端

| 选择 | 版本 | 置信度 | 理由 |
|------|------|--------|------|
| **React 19** | 19.x | HIGH | 生态最成熟，CopilotKit 以 React 为核心 |
| **TypeScript** | 5.x | HIGH | 类型安全，全栈统一 |
| **Vite** | 6.x | HIGH | Tauri 官方推荐，HMR 极快 |
| **Tailwind CSS 4** | 4.x | HIGH | 2025 年底发布，CSS 变量主题系统，构建体积更小，原生暗色模式 |
| **Zustand** | 5.x | HIGH | 轻量状态管理，TypeScript 友好，比 Redux 简洁 |
| **shadcn/ui** | latest | HIGH | 2026 年 React 生态最热门 UI 库（75k+ stars），copy-paste 模式零冗余，Tailwind CSS 4 原生兼容。Phase 5.1 正式引入 |
| **lucide-react** | latest | HIGH | shadcn/ui 官方图标库，统一替代手写 inline SVG。Phase 5.1 同步引入 |

### AI Agent 层

| 选择 | 版本 | 置信度 | 理由 |
|------|------|--------|------|
| **Pydantic AI** | 1.106.0 | HIGH | Pydantic 团队官方维护，17.6k stars，类型安全，模型无关（支持 OpenAI/Anthropic/Gemini 等） |
| **pydantic-deepagents** | 0.3.21 | HIGH | 内置 Planning、Filesystem、SubAgent、Sandbox、Skills、MCP，开箱即用 |
| **AG-UI 协议** | latest | HIGH | Pydantic AI 原生 `agent.to_ag_ui()` 一行代码暴露端点；Google/AWS/Microsoft/LangChain 共同支持 |

**避免:** LangChain —— 臃肿，Pydantic AI 性能快 44%、错误少 5x
**避免:** CrewAI/AutoGPT —— 过度设计，学习项目不需要多 Agent 编排

### 前端 Agent UI

| 选择 | 版本 | 置信度 | 理由 |
|------|------|--------|------|
| **CopilotKit** | latest | HIGH | 20.5k stars，开箱即用聊天 UI（CopilotChat/Sidebar）、HITL 审批、Generative UI、工具调用可视化。2026 年 2700 万美元 A 轮融资 |

### Go 业务层

| 选择 | 版本 | 置信度 | 理由 |
|------|------|--------|------|
| **Go** | 1.24+ | HIGH | 高并发（goroutine）、类型安全、wps-cowork 验证的企业级方案 |
| **PostgreSQL** | 16+ | HIGH | JSONB 原生支持 Agent 消息存储，Go 生态 pgx 驱动成熟 |
| **Redis** | 7.x | HIGH | 缓存 + 配额计数 |

### 桌面端原生能力

| 选择 | 用途 | 置信度 |
|------|------|--------|
| **portable-pty** (Rust) | PTY 终端 | HIGH - wezterm 同款，跨平台，Phase 5 已验证 |
| **xterm.js v6** | 前端终端渲染 | HIGH - 行业标准，FitAddon + WebLinksAddon |
| **@git-diff-view/react** | 代码 Diff | HIGH - 虚拟滚动、Split/Unified 切换、语法高亮，替代 react-diff-viewer-continued |
| **Tauri Channel** | 终端数据流 | HIGH - 官方流式 API，避免 JSON 序列化瓶颈 |

## 版本约束

| 组件 | 最低版本 | 推荐版本 | 备注 |
|------|---------|---------|------|
| Rust | 1.77 | 1.85+ | Tauri 2 要求 |
| Node.js | 20 LTS | 22 LTS | |
| Python | 3.10 | 3.12+ | Pydantic AI 要求 |
| Go | 1.22 | 1.24+ | |

## 不推荐的技术

| 技术 | 原因 |
|------|------|
| Electron | 包体积大，不符合项目"小而美"定位 |
| LangChain | 臃肿，Pydantic AI 性能和 DX 更优 |
| shadcn/ui（重度使用） | 非本项目核心需求，Tailwind 手写更快 |
| GraphQL | 单机 localhost 通信不需要，WebSocket 更直接 |
| gRPC | WebSocket 足够，增加复杂度无收益 |

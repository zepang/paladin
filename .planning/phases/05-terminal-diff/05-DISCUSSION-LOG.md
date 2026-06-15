# Phase 5: Terminal + Diff - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-15
**Phase:** 5-Terminal + Diff
**Areas discussed:** 面板布局, 终端Tab管理, Diff集成, 面板交互, PTY与跨平台

---

## 面板布局（整体方案）

| Option | Description | Selected |
|--------|-------------|----------|
| 底部面板（推荐） | 终端和 Diff 作为可切换的底部面板，类似 VS Code 的底部区域 | ✓ |
| 右侧面板 | 终端和 Diff 放在右侧 | |
| 独立浮动窗口 | 终端和 Diff 各自独立浮动窗口 | |

**User's choice:** 底部面板（推荐）

---

## 底部面板布局（深入）

### 面板高度
| Option | Description | Selected |
|--------|-------------|----------|
| 默认 250px（推荐） | 约屏幕高度 25-30%，最小 100px，最大 50% | ✓ |
| 默认 200px | 紧凑型 | |
| 默认 350px | 宽敞型 | |

### 聊天区域响应
| Option | Description | Selected |
|--------|-------------|----------|
| 聊天区域自动收缩（推荐） | 面板在聊天区域下方，聊天高度自动调整 | ✓ |
| 聊天区域保持不动 | 面板覆盖聊天区域 | |
| 浮动面板 | 浮动在底部 | |

### 终端/Diff 共存
| Option | Description | Selected |
|--------|-------------|----------|
| Tab 切换（推荐） | 面板顶部 Tab 栏切换 | ✓ |
| 左右分屏 | 面板内左右分屏 | |
| 仅终端面板 | 底部面板只放终端 | |

### 初始状态
| Option | Description | Selected |
|--------|-------------|----------|
| 默认关闭（推荐） | 启动时面板隐藏 | ✓ |
| 默认打开 | 启动时显示空终端面板 | |
| 记住上次状态 | 关闭应用时记忆状态 | |

---

## 面板布局（第二轮深入）

### 分隔线
| Option | Description | Selected |
|--------|-------------|----------|
| 可拖拽分隔条（推荐） | 4px 分隔条，hover 显示手柄，即时跟随拖拽 | ✓ |
| 固定分隔线 | 不可拖拽 | |
| 无分隔线 | 仅颜色区分 | |

### 过渡动画
| Option | Description | Selected |
|--------|-------------|----------|
| 平滑滑动（推荐） | 200ms ease-in-out | ✓ |
| 即时切换 | 无动画 | |
| 弹性动画 | 300ms spring | |

### Sidebar 联动
| Option | Description | Selected |
|--------|-------------|----------|
| 面板宽度同步收缩（推荐） | 底部面板跟随 Sidebar 宽度 | ✓ |
| 面板保持全宽 | 不受 Sidebar 影响 | |
| 面板暂时隐藏 | Sidebar 打开时面板自动隐藏 | |

### 关闭状态提示
| Option | Description | Selected |
|--------|-------------|----------|
| 状态栏指示器（推荐） | 底部状态栏绿色圆点 + 快捷键提示 | ✓ |
| Titlebar 按钮 | Titlebar 图标按钮 | |
| 无提示 | 仅快捷键 | |

---

## 终端Tab管理（整体方案）

| Option | Description | Selected |
|--------|-------------|----------|
| 简单Tab（推荐） | 手动创建/关闭，系统 shell，不持久化 | ✓ |
| 预设工作区 | 预设常用 Tab，启动时自动创建 | |
| 会话持久化 | 关闭应用时保存 Tab 状态 | |

---

## 终端Tab管理（深入）

### Tab 栏样式
| Option | Description | Selected |
|--------|-------------|----------|
| 面板顶部 Tab 栏（推荐） | 横向排列，'+' 按钮新建 | ✓ |
| 侧边 Tab 列表 | 左侧垂直排列 | |
| 下拉切换 | 下拉菜单切换 | |

### 最后一个 Tab 关闭
| Option | Description | Selected |
|--------|-------------|----------|
| 关闭面板（推荐） | 关闭最后一个 Tab 时隐藏面板 | ✓ |
| 保持空面板 | 显示空状态 | |
| 禁止关闭 | 不可关闭 | |

### 工作目录
| Option | Description | Selected |
|--------|-------------|----------|
| 项目根目录（推荐） | 从项目根目录启动 | ✓ |
| 上次终端目录 | 继承活跃终端目录 | |
| 用户 Home 目录 | 从 ~ 启动 | |

### Tab 命名
| Option | Description | Selected |
|--------|-------------|----------|
| 自动命名（推荐） | 自动显示 shell，双击可重命名 | ✓ |
| 仅自动标识 | 不可手动编辑 | |
| 可固定名称 | 手动命名后锁定 | |

---

## 终端Tab管理（第二轮深入）

### 字体
| Option | Description | Selected |
|--------|-------------|----------|
| JetBrains Mono 14px（推荐） | 开发者常用等宽字体 | |
| 系统等宽字体 13px | macOS Menlo / Windows Consolas | ✓ |
| Fira Code 14px | 另一种连字字体 | |

### 回滚缓冲区
| Option | Description | Selected |
|--------|-------------|----------|
| 5000 行（推荐） | xterm.js 默认 | |
| 10000 行 | 更大缓冲区 | ✓ |
| 1000 行 | 轻量级 | |

### 颜色主题
| Option | Description | Selected |
|--------|-------------|----------|
| 跟随应用主题（推荐） | 自动切换深色/浅色终端配色 | ✓ |
| 独立终端主题 | 独立配置 | |
| 固定暗色主题 | 始终暗色 | |

### 快捷键冲突
| Option | Description | Selected |
|--------|-------------|----------|
| 终端聚焦时全部发给终端（推荐） | 应用快捷键用 Cmd | ✓ |
| 保留部分应用快捷键 | Ctrl+C/V 保留 | |
| 完全应用优先 | 终端通过右键菜单操作 | |

---

## Diff集成（整体方案）

| Option | Description | Selected |
|--------|-------------|----------|
| 聊天嵌入（推荐） | Diff 结果显示在聊天消息中 | ✓ |
| 独立 Diff 面板 | 单独的 Diff 面板 | |
| 两者结合 | 消息中 mini 预览 + 可展开 | |

---

## Diff集成（深入）

### 展示形式
| Option | Description | Selected |
|--------|-------------|----------|
| 紧凑摘要+展开（推荐） | 默认摘要，点击展开完整 Diff | ✓ |
| 始终完整展示 | 所有 Diff 完整嵌入 | |
| 仅文件列表 | 点击文件名打开 Diff | |

### 默认视图
| Option | Description | Selected |
|--------|-------------|----------|
| Unified 默认（推荐） | 统一视图，节省空间 | ✓ |
| Side-by-side 默认 | 左右对比视图 | |
| 自适应 | 根据消息宽度选择 | |

### 语法高亮
| Option | Description | Selected |
|--------|-------------|----------|
| 自动检测语言（推荐） | 根据文件扩展名高亮 | ✓ |
| 无语法高亮 | 纯文本 | |
| 手动指定语言 | Agent 附带语言信息 | |

### 用户操作
| Option | Description | Selected |
|--------|-------------|----------|
| 仅展示（推荐） | Phase 5 只展示 | ✓ |
| 文件预览按钮 | 终端面板打开文件 | |
| 复制按钮 | 复制修改后代码 | |

---

## Diff集成（第二轮深入）

### 组件库
| Option | Description | Selected |
|--------|-------------|----------|
| react-diff-viewer-continued（推荐） | ROADMAP 指定 | |
| @git-diff-view/react | 虚拟滚动，大文件性能更好 | ✓ |
| 自建 Diff 组件 | 完全控制 UI | |

**Notes:** 用户选择 @git-diff-view/react 替代 ROADMAP 原定的 react-diff-viewer-continued

### 长代码行处理
| Option | Description | Selected |
|--------|-------------|----------|
| 水平滚动（推荐） | 不换行，水平滚动条 | ✓ |
| 软换行 | 自动换行 | |
| 截断+展开 | 截断显示 | |

### 上下文块
| Option | Description | Selected |
|--------|-------------|----------|
| 默认折叠（推荐） | 大段未变更代码折叠 | ✓ |
| 始终展开 | 完整显示 | |
| 隐藏上下文 | 只显示前后 3 行 | |

### 数据格式
| Option | Description | Selected |
|--------|-------------|----------|
| Unified diff 文本（推荐） | 标准格式文本 | ✓ |
| 结构化 JSON | 结构化数据 | |
| Git diff 输出 | 原始 git diff | |

### 二进制文件
| Option | Description | Selected |
|--------|-------------|----------|
| 仅提示（推荐） | 显示 '二进制文件变更' | ✓ |
| 文件信息卡片 | 显示元信息 | |
| 忽略不做 | Phase 5 不处理 | |

---

## 面板交互（整体方案）

| Option | Description | Selected |
|--------|-------------|----------|
| 快捷键+按钮（推荐） | Ctrl+` / Ctrl+Shift+D + Titlebar 按钮 | ✓ |
| 纯快捷键驱动 | 仅快捷键 | |
| 鼠标拖拽悬浮 | 从屏幕边缘拖拽拉出 | |

---

## 面板交互（深入）

### 快捷键
| Option | Description | Selected |
|--------|-------------|----------|
| Ctrl+` / Ctrl+Shift+D（推荐） | 类似 VS Code | ✓ |
| Cmd+J / Cmd+Shift+J | macOS 风格 | |
| F12 / Ctrl+F12 | 功能键驱动 | |

### Titlebar 按钮位置
| Option | Description | Selected |
|--------|-------------|----------|
| ThemeToggle 旁边（推荐） | Titlebar 右侧 | ✓ |
| 左下角状态栏 | 与状态指示器合并 | |
| 顶部菜单栏 | macOS 原生菜单 | |

### 聚焦行为
| Option | Description | Selected |
|--------|-------------|----------|
| 自动聚焦终端输入（推荐） | 打开时焦点到终端 | ✓ |
| 保持聊天焦点 | 不抢焦点 | |
| 用户手动聚焦 | 点击终端聚焦 | |

### 后台进程
| Option | Description | Selected |
|--------|-------------|----------|
| 保持运行（推荐） | 关闭面板进程继续运行 | ✓ |
| 暂停进程 | SIGSTOP/SIGCONT | |
| 终止进程 | 关闭面板杀进程 | |

---

## 面板交互（第二轮深入）

### 拖拽行为
| Option | Description | Selected |
|--------|-------------|----------|
| 即时跟随（推荐） | 拖拽实时跟随鼠标 | ✓ |
| 松开吸附 | 吸附到预设高度 | |
| 不可拖拽 | 仅通过按钮切换 | |

### Tab 切换快捷键
| Option | Description | Selected |
|--------|-------------|----------|
| Ctrl+Tab / Ctrl+Shift+Tab（推荐） | 浏览器风格 | ✓ |
| Cmd+数字键 | 数字键切换 | |
| 无快捷键 | 仅鼠标 | |

### 右键菜单
| Option | Description | Selected |
|--------|-------------|----------|
| 基础菜单（推荐） | 复制/粘贴/新建/关闭 Tab | ✓ |
| 完整菜单 | +重命名/分割/清除 | |
| 仅复制粘贴 | 最少功能 | |

### 滚动行为
| Option | Description | Selected |
|--------|-------------|----------|
| 智能跟随（推荐） | 底部跟随/上翻不跟 | ✓ |
| 始终跟随 | 始终滚到底部 | |
| 不跟随 | 手动滚动 | |

---

## PTY与跨平台

### shell 选择
| Option | Description | Selected |
|--------|-------------|----------|
| 系统默认 shell（推荐） | portable-pty 自动检测 | ✓ |
| 固定 zsh/bash | 统一 shell | |
| 用户可配置 | 设置中切换 | |

### 崩溃恢复
| Option | Description | Selected |
|--------|-------------|----------|
| 自动重启（推荐） | 自动重建 PTY | ✓ |
| 提示用户 | 显示提示 | |
| 静默处理 | 不做提示 | |

### IPC 传输
| Option | Description | Selected |
|--------|-------------|----------|
| Tauri Channel（推荐） | 官方流式通道，无 JSON 开销 | ✓ |
| 事件流推送 | Tauri Events，JSON 序列化 | |
| WebSocket 桥接 | 本地 WS 服务器 | |

**Notes:** 用户要求详细分析三种方案后选择。结论：Tauri Channel 是官方为流式数据设计的 API，适合终端高频输出场景，避免 Events 的 JSON 序列化开销和 WebSocket 的冗余网络栈

### ANSI 处理
| Option | Description | Selected |
|--------|-------------|----------|
| xterm.js 原生处理（推荐） | 直接传递 ANSI 序列 | ✓ |
| Rust 端过滤 | 过滤/转义危险序列 | |
| 仅 UTF-8 | 丢弃非 UTF-8 字符 | |

---

## Claude's Discretion

- xterm.js fit addon 的具体集成代码
- @git-diff-view/react 的具体 API 调用方式
- 底部状态栏指示器的具体样式
- Tab 栏的具体 CSS 实现
- Zustand terminal store 的具体数据结构
- Tauri Channel 的具体创建和生命周期管理
- portable-pty spawn 的具体参数配置
- 快捷键注册的具体实现方式
- 面板高度拖拽的具体实现
- Diff 展开/折叠的具体动画效果

## Deferred Ideas

- 终端会话持久化（关闭应用时保存 Tab 列表和工作目录）
- 分屏终端（一个 Tab 内左右分屏）
- Diff 操作交互（接受/拒绝变更、应用到文件）
- 终端历史命令搜索
- 自定义终端颜色方案（独立于应用主题）

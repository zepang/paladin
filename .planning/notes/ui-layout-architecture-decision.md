---
title: UI Layout Architecture Decision
date: 2026-06-15
context: Layout Refactor
---

# UI Layout Architecture Decision

## 核心定位
在桌面端 Agent 的架构中，明确确立：
- **中间区域**：主要的工作区/画布（Workspace Container），专门用于深度工作的只读或编辑展示（如渲染 Agent 生成的复杂 Markdown、全屏 Diff、代码编辑器等）。
- **右侧边栏**：辅助的 AI 聊天交互界面（CopilotSidebar），承载所有的对话流和工具调用卡片。

## 历史背景
在初期的开发中，由于试图在 `CopilotSidebar` 的 `messageView` 插槽内集成虚拟滚动的消息列表（`ChatView`）遇到困难，导致 `ChatView` 被直接放置在了中间的主布局区域。这使得中间区域看起来像是一个放大版的聊天框，背离了最初“主内容区 + 侧边栏”的设计初衷。

## 决策与重构方向
为了让 Paladin 成为真正的生产力工具（类似于 Cursor 的布局），决定彻底将聊天交互归拢到右侧边栏中。中间的 `<main>` 区域被解放出来，作为核心功能的载体。

## 结论
- `ChatView` 必须移入 `CopilotSidebar` 中。
- App 顶层布局重构：左侧会话列表 + 中间画布 + 右侧侧边栏 + 底部终端。
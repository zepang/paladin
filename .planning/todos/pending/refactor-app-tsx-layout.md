---
title: Refactor App.tsx to separate workspace and chat sidebar
date: 2026-06-15
priority: high
---

# Refactor App.tsx to separate workspace and chat sidebar

## 目标
将现有的 `ChatView` 从中间区域移除，将其嵌入到右侧的 `CopilotSidebar` 中，并腾出中间区域作为 `WorkspaceContainer`。

## 任务列表
- [ ] 在 `App.tsx` 中，将中间 `flex-1` 容器的 `<ChatView />` 替换为 `<WorkspaceContainer />`（或临时占位符）。
- [ ] 利用 `CopilotSidebar` 的渲染函数或插槽机制，将 `<ChatView />` 嵌入其中。
- [ ] 确保聊天样式在侧边栏中显示正常，不会破坏原有的流式渲染和虚拟滚动。
- [ ] 更新 `App.tsx` 布局，使其保持：Titlebar (top) + Sidebar (left) + Workspace (center) + CopilotSidebar (right) + BottomPanel (bottom)。
---
title: Implement Resizable CopilotSidebar
date: 2026-06-16
priority: medium
---

# Implement Resizable CopilotSidebar

## 目标
让右侧 `CopilotSidebar` 支持拖拽伸缩，并将用户设定的自定义宽度持久化保存。

## 任务列表
- [ ] 创建或更新相关的 Zustand store（如 `ui` 或 `layout` store），增加 `sidebarWidth` 状态，并启用 `persist` 存储。
- [ ] 在 `App.tsx` 中读取该状态，传给 `<CopilotSidebar width={sidebarWidth} />`。
- [ ] 在 `CopilotSidebar` 的左边缘实现一个可拖拽的 `ResizeHandle` 组件（或集成现成的 resize 方案）。
- [ ] 监听鼠标/指针的拖拽事件，动态计算宽度并更新到 store 中。
- [ ] 在拖拽逻辑中增加最小和最大宽度的限制边界。
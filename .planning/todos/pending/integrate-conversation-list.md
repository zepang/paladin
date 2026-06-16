---
title: Integrate Conversation List into CopilotSidebar
date: 2026-06-16
priority: high
---

# Integrate Conversation List into CopilotSidebar

## 目标
消除聊天组件间的视觉割裂，将历史对话列表集成到右侧的聊天组件内部，彻底释放左侧空间。

## 任务列表
- [ ] 从 `App.tsx` 中移除现有的 `w-64` 独立左侧边栏（`ConversationList`）。
- [ ] 在 `ChatView` 组件内部或 `CopilotSidebar` 的 `header` 插槽中实现一个新的历史会话选择器（例如下拉菜单或按钮切换到历史列表视图）。
- [ ] 确保在新的集成式历史列表入口中，依然能够完成创建新对话、切换对话、修改标题等原有功能。
- [ ] 测试响应式和右侧边栏收缩时的行为，确保对话管理操作顺畅且样式不破坏。
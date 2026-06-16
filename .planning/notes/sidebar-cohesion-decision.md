---
title: Sidebar Cohesion Decision
date: 2026-06-16
context: Layout Refactor (Conversation List)
---

# Sidebar Cohesion Decision

## 核心定位
决定采用“侧边栏内聚”模式，完全移除原本独立的左侧会话列表栏（`w-64` 的 `ConversationList`）。

## 决定的动机
1. **消除视觉割裂感**：避免左侧选对话、右侧看内容的“左右互搏”情况，让用户的视线更加集中。
2. **释放左侧空间**：完全干掉左侧专用的对话栏，将屏幕左侧和中间大部分空间整合为一个大片的纯净工作区。这个区域在未来可以放置文件资源管理器（File Explorer）、全局搜索等更基础的全局组件。
3. **功能内聚**：将历史记录的入口做进右侧 `CopilotSidebar` 内部（比如通过顶部下拉菜单或专属按钮切换），让所有与 AI 对话相关的界面组件（历史、当前流、输入框）完全内聚在屏幕右侧。

## 结论
- 删除左侧的独立会话列表界面。
- 会话切换功能将移入右侧的聊天界面中（如 `CopilotSidebar` 的 header 区域）。
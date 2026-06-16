---
title: Sidebar Resizable & Persistence Decision
date: 2026-06-16
context: Layout Refactor (CopilotSidebar)
---

# Sidebar Resizable & Persistence Decision

## 核心交互设计
决定让右侧 `CopilotSidebar` 支持拖拽调整宽度，并对该宽度状态进行持久化。

## 决定的动机
1. **适应不同场景**：用户在写代码时可能只需要窄边栏陪伴，而在阅读长文本 Markdown 解释或比较宽的代码片段时，需要将其拖宽。
2. **状态持久化**：用户调整到自己舒适的宽度后，关闭应用或重启不应重置为默认值。持久化宽度可以极大提升日常使用的连贯体验，减少重复的调整操作。

## 结论
- `CopilotSidebar` 的左侧边缘需增加拖拽手柄（Resize Handle）。
- 宽度状态需提取至 Zustand store（可命名为 `uiStore` 或放入现有的 store），并使用 `persist` 中间件存入 `localStorage`。
- 设定合理的最小和最大宽度阈值（如 min: 300px, max: 800px 或屏幕宽度的 50%）。
---
quick_id: 260706-nd8
slug: agent-shadcn
status: planned
date: 2026-07-06
---

# 优化桌面端 Agent 停止错误页面样式

## Scope

- Update `apps/desktop/src/components/StartupMask.tsx`.
- Reuse existing shadcn-style primitives and design tokens where available.
- Replace the sparse stopped/error view with a compact status panel including icon, title, explanation, diagnostic blocks, and restart action.
- Keep existing process-state behavior and visibility of `error` / `stderrTail`.

## Verification

- Run desktop build or typecheck after implementation.

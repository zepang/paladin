---
phase: 05-terminal-diff
plan: 01
subsystem: ui
tags: [tauri, portable-pty, xterm, git-diff-view, vitest, zustand]

requires:
  - phase: 01.5-ui-layout-refactor
    provides: RightDrawer layout shell, Titlebar toggles
  - phase: 02-chat-ui
    provides: MessageBubble, ChatView integration surface
provides:
  - Rust TerminalManager with Tauri Channel PTY streaming
  - Right drawer multi-tab xterm.js terminal (TRM-01~04)
  - Chat-embedded @git-diff-view/react DiffMessageCard (DIF-01~03)
  - Tested diffParser utilities
affects: [06-agent-tools, 07-hitl-sidecar]

tech-stack:
  added: [portable-pty 0.8, @xterm/xterm ^6, @git-diff-view/react ^0.1.5]
  patterns: [Channel<Vec<u8>> raw PTY bytes, frontend tab id = terminal id, PTY persists when drawer closed]

key-files:
  created:
    - apps/desktop/src-tauri/src/terminal/mod.rs
    - apps/desktop/src-tauri/src/terminal/commands.rs
    - apps/desktop/src/components/layout/RightDrawer.tsx
    - apps/desktop/src/components/terminal/TerminalPanel.tsx
    - apps/desktop/src/components/terminal/TerminalTabBar.tsx
    - apps/desktop/src/components/diff/DiffMessageCard.tsx
    - apps/desktop/src/lib/diffParser.ts
    - apps/desktop/src/lib/__tests__/diffParser.test.ts
  modified:
    - apps/desktop/src-tauri/src/lib.rs
    - apps/desktop/src/stores/terminal.ts
    - apps/desktop/src/App.tsx
    - apps/desktop/src/components/MessageBubble.tsx
    - apps/desktop/src/components/Titlebar.tsx

key-decisions:
  - "Frontend-provided tab id passed to spawn_terminal for 1:1 tab/PTY mapping"
  - "RightDrawer replaces BottomPanel with width-based resize (300-800px)"
  - "diffParser extracted as pure lib with vitest coverage; DiffMessageCard imports from it"

patterns-established:
  - "PTY output: dedicated std::thread → Channel.send(Vec<u8>) without ANSI filtering"
  - "Crash recovery: pty-eof/pty-error → restart_terminal + frontend [进程已重启] message"

requirements-completed: [TRM-01, TRM-02, TRM-03, TRM-04, DIF-01, DIF-02, DIF-03]

duration: 25min
completed: 2026-06-16
---

# Phase 5 Plan 01: Terminal + Diff Core Summary

**Rust portable-pty with Tauri Channel streaming to xterm.js right drawer, plus @git-diff-view/react diff cards in AI chat with tested diffParser utilities**

## Performance

- **Duration:** 25 min
- **Started:** 2026-06-16T09:30:00Z
- **Completed:** 2026-06-16T09:55:00Z
- **Tasks:** 3
- **Files modified:** 14

## Accomplishments

- TerminalManager spawns shells with frontend tab ids, streams raw bytes over `Channel<Vec<u8>>`, resizes via stored `MasterPty`, and exposes `restart_terminal` on EOF/error
- Right drawer hosts multi-tab xterm.js with FitAddon, smart scroll, context menu, Ctrl+` toggle, and PTY persistence when drawer closes
- AI messages render compact diff summaries expanding to Unified/Split DiffView; binary and large diffs handled per spec

## Task Commits

1. **Task 1: Rust PTY backend + Tauri Channel IPC** - `1596382` (feat)
2. **Task 2: Right drawer + xterm.js multi-tab terminal UI** - `b5ebb51` (feat)
3. **Task 3: Diff parser (TDD) + chat-embedded DiffView** - `4cf8c43` (test/feat)

## Files Created/Modified

- `apps/desktop/src-tauri/src/terminal/mod.rs` - TerminalManager with resize and restart
- `apps/desktop/src-tauri/src/terminal/commands.rs` - Five Tauri invoke commands
- `apps/desktop/src/components/layout/RightDrawer.tsx` - Right drawer container with Channel lifecycle
- `apps/desktop/src/components/terminal/TerminalPanel.tsx` - xterm.js with smart scroll and pty restart
- `apps/desktop/src/lib/diffParser.ts` - Pure diff parsing utilities
- `apps/desktop/src/lib/__tests__/diffParser.test.ts` - 9 vitest cases

## Decisions Made

- Used width transition (200ms) for RightDrawer instead of bottom height animation per layout refactor
- Removed obsolete `BottomPanel.tsx` after migrating to RightDrawer

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Removed BottomPanel after RightDrawer migration**
- **Found during:** Task 2 (TypeScript verification)
- **Issue:** BottomPanel referenced removed `panelHeight` store field, breaking `tsc --noEmit`
- **Fix:** Deleted BottomPanel.tsx; RightDrawer is sole panel container
- **Files modified:** apps/desktop/src/components/layout/BottomPanel.tsx (deleted)
- **Committed in:** b5ebb51

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Required for type safety; no scope change.

## Issues Encountered

None

## User Setup Required

None - no external service configuration required.

## Verification

```
cd apps/desktop/src-tauri && cargo build          # exit 0
cd apps/desktop && pnpm exec tsc --noEmit         # exit 0
cd apps/desktop && pnpm exec vitest run src/lib/__tests__/diffParser.test.ts  # 9 passed
```

Manual smoke: Ctrl+` opens right drawer terminal; AI message with ```diff block shows expandable DiffView with Unified/Split toggle.

## Next Phase Readiness

- TRM-01~04 and DIF-01~03 satisfied for Phase 6 Agent Tools integration
- Terminal and diff surfaces ready for agent-triggered shell commands and code review flows

## Self-Check: PASSED

- FOUND: apps/desktop/src/components/layout/RightDrawer.tsx
- FOUND: apps/desktop/src/lib/diffParser.ts
- FOUND: apps/desktop/src/lib/__tests__/diffParser.test.ts
- FOUND: commit 1596382
- FOUND: commit b5ebb51
- FOUND: commit 4cf8c43

---
*Phase: 05-terminal-diff*
*Completed: 2026-06-16*

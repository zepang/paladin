---
phase: 02-chat-ui
plan: 01
type: tdd
dependencies: []
---

## Artifacts this phase produces

**New files:**
- `apps/desktop/src/stores/chat.ts` — Zustand chat store (persist, conversation CRUD)
- `apps/desktop/src/stores/__tests__/chat.test.ts` — Store unit tests
- `apps/desktop/src/components/WelcomePage.tsx` — Welcome page with branding and new chat entry
- `apps/desktop/src/components/ChatToggle.tsx` — Sidebar toggle button for Titlebar
- `apps/desktop/src/components/ConversationList.tsx` — Conversation selector/manager
- `apps/desktop/src/components/MessageBubble.tsx` — Single message renderer
- `apps/desktop/src/components/ChatView.tsx` — Virtuoso-wrapped message list with CopilotKit

**Modified files:**
- `apps/desktop/package.json` — Add `@copilotkit/react-core`, `react-virtuoso` deps
- `apps/desktop/src/main.tsx` — Import CopilotKit styles
- `apps/desktop/src/App.tsx` — Wrap with CopilotKitProvider, add CopilotSidebar
- `apps/desktop/src/components/Titlebar.tsx` — Add ChatToggle button
- `apps/desktop/src-tauri/tauri.conf.json` — CSP update for CopilotKit

**New symbols:**
- `useChatStore` — Zustand hook for chat state
- `Conversation` — TypeScript interface
- `WelcomePage` — React component
- `ChatToggle` — React component (SVG icon + button)
- `ConversationList` — React component (dropdown list with CRUD)
- `MessageBubble` — React component
- `ChatView` — React component (Virtuoso + CopilotKit integration)

## Requirements Addressed

- CHT-01: CopilotKit CopilotChat 组件集成，聊天界面可交互
- CHT-02: 流式输出响应，逐 token 渲染
- CHT-03: 对话历史管理（查看、切换、删除）
- CHT-04: CopilotKit CopilotSidebar 侧边栏模式

## must_haves

- [ ] `pnpm check` (biome ci) passes — 0 errors
- [ ] `tsc --noEmit` passes for `apps/desktop/`
- [ ] CopilotSidebar renders and toggle works
- [ ] Can create, switch, rename, delete conversations
- [ ] Messages display with time grouping separators
- [ ] Message list uses react-virtuoso virtual scrolling
- [ ] Welcome page renders when sidebar is closed
- [ ] Dark mode applies to CopilotKit components via slots

## Waves

### Wave 1: Dependencies & Configuration
**Objective:** Install packages, update CSP, import styles. No runtime behavior change.

### Wave 2: CopilotKit Provider + Sidebar Scaffold
**Objective:** CopilotKitProvider wrapper, CopilotSidebar on screen, toggle button in Titlebar.

### Wave 3: Chat Store (TDD)
**Objective:** Zustand chat store with conversation CRUD, localStorage persistence, full test coverage.

### Wave 4: Welcome Page
**Objective:** Branded welcome page with new chat entry point and suggestion cards.

### Wave 5: Conversation Management UI
**Objective:** Conversation selector in CopilotSidebar header, create/switch/rename/delete interactions.

### Wave 6: Message Display + Virtual Scrolling
**Objective:** Message rendering with time groups, react-virtuoso integration, scroll-to-bottom behavior.

### Wave 7: Polish & Dark Mode
**Objective:** CopilotKit slots dark mode pass, biome + tsc check, manual verification.

---

<feature>
  <name>Chat Store (conversation CRUD, persistence, message cache)</name>
  <files>apps/desktop/src/stores/chat.ts, apps/desktop/src/stores/__tests__/chat.test.ts</files>

  <objective>
  Zustand store managing conversation list, current thread, and message cache.
  TDD ensures conversation CRUD behaves correctly — creation, switching, renaming,
  deletion with fallback behavior.
  </objective>

  <context>
  .planning/phases/02-chat-ui/02-CONTEXT.md (D-09 through D-15, D-25)
  .planning/phases/02-chat-ui/02-RESEARCH.md (§5 Zustand Chat Store Design)
  apps/desktop/src/stores/theme.ts (reference pattern: persist middleware)
  </context>

  <behavior>
  - Store initializes with empty conversations array, null currentThreadId
  - createConversation() returns id, creates entry with "新对话 #{N}" title, increments counter
  - setCurrentThreadId(id) changes active conversation
  - deleteConversation(id) removes and switches to next nearest, creates new if was last
  - updateConversationTitle(id, title) renames
  - setMessages(threadId, messages[]) caches messages per conversation
  - State persists to localStorage key "paladin-chat" via Zustand persist middleware
  </behavior>

  <tdd_phases>
    <phase color="RED">
      <task>Write test suite covering all CRUD operations, edge cases (delete last conversation, duplicate ids), and persistence round-trip</task>
      <task>Run tests — expect all RED (no implementation yet)</task>
    </phase>
    <phase color="GREEN">
      <task>Implement chat store with create/delete/setCurrentThreadId/updateConversationTitle/setMessages</task>
      <task>Add persist middleware with localStorage</task>
      <task>Run tests — expect all GREEN</task>
    </phase>
    <phase color="REFACTOR">
      <task>Review for Biome lint compliance, TypeScript strictness, pattern consistency with theme.ts</task>
      <task>Ensure conversation title defaults match D-14 (editable, default "新对话 #{N}")</task>
      <task>Run tests — must stay GREEN</task>
    </phase>
  </tdd_phases>
</feature>

---

<tasks>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- WAVE 1: Dependencies & Configuration -->
<!-- ═══════════════════════════════════════════════════════ -->

<task id="1.1" wave="1" type="execute">
  <description>Install CopilotKit and react-virtuoso packages</description>
  <read_first>apps/desktop/package.json</read_first>
  <action>
    Add dependencies:
    - `@copilotkit/react-core` (latest v1.59.x)
    - `react-virtuoso` (latest v4.x)
  </action>
  <acceptance_criteria>
    Source: apps/desktop/package.json contains "@copilotkit/react-core" in dependencies
    Source: apps/desktop/package.json contains "react-virtuoso" in dependencies
    CLI: cd apps/desktop && pnpm install exits 0
  </acceptance_criteria>
</task>

<task id="1.2" wave="1" type="execute">
  <description>Update Tauri CSP to allow CopilotKit HTTP requests</description>
  <read_first>apps/desktop/src-tauri/tauri.conf.json</read_first>
  <action>
    In tauri.conf.json → app.security.csp, add:
    - connect-src: add 'http://localhost:*' and 'https://*.copilotkit.ai'
    Current CSP: "default-src 'self'; connect-src ipc: http://ipc.localhost; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data:"
    New: "default-src 'self'; connect-src ipc: http://ipc.localhost http://localhost:* https://*.copilotkit.ai; style-src 'self' 'unsafe-inline'; img-src 'self' asset: http://asset.localhost data:"
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src-tauri/tauri.conf.json app.security.csp contains "http://localhost:*"
    Source: apps/desktop/src-tauri/tauri.conf.json app.security.csp contains "https://*.copilotkit.ai"
  </acceptance_criteria>
</task>

<task id="1.3" wave="1" type="execute">
  <description>Import CopilotKit v2 styles in main.tsx</description>
  <read_first>apps/desktop/src/main.tsx</read_first>
  <action>
    Add import before the existing CSS imports:
    `import '@copilotkit/react-core/v2/styles.css';`
    This line goes right after the React imports, before `import './index.css';`
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/main.tsx contains "import '@copilotkit/react-core/v2/styles.css'"
  </acceptance_criteria>
</task>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- WAVE 2: CopilotKit Provider + Sidebar Scaffold -->
<!-- ═══════════════════════════════════════════════════════ -->

<task id="2.1" wave="2" type="execute" depends_on="1.1,1.3">
  <description>Wrap App with CopilotKitProvider and add CopilotSidebar</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <read_first>apps/desktop/src/components/Titlebar.tsx</read_first>
  <action>
    In App.tsx:
    1. Import: `import { CopilotKitProvider, CopilotSidebar } from '@copilotkit/react-core/v2';`
    2. Wrap the root div with `<CopilotKitProvider runtimeUrl="http://localhost:9876/copilotkit">`
    3. Add `<CopilotSidebar defaultOpen={false} width={400} />` after the closing `</main>` tag but before `</CopilotKitProvider>`
    4. Keep the existing `<div className="flex flex-col h-screen...">` structure inside the provider
    5. Keep Titlebar and main content area
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/App.tsx contains "CopilotKitProvider" import
    Source: apps/desktop/src/App.tsx contains "CopilotSidebar" import
    Source: apps/desktop/src/App.tsx contains 'runtimeUrl="http://localhost:9876/copilotkit"'
    Source: apps/desktop/src/App.tsx contains "defaultOpen={false}"
    Source: apps/desktop/src/App.tsx contains "width={400}"
  </acceptance_criteria>
</task>

<task id="2.2" wave="2" type="execute" depends_on="2.1">
  <description>Create ChatToggle component and integrate into Titlebar</description>
  <read_first>apps/desktop/src/components/Titlebar.tsx</read_first>
  <read_first>apps/desktop/src/components/ThemeToggle.tsx</read_first>
  <action>
    1. Create `apps/desktop/src/components/ChatToggle.tsx`:
       - SVG chat icon (21x21 viewBox, speech bubble shape)
       - Button with `type="button"` prop
       - `aria-hidden="true"` on SVG, `<title>Toggle Chat</title>`
       - Calls a callback prop `onClick`
    2. In Titlebar.tsx:
       - Import ChatToggle
       - Add `<ChatToggle onClick={toggleSidebar} />` in the right-side controls area
       - toggleSidebar dispatches a custom event or sets a state to open/close CopilotSidebar
       - Place ChatToggle between the spacer and ThemeToggle
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/components/ChatToggle.tsx exists with exported component
    Source: apps/desktop/src/components/ChatToggle.tsx contains "type=\"button\""
    Source: apps/desktop/src/components/ChatToggle.tsx contains "<title>Toggle Chat</title>"
    Source: apps/desktop/src/components/ChatToggle.tsx contains "aria-hidden=\"true\""
    Source: apps/desktop/src/components/Titlebar.tsx imports ChatToggle
    Source: apps/desktop/src/components/Titlebar.tsx contains "<ChatToggle"
  </acceptance_criteria>
</task>

<task id="2.3" wave="2" type="execute" depends_on="2.1">
  <description>Wire ChatToggle to CopilotSidebar open/close</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <read_first>apps/desktop/src/components/Titlebar.tsx</read_first>
  <action>
    In App.tsx:
    1. Create state: `const [sidebarOpen, setSidebarOpen] = useState(false);`
    2. Pass `setSidebarOpen` as prop to Titlebar
    3. Set CopilotSidebar: `defaultOpen={sidebarOpen}` with a controlled mechanism
    Note: CopilotSidebar's defaultOpen may only work on initial render.
    If so, use a key prop `key={sidebarOpen ? 'open' : 'closed'}` to force remount,
    or lift sidebar state and use CopilotSidebar's toggle mechanism.
    Research note: CopilotSidebar manages its own open state internally.
    The recommended approach is to leave defaultOpen={false} and let CopilotSidebar
    handle its own state. The ChatToggle dispatches a click on CopilotSidebar's
    internal toggle button via a ref or DOM event.
  </action>
  <acceptance_criteria>
    Behavior: Clicking ChatToggle in Titlebar opens CopilotSidebar
    Behavior: Clicking ChatToggle again (or sidebar's close button) closes CopilotSidebar
    CLI: cd apps/desktop && npx tsc --noEmit exits 0 (no type errors from prop wiring)
  </acceptance_criteria>
</task>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- WAVE 3: Chat Store (TDD) -->
<!-- ═══════════════════════════════════════════════════════ -->

<task id="3.1" wave="3" type="tdd" phase="RED" depends_on="1.1">
  <description>Write chat store test suite (vitest)</description>
  <read_first>apps/desktop/src/stores/theme.ts</read_first>
  <action>
    Create `apps/desktop/src/stores/__tests__/chat.test.ts`:
    Test cases covering:
    - Store initializes with conversations: [], currentThreadId: null
    - createConversation() adds entry with auto-generated id, threadId, "新对话 #{N}" title, createdAt
    - createConversation() increments counter (N in title)
    - setCurrentThreadId(validId) sets currentThreadId
    - setCurrentThreadId(invalidId) does not change currentThreadId
    - deleteConversation(existingId) removes it from array
    - deleteConversation(lastId) when it was current: sets currentThreadId to new last or null
    - deleteConversation(nonCurrentId): currentThreadId unchanged
    - updateConversationTitle(id, newTitle) updates title
    - updateConversationTitle(invalidId): no crash, no change
    - setMessages(threadId, messages[]) caches messages
    - Persistence: store persists and rehydrates from localStorage (mock localStorage)

    Use vitest (bundled with Vite) for test runner.
    If vitest is not installed: `pnpm add -D vitest` in apps/desktop.
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/stores/__tests__/chat.test.ts exists
    CLI: cd apps/desktop && npx vitest run --reporter=verbose exits 0 with failing tests (RED)
  </acceptance_criteria>
</task>

<task id="3.2" wave="3" type="tdd" phase="GREEN" depends_on="3.1">
  <description>Implement chat store to pass all tests</description>
  <read_first>apps/desktop/src/stores/theme.ts</read_first>
  <read_first>apps/desktop/src/stores/__tests__/chat.test.ts</read_first>
  <action>
    Create `apps/desktop/src/stores/chat.ts`:
    
    Following the pattern from `theme.ts`:
    - Use `create<T>()(persist(...))` from zustand
    - Interface `Conversation { id, threadId, title, createdAt, lastMessage, messageCount }`
    - Interface `ChatStore { conversations, currentThreadId, createConversation, deleteConversation, setCurrentThreadId, updateConversationTitle, setMessages }`
    - `createConversation()`: generates UUID via `crypto.randomUUID()`, threadId same pattern, title `新对话 #{N}` with counter from state, set `createdAt: Date.now()`, `lastMessage: ''`, `messageCount: 0`, pushes to array, sets as current
    - `deleteConversation(id)`: filters out, if deleted was current, find next nearest (same index or last), create fresh if none left
    - `setCurrentThreadId(id)`: only change if id exists in conversations
    - `updateConversationTitle(id, title)`: find by id, set title if found
    - `setMessages(threadId, messages)`: reserved for Phase 4, store as messageCache map
    - Persist key: `"paladin-chat"`, version: 0
    - onRehydrateStorage: no special action needed at hydration time
    
    Store exports: `useChatStore` hook, `Conversation` type
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/stores/chat.ts exists
    Source: apps/desktop/src/stores/chat.ts contains "useChatStore"
    Source: apps/desktop/src/stores/chat.ts contains 'name: "paladin-chat"'
    Source: apps/desktop/src/stores/chat.ts contains "persist("
    Source: apps/desktop/src/stores/chat.ts contains "crypto.randomUUID()"
    CLI: cd apps/desktop && npx vitest run exits 0 (all GREEN)
  </acceptance_criteria>
</task>

<task id="3.3" wave="3" type="tdd" phase="REFACTOR" depends_on="3.2">
  <description>Lint and refactor chat store for compliance</description>
  <read_first>apps/desktop/src/stores/chat.ts</read_first>
  <read_first>apps/desktop/src/stores/theme.ts</read_first>
  <action>
    1. Run `pnpm biome check --fix apps/desktop/src/stores/chat.ts`
    2. Fix any remaining lint issues (noNonNullAssertion, organizeImports)
    3. Verify pattern consistency with theme.ts:
       - Same import style (create from zustand, persist from middleware)
       - Same store export convention (named export)
       - No unnecessary type assertions
    4. Run `cd apps/desktop && npx tsc --noEmit` to verify types
    5. Run test suite: `cd apps/desktop && npx vitest run` — must stay GREEN
  </action>
  <acceptance_criteria>
    CLI: pnpm biome check apps/desktop/src/stores/chat.ts exits 0 (no errors)
    CLI: cd apps/desktop && npx tsc --noEmit exits 0
    CLI: cd apps/desktop && npx vitest run exits 0 (tests GREEN)
  </acceptance_criteria>
</task>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- WAVE 4: Welcome Page -->
<!-- ═══════════════════════════════════════════════════════ -->

<task id="4.1" wave="4" type="execute" depends_on="3.2">
  <description>Create WelcomePage component</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <read_first>apps/desktop/src/index.css</read_first>
  <action>
    Create `apps/desktop/src/components/WelcomePage.tsx`:
    - Centered flex column layout
    - Brand name "Paladin" in large text (text-4xl font-bold)
    - Tagline: "AI 编程助手" in muted text
    - "开始新对话" primary button (uses store's createConversation + setCurrentThreadId)
    - 3-4 suggestion cards below the button:
      - "解释这段代码" with code icon
      - "帮我调试" with bug icon
      - "重构建议" with refresh icon
      - "写一个新功能" with sparkle icon
    - Cards are clickable, each creates a new conversation and opens sidebar
    Section shows recent conversations list (last 5, clickable) if conversations exist
    Import useChatStore and use the store for state
    Use Tailwind classes for styling, responsive to dark mode
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/components/WelcomePage.tsx exists
    Source: apps/desktop/src/components/WelcomePage.tsx contains "Paladin"
    Source: apps/desktop/src/components/WelcomePage.tsx contains "开始新对话"
    Source: apps/desktop/src/components/WelcomePage.tsx contains "解释这段代码"
    Source: apps/desktop/src/components/WelcomePage.tsx contains "useChatStore"
  </acceptance_criteria>
</task>

<task id="4.2" wave="4" type="execute" depends_on="4.1">
  <description>Integrate WelcomePage into App.tsx main area</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <action>
    In App.tsx:
    1. Import WelcomePage
    2. Import useChatStore
    3. Replace the placeholder `<p>Paladin — AI 编程助手</p>` in `<main>` with `<WelcomePage />`
    4. The main content area should show WelcomePage when sidebar is closed
    (This is already the case since the main area is always visible behind the sidebar)
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/App.tsx imports WelcomePage
    Source: apps/desktop/src/App.tsx contains "<WelcomePage" inside <main>
    CLI: cd apps/desktop && npx tsc --noEmit exits 0
  </acceptance_criteria>
</task>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- WAVE 5: Conversation Management UI -->
<!-- ═══════════════════════════════════════════════════════ -->

<task id="5.1" wave="5" type="execute" depends_on="3.3">
  <description>Create ConversationList component</description>
  <read_first>apps/desktop/src/stores/chat.ts</read_first>
  <read_first>apps/desktop/src/components/ThemeToggle.tsx</read_first>
  <action>
    Create `apps/desktop/src/components/ConversationList.tsx`:
    - Dropdown/list selector showing all conversations
    - Each item shows: title (editable inline), last message preview, time ago
    - Click to switch: calls setCurrentThreadId
    - "+" plus button at top to create new conversation
    - Swipe or right-click → Delete option with confirmation dialog
    - Rename: double-click title → inline edit → Enter to save
    - Currently selected conversation is highlighted
    - Empty state: "No conversations yet"
    - Use Tailwind for styling, dark mode support
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/components/ConversationList.tsx exists
    Source: apps/desktop/src/components/ConversationList.tsx contains "useChatStore"
    Source: apps/desktop/src/components/ConversationList.tsx contains "setCurrentThreadId"
    Source: apps/desktop/src/components/ConversationList.tsx contains "createConversation"
    Source: apps/desktop/src/components/ConversationList.tsx contains "deleteConversation"
  </acceptance_criteria>
</task>

<task id="5.2" wave="5" type="execute" depends_on="5.1">
  <description>Integrate ConversationList into CopilotSidebar header</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <action>
    In App.tsx, customize CopilotSidebar's header slot:
    1. Use CopilotSidebar's `header` prop to render ConversationList
    2. `<CopilotSidebar header={<ConversationList />} ... />`
    This places the conversation selector at the top of the sidebar,
    above the CopilotChat message area.
    
    The header slot renders above the chat messages and input.
    ConversationList occupies the top ~120px of the sidebar.
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/App.tsx contains "header={<ConversationList"
    Source: apps/desktop/src/App.tsx imports ConversationList
    CLI: cd apps/desktop && npx tsc --noEmit exits 0
  </acceptance_criteria>
</task>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- WAVE 6: Message Display + Virtual Scrolling -->
<!-- ═══════════════════════════════════════════════════════ -->

<task id="6.1" wave="6" type="execute" depends_on="2.1">
  <description>Create MessageBubble component</description>
  <read_first>apps/desktop/src/components/ThemeToggle.tsx</read_first>
  <action>
    Create `apps/desktop/src/components/MessageBubble.tsx`:
    Props: `{ role: 'user' | 'assistant', content: string, timestamp: number }`
    - User messages: right-aligned, blue bg (bg-blue-600 text-white), rounded-l-xl rounded-tr-xl
    - Assistant messages: left-aligned, gray bg (bg-gray-100 dark:bg-gray-800), rounded-r-xl rounded-tl-xl
    - Timestamp shown as relative time below each bubble (small, muted text)
    - Markdown content rendered via CopilotKit default (pass-through)
    - CopilotKit handles the actual rendering within CopilotChat
    This component is for reference/custom rendering when needed
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/components/MessageBubble.tsx exists
    Source: apps/desktop/src/components/MessageBubble.tsx contains "role === 'user'"
    Source: apps/desktop/src/components/MessageBubble.tsx contains "bg-blue-600"
    Source: apps/desktop/src/components/MessageBubble.tsx contains "bg-gray-100"
  </acceptance_criteria>
</task>

<task id="6.2" wave="6" type="execute" depends_on="6.1">
  <description>Integrate react-virtuoso into CopilotChat via slots</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <action>
    Customize CopilotSidebar's message list with react-virtuoso:
    Use the CopilotChat `messageView` slot via CopilotSidebar props.
    
    The exact slot name is `messageView` per CopilotKit v2 Slots system.
    Pass a custom component that wraps messages in `<Virtuoso>`:
    
    Approach:
    1. Create `apps/desktop/src/components/ChatView.tsx`:
       - Receives messages array prop
       - Renders `<Virtuoso data={messages} itemContent={...} followOutput="smooth" />`
       - Uses `components.Header` for date dividers (time grouping per D-26)
       - Uses `atBottomStateChange` for scroll-to-bottom button
    2. In App.tsx, pass `messageView={<ChatView />}` to CopilotSidebar
    
    If the slot doesn't accept custom component for message list,
    fall back to using CopilotSidebar's `children` render function:
    `<CopilotSidebar>{(slots) => <div>{slots.input}<ChatView>{slots.messageView}</ChatView></div>}</CopilotSidebar>`
    
    Time grouping (D-26): Group messages by day, render date dividers:
    - "Today" / "Yesterday" / "MM月DD日"
    - Use the `components.Header` from Virtuoso to inject dividers between groups
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/components/ChatView.tsx exists
    Source: apps/desktop/src/components/ChatView.tsx contains "Virtuoso" import from "react-virtuoso"
    Source: apps/desktop/src/components/ChatView.tsx contains 'followOutput="smooth"'
    CLI: cd apps/desktop && npx tsc --noEmit exits 0
  </acceptance_criteria>
</task>

<!-- ═══════════════════════════════════════════════════════ -->
<!-- WAVE 7: Polish & Dark Mode -->
<!-- ═══════════════════════════════════════════════════════ -->

<task id="7.1" wave="7" type="execute" depends_on="2.1,3.3">
  <description>Apply dark mode customization to CopilotKit via slots</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <read_first>apps/desktop/src/index.css</read_first>
  <action>
    Per CONTEXT.md D-19: Light custom styling to align CopilotKit with
    Paladin's gray-900/gray-100 color system.
    
    Add slot overrides to CopilotSidebar in App.tsx:
    ```tsx
    <CopilotSidebar
      messageView="bg-white dark:bg-gray-900"
      input={{
        textArea: "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700 rounded-lg",
        sendButton: "bg-blue-600 hover:bg-blue-700 text-white",
      }}
      // ... other props
    />
    ```
    
    Tailwind class strings are the simplest slot customization level.
    Focus on: message background, input area, sidebar panel background.
  </action>
  <acceptance_criteria>
    Source: apps/desktop/src/App.tsx contains "dark:bg-gray-900" on CopilotSidebar props
    Source: apps/desktop/src/App.tsx contains "dark:bg-gray-800" on input slot
    Source: apps/desktop/src/App.tsx contains "dark:border-gray-700" on input slot
  </acceptance_criteria>
</task>

<task id="7.2" wave="7" type="execute" depends_on="7.1">
  <description>Run full quality gate: biome check + tsc + format</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <action>
    1. `pnpm format`  — auto-format all files
    2. `pnpm check`   — biome ci (must pass: 0 errors)
    3. `cd apps/desktop && npx tsc --noEmit` — TypeScript check (must pass)
    4. Fix any lint/type errors iteratively
    5. Run `cd apps/desktop && npx vitest run` — store tests must pass
  </action>
  <acceptance_criteria>
    CLI: pnpm check exits 0 (biome ci: 0 errors)
    CLI: cd apps/desktop && npx tsc --noEmit exits 0
    CLI: cd apps/desktop && npx vitest run exits 0
  </acceptance_criteria>
</task>

<task id="7.3" wave="7" type="execute" depends_on="7.2">
  <description>Manual verification checklist</description>
  <read_first>apps/desktop/src/App.tsx</read_first>
  <action>
    Launch the app with `pnpm tauri dev` and verify:
    1. App launches with Titlebar, welcome page visible
    2. Chat toggle button visible in Titlebar (between spacer and theme toggle)
    3. Click chat toggle → CopilotSidebar slides open (right side, 400px)
    4. Sidebar shows input area and "Ask anything..." placeholder
    5. Click chat toggle again → sidebar closes, welcome page visible
    6. Click "开始新对话" → new conversation created, input ready
    7. Type a message → message appears in chat (may show error since no runtime)
    8. Dark mode toggle works → sidebar and welcome page follow
    9. Conversation selector shows conversations, can switch between them
    10. Delete conversation → confirmation dialog → conversation removed
  </action>
  <acceptance_criteria>
    Behavior: App launches without console errors
    Behavior: Chat toggle opens/closes CopilotSidebar
    Behavior: Welcome page renders with branding and suggestion cards
    Behavior: Dark mode applies to all components
    Behavior: Conversation CRUD functions correctly
  </acceptance_criteria>
</task>

</tasks>

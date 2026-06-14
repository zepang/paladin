# Research: Phase 2 — Chat UI

**Created:** 2026-06-14
**Status:** Research Complete

## Research Summary

CopilotKit v2 frontend integration on a Tauri+Vite desktop app, with Zustand chat store, react-virtuoso virtual scrolling, and mock agent backend.

---

## 1. CopilotKit v2 Migration (Critical Path)

### Import Path Changes

CopilotKit has fully consolidated to a unified v2 import structure. The discussions in CONTEXT.md D-05/D-08 used paths that are now outdated:

| Old (CONTEXT.md assumed) | Current (v2) |
|---|---|
| `@copilotkit/react-core/v2` | `@copilotkit/react-core/v2` (same, but CopilotKit renamed to CopilotKitProvider) |
| `@copilotkit/react-ui/v2` | **DEPRECATED** — merged into `@copilotkit/react-core/v2` |
| `@copilotkit/react-ui/v2/styles.css` | `@copilotkit/react-core/v2/styles.css` |
| `<CopilotKit>` | `<CopilotKitProvider>` |
| `CopilotSidebar` from `@copilotkit/react-ui` | `CopilotSidebar` from `@copilotkit/react-core/v2` |

**Source:** [Migrate to V2](https://docs.copilotkit.ai/aws-strands/troubleshooting/migrate-to-v2)

### Required Correct Imports

```tsx
// Provider + Components all from ONE package
import { CopilotKitProvider, CopilotSidebar } from '@copilotkit/react-core/v2';
// Styles
import '@copilotkit/react-core/v2/styles.css';
// Hook for custom access
import { useAgent } from '@copilotkit/react-core/v2';
```

### Decision Update Needed

CONTEXT.md D-05 and D-08 should be updated:
- D-05: Only `@copilotkit/react-core/v2` is needed (no separate `react-ui` package)
- D-08: Styles come from `@copilotkit/react-core/v2/styles.css`

---

## 2. Backend Strategy (Blocking Decision)

### Problem

CopilotKit requires a `runtimeUrl` — an HTTP endpoint running `CopilotRuntime`. Tauri desktop apps don't have a built-in server. Phase 2 has no Python Agent (Phase 3) or Go Server (Phase 8) yet.

### Options Evaluated

| Option | Pros | Cons | Verdict |
|---|---|---|---|
| **A: Tauri embedded HTTP server** | Real agent in Rust | Heavy, complex, Phase 2 shouldn't do Rust HTTP | Reject |
| **B: Express/Hono server as sidecar** | Full CopilotRuntime | Extra process, build complexity, dev setup | Defer to Phase 4 |
| **C: CopilotKitProvider with placeholder URL** | UI works, renders components | No actual Agent, all messages error | **Accept for Phase 2** |
| **D: Mock agent via service worker** | Simulates responses | Complexity, browser-only API | Reject |

### Recommended: Option C — Placeholder Runtime

Phase 2 focuses on **UI infrastructure** — the CopilotKit component tree, Zustand chat store, conversation management, and virtual scrolling. The runtimeUrl is set to a reserved URL (e.g., `http://localhost:9876/copilotkit`) that will be provided by Phase 4.

**What works without a real backend:**
- CopilotSidebar renders and opens/closes
- Input box accepts text, messages are stored in Zustand store
- Conversation list works (localStorage persistence)
- Welcome page and suggestion cards render
- Virtual scrolling works with stored messages

**What doesn't work (deferred to Phase 4):**
- Actual Agent responses
- Streaming token-by-token from LLM
- Tool calls and generative UI

**Implementation:**
- Wrap `<CopilotKitProvider runtimeUrl="http://localhost:9876/copilotkit">` 
- Catch connection errors gracefully (show "Agent not available" state)
- Store user messages in Zustand store as "pending" until Agent responds
- Phase 4 replaces with real runtimeUrl

**This updates CONTEXT.md D-06:** BuiltInAgent + InMemoryAgentRunner is not feasible client-side in Tauri. Use placeholder runtimeUrl instead.

---

## 3. Package Dependencies

### New Production Dependencies

```json
{
  "@copilotkit/react-core": "^1.59.0",  // v2 API via /v2 subpath
  "react-virtuoso": "^4.17.0"            // virtual scrolling (open-source)
}
```

### NOT needed (Phase 2)

```json
{
  "@copilotkit/runtime",  // needs server — Phase 4
  "@copilotkitnext/agent", // BuiltInAgent needs Runtime — Phase 4
  "@copilotkit/react-ui"   // merged into react-core in v2
}
```

### Package Size Note

`react-virtuoso`: ~17KB bundle (open-source MIT, NOT the commercial `@virtuoso.dev/message-list`). The main `react-virtuoso` package provides `Virtuoso` component with `followOutput`, `initialTopMostItemIndex`, `atBottomStateChange` — all needed for chat messages.

---

## 4. React-Virtuoso Integration

### Component API (relevant subset)

```tsx
import { Virtuoso } from 'react-virtuoso';

<Virtuoso
  data={messages}
  itemContent={(index, message) => <MessageBubble message={message} />}
  followOutput="smooth"           // auto-scroll on new message
  initialTopMostItemIndex={messages.length - 1}  // start at bottom
  atBottomStateChange={(atBottom) => { /* "scroll to bottom" button visibility */ }}
  components={{
    Header: () => <DateDivider label="Today" />,  // time grouping
    Footer: () => <LoadingIndicator />
  }}
/>
```

### Key Features
- `followOutput="smooth"` — auto-scrolls when new messages arrive (handles streaming case)
- `initialTopMostItemIndex` — starts viewport at bottom (latest messages)
- `components.Header` — date separators for time grouping (D-26)
- `atBottomStateChange` — shows "scroll to bottom" button when user scrolls up
- Dynamic item heights — no pre-measuring needed (critical for variable-length chat messages)
- ~2.1M weekly downloads, actively maintained

### Integration with CopilotSidebar

The CopilotSidebar uses CopilotChat internally, which renders messages. To add virtual scrolling, use CopilotChat's `messageView` slot via the Slots system:

```tsx
<CopilotSidebar
  messageView={{
    components: {
      MessageList: VirtualScroller,  // replace message list with Virtuoso
    }
  }}
/>
```

**Risk:** Need to verify exact slot name during implementation (may be `messageList` or `messages`). If the slot system doesn't expose the right level, fallback to fully custom `children` render function.

---

## 5. Zustand Chat Store Design

### Store Structure

```typescript
interface ChatStore {
  // Conversation management
  conversations: Conversation[];
  currentThreadId: string | null;
  
  // Conversation CRUD
  createConversation: () => string;
  deleteConversation: (id: string) => void;
  setCurrentThreadId: (id: string | null) => void;
  updateConversationTitle: (id: string, title: string) => void;
  
  // Messages (local cache, synced via useAgent in Phase 4)
  setMessages: (threadId: string, messages: Message[]) => void;
}

interface Conversation {
  id: string;          // UUID
  threadId: string;    // CopilotKit threadId (reserved)
  title: string;       // editable, default "新对话 #{N}" until first message
  createdAt: number;   // Date.now()
  lastMessage: string; // preview text
  messageCount: number;
}
```

### Persistence

Use Zustand `persist` middleware with `localStorage` — consistent with Theme store pattern (`apps/desktop/src/stores/theme.ts`).

### ID Generation

Use `crypto.randomUUID()` (available in Tauri webview) for conversation IDs. Thread IDs follow same pattern for CopilotKit compatibility.

---

## 6. Tauri Security & Permissions

### CSP Considerations

CopilotKit talks to `runtimeUrl` via HTTP/SSE. Tauri's CSP needs to allow:
- `connect-src http://localhost:9876` (placeholder runtime URL)
- `connect-src https://*.copilotkit.ai` (if using Copilot Cloud in future)

Update `tauri.conf.json`:
```json
{
  "app": {
    "security": {
      "csp": "default-src 'self'; connect-src 'self' http://localhost:* https://*.copilotkit.ai; style-src 'self' 'unsafe-inline'"
    }
  }
}
```

The `'self'` covers `tauri://localhost` and `ipc://localhost`. Add `http://localhost:*` for local agent (Phase 4). Add `https://*.copilotkit.ai` for Copilot Cloud.

---

## 7. Implementation Waves (Draft)

Based on research, Phase 2 breaks into these natural waves:

| Wave | Focus | Key Tasks |
|------|-------|-----------|
| W1 | CopilotKit Setup | Install packages, CopilotKitProvider wrapper, styles import, CSP |
| W2 | Sidebar Integration | CopilotSidebar in App, toggle button in Titlebar, layout |
| W3 | Chat Store | Zustand chat store with persist, conversation CRUD |
| W4 | Welcome Page | Welcome component with branding, "New Chat" button, suggestion cards |
| W5 | Conversation Management | Conversation list UI, tab selector, create/switch/delete |
| W6 | Message Display | Message rendering, time grouping, react-virtuoso integration |
| W7 | Polish | Dark mode slots, error states, empty states, manual verification |

---

## 8. Risks & Mitigations

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| CopilotSidebar slot system doesn't expose message list for Virtuoso | Medium | Medium | Fallback to `children` render function; worst case skip Virtuoso in W6 |
| CSP blocks CopilotKit requests | Low | High | Configure CSP before any CopilotKit code |
| `@copilotkit/react-core/v2` version breaking changes | Medium | Medium | Lock to specific version, upgrade in Phase 4 |
| No real agent = limited demo value | High | Low | Accept as Phase 2 scope limitation; focus on UI quality |

---

## 9. Recommendation

**Proceed with planning.** Core architectural decisions are clear:
1. Update imports to CopilotKit v2 unified `@copilotkit/react-core/v2`
2. Use placeholder runtimeUrl (no actual Agent in Phase 2)
3. `react-virtuoso` (open-source) for virtual scrolling
4. Zustand persist for conversation management
5. CopilotKit slots for dark mode customization

Phase 2 delivers a **fully functional chat UI** — open/close sidebar, manage conversations, type messages, see them rendered with virtual scrolling. Agent responses come in Phase 4.

---

## RESEARCH COMPLETE

*Phase: 02-Chat UI*
*Research completed: 2026-06-14*

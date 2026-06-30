# Phase 07: HITL + Sidecar (7a: HITL + Computer Use) - Pattern Map

**Mapped:** 2026-07-01
**Files analyzed:** 13 (5 modified + 8 new)
**Analogs found:** 12 / 13

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `apps/agent/src/agent/paladin_agent.py` | agent-factory | config-driven | `apps/agent/src/agent/paladin_agent.py` (self) | exact |
| `apps/agent/config/config.json` | config | file-I/O | `apps/agent/config/config.json` (self) | exact |
| `apps/agent/pyproject.toml` | config | file-I/O | `apps/agent/pyproject.toml` (self) | exact |
| `apps/agent/src/server/main.py` | controller | streaming + request-response | `apps/agent/src/server/main.py` (existing /copilotkit SSE + /health endpoints) | exact |
| `apps/agent/src/agent/hitl.py` | service | event-driven (asyncio.Event) | `apps/agent/src/agent/paladin_agent.py:_load_mcp_servers()` (module-level factory + global state) | role-match |
| `apps/agent/src/agent/computer_use.py` | service | request-response (tool invocation) | RESEARCH.md §4.2 (@tool decorator pattern) | partial (no existing @tool in repo) |
| `apps/desktop/src/App.tsx` | component | request-response | `apps/desktop/src/App.tsx` (self + `useAgentHealth` hook import pattern) | exact |
| `apps/desktop/src/components/ChatToolbar.tsx` | component | event-driven | `apps/desktop/src/components/ChatToolbar.tsx` (self — existing section structure) | exact |
| `apps/desktop/src/components/approval/ApprovalBridge.tsx` | hook-component | event-driven (SSE subscription) | `apps/desktop/src/hooks/useAgentHealth.ts` (fetch + state hook) + `ChatToolbar.tsx` (store-driven component) | role-match |
| `apps/desktop/src/components/approval/ApprovalCard.tsx` | component | event-driven (user interaction) | `apps/desktop/src/components/diff/DiffMessageCard.tsx` (chat-embedded card) | role-match |
| `apps/desktop/src/components/approval/ApprovalDialog.tsx` | component | event-driven | `apps/desktop/src/components/ui/alert-dialog.tsx` (shadcn wrapper) | exact |
| `apps/agent/tests/test_hitl.py` | test | — | `apps/agent/tests/test_server.py` (FastAPI TestClient + pytest classes) | exact |
| `apps/agent/tests/test_computer_use.py` | test | — | `apps/agent/tests/test_tools.py` (tool tests with `tmp_path` + `patch.dict`) | exact |

## Pattern Assignments

---

### `apps/agent/src/agent/paladin_agent.py` (agent-factory, config-driven)

**Analog:** `apps/agent/src/agent/paladin_agent.py` lines 239-350 (`create_paladin_agent()`)

**Existing config parsing pattern** (lines 264-271):
```python
    # 加载 JSON 完整配置
    config_file = Path(models_config_path)
    try:
        raw_config = json.loads(config_file.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        raise ValueError(f"模型配置 JSON 解析失败: {e}") from e
```

**Existing toolset loading pattern (analog for HITL config)** (lines 284-308):
```python
    # 按需加载 MCP 服务器
    mcp_toolsets = _load_mcp_servers(raw_config)

    # 使用 pydantic-deep 创建 Agent，集成全部内建工具集 (D-01, D-02, D-04)
    agent = create_deep_agent(
        model=primary_model,
        system_prompt=instructions,
        include_todo=True,
        include_filesystem=True,
        # ... more kwargs ...
        mcp_servers=mcp_toolsets if mcp_toolsets else None,
        backend=backend,
    )
```

**New code insertion point** (after `mcp_toolsets` load, before `create_deep_agent()` call, ~line 308):
The new HITL config parsing and ToolGuard creation should be inserted between the MCP loading and the `create_deep_agent()` call, following the same pattern: read from `raw_config` → validate/warn → pass to `create_deep_agent(capabilities=[guard])`.

**Existing attr patching pattern (for _sse_queue injection)** (lines 326-327):
```python
    agent._default_deps = create_default_deps(backend=backend)  # type: ignore[attr-defined]
    agent._model_configs = model_configs  # type: ignore[attr-defined]
```
New: `agent._hitl_sse_queue = asyncio.Queue()` following identical pattern.

**Existing warning logging pattern** (from `_load_mcp_servers` line 234):
```python
        except Exception as e:
            logger.warning("mcp_server_unavailable name=%s error=%s", entry.get("name", "unknown"), e)
```
New HITL config validation should follow same structured warning format.

---

### `apps/agent/config/config.json` (config, file-I/O)

**Analog:** `apps/agent/config/config.json` lines 1-42 (existing structure)

**Existing structure to extend:**
```json
{
  "models": [
    {
      "id": "deepseek-v4-pro",
      "provider": "deepseek",
      "model_id": "deepseek-v4-pro",
      "api_base": "https://api.deepseek.com/v1",
      "api_key": "$DEEPSEEK_API_KEY",
      "priority": 1,
      "params": {
        "temperature": 0.3,
        "max_tokens": 8192
      }
    }
  ],
  "mcp_servers": []
}
```

New `"hitl"` key goes after `"mcp_servers"` at the same level, following the same 2-space indentation convention.

---

### `apps/agent/pyproject.toml` (config, file-I/O)

**Analog:** `apps/agent/pyproject.toml` lines 10-22 (dependencies list)

**Pattern to follow for adding pyautogui:**
```toml
dependencies = [
    "fastapi>=0.136.3",
    # ... existing ...
    "uvicorn>=0.49.0",
    "pyautogui>=0.9.54",     # NEW: added alphabetically within block
]
```

---

### `apps/agent/src/server/main.py` (controller, streaming + request-response)

**Analog:** `apps/agent/src/server/main.py` lines 89-106 (`/copilotkit` SSE endpoint) + lines 108-123 (`/health` endpoint)

**Existing SSE endpoint import pattern** (lines 1-16):
```python
"""
Paladin Agent — FastAPI HTTP Server
提供 /copilotkit (AG-UI SSE) 和 /health 端点
"""
import logging
import os
from pathlib import Path

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response

from pydantic_ai.ag_ui import handle_ag_ui_request
```

New imports needed: `from starlette.responses import StreamingResponse` (adjacent to existing `JSONResponse, Response` import).

**Existing endpoint function pattern** (lines 108-123):
```python
@app.get("/health")
async def health():
    """
    健康检查端点
    
    返回 Agent 状态和可用模型信息。
    
    Returns:
        JSON: {"status": "ok", "agent": "paladin-agent", "models": [...]}
    """
    fallback = get_fallback_models(agent)
    model_ids = [config.id for config, _ in fallback]

    return JSONResponse({
        "status": "ok",
        "agent": "paladin-agent",
        "models": model_ids,
    })
```

**Pattern for new endpoints:**
- Use `JSONResponse` for structured JSON returns (same as `/health`, `/info`, `/copilotkit/info`)
- Use `StreamingResponse` with `media_type="text/event-stream"` for SSE (new pattern)
- Pydantic model for POST body validation (new: `from pydantic import BaseModel`)
- Docstring format: 1-line summary + blank line + multi-line description + `Returns:` / `Args:`
- Prefix route with `/approval` for the new HITL endpoints

**Key pattern for POST endpoint** (follows `/copilotkit` POST patterns — use `Request` param + return `Response`):
```python
@app.post("/copilotkit")
async def copilotkit_endpoint(request: Request) -> Response:
```
New: `@app.post("/approval/{request_id}")` with path parameter.

---

### `apps/agent/src/agent/hitl.py` (service, event-driven)

**Analog:** `apps/agent/src/agent/paladin_agent.py:_load_mcp_servers()` lines 138-235 (module-level function, global state pattern)

**Module-level state pattern:**
```python
# paladin_agent.py is a module with functions (not a class)
# Global state is module-level variables
logger = logging.getLogger(__name__)
```

New `hitl.py` will have: `_pending_approvals`, `_pending_decisions`, `_sse_queue` as module-level globals, same as how `paladin_agent.py` uses `logger` at module level.

**Logging pattern** (from `paladin_agent.py` line 22):
```python
logger = logging.getLogger(__name__)
```

**Type annotation pattern** (from `paladin_agent.py` line 7-11):
```python
from typing import Optional
```
New: `from typing import Any` for `dict[str, Any]` signatures.

**async function pattern** (from `_load_mcp_servers` which is sync, but pydantic-ai patterns):
```python
async def callback(tool_name: str, args: dict[str, Any]) -> bool:
```
Follows pydantic-ai async coroutine pattern.

---

### `apps/agent/src/agent/computer_use.py` (service, tool-functions)

**Analog:** RESEARCH.md §4.2 (@tool decorator pattern — no existing @tool in repo)

This is a **no-close-analog** case. The codebase has no existing `@tool` decorated functions. The pattern comes from the pydantic-ai library itself.

**Pattern from RESEARCH.md** (RESEARCH.md lines ~460-530):
```python
from pydantic_ai import RunContext, tool

@tool
async def computer_screenshot(ctx: RunContext) -> str:
    """截取当前屏幕截图，返回 base64 编码的 PNG 图像。"""
    try:
        import pyautogui
    except ImportError:
        return "Error: pyautogui 未安装。"
    # ... implementation ...
```

**Import convention** (from `paladin_agent.py`):
```python
from pydantic_ai import Agent                    # from paladin_agent.py line 17
from pydantic_ai.models.openai import OpenAIChatModel  # line 18
```
New: `from pydantic_ai import RunContext, tool` (parallel import style).

**Error return pattern** — tools return error strings rather than raising exceptions:
```python
return "Error: pyautogui 未安装。请在 macOS 上运行 pip install pyautogui。"
```

---

### `apps/desktop/src/App.tsx` (component, request-response)

**Analog:** `apps/desktop/src/App.tsx` lines 1-200 (self — import + hook registration + provider wrapping pattern)

**Existing import pattern** (lines 12-19):
```typescript
import { useAgentHealth } from '@/hooks/useAgentHealth';
import { useTerminalStore } from '@/stores/terminal';
```
New: `import { useApprovalBridge } from '@/components/approval/ApprovalBridge';` (same `@/` path alias + named import pattern).

**Existing hook usage pattern** (line 44):
```typescript
const { isOnline, isLoading, error, retry } = useAgentHealth();
```
New: `useApprovalBridge()` (no destructuring needed if hook is self-contained).

**Integration point** — inside the `<CopilotKitProvider>` wrapper (lines 187+), likely before `<ChatArea>` or as a sibling wrapper component. Follow existing component nesting pattern.

---

### `apps/desktop/src/components/ChatToolbar.tsx` (component, event-driven)

**Analog:** `apps/desktop/src/components/ChatToolbar.tsx` lines 1-107 (self — existing section structure)

**Existing section structure:**
1. Lines 59-72: Context info section (`<div className="p-3 border-b border-border">`)
2. Lines 74-92: Tool calls section (`<div className="p-3 border-b border-border flex-1 overflow-auto">`)
3. Lines 94-102: Actions section (`<div className="p-3 border-t border-border">`)

**Pattern for new approval status section** (insert between context section and tool calls section, ~line 73):
```tsx
<div className="p-3 border-b border-border">
  <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground mb-2">
    <Clock className="size-3.5" />
    <span>审批状态</span>
  </div>
  {/* conditional rendering based on approval state */}
</div>
```

**Existing icon import pattern** (line 8):
```typescript
import { Eraser, Info, Wrench } from 'lucide-react';
```
New: `import { Clock } from 'lucide-react';` (for approval status icon).

**Store usage pattern** (lines 35-36):
```typescript
const currentThreadId = useChatStore((s) => s.currentThreadId);
const createConversation = useChatStore((s) => s.createConversation);
```
New: import from a new approval store or use prop drilling from ApprovalBridge.

---

### `apps/desktop/src/components/approval/ApprovalBridge.tsx` (hook-component, event-driven)

**Analog:** `apps/desktop/src/hooks/useAgentHealth.ts` lines 1-70 (hook pattern) + `ChatToolbar.tsx` (component using stores)

**Hook import pattern** (from `useAgentHealth.ts` lines 1-7):
```typescript
import { useCallback, useEffect, useState } from 'react';
```

**State management pattern** (from `useAgentHealth.ts` lines 30-34):
```typescript
const [state, setState] = useState<AgentHealthState>({
    isOnline: false,
    isLoading: true,
    error: null,
});
```
New: `useState<ApprovalRequest[]>([])` for the pending approvals queue.

**useEffect + fetch pattern** (from `useAgentHealth.ts` lines 39-60):
```typescript
const checkHealth = useCallback(async () => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await fetch('http://localhost:9876/health');
      if (response.ok) {
        setState({ isOnline: true, isLoading: false, error: null });
      } else {
        setState({ isOnline: false, isLoading: false, error: 'Agent 服务异常' });
      }
    } catch {
      setState({ isOnline: false, isLoading: false, error: '无法连接到 Agent 服务，请先启动 Agent' });
    }
}, []);
```
New: SSE `EventSource` or `fetch` with `ReadableStream` for `/approval/stream` endpoint, plus `POST /approval/{id}` for callback.

**Component export pattern** (from `ChatToolbar.tsx` line 38):
```typescript
export function ChatToolbar() {
```

**CSS class pattern** (from `ChatToolbar.tsx`):
```typescript
className="border-l border-border/50 flex-shrink-0 bg-background/50"
```
Uses Tailwind utility classes + CSS variables.

---

### `apps/desktop/src/components/approval/ApprovalCard.tsx` (component, event-driven)

**Analog:** `apps/desktop/src/components/diff/DiffMessageCard.tsx` lines 1-100 (chat-embedded card)

**Props interface pattern** (from `DiffMessageCard.tsx` lines 14-19):
```typescript
interface DiffMessageCardProps {
  rawDiff: string;
  fileName: string;
  language?: string;
}
```
New:
```typescript
interface ApprovalCardProps {
  toolName: string;
  args: Record<string, unknown>;
  onApprove: () => void;
  onDeny: () => void;
}
```

**Component function pattern** (from `DiffMessageCard.tsx` line 21):
```typescript
export function DiffMessageCard({ rawDiff, fileName, language }: DiffMessageCardProps) {
```

**Card container pattern** (from `DiffMessageCard.tsx` lines 52-56):
```typescript
<div className="border border-border rounded-lg overflow-hidden my-2 px-3 py-2 bg-muted text-sm text-muted-foreground">
  二进制文件变更
</div>
```
New: approval card with action buttons, following same border/rounded/overflow conventions.

**Button pattern** (from `DiffMessageCard.tsx` lines 62-63):
```typescript
<button
  type="button"
  className="w-full flex items-center gap-2 px-3 py-2 bg-muted hover:bg-muted/70 transition-colors text-left"
```
New: approve/deny buttons following same interactive styling.

**State hook pattern** (from `DiffMessageCard.tsx` line 21):
```typescript
import { useMemo, useState } from 'react';
```

---

### `apps/desktop/src/components/approval/ApprovalDialog.tsx` (component, event-driven)

**Analog:** `apps/desktop/src/components/ui/alert-dialog.tsx` lines 1-80 (shadcn AlertDialog wrapper)

**Import pattern** (from `alert-dialog.tsx` lines 1-5):
```typescript
import { AlertDialog as AlertDialogPrimitive } from '@base-ui/react/alert-dialog';
import type * as React from 'react';
import { buttonVariants } from '@/components/ui/button';
import { cn } from '@/lib/utils';
```

**Usage pattern** — Using AlertDialog composable components:
```tsx
<AlertDialog open={isOpen} onOpenChange={setIsOpen}>
  <AlertDialogTrigger />
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>审批请求</AlertDialogTitle>
      <AlertDialogDescription>
        Agent 请求执行 {toolName}
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel onClick={onDeny}>拒绝</AlertDialogCancel>
      <AlertDialogAction onClick={onApprove}>批准</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Component export pattern:**
```typescript
export function ApprovalDialog({ ... }) {
```

---

### `apps/agent/tests/test_hitl.py` (test)

**Analog:** `apps/agent/tests/test_server.py` lines 1-70 (FastAPI TestClient + pytest class pattern)

**Test file header + imports** (from `test_server.py` lines 1-10):
```python
"""
AG-UI Server 测试套件
测试 /health 和 /copilotkit 端点
"""
import os
from unittest.mock import patch

import pytest
```

**Test class pattern** (from `test_server.py` lines 14-29):
```python
class TestHealthEndpoint:
    """测试 GET /health"""

    def test_health_returns_200_and_json(self):
        """/health 返回 200 状态码和有效 JSON"""
        with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
            from src.server.main import app
            from fastapi.testclient import TestClient

            client = TestClient(app)
            response = client.get("/health")

            assert response.status_code == 200
            data = response.json()
            assert data["status"] == "ok"
```

**Key test patterns:**
- `patch.dict(os.environ, {...})` for env vars
- `TestClient(app)` from fastapi.testclient
- Assert on `response.status_code` and `response.json()`
- pytest class grouping: `class TestSomething:`

---

### `apps/agent/tests/test_computer_use.py` (test)

**Analog:** `apps/agent/tests/test_tools.py` lines 1-150 (tool tests with `tmp_path` + `patch.dict`)

**Fixture pattern** (from `test_tools.py` lines 14-28):
```python
def write_config_json(tmpdir: Path, data: dict) -> Path:
    """写入临时 config.json"""
    path = tmpdir / "config.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return path


def make_model_config(**kwargs) -> dict:
    """创建模型配置字典的快捷函数"""
    defaults = {
        "id": "test-flash",
        "provider": "openai",
        # ...
    }
    defaults.update(kwargs)
    return defaults
```

**Test function with tmp_path** (from `test_tools.py` lines 70-87):
```python
def test_agent_filesystem_read_write(self, tmp_path):
    """Agent 可读取/写入 workspace 内文件"""
    config_json = write_config_json(tmp_path, {"models": [make_model_config()]})
    prompt_md = tmp_path / "system.md"
    prompt_md.write_text("You are helpful.")
    ws_dir = tmp_path / "workspace"
    ws_dir.mkdir()
    # ...
    with patch.dict(os.environ, {"TEST_API_KEY": "fake-key"}):
        from src.agent.paladin_agent import create_paladin_agent
        agent = create_paladin_agent(...)
        assert agent is not None
```

**Mock pattern for pyautogui** — use `unittest.mock.patch` to mock `pyautogui.screenshot`, `pyautogui.click`, `pyautogui.typewrite` (consistent with existing `patch.dict` usage in test_tools.py line 5: `from unittest.mock import patch, MagicMock`).

---

## Shared Patterns

### Authentication / CORS
**Source:** `apps/agent/src/server/main.py` lines 36-45
**Apply to:** New `/approval/stream` and `POST /approval/{request_id}` endpoints

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:1420",  # Tauri dev
        "http://localhost:5173",  # Vite dev
        "tauri://localhost",      # Tauri production
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```
New endpoints are automatically covered by the existing CORS middleware — no changes needed.

### Error Handling
**Source:** `apps/agent/src/server/main.py` — `JSONResponse` pattern
**Apply to:** `POST /approval/{request_id}` (404 case)

```python
return JSONResponse(
    {"error": "request_id not found or already resolved"},
    status_code=404,
)
```

### Logger Configuration
**Source:** `apps/agent/src/agent/paladin_agent.py` line 22 + `apps/agent/src/server/main.py` line 16
**Apply to:** `hitl.py`, `computer_use.py`

```python
# In agent modules:
import logging
logger = logging.getLogger(__name__)

# In server modules:
import structlog
logger = structlog.get_logger(__name__)
```

### Structured Logging
**Source:** `apps/agent/src/agent/paladin_agent.py` line 234 (`_load_mcp_servers`)
**Apply to:** `hitl.py` approval_callback

```python
logger.warning(
    "mcp_server_unavailable name=%s error=%s",
    entry.get("name", "unknown"), e,
)
```
New: Use same `logger.warning("hitl_timeout request_id=%s tool=%s timeout=%ds", ...)` format.

### shadcn Utility
**Source:** `apps/desktop/src/lib/utils.ts`
**Apply to:** All new desktop components

```typescript
import { cn } from '@/lib/utils';
```

### Store Pattern
**Source:** `apps/desktop/src/stores/chat.ts` (zustand store — observed in imports from ChatToolbar.tsx line 7)
**Apply to:** ApprovalBridge state management

```typescript
import { useChatStore } from '@/stores/chat';
// Pattern: import useXStore from '@/stores/<name>';
// Pattern: const value = useXStore((s) => s.someProperty);
```

### FastAPI TestClient Pattern
**Source:** `apps/agent/tests/test_server.py` lines 20-29
**Apply to:** All new test files

```python
with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
    from src.server.main import app
    from fastapi.testclient import TestClient
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
```

## No Analog Found

Files with no close match in the codebase (planner should use RESEARCH.md patterns instead):

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `apps/agent/src/agent/computer_use.py` | service (tool functions) | request-response | No existing @tool decorated functions in the codebase. Pattern comes from pydantic-ai library documentation. RESEARCH.md §4.2 provides the canonical pattern. |

## Metadata

**Analog search scope:**
- `apps/agent/src/agent/` (2 files scanned)
- `apps/agent/src/server/` (1 file scanned)
- `apps/agent/config/` (1 file scanned)
- `apps/agent/tests/` (5 files scanned)
- `apps/desktop/src/` (App.tsx + all components + hooks + stores + lib)
- `.planning/phases/07-hitl-sidecar/07-RESEARCH.md` (research patterns)

**Files scanned:** 18
**Pattern extraction date:** 2026-07-01

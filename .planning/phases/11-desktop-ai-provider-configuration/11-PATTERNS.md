# Phase 11: desktop-ai-provider-configuration - Pattern Map

**Mapped:** 2026-07-13  
**Files analyzed:** 35  
**Analogs found:** 32 / 35

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `apps/agent/src/agent/provider_runtime.py` | service | request-response | `apps/agent/src/agent/paladin_agent.py` | role-match |
| `apps/agent/src/server/provider_routes.py` | route | request-response | `apps/agent/src/server/main.py` | exact |
| `apps/agent/src/server/main.py` | controller | request-response/streaming | `apps/agent/src/server/main.py` | exact |
| `apps/agent/src/agent/paladin_agent.py` | service | request-response | `apps/agent/src/agent/paladin_agent.py` | exact |
| `apps/agent/tests/test_provider_runtime.py` | test | request-response | `apps/agent/tests/test_agent.py` | role-match |
| `apps/agent/tests/test_server.py` | test | request-response/streaming | `apps/agent/tests/test_server.py` | exact |
| `apps/agent/tests/test_agent.py` | test | transform/request-response | `apps/agent/tests/test_agent.py` | exact |
| `apps/desktop/src-tauri/src/ai_provider/mod.rs` | service/route | CRUD/request-response | `apps/desktop/src-tauri/src/process/commands.rs` | role-match |
| `apps/desktop/src-tauri/src/ai_provider/types.rs` | model | CRUD/transform | `apps/desktop/src-tauri/src/process/config.rs` | role-match |
| `apps/desktop/src-tauri/src/ai_provider/storage.rs` | service | file-I/O/CRUD | `apps/desktop/src-tauri/src/process/config.rs` | role-match |
| `apps/desktop/src-tauri/src/ai_provider/bootstrap.rs` | utility | transform/file-I/O | `apps/desktop/src-tauri/src/process/supervisor.rs` | partial |
| `apps/desktop/src-tauri/src/ai_provider/*_tests.rs` | test | file-I/O/CRUD | `apps/desktop/src-tauri/src/process/config_tests.rs` | role-match |
| `apps/desktop/src-tauri/src/process/supervisor.rs` | service | event-driven/process I/O | `apps/desktop/src-tauri/src/process/supervisor.rs` | exact |
| `apps/desktop/src-tauri/src/process/log_redact.rs` | utility | transform | `apps/desktop/src-tauri/src/process/log_redact.rs` | exact |
| `apps/desktop/src-tauri/src/process/log_redact_tests.rs` | test | transform | `apps/desktop/src-tauri/src/process/log_redact_tests.rs` | exact |
| `apps/desktop/src-tauri/src/lib.rs` | config/provider | request-response/event-driven | `apps/desktop/src-tauri/src/lib.rs` | exact |
| `apps/desktop/src/lib/tauri-commands.ts` | utility | request-response | `apps/desktop/src/lib/tauri-commands.ts` | exact |
| `apps/desktop/src/stores/aiProvider.ts` | store | request-response/event-driven | `apps/desktop/src/stores/process.ts` | role-match |
| `apps/desktop/src/stores/terminal.ts` | store | UI state | `apps/desktop/src/stores/terminal.ts` | exact |
| `apps/desktop/src/components/provider/AiProviderPanel.tsx` | component | CRUD/request-response | `apps/desktop/src/components/layout/RightPanel.tsx` | partial |
| `apps/desktop/src/components/layout/RightPanel.tsx` | component | UI state/event-driven | `apps/desktop/src/components/layout/RightPanel.tsx` | exact |
| `apps/desktop/src/components/ChatArea.tsx` | component | request-response | `apps/desktop/src/components/ChatArea.tsx` | exact |
| `apps/desktop/src/components/StatusBar/AiProviderLight.tsx` | component | request-response/event-driven | `apps/desktop/src/components/StatusBar/ProcessLight.tsx` | role-match |
| `apps/desktop/src/components/StatusBar.tsx` | component | UI composition | `apps/desktop/src/components/StatusBar.tsx` | exact |
| `apps/desktop/src/App.tsx` | provider/root component | request-response | `apps/desktop/src/App.tsx` | exact |
| `apps/desktop/src/components/provider/__tests__/*.test.tsx` | test | UI event-driven | `apps/desktop/src/components/StatusBar/__tests__/ProcessLight.test.tsx` | role-match |
| `apps/desktop/src/stores/__tests__/aiProvider.test.ts` | test | store CRUD | `apps/desktop/src/stores/__tests__/chat.test.ts` | role-match |
| `README.md` | docs | transform | `README.md` | exact |
| `docs/packaging.md` | docs | transform | `docs/packaging.md` | exact |
| `scripts/launch-paladin-macos.sh` | script | env bootstrap | `scripts/launch-paladin-macos.sh` | exact |
| `scripts/test-launch-paladin-macos.sh` | test | env bootstrap | `scripts/test-launch-paladin-macos.sh` | exact |

## Pattern Assignments

### `apps/agent/src/server/provider_routes.py` and `apps/agent/src/server/main.py`

**Analog:** `apps/agent/src/server/main.py`

**Imports and FastAPI app pattern** (lines 5-18):
```python
import json
import os
from pathlib import Path

import structlog
from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import JSONResponse, Response

from pydantic_ai.ui.ag_ui import AGUIAdapter

from ..agent.paladin_agent import create_paladin_agent
from .cli import dotenv_enabled
```

**Endpoint pattern** (lines 74-93):
```python
@app.get("/copilotkit/info")
async def copilotkit_info():
    return JSONResponse({
        "agents": [
            {
                "name": "default",
                "description": "Paladin AI 编程助手",
                "type": "ag-ui",
            }
        ]
    })
```

**Streaming dispatch pattern to preserve** (lines 96-124):
```python
@app.post("/copilotkit")
async def copilotkit_endpoint(request: Request) -> Response:
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"detail": "Invalid JSON body"}, status_code=422)

    async def receive_once():
        return {
            "type": "http.request",
            "body": json.dumps(body).encode("utf-8"),
            "more_body": False,
        }

    replay_request = Request(request.scope, receive_once)
    return await AGUIAdapter.dispatch_request(
        request=replay_request,
        agent=agent,
        deps=getattr(agent, '_default_deps', None),
    )
```

**Health JSON pattern** (lines 127-144):
```python
@app.get("/health")
async def health():
    model_configs = getattr(agent, "_model_configs", [])
    model_ids = [config.id for config in model_configs]

    return JSONResponse({
        "status": "ok",
        "agent": "paladin-agent",
        "models": model_ids,
    })
```

Planner notes:
- Keep `JSONResponse` style and explicit 422 on invalid JSON.
- New provider endpoints should be small FastAPI handlers that call a runtime object, not write persisted config.
- Refactor lines 58-66 module-import agent creation so no-key import can succeed; health must report AI readiness separately.

### `apps/agent/src/agent/provider_runtime.py` and `apps/agent/src/agent/paladin_agent.py`

**Analog:** `apps/agent/src/agent/paladin_agent.py`

**Dataclass DTO pattern** (lines 12-43):
```python
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional

@dataclass
class ModelConfig:
    id: str
    provider: str
    model_id: str
    api_base: str
    api_key: str
    priority: int
    params: dict = field(default_factory=dict)
```

**JSON load + validation pattern** (lines 81-115):
```python
config_file = Path(config_path)
if not config_file.exists():
    raise FileNotFoundError(f"模型配置文件不存在: {config_path}")

try:
    raw = json.loads(config_file.read_text(encoding="utf-8"))
except json.JSONDecodeError as e:
    raise ValueError(f"模型配置 JSON 解析失败: {e}") from e

required = ["id", "provider", "model_id", "api_base", "api_key", "priority"]
missing = [f for f in required if f not in entry]
if missing:
    raise ValueError(
        f"模型配置 '{entry.get('id', 'unknown')}' 缺少必需字段: {missing}"
    )
```

**Provider/model construction pattern to adapt** (lines 137-170):
```python
resolved_key = os.path.expandvars(config.api_key)
resolved_model = os.path.expandvars(config.model_id)

if config.provider == "deepseek":
    from openai import AsyncOpenAI
    custom_client = AsyncOpenAI(
        api_key=resolved_key,
        base_url="https://api.deepseek.com/v1",
    )
    provider = DeepSeekProvider(api_key=resolved_key, openai_client=custom_client)
elif config.provider == "openai":
    resolved_base = os.path.expandvars(config.api_base)
    provider = OpenAIProvider(base_url=resolved_base, api_key=resolved_key)
else:
    raise ValueError(f"不支持的 provider: {config.provider}")

return OpenAIChatModel(resolved_model, provider=provider)
```

Planner notes:
- Copy the dataclass and validation style, but make runtime snapshots immutable enough for snapshot-at-request-start semantics.
- Do not copy the hardcoded DeepSeek `base_url`; replace it with configured `api_base`.
- Secret-bearing runtime snapshot may hold raw key in memory, but read APIs and logs must use masked DTOs.

### Python tests

**Analogs:** `apps/agent/tests/test_server.py`, `apps/agent/tests/test_agent.py`

**Server TestClient pattern** (test_server.py lines 17-31):
```python
with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
    from src.server.main import app
    from fastapi.testclient import TestClient

    client = TestClient(app)
    response = client.get("/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
```

**AGUI dispatch monkeypatch pattern** (test_server.py lines 112-140):
```python
captured = {}

async def fake_dispatch_request(*, request, agent, deps):
    captured["request"] = request
    captured["agent"] = agent
    captured["deps"] = deps
    captured["body"] = await request.json()
    return Response("adapter-ok", status_code=202)

monkeypatch.setattr(main.AGUIAdapter, "dispatch_request", fake_dispatch_request)

client = TestClient(main.app)
response = client.post("/copilotkit", json={"messages": []})

assert response.status_code == 202
assert captured["body"] == {"messages": []}
```

**Agent temporary config pattern** (test_agent.py lines 35-54):
```python
def write_config_json(tmpdir: Path, data: dict) -> Path:
    path = tmpdir / "config.json"
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2))
    return path

def make_model_config(**kwargs) -> dict:
    defaults = {
        "id": "test-flash",
        "provider": "openai",
        "model_id": "test-model",
        "api_base": "https://api.test.com/v1",
        "api_key": "$TEST_API_KEY",
        "priority": 1,
        "params": {"temperature": 0.3, "max_tokens": 4096},
    }
    defaults.update(kwargs)
    return defaults
```

Planner notes:
- Add no-key startup tests using `patch.dict(os.environ, {}, clear=True)`.
- Add tests for `provider-not-configured` response without requiring network.
- Add tests that DeepSeek honors configured `api_base`.

### `apps/desktop/src-tauri/src/ai_provider/*` and command registration

**Analogs:** `apps/desktop/src-tauri/src/process/commands.rs`, `apps/desktop/src-tauri/src/process/config.rs`, `apps/desktop/src-tauri/src/lib.rs`

**Tauri command boundary** (commands.rs lines 12-20, 53-67):
```rust
use crate::process::supervisor::{
    ProcessName, ProcessStatusSnapshot, ProcessSupervisor, RuntimeConfig,
};
use tauri::State;

#[tauri::command]
pub async fn restart_agent(supervisor: State<'_, ProcessSupervisor>) -> Result<(), String> {
    supervisor.restart_one(ProcessName::Agent).await
}

#[tauri::command]
pub async fn get_runtime_config(
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<RuntimeConfig, String> {
    Ok(supervisor.runtime_config())
}
```

**Serde model pattern** (config.rs lines 17-29, 39-62):
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProcessConfig {
    pub mode: String,
    pub processes: HashMap<ProcessNameKey, ProcessEntry>,
    pub backoff_secs: Vec<u64>,
    pub max_restarts: u32,
    pub shutdown_grace_secs: u64,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub struct ProcessEntry {
    pub cmd: Vec<String>,
    pub cwd: Option<PathBuf>,
    pub env: HashMap<String, String>,
    pub port: u16,
    pub health: HealthConfig,
    pub startup_grace_secs: u64,
}
```

**Validation pattern** (config.rs lines 251-266):
```rust
for (name, entry) in &self.processes {
    if entry.cmd.is_empty() {
        return Err(format!("{name:?} cmd empty"));
    }
    if mode == RuntimeMode::Packaged {
        validate_packaged_entry(*name, entry)?;
    }
    if entry.port == 0 {
        return Err(format!("{name:?} port 0"));
    }
    validate_endpoint(*name, "liveness", &entry.health.liveness)?;
}
Ok(())
```

**State registration and invoke registration** (lib.rs lines 70-95):
```rust
tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
        greet,
        terminal::commands::spawn_terminal,
        restart_agent,
        stop_agent,
        get_process_status,
        get_runtime_config,
    ])
    .setup(|app| {
        app.manage(TerminalManager::new(app.handle().clone()));
```

Planner notes:
- Put provider commands in `ai_provider/mod.rs` or `ai_provider/commands.rs`, then import/register them in `lib.rs`.
- Manage an `AiProviderConfigManager` with `app.manage(...)`.
- Return `Result<MaskedProviderConfig, String>` or equivalent; never return raw `api_key`.
- Use `tokio::sync::Mutex` inside the manager for overlapping saves.

### Rust app-data storage and bootstrap

**Analog:** `apps/desktop/src-tauri/src/process/config.rs`, `apps/desktop/src-tauri/src/process/supervisor.rs`

**File/schema load error pattern** (config.rs lines 72-87):
```rust
#[derive(Debug)]
pub enum ConfigError {
    NotFound(PathBuf),
    IoError(std::io::Error),
    ParseError(serde_json::Error),
    InvalidSchema(String),
}
```

**Env allowlist pattern** (supervisor.rs lines 67-81):
```rust
const BUSINESS_ENV_ALLOWLIST: &[&str] = &[
    "DEEPSEEK_API_KEY",
    "PALADIN_PORT",
    "PALADIN_DATABASE_URL",
    "PALADIN_REDIS_URL",
    "PALADIN_JWT_SECRET",
    "PALADIN_JWT_TTL",
    "PALADIN_BCRYPT_COST",
    "PALADIN_ADMIN_EMAIL",
    "PALADIN_ADMIN_PASSWORD",
    "PALADIN_AUTO_MIGRATE",
    "PALADIN_QUOTA_LIMIT",
    "PALADIN_QUOTA_WINDOW",
    "LOGFIRE_PYDANTIC_RECORD",
];
```

**Env filtering pattern** (supervisor.rs lines 98-116):
```rust
pub(crate) fn environment_for_process(
    mode: RuntimeMode,
    parent: &HashMap<OsString, OsString>,
    configured: &HashMap<String, String>,
) -> HashMap<OsString, OsString> {
    let mut result = HashMap::new();
    for name in BUSINESS_ENV_ALLOWLIST.iter().chain(SYSTEM_ENV_ALLOWLIST) {
        let key = OsString::from(name);
        if let Some(value) = parent.get(&key).filter(|value| !value.is_empty()) {
            result.insert(key, value.clone());
        }
    }
    for (name, value) in configured {
        if !value.is_empty()
            && BUSINESS_ENV_ALLOWLIST.contains(&name.as_str())
            && name != "PALADIN_RUNTIME_MODE"
        {
            result.insert(OsString::from(name), OsString::from(value));
        }
    }
```

Planner notes:
- For bootstrap, copy non-empty env filtering and add `PALADIN_AI_PROVIDER`, `PALADIN_AI_BASE_URL`, `PALADIN_AI_API_KEY`, `PALADIN_AI_MODEL`.
- Env bootstrap should seed a clean app-data config and must not override after explicit user save.
- Storage tests should use tempfile like config tests, not real app data.

### Secret redaction

**Analog:** `apps/desktop/src-tauri/src/process/log_redact.rs`

**Central redaction pattern** (lines 20-30, 32-45):
```rust
use regex::Regex;
use std::sync::LazyLock;

pub const SECRET_PATTERNS: &[&str] = &[
    "DEEPSEEK_API_KEY",
    "JWT_SECRET",
    "PALADIN_JWT_SECRET",
    "Authorization",
    "password",
];

static DEEPSEEK_PATTERN: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"(?i)(DEEPSEEK_API_KEY\s*[=:]\s*)\S+").unwrap());
```

**Replace-all chain** (lines 52-68):
```rust
pub fn redact_log_line(line: &str) -> String {
    let mut s = DEEPSEEK_PATTERN
        .replace_all(line, "${1}[REDACTED]")
        .into_owned();
    s = JWT_SECRET_PATTERN
        .replace_all(&s, "${1}[REDACTED]")
        .into_owned();
    s = PALADIN_JWT_PATTERN
        .replace_all(&s, "${1}[REDACTED]")
        .into_owned();
    s = AUTHORIZATION_PATTERN
        .replace_all(&s, "${1}[REDACTED]")
        .into_owned();
    s = PASSWORD_PATTERN
        .replace_all(&s, "${1}[REDACTED]")
        .into_owned();
    s
}
```

**Redact-before-emit/persist invariant** (supervisor.rs lines 283-315):
```rust
let redacted = redact_log_line(raw_line);
let chunk = LogChunk {
    process: name,
    stream,
    line: redacted.clone(),
    ts: now_ms(),
};
emit(&chunk);

if stream == LogStream::Stderr {
    stderr_tail.push_back(redacted.clone());
}

let persisted = match stream {
    LogStream::Stderr => format!("[stderr] {redacted}\n"),
    LogStream::Stdout => format!("[stdout] {redacted}\n"),
};
```

Planner notes:
- Extend `SECRET_PATTERNS` and regexes; keep key name and separator, replace only values.
- Apply same redaction before diagnostics/readback/events that may include provider payloads.

### Rust tests

**Analogs:** `apps/desktop/src-tauri/src/process/config_tests.rs`, `apps/desktop/src-tauri/src/process/log_redact_tests.rs`

**Tempfile JSON test helper** (config_tests.rs lines 22-45):
```rust
fn write_temp_config(content: &str) -> (TempDir, PathBuf) {
    let dir = tempdir().expect("tempdir created");
    let path = dir.path().join("processes.json");
    fs::write(&path, content).expect("temp config written");
    (dir, path)
}

fn dev_skeleton_json(agent_override: &str, server_override: &str) -> String {
    format!(
        r#"{{
            "mode": "dev",
            "processes": {{
                "agent": {agent_override},
                "server": {server_override}
            }},
            "backoff_secs": [1, 2, 4, 8, 16],
            "max_restarts": 5,
            "shutdown_grace_secs": 5
        }}"#
    )
}
```

**Redaction assertion pattern** (log_redact_tests.rs lines 14-33):
```rust
#[test]
fn test_redact_deepseek_api_key() {
    let input = "DEEPSEEK_API_KEY=sk-abc123xyz";
    let output = redact_log_line(input);
    assert!(
        !output.contains("sk-abc123xyz"),
        "secret value must not appear in output: got {:?}",
        output
    );
    assert!(output.contains("DEEPSEEK_API_KEY"));
    assert!(output.contains("[REDACTED]"));
}
```

Planner notes:
- Add overlap-save tests for JSON validity, duplicate IDs, active provider stability.
- Add tests for `PALADIN_AI_*`, `OPENAI_API_KEY`, `Authorization: Bearer`, and provider alias redaction.

### `apps/desktop/src/stores/aiProvider.ts`

**Analog:** `apps/desktop/src/stores/process.ts`

**Store + Rust snapshot pattern** (lines 13-21, 47-64):
```typescript
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { create } from 'zustand';

export type ProcessName = 'agent' | 'server';
export type ProcessState = 'starting' | 'running' | 'degraded' | 'unhealthy' | 'stopped' | 'conflict';
export type ProcessOwner = 'supervisor' | 'external' | 'none';
export type ProcessHealth = 'healthy' | 'degraded' | 'failed' | 'unknown';

export const useProcessStore = create<ProcessStore>((set) => ({
  agent: { ...initial },
  server: { ...initial },
  setStatus: (name, patch) => set((s) => ({ [name]: { ...s[name], ...patch } })),
}));

export const useProcessStatus = (name: ProcessName): ProcessInfo => useProcessStore((s) => s[name]);
```

**Init/listen/reconcile pattern** (lines 76-98):
```typescript
export async function initProcessListeners(): Promise<() => void> {
  const unlisten = await listen<ProcessStatusEventPayload>('process-status', (e) => {
    const { name, ...patch } = e.payload;
    useProcessStore.getState().setStatus(name, patch);
  });

  try {
    await syncProcessStatus();
  } catch (e) {
    console.warn('[process] get_process_status failed, 保留 starting 默认值', e);
  }

  const reconcileTimer = window.setInterval(() => {
    syncProcessStatus().catch((e) => {
      console.warn('[process] reconcile status failed', e);
    });
  }, 2000);

  return () => {
    window.clearInterval(reconcileTimer);
    unlisten();
  };
}
```

Planner notes:
- Define `AiProviderReadiness = 'unconfigured' | 'untested' | 'available' | 'invalid'`.
- Use `invoke('get_ai_provider_config')`, `invoke('save_ai_provider')`, etc. with typed DTOs.
- If adding runtime event updates from Rust, mirror `listen(...)`; otherwise use snapshot/reconcile.

### `apps/desktop/src/stores/terminal.ts` and RightPanel integration

**Analogs:** `apps/desktop/src/stores/terminal.ts`, `apps/desktop/src/components/layout/RightPanel.tsx`

**Panel union pattern** (terminal.ts lines 9-24):
```typescript
interface TerminalState {
  isOpen: boolean;
  isFullscreen: boolean;
  panelWidth: number;
  activePanel: 'terminal' | 'file-preview' | 'diff' | 'logs';
  tabs: TerminalTab[];
  activeTabId: string | null;
  isTerminalRunning: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
  setPanelWidth: (w: number) => void;
  setActivePanel: (panel: 'terminal' | 'file-preview' | 'diff' | 'logs') => void;
}
```

**Panel actions pattern** (terminal.ts lines 40-48):
```typescript
openPanel: () => set({ isOpen: true }),
closePanel: () => set({ isOpen: false, isFullscreen: false }),
togglePanel: () => set((s) => ({ isOpen: !s.isOpen })),
setPanelWidth: (w) => set({ panelWidth: Math.max(300, w) }),
setFullscreen: (fs) => set({ isFullscreen: fs }),
toggleFullscreen: () => set((s) => ({ isFullscreen: !s.isFullscreen })),

setActivePanel: (panel) => set({ activePanel: panel }),
```

**RightPanel tab pattern** (RightPanel.tsx lines 125-163):
```tsx
const tabs = [
  { id: 'terminal' as const, icon: TerminalIcon, label: '终端' },
  { id: 'file-preview' as const, icon: FileCode, label: '文件' },
  { id: 'diff' as const, icon: GitBranch, label: 'Diff' },
  { id: 'logs' as const, icon: ScrollText, label: '日志' },
];

{tabs.map((tab) => {
  const Icon = tab.icon;
  const isActive = activePanel === tab.id;
  return (
    <Button
      key={tab.id}
      variant={isActive ? 'secondary' : 'ghost'}
      size="sm"
      onClick={() => setActivePanel(tab.id)}
      className="h-7 px-2 text-xs gap-1"
      title={tab.label}
    >
      <Icon className="size-3.5" />
      <span className="hidden sm:inline">{tab.label}</span>
    </Button>
  );
})}
```

Planner notes:
- Extend the union with `'ai-provider'`.
- Add one tab using a lucide icon (`BrainCircuit`, `Settings`, or `KeyRound`) and the same `h-7 px-2 text-xs gap-1`.
- Do not let `removeTab()` close the whole panel when only provider/settings is open.

### `apps/desktop/src/components/provider/AiProviderPanel.tsx`

**Analogs:** `RightPanel.tsx`, shadcn primitive wrappers

**Button primitive style** (button.tsx lines 6-28):
```typescript
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:not-aria-[haspopup]:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground hover:bg-primary/80',
        outline: 'border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-[color-mix(in_oklch,var(--secondary),var(--foreground)_5%)] aria-expanded:bg-secondary aria-expanded:text-secondary-foreground',
        ghost: 'hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50',
        destructive: 'bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40',
      },
```

**Destructive confirmation primitive** (alert-dialog.tsx lines 36-45, 97-115):
```tsx
function AlertDialogContent({ className, ...props }: AlertDialogPrimitive.Popup.Props) {
  return (
    <AlertDialogPortal>
      <AlertDialogOverlay />
      <AlertDialogPrimitive.Popup
        data-slot="alert-dialog-content"
        className={cn(
          'fixed top-1/2 left-1/2 z-50 -translate-x-1/2 -translate-y-1/2 flex flex-col gap-4 w-full max-w-sm rounded-lg border border-border bg-popover p-6 text-popover-foreground shadow-lg transition duration-200 data-ending-style:opacity-0 data-ending-style:scale-95 data-starting-style:opacity-0 data-starting-style:scale-95',
          className
        )}
        {...props}
      />
    </AlertDialogPortal>
  );
}

function AlertDialogAction({ className, ...props }: AlertDialogPrimitive.Close.Props) {
  return (
    <AlertDialogPrimitive.Close
      data-slot="alert-dialog-action"
      className={cn(buttonVariants({ variant: 'destructive' }), className)}
      {...props}
    />
  );
}
```

Planner notes:
- Use native inputs styled with project tokens; no new form library.
- Layout order from UI-SPEC: current provider summary, provider list, editor form, validation/test result.
- Save and test actions must be separate buttons and separate command calls.

### `apps/desktop/src/components/ChatArea.tsx`

**Analog:** `apps/desktop/src/components/ChatArea.tsx`

**Current empty-state pattern** (lines 13-33):
```tsx
export function ChatArea() {
  const currentThreadId = useChatStore((s) => s.currentThreadId);
  const conversations = useChatStore((s) => s.conversations);
  const rightPanelOpen = useTerminalStore((s) => s.isOpen);

  const currentConversation = conversations.find((c) => c.id === currentThreadId);

  if (!currentThreadId || !currentConversation) {
    return (
      <div className="flex-1 flex min-w-0">
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
          <h1 className="text-2xl font-bold text-foreground">Paladin</h1>
          <p className="text-muted-foreground text-center max-w-md">
            AI 编程伙伴。从左侧选择对话或创建新对话开始。
          </p>
        </div>
        {!rightPanelOpen && <ChatToolbar />}
      </div>
    );
  }
```

**CopilotChat composition pattern** (lines 36-50):
```tsx
return (
  <div className="flex-1 flex min-w-0">
    <div className="flex flex-1 min-w-0">
      <AguiApprovalInterrupt />
      <CopilotChat
        className="flex-1 min-w-0"
        threadId={currentConversation.threadId}
        labels={{
          welcomeMessageText: 'Paladin — AI 编程伙伴',
          chatInputPlaceholder: '输入消息...',
        }}
      />
    </div>
    {!rightPanelOpen && <ChatToolbar />}
  </div>
);
```

Planner notes:
- Missing-provider CTA should use the empty-state block pattern, with `配置 AI provider` button opening RightPanel and setting `activePanel='ai-provider'`.
- Do not replace Agent stopped/unhealthy with provider CTA; provider CTA applies only when Agent is running and AI readiness is unconfigured/invalid.

### `apps/desktop/src/components/StatusBar/AiProviderLight.tsx` and `StatusBar.tsx`

**Analog:** `apps/desktop/src/components/StatusBar/ProcessLight.tsx`, `apps/desktop/src/components/StatusBar.tsx`

**Status maps pattern** (ProcessLight.tsx lines 8-37):
```typescript
const DOT_CLASS: Record<ProcessState, string> = {
  starting: 'bg-primary',
  running: 'bg-emerald-500',
  degraded: 'bg-amber-500',
  unhealthy: 'bg-orange-500',
  stopped: 'bg-destructive',
  conflict: 'bg-destructive',
};

const TEXT: Record<ProcessState, string> = {
  starting: '启动中',
  running: '运行中',
  degraded: '降级',
  unhealthy: '异常',
  stopped: '已停止',
  conflict: '冲突',
};
```

**Popover action pattern** (ProcessLight.tsx lines 55-107):
```tsx
return (
  <Popover>
    <PopoverTrigger
      render={
        <Button variant="ghost" size="sm" title={displayText}>
          <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[status.state]}`} />
          <span className="text-xs">{displayText}</span>
        </Button>
      }
    />
    <PopoverContent side="top" align="start" sideOffset={10}>
      <div className="flex flex-col gap-2">
        <div className="font-medium text-sm">{label} 进程</div>
        <div className="text-xs text-muted-foreground">
          状态: {text} · 所有权: {ownerText} · 健康: {HEALTH_TEXT[status.health]}
        </div>
        <div className="flex gap-2">
          <Button size="sm" disabled={isExternal} onClick={() => invoke(`restart_${name}`)}>
            重启
          </Button>
          <Button size="sm" variant="outline" onClick={openLogsPanel}>
            查看日志
          </Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>
);
```

**StatusBar composition** (StatusBar.tsx lines 18-39):
```tsx
return (
  <div className="flex items-center justify-between h-6 px-2 bg-muted border-t border-border text-xs text-muted-foreground select-none">
    <div className="flex items-center gap-2">
      <Button variant="ghost" size="sm" onClick={handleClick}>
        <span className={`inline-block w-2 h-2 rounded-full ${
          isTerminalRunning ? 'bg-green-500' : 'bg-muted-foreground'
        }`} />
        <span>{isTerminalRunning ? '终端运行中' : '终端未启动'}</span>
      </Button>
      <ProcessLight name="agent" label="Agent" />
      <ProcessLight name="server" label="Go" />
    </div>
  </div>
);
```

Planner notes:
- AI status text should be `AI · 未配置`, `AI · 未测试`, `AI · 可用`, `AI · 无效`.
- Clicking opens settings panel and can trigger test connection when a provider exists.
- Keep state separate from `ProcessLight`; do not reuse process state labels.

### `apps/desktop/src/App.tsx`

**Analog:** `apps/desktop/src/App.tsx`

**Runtime config invoke pattern** (lines 39-57):
```tsx
const [runtimeConfig, setRuntimeConfig] = useState<{
  agent_url: string;
  server_url: string;
} | null>(null);

useEffect(() => {
  invoke<{ agent_url: string; server_url: string }>('get_runtime_config')
    .then(setRuntimeConfig)
    .catch((e) => {
      console.warn('[runtime] 配置加载失败，回退默认 http://localhost:9876', e);
      setRuntimeConfig({
        agent_url: 'http://localhost:9876',
        server_url: 'http://localhost:9880',
      });
    });
}, []);
```

**CopilotKit error mapping** (lines 163-177):
```tsx
const handleCopilotError = useCallback(
  (event: { code: string; error: Error; context?: Record<string, unknown> }) => {
    const errorMessages: Record<string, string> = {
      runtime_info_fetch_failed: '无法连接到 Agent 服务',
      agent_connect_failed: 'Agent 连接失败，请检查服务状态',
      agent_run_failed: 'Agent 运行失败',
      agent_run_error_event: 'Agent 内部错误',
      tool_argument_parse_failed: '工具参数解析错误',
      tool_handler_failed: '工具执行失败',
    };
    const friendly = errorMessages[event.code] || event.error.message;
    console.error(`[CopilotKit ${event.code}]`, friendly, event.error);
    toast.error(friendly);
  },
  []
);
```

**Provider mounting boundary** (lines 199-238):
```tsx
if (agentState !== 'running') {
  return (
    <div className="flex flex-col h-screen bg-background">
      <Titlebar ... />
      <main className="flex-1">
        <StartupMask ... />
      </main>
      <StatusBar />
      <Toaster position="bottom-center" />
    </div>
  );
}

return (
  <CopilotKitProvider
    runtimeUrl={`${runtimeConfig.agent_url}/copilotkit`}
    agents__unsafe_dev_only={{ default: agUiAgent as HttpAgent }}
    onError={handleCopilotError}
    showDevConsole={import.meta.env.DEV}
  >
```

Planner notes:
- Initialize AI provider store/listeners at root if implemented.
- Do not gate CopilotKit mounting on AI provider readiness; missing provider is a chat/product state, not Agent liveness.

### Frontend tests

**Analogs:** `apps/desktop/src/components/StatusBar/__tests__/ProcessLight.test.tsx`, `apps/desktop/src/stores/__tests__/chat.test.ts`

**Component test and invoke mock pattern** (ProcessLight.test.tsx lines 1-13):
```tsx
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue(undefined);
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { useProcessStore } from '@/stores/process';
import { useTerminalStore } from '@/stores/terminal';
```

**Store reset/localStorage pattern** (chat.test.ts lines 10-31):
```typescript
const storage = new Map<string, string>();
beforeEach(() => {
  storage.clear();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn((key: string) => storage.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      storage.set(key, value);
    }),
    removeItem: vi.fn((key: string) => {
      storage.delete(key);
    }),
  });
});

beforeEach(async () => {
  vi.resetModules();
  const mod = await import('../chat');
  useChatStore = mod.useChatStore;
});
```

Planner notes:
- Add tests for opening provider panel from ChatArea CTA and StatusBar light.
- Add tests that raw API key text is not rendered when masked metadata is present.
- Add store tests for save/test failure states and no duplicate prompt/panel behavior.

### Docs and launch wrapper tests

**Analogs:** `README.md`, `docs/packaging.md`, `scripts/test-launch-paladin-macos.sh`

**Current docs to replace** (README.md lines 43-57):
```markdown
# 1. 配置 Agent 的 AI 服务密钥
# 当前 DeepSeek 路径实际读取 DEEPSEEK_API_KEY；base URL 由内置配置/代码路径决定。
export DEEPSEEK_API_KEY='你的 deepseek key'
```

**Packaging env docs to update** (docs/packaging.md lines 29-35):
```markdown
安装态 sidecar 只接收 supervisor 明确允许的非空变量；不会读取工作目录 `.env`，也不会热加载环境。修改配置后请完整退出并重新启动 Paladin。

当前 Agent 模型配置使用 DeepSeek provider，因此模型服务密钥变量是 `DEEPSEEK_API_KEY`。
```

**Wrapper test assertion style** (test-launch-paladin-macos.sh lines 9-29, 57-66):
```bash
assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "Expected output to contain: $needle" >&2
    echo "Actual output:" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

missing_output="$(env -u DEEPSEEK_API_KEY -u PALADIN_DATABASE_URL -u PALADIN_REDIS_URL "$WRAPPER" --app "$APP" 2>&1)"
assert_contains "$missing_output" "Missing recommended environment variables:"
assert_contains "$missing_output" "DEEPSEEK_API_KEY"
assert_not_contains "$missing_output" "sk-test-secret"
```

Planner notes:
- Docs should describe no-key startup and runtime settings as the normal path.
- Launch wrapper test should stop treating `DEEPSEEK_API_KEY` as required; keep secret CLI arg rejection and raw value absence checks.

## Shared Patterns

### Rust As Runtime Authority
**Source:** `apps/desktop/src-tauri/src/process/commands.rs`, `apps/desktop/src-tauri/src/lib.rs`  
**Apply to:** all provider persistence and frontend command calls
```rust
#[tauri::command]
pub async fn get_runtime_config(
    supervisor: State<'_, ProcessSupervisor>,
) -> Result<RuntimeConfig, String> {
    Ok(supervisor.runtime_config())
}

app.manage(TerminalManager::new(app.handle().clone()));
```

### Readiness Is Separate From Process Health
**Source:** `apps/desktop/src/components/StatusBar/ProcessLight.tsx`, `apps/desktop/src/stores/process.ts`  
**Apply to:** Agent health response, `aiProvider.ts`, `AiProviderLight.tsx`, ChatArea CTA
```typescript
export type ProcessHealth = 'healthy' | 'degraded' | 'failed' | 'unknown';
export const useProcessStatus = (name: ProcessName): ProcessInfo => useProcessStore((s) => s[name]);
```
Use a new AI readiness enum instead of overloading process state.

### Secret Redaction Before Any Emission
**Source:** `apps/desktop/src-tauri/src/process/supervisor.rs`  
**Apply to:** process logs, provider diagnostics, Tauri readback DTOs, UAT evidence
```rust
let redacted = redact_log_line(raw_line);
let chunk = LogChunk {
    process: name,
    stream,
    line: redacted.clone(),
    ts: now_ms(),
};
emit(&chunk);
```

### UI Primitive Discipline
**Source:** `apps/desktop/src/components/ui/button.tsx`, `popover.tsx`, `alert-dialog.tsx`  
**Apply to:** provider panel, status popover, destructive delete flow
```tsx
<Button variant="ghost" size="sm" title={displayText}>
  <span className={`inline-block w-2 h-2 rounded-full ${DOT_CLASS[status.state]}`} />
  <span className="text-xs">{displayText}</span>
</Button>
```

### Test Style
**Source:** Python, Rust, Vitest analogs above  
**Apply to:** all Phase 11 tests
```python
with patch.dict(os.environ, {}, clear=True):
    ...
```
```rust
let (_dir, path) = write_temp_config(JSON);
```
```tsx
vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
```

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `apps/agent/src/agent/provider_runtime.py` | service | runtime snapshot/request-response | No existing versioned provider snapshot or hot-switch resolver exists; use `paladin_agent.py` style plus SPEC semantics. |
| `apps/desktop/src-tauri/src/ai_provider/storage.rs` | service | app-data file-I/O/CRUD | Existing config loader reads repo/resource config but does not write app data; copy serde/validation/test style, not storage behavior. |
| `apps/desktop/src/components/provider/AiProviderPanel.tsx` | component | CRUD form | No existing settings form of this density; compose existing RightPanel + shadcn primitives. |

## Metadata

**Analog search scope:** `apps/agent`, `apps/desktop/src`, `apps/desktop/src-tauri/src`, `scripts`, `docs`, `README.md`  
**Files scanned:** 80+ via `rg --files` and targeted `rg`/`nl` reads  
**Pattern extraction date:** 2026-07-13

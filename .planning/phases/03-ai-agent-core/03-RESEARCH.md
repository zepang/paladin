# Phase 3: AI Agent Core — Research

**Researched:** 2026-06-14
**Phase Requirements:** AGT-01, AGT-02, AGT-04

---

## Table of Contents

1. [Pydantic AI: Agent Creation & LLM Integration](#1-pydantic-ai-agent-creation--llm-integration)
2. [AG-UI Protocol Integration](#2-ag-ui-protocol-integration)
3. [pydantic-deepagents (pydantic-deep)](#3-pydantic-deepagents-pydantic-deep)
4. [Package Dependency Map](#4-package-dependency-map)
5. [Architecture Recommendations](#5-architecture-recommendations)
6. [Pitfalls & Gotchas](#6-pitfalls--gotchas)
7. [Validation Architecture](#7-validation-architecture)

---

## 1. Pydantic AI: Agent Creation & LLM Integration

### Core API

```python
from pydantic_ai import Agent

agent = Agent(
    'openai:gpt-4o',              # Model string: provider:model_id
    instructions='Be concise.',    # System prompt / instructions
    deps_type=MyDeps,              # Optional: typed dependency injection
)
```

### Model String Format

| Provider | Format | Example |
|----------|--------|---------|
| OpenAI | `openai:model-id` | `openai:gpt-4o` |
| Anthropic | `anthropic:model-id` | `anthropic:claude-sonnet-4-6` |
| DeepSeek (OpenAI-compat) | `openai:deepseek-chat` via custom `OpenAIModel` with `base_url` | See §1.1 |
| Llama Studio (OpenAI-compat) | `openai:local-model` via custom `OpenAIModel` with `base_url` |  See §1.1 |

### Running Agents

| Method | Type | Use Case |
|--------|------|----------|
| `agent.run_sync(prompt)` | Synchronous | CLI REPL, scripts |
| `await agent.run(prompt)` | Async | FastAPI endpoints |
| `async for event in agent.run_stream_events(prompt):` | Async Streaming | SSE/AG-UI |

### 1.1 Multi-Provider Configuration (DeepSeek + Llama Studio)

Both DeepSeek and Llama Studio use OpenAI-compatible APIs — they work via Pydantic AI's `OpenAIModel` with custom `base_url`:

```python
from pydantic_ai.models.openai import OpenAIModel
from pydantic_ai import Agent

# DeepSeek V4 Pro
deepseek_pro = OpenAIModel(
    'deepseek-v4-pro',
    base_url='https://api.deepseek.com/v1',
    api_key=os.environ['DEEPSEEK_API_KEY'],
)

# Llama Studio (local)
llama_local = OpenAIModel(
    'local-model',  # Model name configured in Llama Studio
    base_url='http://localhost:8080/v1',
    api_key='not-needed',
)
```

**Key insight:** Pydantic AI does NOT support dynamic model switching on a single Agent instance. To implement fallback, you need to either:
- Create multiple Agent instances (one per model)
- Or use `model` parameter in `agent.run_sync(prompt, model=fallback_model)` — this IS supported

**Fallback chain implementation pattern:**
```python
models = [deepseek_pro, deepseek_flash, llama_local]
for model in models:
    try:
        result = await agent.run(prompt, model=model)
        return result
    except Exception:
        continue
raise AllModelsFailed()
```

### 1.2 LLM Configuration Pattern

Pydantic AI uses environment variables natively:
- `OPENAI_API_KEY` — for OpenAI-compatible providers
- `ANTHROPIC_API_KEY` — for Anthropic

Custom providers can read env vars at model construction time.

---

## 2. AG-UI Protocol Integration

### Package

```bash
uv add 'pydantic-ai-slim[ag-ui]'
```

This installs: `pydantic-ai-slim` + `ag-ui-protocol` + `starlette`.

### Three Integration Methods

| Method | Flexibility | Complexity | Recommended For |
|--------|-------------|------------|-----------------|
| `agent.to_ag_ui()` → ASGI app | Low | Lowest | Quick demos; mounts as sub-app |
| `handle_ag_ui_request()` | Medium | Low | **FastAPI endpoints (RECOMMENDED)** |
| `run_ag_ui()` | High | Highest | Non-Starlette frameworks (Flask, Django) |

### Recommended: `handle_ag_ui_request()`

```python
from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import Response
from pydantic_ai import Agent
from pydantic_ai.ag_ui import handle_ag_ui_request

agent = Agent('openai:gpt-4o')
app = FastAPI()

@app.post('/copilotkit')
async def copilotkit_endpoint(request: Request) -> Response:
    return await handle_ag_ui_request(request, agent=agent)
```

This automatically:
- Parses `RunAgentInput` from the request body
- Streams AG-UI events as SSE
- Handles `thread_id`, `run_id`, `messages`, `state`, `tools`, `context`

### AG-UI Event Types

| Category | Events | When Emitted |
|----------|--------|--------------|
| Lifecycle | `RUN_STARTED`, `RUN_FINISHED`, `RUN_ERROR` | Every run |
| Text Message | `TEXT_MESSAGE_START`, `TEXT_MESSAGE_CONTENT`, `TEXT_MESSAGE_END` | Chat responses |
| Tool Call | `TOOL_CALL_START`, `TOOL_CALL_ARGS`, `TOOL_CALL_END`, `TOOL_CALL_RESULT` | Agent invokes tools |
| State | `STATE_SNAPSHOT`, `STATE_DELTA`, `MESSAGES_SNAPSHOT` | State sync |
| Special | `RAW`, `CUSTOM` | Custom extensions |

`handle_ag_ui_request()` emits **all relevant events automatically** — no manual event construction needed.

### Health Check Endpoint

The ASGI app from `agent.to_ag_ui()` does NOT include a `/health` endpoint. Must add manually:

```python
@app.get('/health')
async def health():
    return {"status": "ok", "agent": "paladin-agent"}
```

### Port & Path

- Port: `9876` (matches Phase 2 `runtimeUrl`)
- Path: `/copilotkit` (matches Phase 2 placeholder)

---

## 3. pydantic-deepagents (pydantic-deep)

### Package Name

**CRITICAL**: The PyPI package is `pydantic-deep`, NOT `pydantic-deepagents`.

```bash
uv add pydantic-deep
```

### Core API

```python
from pydantic_deep import create_deep_agent

agent = create_deep_agent(
    model='openai:gpt-4o',
    instructions='You are a helpful assistant.',
    include_todo=True,        # Enables TodoToolset
    include_filesystem=True,  # Enables FilesystemToolset
)
```

### Built-in Toolsets

| Toolset | Enabled By | Description |
|---------|------------|-------------|
| `TodoToolset` | `include_todo=True` | Task planning & tracking (read/write TODOs) |
| `FilesystemToolset` | `include_filesystem=True` | File read/write/edit operations |
| `SubAgentToolset` | `include_subagents=True` | Task delegation to sub-agents |
| `SkillsToolset` | `include_skills=True` | Markdown-driven skill extensions |
| `PlanToolset` | `include_plan=True` | Structured planning |

### FilesystemToolset Sandbox

Filesystem backends:
- `MemoryBackend` — in-memory (tests)
- `FileBackend(root_dir=...)` — real filesystem with root dir restriction
- `DockerSandbox` — isolated Docker container (Phase 7)

For Phase 3 sandbox: use `FileBackend(root_dir='apps/agent/')`

### TodoToolset

Tools provided: `read_todos`, `write_todos`, `complete_todo`

```python
# Agent can auto-plan and track tasks:
# User: "Create a Python web scraper"
# Agent internally:
#   1. write_todos([{"task": "Research target site", "status": "in_progress"}, ...])
#   2. Complete each step
#   3. read_todos() to show progress
```

### Relationship with Pydantic AI

`pydantic-deep` extends Pydantic AI — it uses `create_deep_agent()` which returns a standard Pydantic AI `Agent` instance. This means:
- `agent.to_ag_ui()` still works
- `handle_ag_ui_request()` still works
- Custom tools can be added to the returned agent

### Integration: deep agent + AG-UI

```python
from pydantic_deep import create_deep_agent
from pydantic_ai.ag_ui import handle_ag_ui_request

# Create deep agent with toolsets
agent = create_deep_agent(
    model='openai:deepseek-v4-pro',
    include_todo=True,
    include_filesystem=True,
    instructions='You are Paladin, a general-purpose AI assistant.',
)

# AG-UI endpoint — handle_ag_ui_request works directly
@app.post('/copilotkit')
async def copilotkit(request: Request) -> Response:
    return await handle_ag_ui_request(request, agent=agent)
```

---

## 4. Package Dependency Map

### Production Dependencies

```
apps/agent/
├── pydantic-ai-slim[ag-ui]  → Pydantic AI core + AG-UI protocol
│   ├── ag-ui-protocol        → AG-UI types & encoder
│   └── starlette             → ASGI base (FastAPI compatible)
├── pydantic-deep             → TodoToolset, FilesystemToolset
├── fastapi                   → HTTP server
├── uvicorn                   → ASGI server
├── python-dotenv             → .env loading
├── pyyaml                    → models.yaml parsing
├── structlog                 → Structured logging
└── httpx                     → Health check LLM connectivity test
```

### Source of Truth

| Decision | Rationale |
|----------|-----------|
| `pydantic-ai-slim[ag-ui]` not `pydantic-ai` | AG-UI extra includes ag-ui-protocol + starlette. `-slim` variant is lighter (no logfire, no examples) |
| `pydantic-deep` not `pydantic-deepagents` | PyPI package name is `pydantic-deep` |
| `fastapi` + `uvicorn` | User choice (D-10) |
| `pyyaml` | User choice for models.yaml (D-24) |
| `structlog` | User choice (D-17) |

---

## 5. Architecture Recommendations

### Directory Structure

```
apps/agent/
├── pyproject.toml
├── .env                          # API keys (git-ignored)
├── .env.example                  # Template without secrets
├── config/
│   └── models.yaml               # Model list with priorities & params
├── prompts/
│   └── system.md                 # System prompt (Markdown)
├── src/
│   ├── __init__.py
│   ├── agent/
│   │   ├── __init__.py
│   │   └── paladin_agent.py      # Agent creation & config loading
│   ├── server/
│   │   ├── __init__.py
│   │   ├── main.py               # FastAPI app + /copilotkit + /health
│   │   └── cli.py                # CLI REPL mode
│   └── tools/
│       ├── __init__.py
│       └── (Phase 6 extension)
└── tests/
    ├── __init__.py
    ├── test_agent.py
    └── test_server.py
```

### Entry Points (pyproject.toml)

```toml
[project.scripts]
paladin-agent = "src.server.cli:main"         # CLI REPL
paladin-agent-serve = "src.server.main:main"  # HTTP server
```

### config/models.yaml Structure

```yaml
models:
  - id: deepseek-v4-pro
    provider: openai
    model_id: deepseek-v4-pro
    api_base: https://api.deepseek.com/v1
    api_key_env: DEEPSEEK_API_KEY
    priority: 1
    params:
      temperature: 0.3
      max_tokens: 8192
  - id: deepseek-v4-flash
    provider: openai
    model_id: deepseek-v4-flash
    api_base: https://api.deepseek.com/v1
    api_key_env: DEEPSEEK_API_KEY
    priority: 2
    params:
      temperature: 0.3
      max_tokens: 4096
  - id: llama-local
    provider: openai
    model_id: local-model
    api_base: http://localhost:8080/v1
    api_key_env: LLAMA_API_KEY
    priority: 3
    params:
      temperature: 0.7
      max_tokens: 2048
```

### Fallback Chain Logic

```
For each run:
  1. Sort models by priority (ascending)
  2. Try model[0]
  3. On failure → try model[1]
  4. On failure → try model[2]
  5. All failed → raise AllModelsExhaustedError
```

---

## 6. Pitfalls & Gotchas

### 6.1 pydantic-deep vs pydantic-deepagents

The PyPI package is `pydantic-deep` (not `pydantic-deepagents`). The import is `from pydantic_deep import create_deep_agent`. Installing `pydantic-deepagents` will NOT work.

### 6.2 AG-UI requires Starlette

`handle_ag_ui_request()` expects a `starlette.requests.Request`, not a FastAPI-specific type. Import from `starlette.requests`, not `fastapi`.

### 6.3 Model Fallback on Agent Instance

Pydantic AI supports passing `model=` to `agent.run()`, `agent.run_sync()`, and `agent.run_stream_events()`. This means fallback can work without creating multiple Agent instances.

### 6.4 FilesystemToolset Backend

The default backend is `MemoryBackend` (in-memory). For file system access, explicitly pass `FileBackend(root_dir=...)`. The backend is passed via `DeepAgentDeps`:

```python
from pydantic_deep import create_deep_agent, DeepAgentDeps
from pydantic_deep.backends import FileBackend

backend = FileBackend(root_dir='apps/agent/workspace')
deps = DeepAgentDeps(backend=backend)
```

### 6.5 System Prompt Loading

`create_deep_agent(instructions=...)` accepts a string. For file-based prompts, read the file before calling:

```python
instructions = Path('prompts/system.md').read_text()
agent = create_deep_agent(instructions=instructions, ...)
```

---

## 7. Validation Architecture

### Nyquist Dimension Coverage

| Dimension | How Validated |
|-----------|---------------|
| D1: Unit | pytest for agent creation, model config parsing, fallback logic |
| D2: Integration | Test FastAPI endpoint with TestClient, verify SSE stream |
| D3: E2E | CLI REPL manual smoke test: create agent → chat → receive response |
| D4: Contract | AG-UI event schema validation against protocol spec |
| D5: Error | Test fallback chain exhausts, test invalid model config |
| D6: Performance | Agent startup time < 2s, first token latency logged |
| D7: Security | .env not committed, workspace restricted to apps/agent/ |
| D8: Docs | README with setup + run instructions |

### Key Test Scenarios

1. **Agent creation**: Load system prompt from file, register toolsets
2. **Model fallback**: Primary fails → secondary succeeds → verify correct model used
3. **AG-UI endpoint**: POST to /copilotkit → receive SSE TEXT_MESSAGE_CONTENT events
4. **Health check**: GET /health → 200 + status JSON
5. **CLI REPL**: Run paladin-agent → type message → get response
6. **FilesystemToolset sandbox**: Agent cannot access outside root_dir
7. **config/models.yaml**: Parse valid → create models; parse invalid → clear error

---

*Research complete. All findings above are incorporated from official Pydantic AI docs (ai.pydantic.dev), pydantic-deep docs (vstorm-co.github.io/pydantic-deepagents), and AG-UI protocol spec (ag-ui.com).*

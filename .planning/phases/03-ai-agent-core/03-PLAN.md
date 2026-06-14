# Phase 3: AI Agent Core — Plan

**Planned:** 2026-06-14
**Status:** Ready for execution
**Requirements:** AGT-01, AGT-02, AGT-04
**TDD Mode:** true

---

## Wave Outline

| Wave | Name | Tasks | TDD? |
|------|------|-------|------|
| W1 | Project Bootstrap | 3 | No |
| W2 | Agent Core | 3 | Yes |
| W3 | AG-UI Server | 3 | No |
| W4 | deepagents Integration | 2 | No |
| W5 | CLI REPL + Dev UX | 2 | No |
| W6 | Quality Gates + Tests | 3 | Yes |

---

## Wave 1: Project Bootstrap

### Task 1.1 — Initialize uv project
- **type:** scaffold
- **files_created:** `apps/agent/pyproject.toml`, `apps/agent/.env.example`, `apps/agent/.gitignore`
- Run `uv init apps/agent` (or manually create pyproject.toml)
- Configure: Python 3.12, package name `paladin-agent`
- Add `[project.scripts]` entries: `paladin-agent`, `paladin-agent-serve`
- Create `.env.example` with template vars: `DEEPSEEK_API_KEY`, `LLAMA_API_KEY`, `LLAMA_BASE_URL`
- Create `.gitignore` with `.env`, `__pycache__`, `.venv`, `*.pyc`

### Task 1.2 — Install dependencies
- **type:** scaffold
- **files_modified:** `apps/agent/pyproject.toml`
- **depends_on:** 1.1
- Add production deps: `pydantic-ai-slim[ag-ui]`, `pydantic-deep`, `fastapi`, `uvicorn`, `python-dotenv`, `pyyaml`, `structlog`, `httpx`
- Add dev deps: `pytest`, `pytest-asyncio`, `httpx` (for TestClient)
- Run `uv sync`

### Task 1.3 — Create directory structure
- **type:** scaffold
- **files_created:** all directories
- **depends_on:** 1.1
- Create: `src/agent/`, `src/server/`, `src/tools/`, `config/`, `prompts/`, `tests/`
- Add `__init__.py` to all Python packages

---

## Wave 2: Agent Core

### Task 2.1 — RED: Write agent creation tests
- **type:** tdd
- **files_created:** `apps/agent/tests/test_agent.py`
- **depends_on:** 1.2, 1.3
- Test: `create_paladin_agent()` returns valid Pydantic AI Agent
- Test: Agent has correct system prompt loaded from `prompts/system.md`
- Test: Agent creation fails gracefully when config/models.yaml is missing
- Test: Agent registers TodoToolset and FilesystemToolset when enabled

### Task 2.2 — GREEN: Implement Agent creation module
- **type:** tdd
- **files_created:** `apps/agent/src/agent/paladin_agent.py`, `apps/agent/src/agent/__init__.py`, `apps/agent/config/models.yaml`, `apps/agent/prompts/system.md`
- **depends_on:** 2.1
- Implement `create_paladin_agent()` function:
  - Parse `config/models.yaml` → list of model configs
  - Load System Prompt from `prompts/system.md`
  - Create Pydantic AI `Agent` with primary model
  - Register `TodoToolset` and `FilesystemToolset` via `pydantic-deep`
  - Return agent instance + model list for fallback
- Implement `load_models()` — parse YAML, create `OpenAIModel` instances with custom base_url
- Implement `load_system_prompt()` — read markdown file
- Write default `prompts/system.md` with general-purpose assistant prompt
- Write default `config/models.yaml` with DeepSeek V4 Pro/Flash + Llama Studio

### Task 2.3 — REFACTOR: Full test suite coverage
- **type:** tdd
- **files_modified:** `apps/agent/tests/test_agent.py`, `apps/agent/src/agent/paladin_agent.py`
- **depends_on:** 2.2
- Add test: `load_models()` returns correct number of models
- Add test: Fallback chain sorts by priority
- Add test: Invalid YAML raises clear error
- Add test: Missing API key env var raises clear error
- Run `pytest` — verify all pass
- Refactor agent module for clarity

---

## Wave 3: AG-UI Server

### Task 3.1 — Create FastAPI server with /copilotkit endpoint
- **type:** implement
- **files_created:** `apps/agent/src/server/main.py`, `apps/agent/src/server/__init__.py`
- **depends_on:** 2.2
- Create FastAPI app
- Mount `/copilotkit` endpoint using `handle_ag_ui_request(request, agent=agent)`
- Import from `starlette.requests.Request` (not FastAPI — AG-UI protocol requirement)
- Configure CORS middleware for `localhost:1420` (Tauri dev port)
- Set port to `9876` (matches Phase 2 `runtimeUrl`)
- Return SSE streaming response

### Task 3.2 — Add /health endpoint
- **type:** implement
- **files_modified:** `apps/agent/src/server/main.py`
- **depends_on:** 3.1
- `GET /health` returns `{"status": "ok", "agent": "paladin-agent", "models": [...]}`
- Include LLM connectivity check (optional: try a minimal model call with timeout)

### Task 3.3 — Test server with curl / TestClient
- **type:** verify
- **files_created:** `apps/agent/tests/test_server.py`
- **depends_on:** 3.1, 3.2
- Test: `GET /health` returns 200 with valid JSON
- Test: `POST /copilotkit` with valid `RunAgentInput` returns 200 with SSE content type
- Test: `POST /copilotkit` with invalid body returns 422
- Test: CORS headers present on OPTIONS request

---

## Wave 4: pydantic-deep Integration

### Task 4.1 — Wire TodoToolset + FilesystemToolset
- **type:** implement
- **files_modified:** `apps/agent/src/agent/paladin_agent.py`
- **depends_on:** 2.2
- Enable `include_todo=True`, `include_filesystem=True` in `create_deep_agent()`
- Configure Filesystem backend: `FileBackend(root_dir='apps/agent/workspace')`
- Create workspace directory
- Verify TodoToolset tools appear in agent's tool list

### Task 4.2 — Verify AG-UI emits tool call events
- **type:** verify
- **files_modified:** `apps/agent/tests/test_server.py`
- **depends_on:** 4.1, 3.1
- Test: SSE stream includes `TOOL_CALL_START` events when Agent uses tools
- Test: `RUN_ERROR` event emitted on LLM failure (structured error)
- Manual: Start server, POST a message that triggers TodoToolset, verify events in SSE stream

---

## Wave 5: CLI REPL + Dev UX

### Task 5.1 — Implement CLI REPL
- **type:** implement
- **files_created:** `apps/agent/src/server/cli.py`
- **depends_on:** 2.2
- Entry point `paladin-agent` (pyproject.toml scripts)
- Interactive loop: read user input → `agent.run_sync()` → print response
- Colorized output (green for user, blue for agent)
- Handle Ctrl+C gracefully
- `--model` flag to override default model

### Task 5.2 — Wire serve command with hot reload
- **type:** implement
- **files_modified:** `apps/agent/src/server/cli.py`, `apps/agent/src/server/main.py`
- **depends_on:** 5.1, 3.1
- `paladin-agent serve` → start uvicorn on 9876
- `paladin-agent serve --dev` → start with `--reload`
- `paladin-agent serve --port XXXX` → override port
- Print startup banner: URL, docs link, Ctrl+C hint

---

## Wave 6: Quality Gates + Tests

### Task 6.1 — Write integration tests for fallback chain
- **type:** tdd
- **files_modified:** `apps/agent/tests/test_agent.py`
- **depends_on:** 2.3, 5.1
- Test: model with priority=1 used first
- Test: priority=1 fails → priority=2 succeeds (mock API error)
- Test: all models fail → `AllModelsExhaustedError`
- Test: `--model` CLI flag overrides priority chain

### Task 6.2 — Full test suite run
- **type:** verify
- **files_modified:** (none)
- **depends_on:** 6.1
- Run `pytest` — verify all tests pass (target: 15+ tests)
- Run `uv run paladin-agent` — verify REPL starts
- Run `uv run paladin-agent-serve` — verify server starts on 9876
- Run `curl localhost:9876/health` — verify response
- Verify FastAPI Swagger at `localhost:9876/docs`

### Task 6.3 — Code quality
- **type:** verify
- **files_modified:** (none)
- **depends_on:** 6.2
- Run `python -m pytest --cov=src` or verify test coverage
- Verify `.env` is in `.gitignore`
- Verify no hardcoded API keys in source
- Verify all public functions have docstrings

---

## Requirements Coverage

| Req ID | Description | Covered By |
|--------|-------------|------------|
| AGT-01 | Pydantic AI Agent + LLM call | W2 (agent creation), W5 (CLI REPL) |
| AGT-02 | AG-UI endpoint (HTTP/SSE) | W3 (FastAPI server + /copilotkit) |
| AGT-04 | pydantic-deepagents integration | W4 (TodoToolset + FilesystemToolset) |

---

## Success Criteria

- [ ] `uv run paladin-agent` → interactive REPL works
- [ ] `uv run paladin-agent-serve` → server on `localhost:9876`
- [ ] `curl localhost:9876/health` → `{"status": "ok"}`
- [ ] `POST localhost:9876/copilotkit` → SSE stream with AG-UI events
- [ ] Agent uses TodoToolset + FilesystemToolset (verified via tool call events)
- [ ] Model fallback chain works (primary → secondary → fallback)
- [ ] All pytest tests pass (15+ tests)
- [ ] `.env` not committed, no hardcoded secrets

---

*Phase: 03-ai-agent-core*
*Plan generated: 2026-06-14*

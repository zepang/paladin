---
phase: 06-agent-tools
plan: 04
status: completed
started: 2026-06-30T21:03:00Z
completed: 2026-06-30T21:10:00Z
---

# Plan 06-04 Summary: Agent Tool Activation

**Result:** ✅ All 22 tests passing, 5 toolsets activated + MCP on-demand loading.

## What was done

- Added `_load_mcp_servers()` function for on-demand MCP toolset loading with `enabled` field filtering per RESESPEC pattern
- Updated `create_paladin_agent()`:
  - Added `skills_dir` parameter (default: `skills/`)
  - Flipped all 5 feature flags: `include_skills=True`, `include_subagents=True`, `include_builtin_subagents=True`, `include_execute=True`, `include_plan=True`, `web_search=True`
  - Added `skill_directories` and `max_nesting_depth=1`
  - MCP servers loaded via `_load_mcp_servers()` 
  - Skills directory auto-created with `mkdir(parents=True, exist_ok=True)`
- Updated `main.py`: `_config_path` from `models.yaml` → `config.json`

## Test Results

```
22 passed in 2.03s
```

- 8 new TestToolsetActivation tests (skills, MCP no-servers, MCP SDK missing, MCP enabled, MCP disabled, auto-create dir, plan+web_search, empty dir)
- 14 existing tests all pass with no regression

## Files Changed

| File | Change |
|------|--------|
| `apps/agent/src/agent/paladin_agent.py` | Added `_load_mcp_servers()`, updated `create_paladin_agent()` with all toolset flags |
| `apps/agent/src/server/main.py` | `_config_path` → `config.json` |

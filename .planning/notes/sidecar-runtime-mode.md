---
title: "Sidecar Runtime Mode"
date: 2026-07-06
context: "Exploration after Phase 07.3 UAT exposed dev startup ambiguity"
---

# Sidecar Runtime Mode

## Problem

Phase 07.3 introduced a Rust `ProcessSupervisor` that starts and monitors two local sidecars:

- Python Agent on `9876`
- Go Server on `9880`

UAT showed that the current design makes development startup hard to reason about. The desktop app behaves as if it owns the sidecars, but developers naturally also start the Agent and Server manually while debugging. When those manually started processes are healthy, the UI can still report stopped/conflict states because the supervisor only trusts its own child-process lifecycle.

The design needs to distinguish **service health** from **process ownership**.

## Current Design

Current runtime flow:

1. Tauri `setup()` loads `src-tauri/processes.json`.
2. `ProcessSupervisor.start()` starts Go Server first.
3. It waits up to 5 seconds for Go `/readyz`.
4. It starts Python Agent.
5. A probe loop checks configured health endpoints every 10 seconds.
6. Rust emits `process-status` events.
7. The frontend renders `StartupMask`, `StatusBar`, and `useAgentHealth` from supervisor state.

Current frontend truth source is the Rust supervisor state, not the health endpoints directly.

## Design Issue

The current state model conflates:

- Is a service healthy?
- Did the desktop app spawn the process?
- Is the port occupied by an unrelated process?
- Is this a dev externally managed service or a packaged sidecar?
- Is it safe for the desktop app to stop/restart/kill the process?

This causes confusing UX:

- A manually started healthy service may still look like an error if supervisor expects ownership.
- A port conflict and a failed process can both collapse into "stopped".
- The UI does not clearly show whether a service is external, managed, degraded, or conflicted.

## Recommended Direction

Use **Hybrid mode in development**, and **Supervisor-owned sidecars in packaged builds**.

### Dev: Hybrid Mode

Startup flow:

1. Probe health endpoints first:
   - Agent: `GET http://127.0.0.1:9876/health`
   - Server: `GET http://127.0.0.1:9880/healthz`
   - Server readiness: `GET http://127.0.0.1:9880/readyz`
2. If a service is healthy, attach to it as external.
3. If it is absent and the port is free, spawn it as supervisor-owned.
4. If the port is occupied but health fails, mark it as conflict.
5. Never kill or restart an external process.

### Packaged: Supervisor-Owned Mode

Packaged builds should use bundled sidecar binaries via Tauri sidecar/external binary patterns.

Packaged mode should not depend on:

- `uv`
- `go`
- login-shell `PATH`
- repository-relative cwd

## Proposed State Model

Add ownership as a first-class dimension:

```ts
state: "starting" | "running" | "degraded" | "unhealthy" | "stopped" | "conflict"
owner: "supervisor" | "external" | "none"
health: "healthy" | "degraded" | "failed" | "unknown"
```

Examples:

- `running + supervisor`: desktop app spawned and owns the process.
- `running + external`: desktop app connected to an already-running service.
- `conflict + none`: port is occupied, but health endpoint does not match Paladin.
- `stopped + supervisor`: desktop-owned child exited.
- `stopped + none`: no service is running and no spawn has been attempted.

## UI Implications

Status and actions should reflect ownership:

- External healthy service: show "已连接外部 Agent/Server".
- Supervisor-owned service: show "桌面端托管中".
- External service actions: disable stop/kill/restart; offer "重新检测" or "切换为托管".
- Supervisor-owned actions: allow restart/stop.
- Conflict: show port/process diagnostic and health failure details.

StartupMask should display the actual failure class:

- executable not found
- cwd missing
- port occupied
- health endpoint failed
- process exited within startup grace
- readiness degraded

## Open Decision

When an external healthy service is detected, the preferred UX needs a final decision:

1. Disable restart/stop and show "external attached".
2. Offer "switch to managed", which asks the user to stop the external service first.
3. Offer "use external for this session" and remember nothing.
4. Persist dev preference for external vs managed startup.

## Suggested Next Step

Create a small implementation phase or quick task:

**Sidecar Runtime Mode**

Scope:

- Add `owner` and `conflict` to process status.
- Add pre-spawn health probing.
- Implement dev Hybrid mode.
- Update StartupMask and ProcessLight labels/actions.
- Keep packaged mode ready for future Tauri sidecar binaries.


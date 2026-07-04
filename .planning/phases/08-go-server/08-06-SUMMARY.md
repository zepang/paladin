---
phase: 08
plan: 08-06
title: WebSocket Hub + coder/websocket gateway (TDD)
status: complete
started: 2026-07-04T15:00:00+08:00
completed: 2026-07-04T15:10:00+08:00
requirements: [SRV-05]
---

# 08-06 Summary

## What was built

Implemented the in-memory WebSocket broadcast Hub (with full concurrency coverage) and the `coder/websocket` gateway that bridges the Gin `/ws` route to the Hub. The `/ws` route is now live (replacing the 08-04 501 placeholder) and is protected by `Auth`.

## TDD Cycle

- **RED:** wrote `hub_test.go` with five failing cases (undefined `Hub`, `Conn`).
- **GREEN:** implemented `Hub` with `sync.RWMutex` + `map[string]Conn`; all tests passed.
- **REFACTOR:** extracted the `Conn` interface so the Hub is testable with fakes; added the `wsConn` adapter and `WSHandler` gateway against `coder/websocket`.

## Artifacts

### Hub (`internal/ws/`)
- `hub.go` — `Conn` interface (`ID() string`, `Write(ctx, msg) error`); `Hub` with `sync.RWMutex` guarding `map[string]Conn`; `Register`, `Unregister` (idempotent — deleting a missing key is a no-op), `ClientCount`, and `Broadcast` which snapshots the client list under the read lock and then writes outside the lock (no deadlock if a `Write` blocks). Double-register of the same ID is a no-op (map overwrite, count unchanged).
- `hub_test.go` — five `-race` cases using a `fakeConn` with a wakeup channel:
  1. `Register` + `Unregister` → count goes 0→2→1→0.
  2. `Broadcast` delivers to all clients.
  3. `Broadcast` with no clients does not block (1s timeout guard).
  4. `Unregister` is idempotent.
  5. Double `Register` does not inflate the count.

### Gateway (`internal/http/ws/`)
- `handler.go` — `wsConn` adapts `*websocket.Conn` to `ws.Conn` (mutex-guarded `Write`, close flag); `WSHandler` accepts the upgrade with `OriginPatterns: ["localhost","127.0.0.1"]`, registers the connection keyed by the JWT subject (or `"anon"` if missing), runs a 30s ping goroutine + a read loop that discards inbound frames, and unregisters + closes on exit. Exposes `Broadcast`/`ClientCount` pass-throughs for future admin tooling.

### Wiring
- `server.go` — `/ws` now routes through `middleware.Auth(cfg.JWTSecret)` → `wsH.Handle`. The 08-04 501 placeholder is gone.

## Self-Check: PASSED

- `go build ./...` → clean.
- `go vet ./...` → clean.
- `go test ./... -race -count=1` → all packages green (Hub suite included).
- Hub: register/unregister count correct; broadcast reaches every client; broadcast with zero clients returns within 1s; double-unregister and double-register are safe.
- `/ws` route is registered behind `Auth`; placeholder 501 removed.
- `coder/websocket` v1.8.15 is the only WS library imported (no `gorilla/websocket`).

## Deviations

- The Hub stores clients in a `map[string]Conn` keyed by `Conn.ID()`. The plan suggested a `map[*client]struct{}`; the string-keyed map is equivalent for our purposes (the JWT subject is the natural key) and makes the fake-conn tests simpler. Double-register of the same ID is a no-op rather than a panic, which matches the idempotent `Unregister` semantics.
- The gateway uses `coder/websocket` (the plan's documented choice, D-19) rather than `gorilla/websocket` (the plan's anti-choice, D-20).

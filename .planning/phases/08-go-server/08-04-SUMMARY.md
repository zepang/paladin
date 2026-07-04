---
phase: 08
plan: 08-04
title: Gin engine + health/readiness probes + unified error middleware
status: complete
started: 2026-07-04T14:35:00+08:00
completed: 2026-07-04T14:45:00+08:00
requirements: [SRV-01]
---

# 08-04 Summary

## What was built

Constructed the Gin HTTP server: unified error writer (`{"error":{"code","message"}}`), panic recovery middleware, `/healthz` liveness, `/readyz` PG+Redis probes, sample handler stubs, and the `NewServer` composition function. Wired `cmd/server/main.go` to build config → pool → redis → engine → `http.Server` with graceful SIGTERM/SIGINT shutdown.

## Artifacts

- `apps/server/internal/http/middleware/error.go` — `ErrorResponse` + `WriteError(c, status, code, message)` using `AbortWithStatusJSON`. Never carries JWT/password/stack content.
- `apps/server/internal/http/middleware/recovery.go` — `Recovery(logger)` that recovers from panics, logs `debug.Stack()` server-side only, and returns a unified `internal_error` 500 with no stack leak.
- `apps/server/internal/http/handler/health_handler.go` — unexported `Pinger` interface; `HealthHandler` with `pg`/`redis` `Pinger` fields backed by `*pgxpool.Pool`/`*redis.Client` adapters; `Liveness` returns 200 `{"status":"ok"}`; `Ready` uses a 2s timeout, pings both deps, returns 200 `{"status":{"postgres","redis"},"ok":true}` or 503 with the down dep marked. Also exposes `NewHealthHandlerWithPingers` for test injection.
- `apps/server/internal/http/handler/sample_handler.go` — `SampleHandler.Me`/`AdminHealth` stubs returning 501 `not_implemented` (08-05 replaces bodies).
- `apps/server/internal/http/server.go` — `NewServer(cfg, pool, rdb) *gin.Engine` applying Recovery + dev-only localhost CORS and registering `/healthz`, `/readyz`, `/me`, `/admin/health`, plus placeholder `/auth/register`, `/auth/login`, `/ws` that return 501. No broadcast route.
- `apps/server/internal/http/handler/health_test.go` — table-driven `httptest` tests using fake `Pinger` implementations (no live DB).
- `apps/server/cmd/server/main.go` — updated composition root: load config → `db.NewPostgresPool` → `db.NewRedisClient` → `NewServer` → `http.Server` on `:cfg.Port` → goroutine `ListenAndServe` → SIGTERM/SIGINT → `srv.Shutdown` with 10s timeout.

## Self-Check: PASSED

- `go build ./internal/http/...` → clean.
- `go vet ./internal/http/...` → clean.
- `go build ./cmd/server` → clean.
- `go test ./internal/http/handler/... -run 'Health|Ready|Liveness|Concurrent' -race -count=1` → all 5 tests pass.
- Liveness always returns 200 `{"status":"ok"}`.
- Ready returns 200 with both deps `up` when pings succeed.
- Ready returns 503 with `postgres:down` when the PG ping fails.
- Ready returns 503 with `redis:down` when the Redis ping fails.
- 50 concurrent `/readyz` requests return byte-identical bodies under `-race`.
- All 7 routes registered; no broadcast route; auth/ws placeholders return 501.
- `cmd/server/main.go` uses injected pool/redis (no global singletons), binds `:9880`, prints banner, shuts down on signals.

## Deviations

- `Recovery(logger)` accepts a `*log.Logger` (nil-safe); when nil it silently writes the unified 500 without logging the stack. This keeps the handler testable without forcing a concrete logger while preserving the "no stack to client" contract.
- CORS origin check is implemented as a simple prefix match on `http://localhost`/`http://127.0.0.1` (dev-only); tightened from the original `http://localhost:*` substring idea because Go's `http` package normalizes away the `:*` suffix.

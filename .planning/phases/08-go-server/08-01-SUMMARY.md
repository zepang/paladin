---
phase: 08
plan: 08-01
title: Go toolchain install + module scaffold + config + .env.example
status: complete
started: 2026-07-04T14:00:00+08:00
completed: 2026-07-04T14:15:00+08:00
requirements: [SRV-01]
---

# 08-01 Summary

## What was built

Resolved the Wave 0 blocker (no Go toolchain on this machine) and laid the Go module foundation for the Paladin server.

## Wave 0 Blocker Lifted

- **Go toolchain:** Homebrew had no prebuilt bottle for `go` (Tier 3 config). Downloaded the official tarball from go.dev and installed to `$HOME/go-sdk/go/bin`.
- **Resolved version:** `go version go1.26.4 darwin/arm64` — satisfies the `>= go1.26` requirement.
- **migrate CLI:** Also no Homebrew bottle. Installed via `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1` — reports `dev` (source-built) but is v4.19.1.
- **sqlc CLI:** Installed via `go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1` — reports `v1.31.1`.

## Artifacts

- `apps/server/go.mod` — `module paladin/apps/server`, `go 1.26`, pinned dependency block:
  - gin v1.10.0, pgx/v5 v5.10.0, golang-migrate/migrate/v4 v4.19.1, golang-jwt/jwt/v5 v5.3.1, redis/go-redis/v9 v9.21.0, coder/websocket v1.8.15, golang.org/x/crypto v0.53.0, joho/godotenv v1.5.1, google/uuid v1.6.0, stretchr/testify v1.11.1.
- `apps/server/go.sum` — populated; `go mod verify` clean.
- `apps/server/.gitignore` — ignores `.env`, `/bin/`, `/server`, `/migrate`, `vendor/`.
- `apps/server/.env.example` — all 9 keys with placeholder values; no 32+ char high-entropy literal.
- `apps/server/internal/config/config.go` — `Config` struct + `Load() (*Config, error)` with defaults (Port=9880, JWTTTL=15m, BcryptCost=10, AutoMigrate=true) and fail-fast validation (DB URL/Redis URL non-empty, JWT secret >= 32 bytes, bcrypt cost >= 10). No global singleton.
- `apps/server/internal/config/config_test.go` — table-driven tests for defaults, override, JWT-secret-too-short, empty DB URL, empty Redis URL, low bcrypt cost. Passes under `-race`.
- `apps/server/cmd/server/main.go` — composition root stub: loads config, prints banner referencing port 9880 and `/healthz`.
- `apps/server/cmd/migrate/main.go` — stub that prints "not yet implemented".

## Self-Check: PASSED

- `go version` → `go1.26.4 darwin/arm64`.
- `go mod verify` → all modules verified.
- `go vet ./internal/config/...` → clean.
- `go test ./internal/config/... -race -count=1` → ok (6 tests pass).
- `go build ./cmd/...` → clean.
- `go vet ./...` → clean.
- `go run ./cmd/server` with valid env prints the expected banner with port 9880 and `/healthz`.
- `.env.example` contains all 9 keys, no high-entropy literal.
- `.gitignore` ignores `.env` and compiled binaries.

## Deviations

- **Toolchain installation method:** Plans assumed `brew install go` and `brew install golang-migrate` would work. Homebrew reported "no bottle available" for both (Tier 3 config). Fell back to the official Go tarball from go.dev and `go install` for the two CLIs. Versions match the pinned requirements (Go 1.26.4, migrate v4.19.1, sqlc v1.31.1). No functional impact.

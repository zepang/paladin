# Paladin Go Server

JWT-authenticated Gin HTTP + WebSocket server backed by PostgreSQL and Redis. This is the Phase 08 scaffold: auth, RBAC, health probes, and an in-memory broadcast Hub. The phase-09 quota/usage features are intentionally absent.

## Stack

| Layer | Choice |
|---|---|
| Language | Go 1.26+ |
| HTTP | `github.com/gin-gonic/gin` v1.10.0 |
| WebSocket | `github.com/coder/websocket` v1.8.15 |
| Postgres driver | `github.com/jackc/pgx/v5` v5.10.0 (via `pgxpool`) |
| Redis client | `github.com/redis/go-redis/v9` v9.21.0 |
| Migrations | `github.com/golang-migrate/migrate/v4` v4.19.1 |
| Query gen | `github.com/sqlc-dev/sqlc` v1.31.1 (`sql_package: pgx/v5`) |
| JWT | `github.com/golang-jwt/jwt/v5` v5.3.1 (HS256 only) |
| Password | `golang.org/x/crypto/bcrypt` |

## Prerequisites

- Go >= 1.26
- Docker (or Podman — see "Podman / Docker" below)
- `golang-migrate` CLI and `sqlc` CLI (install via `go install` if Homebrew has no bottle)

## Quick start

```bash
# 1. Start Postgres + Redis
docker compose -f docker-compose.server.yml up -d

# 2. Apply migrations
migrate -path apps/server/migrations \
  -database "postgres://paladin:change-me@localhost:5432/paladin?sslmode=disable" up

# 3. Configure env
cp apps/server/.env.example apps/server/.env
# edit apps/server/.env — set a real PALADIN_JWT_SECRET (>= 32 bytes)

# 4. Run the server
cd apps/server
go run ./cmd/server
```

The server listens on `http://localhost:9880`.

## Endpoints

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/healthz` | none | Liveness — always 200 `{"status":"ok"}` |
| GET | `/readyz` | none | Readiness — 200 if PG+Redis up, 503 otherwise, with per-dep status |
| POST | `/auth/register` | none | `{email, password}` → 201 `{id,email,roles}`; 409 on case-insensitive duplicate; 400 on invalid input |
| POST | `/auth/login` | none | `{email, password}` → 200 `{token, token_type:"Bearer", expires_at}`; 401 on bad creds |
| GET | `/me` | Bearer | Returns the JWT subject + roles |
| GET | `/admin/health` | Bearer + `admin` | 200 for admins, 403 for everyone else |
| GET | `/ws` | Bearer | WebSocket upgrade; 30s server-side ping |

All error responses use the shape `{"error":{"code": "...", "message": "..."}}`.

## Configuration

All settings come from environment variables (see `.env.example`):

| Var | Default | Notes |
|---|---|---|
| `PALADIN_PORT` | `9880` | HTTP listen port |
| `PALADIN_DATABASE_URL` | — | Required. Postgres DSN |
| `PALADIN_REDIS_URL` | — | Required. Redis URL |
| `PALADIN_JWT_SECRET` | — | Required. >= 32 bytes |
| `PALADIN_JWT_TTL` | `15m` | Go duration |
| `PALADIN_BCRYPT_COST` | `10` | Minimum 10 |
| `PALADIN_ADMIN_EMAIL` | — | If set with password, bootstraps an admin user on startup |
| `PALADIN_ADMIN_PASSWORD` | — | Paired with `PALADIN_ADMIN_EMAIL` |
| `PALADIN_AUTO_MIGRATE` | `true` | Reserved for future use |

## Migrations

```bash
migrate -path apps/server/migrations -database "$PALADIN_DATABASE_URL" up      # apply
migrate -path apps/server/migrations -database "$PALADIN_DATABASE_URL" down 2  # roll back 2 versions
migrate -path apps/server/migrations -database "$PALADIN_DATABASE_URL" version # inspect
```

The `cmd/migrate` binary in this module wraps the same operations:

```bash
go run ./cmd/migrate up
go run ./cmd/migrate down 2
go run ./cmd/migrate version
```

Schema (`migrations/000001_init_schema.up.sql`):
- `users(id BIGSERIAL PK, email TEXT, password_hash TEXT, created_at TIMESTAMPTZ)` with `UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email))`.
- `roles(id BIGSERIAL PK, name TEXT UNIQUE)`.
- `user_roles(user_id, role_id)` composite PK.
- Seed (`000002`): `user`, `admin`.

## Regenerating sqlc code

```bash
sqlc generate
```

Config lives at `apps/server/sqlc.yaml`. Output package is `sqlcgen` at `internal/db/sqlc`. Never hand-edit generated files.

## Tests

```bash
# Unit tests (no live deps)
go test ./... -race -count=1

# Integration tests against the compose stack
PALADIN_DB_INTEGRATION=1 go test ./internal/db/... -race -count=1
```

## Podman / Docker

The compose file works with either engine:

```bash
# Docker (default)
docker compose -f docker-compose.server.yml up -d

# Podman
podman compose -f docker-compose.server.yml up -d
```

This phase was verified with Docker 28.4.0; Podman is the recommended production engine (see decisions D-23/D-24).

## Project layout

```
apps/server/
  cmd/
    server/main.go       # composition root + graceful shutdown
    migrate/main.go      # migration CLI
  internal/
    auth/                # JWT, bcrypt, BootstrapAdmin
    config/              # typed env loader with validation
    db/
      pool.go            # pgxpool wrapper
      redis.go           # go-redis wrapper
      queries/           # sqlc input SQL
      sqlc/              # GENERATED — do not edit
    http/
      server.go          # NewServer: wires every route
      handler/           # health, auth, sample handlers
      middleware/        # recovery, error, Auth, RequireRole
      ws/                # coder/websocket gateway
    ws/                  # in-memory broadcast Hub
  migrations/            # golang-migrate up/down SQL
  sqlc.yaml
  .env.example
  .gitignore
```

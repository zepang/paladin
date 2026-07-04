# Phase 08: Go Server — Research

**Researched:** 2026-07-04
**Domain:** Go business server / auth foundation
**Confidence:** HIGH
**Phase goal (from ROADMAP):** 业务层基础能力就绪 (Business-layer foundation capabilities ready)
**Requirements addressed:** SRV-01, SRV-02, SRV-03, SRV-04

---

## Summary

Phase 08 introduces Paladin's first Go service: a greenfield Gin HTTP server under `apps/server` that owns email/password JWT authentication, user/admin RBAC, and a JWT-authenticated WebSocket Hub MVP, backed by PostgreSQL (sqlc + pgx) and Redis. None of this stack exists in the codebase today — there is no `apps/server`, no `go.mod`, no migrations, and no Go tests. The phase is self-contained and runs on a dedicated port (`9880`) to avoid collision with the existing Python Agent on `9876`.

The CONTEXT.md has locked the major technical choices: Gin, an independent Go module, `internal/` layering, sqlc + pgx (not GORM), golang-migrate SQL files, short-lived HMAC JWTs with role claims, bootstrap admin from env, first-message WebSocket auth handshake, and Podman-first local dev. This research treats those as fixed and focuses on **how to implement the locked choices well** — exact versions, verified config, prescriptive patterns, and the pitfalls that will bite the planner.

**Primary recommendation:** Build a thin Gin service with a clean `internal/` boundary (config → http → auth → db → ws), generate typed queries with **sqlc v1.31.x configured for pgx/v5**, run **golang-migrate v4** migrations from embedded SQL files via a `migrate` subcommand, issue **HS256 JWTs with golang-jwt/jwt/v5** behind hand-rolled Gin middleware (no gin-jwt), and implement the Hub on **coder/websocket v1.8.x** (the maintained successor of nhooyr.io/websocket) because its context-native API, built-in concurrent-write safety, and clean `Ping(ctx)` map directly onto the locked acceptance criteria (read-deadline auth timeout, panic-free concurrent broadcast). Verify the whole stack with Go's stdlib `testing` + `httptest` + table-driven tests; avoid testcontainers-go per D-27.

**Critical environment finding:** This machine has **only Docker 28.4.0** installed. Go, Podman, `psql`, `redis-cli`, `sqlc`, and `migrate` CLIs are **all missing**. The planner MUST make toolchain installation Wave 0 — see Environment Availability.

---

## Architectural Responsibility Map

| Capability | Tier / Owner | Phase 08 Notes |
|---|---|---|
| HTTP routing + middleware chain | `internal/http` (Gin) | Lightweight; no enterprise framework (D-02) |
| Config loading (env + defaults) | `internal/config` | Ports 9880/5432/6379, JWT secret, admin bootstrap (D-25, D-26) |
| Auth: register/login/JWT issue | `internal/auth` | bcrypt hash; HS256; claims `sub,email,roles,exp` (D-10, D-11) |
| RBAC enforcement | `internal/auth` middleware | Role-claim based; `user`/`admin` only (D-12) |
| Data access (PostgreSQL) | `internal/db` + sqlc generated | sqlc + pgx/v5; **not GORM** (D-05..D-07) |
| Migrations (users/roles/user_roles) | `migrations/` SQL files | golang-migrate up/down; idempotent (D-08, D-09) |
| Redis connectivity + health | `internal/db` (or `internal/cache`) | Connected + health-checked; no quota logic (Phase 9) |
| WebSocket Hub | `internal/ws` | coder/websocket; first-message JWT auth; keyed by userID (D-17..D-21) |
| Health/readiness | `internal/http` | `/healthz`, `/readyz` probing PG + Redis |
| Local dev deps | root `docker-compose.server.yml` | Postgres + Redis; Podman-first docs (D-23, D-24) |
| Error shape | unified `error.code` + `error.message` | Never echo JWT/password (D-15, D-16) |

---

<user_constraints>

## Locked User Decisions (from 08-CONTEXT.md — verbatim, DO NOT re-litigate)

### Go Service Skeleton
- **D-01:** Use Gin for the Go HTTP server. Chosen for familiarity, convenience, full-featured, broad adoption.
- **D-02:** Keep Gin usage lightweight. No heavy enterprise framework; do not copy `references/wps-cowork` wholesale.
- **D-03:** Independent Go module under `apps/server`.
- **D-04:** `internal/`-based layered structure, roughly: `cmd/server`, `internal/config`, `internal/http`, `internal/auth`, `internal/db`, `internal/ws`, `migrations`.

### Data Access and Migrations
- **D-05:** Use `sqlc + pgx + SQL migrations` for PostgreSQL access.
- **D-06:** Rationale: transparent SQL, generated type-safe Go, modern PG driver stack, avoids hand-written scan-heavy raw SQL.
- **D-07:** Do NOT use GORM for Phase 08. (Decision explicitly changed back to sqlc + pgx.)
- **D-08:** golang-migrate-style versioned SQL migration files with clear `up`/`down` organization.
- **D-09:** Migration planning MUST preserve SPEC constraints: duplicate email, duplicate role name, duplicate user-role assignment rejected by DB constraints; repeated migrations are safe.

### Auth and RBAC
- **D-10:** Short-lived access tokens only. NO refresh tokens in Phase 08.
- **D-11:** JWT claims include `sub`, `email`, `roles`, `exp`.
- **D-12:** RBAC may use role claims from JWT (only `user/admin` required; no role-management API yet). Future admin phase may revise if role changes need immediate effect.
- **D-13:** Bootstrap initial admin from env vars `PALADIN_ADMIN_EMAIL`, `PALADIN_ADMIN_PASSWORD`.
- **D-14:** `.env.example` contains placeholders only. No real secrets / default real passwords.
- **D-15:** Logs, error responses, WebSocket messages MUST NEVER include plaintext passwords or JWTs.
- **D-16:** API errors use unified JSON error object (`error.code` + `error.message`), not Gin defaults.

### WebSocket Hub
- **D-17:** First-message auth handshake: client connects, first message must provide valid JWT; invalid auth or auth timeout closes connection.
- **D-18:** Do NOT pass JWTs in WebSocket query string (avoid URL/log exposure).
- **D-19:** Hub registry keyed by user ID; supports multiple concurrent connections per user.
- **D-20:** Broadcast is an internal Hub method verified by Go tests. NO dev/test HTTP broadcast endpoint or production broadcast API in Phase 08.
- **D-21:** MVP heartbeat: server ping/pong, read deadlines or pong handlers, cleanup when connection stops responding.
- **D-22:** Do NOT implement a full reconnect protocol in Phase 08.

### Local Development and Verification
- **D-23:** Root-level `docker-compose.server.yml` for local PostgreSQL + Redis.
- **D-24:** Document Podman-first commands (`podman compose -f docker-compose.server.yml up -d`). Docker equivalents allowed; do NOT assume Docker is the only runtime.
- **D-25:** Fixed default ports with env overrides: Go server `9880`, PostgreSQL `5432`, Redis `6379`.
- **D-26:** `.env.example` with safe placeholders for: database URL, Redis URL, JWT secret, bootstrap admin email/password, server port.
- **D-27:** Verification = Go unit tests + documented Podman-backed integration checks. Do NOT require `testcontainers-go` unless a compelling reason + Podman compatibility is clear.

### Claude's Discretion Areas (planner chooses exact form)
- Exact package/file names inside the locked `apps/server` + `internal/` structure.
- Exact golang-migrate CLI integration pattern (as long as versioned SQL migrations are clear and repeatable).
- Exact JWT TTL (must be short-lived access-token-only; document in `.env.example` or config defaults).
- Exact WebSocket message envelope names for auth/broadcast tests (preserve first-message auth + internal broadcast-only scope).

### Deferred Ideas
- Complete WebSocket reconnect protocol (client reconnect behavior, close/error code semantics, resume/compensation) — post Phase 08.

</user_constraints>

---

<phase_requirements>

## Phase Requirements → Research Support

| Req ID | Requirement (REQUIREMENTS.md) | Locked SPEC outcome | Research support in this doc |
|---|---|---|---|
| **SRV-01** | Go 项目骨架 + PostgreSQL + Redis 连接 | Go skeleton starts locally; `/healthz` `/readyz` report PG+Redis status; fail when down | Standard Stack (Gin/pgx/go-redis), Architecture Patterns, Health endpoint example, Environment Availability |
| **SRV-02** | 用户注册/登录 API | Register creates normalized-email user with `user` role; duplicate→conflict; empty rejected; login returns JWT; invalid fails | sqlc queries + bcrypt + JWT issue examples, Common Pitfalls (email normalization, secret logging) |
| **SRV-03** | RBAC 角色权限控制 | user/admin roles; sample admin route; user denied, admin allowed; duplicate role assignment no duplicate authz | RBAC middleware example, JWT claims design, Don't Hand-Roll |
| **SRV-04** | WebSocket Hub 实时通信 | JWT-auth handshake rejects unauth; valid connects; disconnect cleans registry; multi-conn per user; broadcast panic-free under concurrency | coder/websocket decision + first-message auth example + Hub lifecycle, Common Pitfalls (concurrent writes, ping/pong deadlock) |

</phase_requirements>

---

## Standard Stack

### Core Stack

| Component | Module path | Verified version | Provenance | Notes |
|---|---|---|---|---|
| HTTP framework | `github.com/gin-gonic/gin` | **v1.10.0** | [VERIFIED: pkg.go.dev/github.com/gin-gonic/gin?tab=versions] | Latest stable in v1 series. Older versions carry GO-2023-1737 (Content-Disposition). Pin `@v1.10.0`. |
| PG driver | `github.com/jackc/pgx/v5` | **v5.10.0** (Jun 3 2026) | [VERIFIED: pkg.go.dev/github.com/jackc/pgx/v5?tab=versions] | Latest. Versions ≤ v5.9.x carry GO-2026-4771/4772/5004 (SQL injection via dollar-quoted string placeholder confusion) — **pin v5.10.0 which is the fix**. |
| sqlc (codegen CLI) | `github.com/sqlc-dev/sqlc` | **v1.31.1** (Apr 22 2026) | [VERIFIED: github.com/sqlc-dev/sqlc/releases] | v1.31.0 removed pgx/v4 dep, bumped Go toolchain to 1.26. Install via `go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1` or release binary. |
| Migrations | `github.com/golang-migrate/migrate/v4` | **v4.19.1** (Nov 29 2025) | [VERIFIED: pkg.go.dev/github.com/golang-migrate/migrate/v4?tab=versions] | Latest v4. Use `file` source + `postgres` database driver. |
| JWT | `github.com/golang-jwt/jwt/v5` | **v5.3.1** (Jan 28 2026) | [VERIFIED: pkg.go.dev/github.com/golang-jwt/jwt/v5] | Imported by 15,146 projects. Use HS256 (`jwt.SigningMethodHS256`). |
| Redis client | `github.com/redis/go-redis/v9` | **v9.21.0** (Jun 22 2026) | [VERIFIED: pkg.go.dev/github.com/redis/go-redis/v9?tab=versions] | Latest v9. `ParseURL` for DSN; `Client.Ping(ctx)` for health. |
| WebSocket | `github.com/coder/websocket` | **v1.8.15** (Jun 15 2026) | [VERIFIED: pkg.go.dev/github.com/coder/websocket] | **RECOMMENDED over gorilla/websocket** — see State of the Art. Maintained by Coder (successor to nhooyr.io/websocket). Concurrent writes, context-native, `wsjson` helpers. |
| Password hashing | `golang.org/x/crypto/bcrypt` | latest `golang.org/x/crypto` tag | [CITED: pkg.go.dev/golang.org/x/crypto/bcrypt] | Part of the unified `golang.org/x/crypto` module (no independent bcrypt version). Cost 10–12 recommended. |
| stdlib `net/http` | (Go stdlib) | Go 1.26+ | [ASSUMED] | sqlc v1.31 toolchain needs Go 1.26; pin Go ≥ 1.26 for the module. |
| test assertions (optional) | `github.com/stretchr/testify` | latest v1.x | [CITED: pkg.go.dev/github.com/stretchr/testify] | Optional; stdlib `testing` is sufficient. Use only `assert`/`require` helpers if desired. |

### Supporting / Tooling

| Component | Purpose | Version / Source |
|---|---|---|
| `docker-compose.server.yml` | Local Postgres 16 + Redis 7 containers | root of monorepo (D-23) |
| Podman (preferred) / Docker (fallback) | Container runtime for compose | D-24 Podman-first |
| `golang-migrate` CLI | Run migrations in dev | v4.19.1 binary |
| `sqlc` CLI | Generate typed Go from SQL | v1.31.1 binary |
| `github.com/joho/godotenv` | Load `.env` for local dev (optional) | latest v1.x [CITED] |
| `github.com/google/uuid` | Connection IDs / JWT `jti` (optional) | latest v1.x [CITED] |

### Alternatives Considered (locked OUT by CONTEXT — documented for traceability)

| Alternative | Why rejected | Locked decision |
|---|---|---|
| GORM | Less type-safe; hides SQL; explicit user change-back | D-07: sqlc + pgx |
| gin-jwt | Over-opinionated for simple HS256 + role claims; adds abstraction we don't need | Hand-rolled middleware on golang-jwt/v5 |
| gorilla/websocket | Viable (revived maintenance) but lacks concurrent-write safety → external mutex needed for Hub broadcast; callback-based pong vs context-native Ping | coder/websocket (see State of the Art) |
| Refresh tokens | Out of scope | D-10 |
| Query-string WS auth | URL/log exposure | D-18 |
| testcontainers-go | Not required unless compelling + Podman-clear | D-27 |
| Heavy enterprise framework (e.g. go-kit layers, di) | User wants lightweight Gin | D-02 |

### Installation commands (documented for the planner)

```bash
# 1. Go toolchain (REQUIRED — not present on this machine)
brew install go          # macOS; or use official installer from go.dev/dl

# 2. sqlc codegen CLI
go install github.com/sqlc-dev/sqlc/cmd/sqlc@v1.31.1

# 3. golang-migrate CLI
go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v1.0.0
#  (version helper; pin to v4.19.1 module: see migrate README for current cmd tag)
#  Alternative: brew install golang-migrate

# 4. Local deps (Podman-first)
podman compose -f docker-compose.server.yml up -d
#  Docker fallback:
#  docker compose -f docker-compose.server.yml up -d

# 5. Go module deps (inside apps/server)
go get github.com/gin-gonic/gin@v1.10.0
go get github.com/jackc/pgx/v5@v5.10.0
go get github.com/jackc/pgx/v5/pgxpool@v5.10.0
go get github.com/golang-migrate/migrate/v4@v4.19.1
go get github.com/golang-jwt/jwt/v5@v5.3.1
go get github.com/redis/go-redis/v9@v9.21.0
go get github.com/coder/websocket@v1.8.15
go get golang.org/x/crypto/bcrypt
```

---

## Package Legitimacy Audit

Go uses the **Go module proxy** (`proxy.golang.org`) plus checksum DB (`sum.golang.org`), NOT an npm-style registry. There is no "slopsquatting" registry attack vector in the npm sense, but **typosquatting on module paths** and **abandoned-but-not-archived modules** are real risks. All core modules below are verified present, tagged, and widely imported.

| Module | Verified path resolves | License | Maintainer | Importers | Risk |
|---|---|---|---|---|---|
| `github.com/gin-gonic/gin` | YES [VERIFIED] | MIT | gin-gonic org | very high | LOW — canonical Go web framework |
| `github.com/jackc/pgx/v5` | YES [VERIFIED] | MIT | Jack Christensen (jackc) | very high | LOW — canonical PG driver |
| `github.com/sqlc-dev/sqlc` | YES [VERIFIED] | MIT | sqlc-dev org (kyleconroy) | high | LOW — active releases through 2026 |
| `github.com/golang-migrate/migrate/v4` | YES [VERIFIED] | MIT | golang-migrate org | very high | LOW — de-facto Go migration tool |
| `github.com/golang-jwt/jwt/v5` | YES [VERIFIED] | MIT | golang-jwt maintainer team | 15,146 [VERIFIED] | LOW — official successor of dgrijalva/jwt-go |
| `github.com/redis/go-redis/v9` | YES [VERIFIED] | BSD-2-Clause | Redis Inc. | 2,747+ [VERIFIED] | LOW — officially maintained by Redis |
| `github.com/coder/websocket` | YES [VERIFIED] | ISC | Coder (nhooyr handed over) | 790 [VERIFIED] | LOW-MED — smaller importer base than gorilla but corporate-backed, active |
| `golang.org/x/crypto/bcrypt` | YES [CITED] | BSD-3-Clause | Go team | universal | NONE — official Go subrepository |

**Typosquat warnings to brief the implementer on:**
- `github.com/gorilla/websocket` (the old canonical) vs `github.com/coder/websocket` — both legitimate, but they are NOT interchangeable APIs. Pick `coder/websocket` and import it consistently.
- `github.com/dgrijalva/jwt-go` — **deprecated/original**, must NOT be used. Use `github.com/golang-jwt/jwt/v5`.
- `github.com/go-redis/redis` (v6/v7) — **old module path**. Use `github.com/redis/go-redis/v9` (the redis-org-owned successor).
- Verify `GOFLAGS=-mod=mod` and `go.sum` checksums are committed; `go mod verify` should pass in CI.

---

## Architecture Patterns

### System Architecture Diagram (Phase 08 request flow)

```
                        Local Developer Machine
 ┌──────────────────────────────────────────────────────────────────────┐
 │                                                                      │
 │   podman compose -f docker-compose.server.yml up -d                  │
 │   ┌─────────────────────┐         ┌─────────────────────┐            │
 │   │  PostgreSQL :5432   │         │     Redis :6379     │            │
 │   │  (users/roles/      │         │   (connected +      │            │
 │   │   user_roles)       │         │    health-checked)  │            │
 │   └──────────▲──────────┘         └──────────▲──────────┘            │
 │              │ pgxpool                        │ go-redis              │
 │              │                                │                       │
 │   ┌──────────┴────────────────────────────────┴───────────┐          │
 │   │                Go Server  :9880                        │          │
 │   │                apps/server (independent module)        │          │
 │   │                                                        │          │
 │   │  cmd/server/main.go  →  internal/...  →  Gin Engine    │          │
 │   │                                                        │          │
 │   │  ┌─────────────┐   ┌────────────┐   ┌──────────────┐   │          │
 │   │  │  /healthz   │   │  /readyz   │   │  /ws (Hub)   │   │          │
 │   │  │  /readyz    │   │ probes PG  │   │  coder/ws    │   │          │
 │   │  │  liveness   │   │ + Redis    │   │  1st-msg JWT │   │          │
 │   │  └─────────────┘   └────────────┘   └──────────────┘   │          │
 │   │  ┌─────────────────────────────────────────────────┐   │          │
 │   │  │  POST /auth/register  →  bcrypt + sqlc insert   │   │          │
 │   │  │  POST /auth/login     →  bcrypt compare + JWT   │   │          │
 │   │  │  GET  /me             →  [authz: any role]      │   │          │
 │   │  │  GET  /admin/health   →  [authz: admin only]    │   │          │
 │   │  └─────────────────────────────────────────────────┘   │          │
 │   └────────────────────────┬───────────────────────────────┘          │
 │                            │                                          │
 │   (separate port; Python Agent owns :9876 — do NOT collide)           │
 └──────────────────────────────────────────────────────────────────────┘
```

### Recommended Project Structure

Mirrors `references/wps-cowork/apps/api` layering (handlers/internal/pkg) but **lightweight** per D-02. Exact package names are at planner discretion (D-04 fixes the tier names).

```
apps/server/
├── go.mod                          # independent module (D-03)
├── go.sum
├── sqlc.yaml                       # sqlc config (pgx/v5 engine)
├── .env.example                    # placeholders only (D-14, D-26)
├── README.md                       # local-run docs, Podman-first
├── cmd/
│   └── server/
│       └── main.go                 # entrypoint: load config, wire deps, Run(":9880")
│   └── migrate/
│       └── main.go                 # (optional) migrate up/down subcommand
├── internal/
│   ├── config/
│   │   └── config.go               # env → struct; ports, DSN, JWT secret, admin bootstrap
│   ├── http/
│   │   ├── server.go               # gin.Engine construction, route registration
│   │   ├── handler/
│   │   │   ├── auth_handler.go     # register, login
│   │   │   ├── health_handler.go   # /healthz, /readyz (PG+Redis probes)
│   │   │   └── sample_handler.go   # /me (any role), /admin/health (admin only)
│   │   ├── middleware/
│   │   │   ├── jwt.go              # parse Bearer, set claims in context
│   │   │   ├── rbac.go             # requireRole("admin")
│   │   │   ├── error.go            # unified error.code/error.message (D-16)
│   │   │   └── recovery.go         # never leak stack to client
│   │   └── ws/
│   │       └── handler.go          # upgrade, first-message auth, register conn
│   ├── auth/
│   │   ├── jwt.go                  # issue + verify HS256; claims sub/email/roles/exp
│   │   ├── password.go             # bcrypt hash/compare
│   │   └── bootstrap.go            # create admin from PALADIN_ADMIN_* if missing
│   ├── db/
│   │   ├── pool.go                 # pgxpool.New + Ping
│   │   ├── redis.go                # go-redis client + Ping
│   │   ├── sqlc/                   # GENERATED (do not hand-edit)
│   │   │   ├── db.go
│   │   │   ├── models.go
│   │   │   └── users.sql.go  (+ roles.sql.go, user_roles.sql.go)
│   │   └── queries/                # sqlc input
│   │       ├── users.sql
│   │       ├── roles.sql
│   │       └── user_roles.sql
│   └── ws/
│       └── hub.go                  # Hub: map[userID][]*Conn; Broadcast; cleanup
├── migrations/
│   ├── 000001_init_schema.up.sql
│   ├── 000001_init_schema.down.sql
│   ├── 000002_seed_roles.up.sql    # 'user','admin' rows
│   └── 000002_seed_roles.down.sql
└── internal/ws/hub_test.go         # broadcast panic-free under concurrency
```

**Key pattern choices:**
- `cmd/server/main.go` is the only composition root — it constructs config → pool → redis → hub → handlers → engine. No global state.
- `internal/` enforces the public API boundary at the module level (Go compiler prevents external imports).
- sqlc-generated code lives under `internal/db/sqlc/` (a `// Code generated by sqlc. DO NOT EDIT.` file). Queries live under `internal/db/queries/*.sql` — sqlc reads these and writes Go next to or near them per `sqlc.yaml`.
- Migrations live in `migrations/` at the module root (NOT under internal) so both the `migrate` CLI and an embedded `//go:embed` can reference them.

### sqlc.yaml (prescriptive — pgx/v5 engine)

```yaml
version: "2"
sql:
  - engine: "postgresql"
    queries: "internal/db/queries"
    schema: "migrations"               # sqlc reads the .up.sql files for schema
    gen:
      go:
        package: "sqlcgen"
        out: "internal/db/sqlc"
        sql_package: "pgx/v5"          # CRITICAL: emit pgx/v5-native code
        emit_json_tags: true
        emit_prepared_queries: false
        emit_interface: true           # Querier interface for mocking in tests
        emit_pointers_for_null_types: true
```

[VERIFIED: sqlc v1.31.x supports `version: "2"`, `sql_package: "pgx/v5"`, `emit_interface`, `emit_pointers_for_null_types` — github.com/sqlc-dev/sqlc/docs]

### Migrations: file-based + embed (hybrid)

- **Dev:** run via `migrate` CLI: `migrate -path apps/server/migrations -database "$DATABASE_URL" up`.
- **Binary:** embed via `//go:embed migrations/*.sql` (Go 1.16+) and use `migrate/source/iofs` so a single binary can self-migrate. This satisfies "repeated migrations are safe" (D-09) and lets Phase 9/10 sidecar work reuse one binary.
- **Idempotency:** `migrate up` is a no-op when already at latest version (returns `ErrNoChange`, which is not an error for startup). golang-migrate tracks version in `schema_migrations` table.
- **Up/down pairs:** every `NNNNNN_name.up.sql` has a matching `.down.sql`. Down migrations are for dev rollback only.

### Auth flow

```
Register:  POST /auth/register {email,password}
           → normalize email (lowercase, trim)
           → bcrypt.GenerateFromPassword(pwd, 10)
           → sqlc CreateUser + AssignRole("user") in a tx
           → 201 {user_id, email, roles:["user"]}   OR  409 conflict (unique violation)

Login:     POST /auth/login {email,password}
           → sqlc GetUserByEmail + GetRolesByUserID
           → bcrypt.CompareHashAndPassword
           → on success: jwt.NewWithClaims(HS256, {sub,email,roles,exp}) → signed string
           → 200 {token, expires_at}   OR   401 invalid credentials (UNIFIED error, no echo)

Protected: GET /admin/health   Authorization: Bearer <jwt>
           → middleware jwt.go: parse + verify HS256 + check exp
           → middleware rbac.go: claims.roles ∋ "admin" ? next : 403
```

### WebSocket Hub lifecycle (coder/websocket)

```
1. Client opens ws://localhost:9880/ws (HTTP upgrade, no auth yet)
2. server Accept(c) → upgrade OK
3. ctx, cancel := context.WithTimeout(ctx, AUTH_TIMEOUT)   # e.g. 5s
4. wsjson.Read(ctx, c, &authMsg)                            # first message
   - authMsg = {"type":"auth","token":"<jwt>"}
   - parse+verify JWT; on fail → c.Close(StatusPolicyViolation) and return
5. hub.Register(userID, c)                                  # map[userID][]*Conn
6. read loop: SetReadLimit; heartbeat via c.Ping(ctx) ticker
7. on read err / ctx done → hub.Unregister(userID, c) (idempotent) → c.Close(...)
```

### Anti-Patterns to avoid

- **GORM/scan-heavy raw SQL** — locked out (D-07).
- **Global singleton DB/Redis** — pass via main composition; enables `httptest` with fakes.
- **gin-jwt** — over-opinionated; hand-roll 30 lines of middleware for HS256.
- **Storing JWTs in cookies for a WS API** — D-10/18 mandate Bearer + first-message.
- **Echoing errors with internal detail** — D-15/16 mandate unified `error.code`/`error.message`; log full detail server-side with a correlation ID, return a generic code client-side.
- **Concurrent writes on gorilla/websocket without a mutex** — would panic. (Avoided by using coder/websocket, which is concurrent-write-safe. If gorilla were used, a per-conn write mutex is mandatory.)
- **`r.Context()` for the WS read loop** — coder/websocket docs explicitly warn against `r.Context()` for hijacked conns; use `context.Background()` with a timeout.
- **Running migrations in the HTTP hot path** — run once at startup or via subcommand, not per-request.

---

## Don't Hand-Roll

| Problem | Don't build | Use instead |
|---|---|---|
| Type-safe SQL queries | hand-written `rows.Scan(&a,&b,...)` | **sqlc** codegen from `.sql` files (D-05) |
| Password hashing | custom crypto / MD5/SHA | `golang.org/x/crypto/bcrypt` (cost ≥10) |
| JWT sign/verify | manual base64+HMAC | `github.com/golang-jwt/jwt/v5` `NewWithClaims`/`ParseWithClaims` |
| WS protocol / framing | raw TCP / `x/net/websocket` (deprecated) | `github.com/coder/websocket` |
| DB schema evolution | ad-hoc `CREATE TABLE IF NOT EXISTS` | **golang-migrate** versioned up/down files (D-08) |
| Connection pooling | custom pool | `pgxpool` (built into pgx/v5) |
| Redis client | raw RESP over TCP | `github.com/redis/go-redis/v9` |
| HTTP routing | `net/http` ServeMux patterns | Gin `Engine` (locked D-01) |
| Email normalization | ad-hoc regex | `strings.ToLower(strings.TrimSpace(email))` + PG `CITEXT` or lower unique index |
| Config loading | manual `os.Getenv` sprawl | typed `config.Config` struct + `os.Getenv` with defaults (keep minimal; no viper) |

---

## Common Pitfalls (Go/Gin/sqlc/WebSocket/JWT)

1. **sqlc `sql_package` misconfiguration.** Default emits `database/sql` code. MUST set `sql_package: "pgx/v5"` to get pgx-native types (`pgtype.Text`, etc.) and avoid `lib/pq`. [CITED: sqlc docs]
2. **Migration dirty state.** If a migration fails mid-run, golang-migrate marks `schema_migrations.dirty=true` and refuses further ops. Fix: `migrate ... force <version>` then resolve. Document this in the README.
3. **pgx security advisory (GO-2026-5004).** Versions ≤ v5.9.x have a SQL-injection vector via dollar-quoted string placeholder confusion. **Pin v5.10.0.** [VERIFIED]
4. **JWT secret too short.** HS256 needs ≥256 bits of entropy (32 random bytes). A short/guessable secret breaks the signature. Reject startup if `len(secret) < 32`. [CITED: RFC 7518, OWASP ASVS V6.2]
5. **bcrypt cost too high in tests.** Cost 12+ slows test suites. Use cost 10 for dev/test, allow override via env for prod. Never use cost < 10.
6. **Concurrent WS writes panic (gorilla only).** gorilla/websocket does NOT serialize writes — a Hub broadcasting while a client write goroutine runs will panic. coder/websocket is concurrent-write-safe, which is why it's recommended. If gorilla is used, wrap every `WriteMessage` in a per-conn mutex.
7. **Ping/pong deadlock.** With gorilla, calling `WriteControl(PingMessage)` from the same goroutine that's blocked on `ReadMessage` can deadlock if the pong handler also writes. coder/websocket's `Conn.Ping(ctx)` is context-native and non-blocking. Either way, run the heartbeat ticker in its own goroutine.
8. **Using `r.Context()` for hijacked WS.** coder/websocket README explicitly warns: after `Accept`, `r.Context()` is cancelled when the HTTP handler returns — use `context.Background()` + timeout. [VERIFIED: coder/websocket README]
9. **Email uniqueness case sensitivity.** `Foo@x.com` vs `foo@x.com` — normalize to lowercase before insert AND lookup, or use a PG `CITEXT` column / `LOWER()` unique index. SPEC R3 requires normalized comparison.
10. **Leaking JWT/password in logs.** Gin's default logger prints request path + query. WS query auth (rejected per D-18) would leak tokens. Also avoid `fmt.Printf("%+v", request)` on auth bodies. Use a redacting logger.
11. **`migrate` CLI vs library version skew.** The CLI binary and the `v4` library import must be the same major version or migration file formats can diverge. Pin both to v4.19.x.
12. **sqlc schema from migrations directory.** sqlc reads the `schema:` path for DDL. If you point it at `migrations/` it will parse `.up.sql` files — good — but it will also try `.down.sql`. Some teams use a separate `schema/` dir of `CREATE TABLE` files for sqlc and keep migrations separate. Recommend pointing `schema:` at a filtered view or placing only forward DDL where sqlc reads. Test codegen locally.
13. **Bootstrap admin idempotency.** If the admin already exists, startup must NOT fail or create a duplicate. Use `INSERT ... ON CONFLICT (email) DO NOTHING` then ensure the admin role is attached (`ON CONFLICT` on user_roles).
14. **Duplicate role assignment.** SPEC R4 edge: re-assigning `admin` must not duplicate authorization. Enforce `UNIQUE(user_id, role_id)` on `user_roles`; idempotent re-assign is a no-op.
15. **Refresh tokens drift.** Do not "accidentally" add a refresh endpoint. D-10 is explicit. A long TTL is NOT a refresh token — keep access TTL short (e.g. 15 min) per D-10.
16. **CORS for local dev only.** Desktop CSP allows `http://localhost:*` but the Go server is server-only in Phase 08. If you add CORS for manual browser testing, scope it to localhost origins and do not ship wide-open CORS.

---

## Code Examples

### Gin handler (register) — unified error shape, bcrypt, sqlc

```go
// internal/http/handler/auth_handler.go
func (h *AuthHandler) Register(c *gin.Context) {
    var req struct {
        Email    string `json:"email"    binding:"required,email`
        Password string `json:"password" binding:"required,min=8`
    }
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(400, gin.H{"error": gin.H{"code": "invalid_input", "message": "email and password required"}})
        return
    }
    email := normalizeEmail(req.Email) // strings.ToLower + TrimSpace

    hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), h.cfg.BcryptCost)
    if err != nil { writeError(c, 500, "internal"); return }

    tx, err := h.pool.Begin(c.Request.Context())
    if err != nil { writeError(c, 500, "internal"); return }
    defer tx.Rollback(c.Request.Context())
    q := h.queries.WithTx(tx)

    user, err := q.CreateUser(c.Request.Context(), sqlcgen.CreateUserParams{Email: email, PasswordHash: string(hash)})
    if err != nil {
        if isUniqueViolation(err) { c.JSON(409, gin.H{"error": gin.H{"code":"email_taken","message":"email already registered"}}); return }
        writeError(c, 500, "internal"); return
    }
    if err := q.AssignDefaultRole(c.Request.Context(), user.ID); err != nil { writeError(c, 500, "internal"); return }
    if err := tx.Commit(c.Request.Context()); err != nil { writeError(c, 500, "internal"); return }

    c.JSON(201, gin.H{"id": user.ID, "email": user.Email, "roles": []string{"user"}})
}
// NEVER log req.Password or hash. writeError returns unified error.code/error.message.
```

### sqlc query + generated code

```sql
-- internal/db/queries/users.sql
-- name: CreateUser :one
INSERT INTO users (email, password_hash)
VALUES ($1, $2)
RETURNING id, email, password_hash, created_at;

-- name: GetUserByEmail :one
SELECT id, email, password_hash, created_at FROM users WHERE email = $1;

-- name: AssignDefaultRole :exec
INSERT INTO user_roles (user_id, role_id)
SELECT $1, id FROM roles WHERE name = 'user'
ON CONFLICT (user_id, role_id) DO NOTHING;
```
```go
// GENERATED (internal/db/sqlc/users.sql.go) — sqlc produces typed methods:
func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (User, error)
func (q *Queries) GetUserByEmail(ctx context.Context, email string) (User, error)
func (q *Queries) AssignDefaultRole(ctx context.Context, userID int64) error
```

### JWT issue + verify (HS256)

```go
// internal/auth/jwt.go
type Claims struct {
    Email string   `json:"email"`
    Roles []string `json:"roles"`
    jwt.RegisteredClaims
}
func Issue(secret string, userID int64, email string, roles []string, ttl time.Duration) (string, error) {
    now := time.Now()
    claims := Claims{Email: email, Roles: roles, RegisteredClaims: jwt.RegisteredClaims{
        Subject: strconv.FormatInt(userID, 10),
        ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
        IssuedAt: jwt.NewNumericDate(now),
    }}
    return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
}
func Verify(secret, tokenStr string) (*Claims, error) {
    c := &Claims{}
    tok, err := jwt.ParseWithClaims(tokenStr, c, func(t *jwt.Token) (any, error) {
        if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok { return nil, fmt.Errorf("unexpected alg") }
        return []byte(secret), nil
    }, jwt.WithValidMethods([]string{"HS256"}))
    if err != nil || !tok.Valid { return nil, err }
    return c, nil
}
```

### Gin auth middleware (hand-rolled, no gin-jwt)

```go
// internal/http/middleware/jwt.go
func Auth(secret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        h := c.GetHeader("Authorization")
        if !strings.HasPrefix(h, "Bearer ") { abort(c, 401, "missing_token"); return }
        claims, err := auth.Verify(secret, strings.TrimPrefix(h, "Bearer "))
        if err != nil { abort(c, 401, "invalid_token"); return }
        c.Set("userID", claims.Subject); c.Set("roles", claims.Roles)
        c.Next()
    }
}
// internal/http/middleware/rbac.go
func RequireRole(want string) gin.HandlerFunc {
    return func(c *gin.Context) {
        roles, _ := c.Get("roles"); 
        for _, r := range roles.([]string) { if r == want { c.Next(); return } }
        abort(c, 403, "forbidden")
    }
}
// router: r.GET("/admin/health", middleware.Auth(secret), middleware.RequireRole("admin"), h.AdminHealth)
```

### WebSocket first-message auth handshake (coder/websocket)

```go
// internal/http/ws/handler.go
func (h *WSHandler) ServeWS(c *gin.Context) {
    conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
        OriginPatterns: []string{"localhost:*"}, // dev only; tighten in prod (Phase 10)
    })
    if err != nil { return }
    defer conn.CloseNow()

    ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second) // AUTH_TIMEOUT
    defer cancel()

    var msg struct{ Type, Token string `json:"type,token"` }
    if err := wsjson.Read(ctx, conn, &msg); err != nil || msg.Type != "auth" {
        conn.Close(websocket.StatusPolicyViolation, "auth required"); return
    }
    claims, err := auth.Verify(h.cfg.JWTSecret, msg.Token)
    if err != nil { conn.Close(websocket.StatusPolicyViolation, "bad token"); return }

    uid, _ := strconv.ParseInt(claims.Subject, 10, 64)
    h.hub.Register(uid, conn)             // keyed by userID, multi-conn (D-19)
    defer h.hub.Unregister(uid, conn)     // idempotent cleanup (D-21)

    heartbeat := time.NewTicker(30 * time.Second); defer heartbeat.Stop()
    readCtx, readCancel := context.WithCancel(context.Background()); defer readCancel()
    go func() { for { select { case <-heartbeat.C: if err := conn.Ping(readCtx); err != nil { return } } } }()

    for {
        if _, _, err := conn.Reader(readCtx); err != nil { return } // cleanup on disconnect/timeout
    }
}
```

### bcrypt hash/compare

```go
hash, _ := bcrypt.GenerateFromPassword([]byte(password), 10)
// store string(hash) in users.password_hash
err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(suppliedPassword))
// err == nil → valid; ErrMismatchedHashAndPassword → invalid credentials
```

### Health endpoint (PG + Redis probes)

```go
// internal/http/handler/health_handler.go
func (h *HealthHandler) Ready(c *gin.Context) {
    ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second); defer cancel()
    status := gin.H{}
    ok := true
    if err := h.pool.Ping(ctx); err != nil { status["postgres"]="down"; ok=false } else { status["postgres"]="up" }
    if err := h.redis.Ping(ctx).Err(); err != nil { status["redis"]="down"; ok=false } else { status["redis"]="up" }
    code := 200; if !ok { code = 503 }
    c.JSON(code, gin.H{"status": status, "ok": ok})
}
// /healthz = liveness (always 200 if process alive); /readyz = dependency probes above
```

---

## State of the Art

### WebSocket library: coder/websocket vs gorilla/websocket (CRITICAL DECISION)

**Recommendation: Use `github.com/coder/websocket` (v1.8.15).**

Rationale grounded in the locked acceptance criteria:

| Criterion (from SPEC R5 / CONTEXT D-17..D-21) | gorilla/websocket v1.5.3 | coder/websocket v1.8.15 |
|---|---|---|
| Concurrent broadcast panic-free (R5 concurrency) | ❌ Requires external per-conn write mutex | ✅ Built-in concurrent-write safety |
| Auth read-deadline / timeout (D-21) | Manual deadline on Upgrader + SetReadDeadline | ✅ `context.WithTimeout` native to every Read/Ping |
| Heartbeat ping/pong (D-21) | Callback-based `PongHandler` + manual `WriteControl(Ping)` | ✅ `Conn.Ping(ctx)` idiomatic, non-blocking |
| First-message JSON auth (D-17) | Manual `ReadJSON` | ✅ `wsjson.Read(ctx, conn, &v)` helper |
| `r.Context()` hazard | Easy to misuse | ✅ Documented; library nudges `context.Background()` |
| Maintenance | Revived 2022–2025 (was archived); v1.5.3 Jun 2024, last commit Mar 2025 | ✅ Actively developed by Coder; v1.8.15 Jun 2026 |
| Importer base | 197k (incumbent) | 790 (newer, corporate-backed) |
| Dependencies | bundled x/net/proxy | ✅ Zero dependencies |

Both pass the Autobahn test suite and are production-grade. The deciding factors for **this phase** are: (a) the broadcast-must-not-panic-under-concurrency acceptance criterion maps directly onto coder/websocket's concurrent-write safety, removing a whole class of mutex bugs; (b) the context-native API matches the read-deadline auth handshake; (c) clear active corporate maintenance vs gorilla's archive/revive history. [VERIFIED: pkg.go.dev/github.com/coder/websocket README "Comparison > gorilla/websocket"]

**If the planner prefers gorilla/websocket** (e.g., team familiarity, more examples): it remains a valid, maintained choice, BUT the plan MUST add a per-connection write mutex in the Hub and handle ping/pong via callbacks. The recommendation stands on coder/websocket for lower implementation risk against the locked criteria.

### sqlc current state
- Active: v1.31.1 (Apr 2026), v1.31.0 added pgx v5 mapping improvements (`Map xid8 to pgtype.Uint64 for pgx/v5`), removed pgx/v4 dependency, bumped Go toolchain to 1.26. [VERIFIED: github.com/sqlc-dev/sqlc/releases]
- The `version: "2"` sqlc.yaml format is current. `sql_package: "pgx/v5"` is the documented path for pgx-native generated code.

### golang-jwt current state
- `github.com/golang-jwt/jwt/v5` is the official maintained successor to the deprecated `dgrijalva/jwt-go` and the v3/v4 line. v5.3.1 Jan 2026. v5 added `Validator`, `WithValidMethods`, `WithExpirationRequired` — use these to harden parsing. [VERIFIED]

### pgx security
- pgx ≤ v5.9.x carries active advisories (GO-2026-4771/4772/5004 — SQL injection via dollar-quoted string placeholder confusion). **v5.10.0 is the fixed version.** Pin it. [VERIFIED]

---

## Assumptions Log

- [ASSUMED] Go 1.26 is the minimum toolchain (sqlc v1.31 requires Go 1.26; pgx v5.10 targets recent Go). The exact installed Go version is unknown because Go is not yet installed on this machine.
- [ASSUMED] `golang-migrate` CLI `cmd/migrate` install tag resolves to v4.19.1 functionality; the canonical install is `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@latest` then verify with `migrate -version`. Pin behavior via go.mod.
- [ASSUMED] bcrypt cost 10 is acceptable for Phase 08 dev/test; production cost (12+) is a Phase 10/deployment concern.
- [ASSUMED] HS256 (symmetric HMAC) is sufficient for Phase 08 single-server auth. RS256/asymmetric would be needed only if a separate verifier service existed — none does in Phase 08. The CONTEXT permits this ("short-lived access tokens only").
- [ASSUMED] The existing Docker 28.4.0 on this machine is `docker compose` v2-capable (very likely; v1 is EOL). Podman is the documented preference (D-24) but is not installed — the planner should either install Podman or document Docker as the available runtime.
- [ASSUMED] `references/wps-cowork/apps/api` uses a comparable Go layering (handlers/internal/pkg) — confirmed via directory listing; used only as a layering reference, not copied (D-02).
- [ASSUMED] WebSocket message envelope shape `{type:"auth",token}` and broadcast payload are at planner discretion (CONTEXT: "Claude's Discretion" — envelope names).

---

## Open Questions

1. **Go version to pin in `go.mod`?** Recommend `go 1.26` in `apps/server/go.mod` to match sqlc v1.31 toolchain. Confirm once Go is installed.
2. **Migrate-on-startup vs separate subcommand?** Both are supported by CONTEXT (D-27/planner discretion). Recommend: embed migrations + run `up` at startup guarded by a feature flag (`PALADIN_AUTO_MIGRATE=true`, default true for dev) AND expose `cmd/migrate` for explicit control. Planner decides.
3. **CORS posture for Phase 08?** Server-only per CONTEXT, but manual browser testing needs permissive localhost CORS. Recommend a dev-only `localhost:*` allowlist, documented, no wildcard in any shipped config.
4. **Podman vs Docker for this machine?** Podman not installed; Docker 28.4.0 is. Planner should either (a) add Podman install to Wave 0 (matches D-24 user preference), or (b) document Docker as acceptable since compose files are compatible. Lean toward installing Podman to honor the locked preference.
5. **Role storage: enum vs lookup table?** SPEC requires `roles` table. Recommend `roles(id, name UNIQUE)` + `user_roles(user_id, role_id, UNIQUE(user_id,role_id))`. Seed `user`,`admin` in migration 000002.
6. **JWT TTL exact value?** Planner discretion (CONTEXT). Recommend 15 min; document in `.env.example` as `PALADIN_JWT_TTL=15m`.
7. **`schema_migrations` table ownership** — golang-migrate owns it; ensure sqlc `schema:` ignores it (point sqlc at forward `.up.sql` DDL files or a dedicated schema dir).

---

## Environment Availability

Probed on this machine (2026-07-04) via direct command execution:

| Tool | Available? | Version / Note | Action required |
|---|---|---|---|
| **go** | ❌ NOT installed | `command not found: go` | **Install Go 1.26+ (Wave 0 blocker)** |
| **podman** | ❌ NOT installed | `command not found: podman` | Install Podman OR use existing Docker (D-24 prefers Podman) |
| **docker** | ✅ installed | Docker 28.4.0 | Usable as compose runtime fallback |
| **psql** | ❌ NOT installed | `command not found: psql` | Optional; useful for manual DB inspection. Run via container if needed. |
| **redis-cli** | ❌ NOT installed | `command not found: redis-cli` | Optional; run via container (`podman exec`) if needed. |
| **sqlc** | ❌ NOT installed | `command not found: sqlc` | Install v1.31.1 (`go install ...@v1.31.1`) after Go is present |
| **migrate** | ❌ NOT installed | `command not found: migrate` | Install golang-migrate CLI v4.19.x |

**Probe command output:**
```
zsh:1: command not found: go
---PODMAN---
zsh:1: command not found: podman
---DOCKER---
Docker version 28.4.0, build d8eb465
---PSQL---
zsh:1: command not found: psql
---REDIS---
zsh:1: command not found: redis-cli
---SQLC---
zsh:1: command not found: sqlc
---MIGRATE---
zsh:1: command not found: migrate
```

**Wave 0 implication:** The planner's first plan MUST install the Go toolchain, sqlc, and golang-migrate CLI, and decide Podman-install vs Docker-use for the compose runtime. No Go code can be compiled or tested until Go is present.

---

## Validation Architecture (Nyquist enabled)

The phase is fully testable with Go's stdlib `testing` + `net/http/httptest`. No testcontainers-go required (D-27). The "sampling rate" here is test coverage breadth across the 4 requirements × their edge categories from SPEC.

### Test Framework

| Concern | Tool | Rationale |
|---|---|---|
| Unit + table-driven tests | Go stdlib `testing` | Zero-dep, idiomatic; `go test ./...` |
| Assertions (optional) | `github.com/stretchr/testify/assert` + `require` | Reduces boilerplate; optional, not mandatory |
| HTTP handler tests | `net/http/httptest` + `gin.CreateTestContext` or full `httptest.Server` | Drive Gin engine without binding a port |
| DB layer tests | sqlc `Querier` interface + fake OR real PG via compose | D-27: Podman-backed integration for real PG; unit tests can fake the interface |
| Redis tests | real Redis via compose (`Ping`) OR fake the small health-check interface | Only Ping needed in Phase 08 |
| WS Hub tests | in-process: dial with `coder/websocket` client → assert auth reject/accept, broadcast delivery, concurrency | `coder/websocket` has `Dial` for test clients |
| Race detection | `go test -race ./...` | Catches Hub concurrent-write / map access bugs (R5 concurrency) |

### SRV-01..04 → Test Map

| Req | Acceptance (from SPEC) | Test(s) | Sampling |
|---|---|---|---|
| **SRV-01** server skeleton + PG/Redis health | starts locally; /healthz + /readyz report deps; fail when down | `health_test.go`: 200 when both up; 503 + `postgres:down` when PG killed; 503 + `redis:down` when Redis killed; concurrent health checks don't mutate state | Full: 3 paths × concurrency check |
| **SRV-02** register/login | new email→201+user role; dup→409; empty→400; login valid→JWT; login invalid→401 no token | `auth_test.go` table-driven: valid register, dup email, empty email, empty password, short password; valid login returns parseable JWT with correct claims; wrong password →401; normalized-email login (Foo@ vs foo@) | Full edge coverage (empty, encoding, idempotency, concurrency) |
| **SRV-03** RBAC | missing/invalid token rejected; user denied admin route; admin allowed; duplicate role no dup authz | `rbac_test.go`: no token→401; bad token→401; user token on /admin→403; admin token on /admin→200; re-assign admin role then authz unchanged | Full (empty, adjacency, ordering, idempotency) |
| **SRV-04** WebSocket Hub | no/invalid JWT rejected; valid connects+registered; disconnect cleans; multi-conn per user; broadcast panic-free under concurrency | `hub_test.go`: unauth connect→closed; valid→registered; disconnect→unregistered (idempotent re-unregister); 2 conns same userID coexist; broadcast to N=100 conns under `-race` no panic; broadcast not exposed via HTTP (D-20) | Full (empty, adjacency, idempotency, concurrency) |

### Negative / prohibition tests (SPEC must-NOTs)
- **No-secret-echo:** assert auth-failure bodies and WS close reasons do NOT contain the JWT string or password substring.
- **No broadcast HTTP endpoint:** assert no route under `/api/*` or `/admin/*` performs broadcast (grep router registrations).
- **No Phase 9 scope:** assert no audit-log table, no Redis quota counter code paths exist.

### Sampling Rate (Nyquist)
- Cover **every** acceptance-criterion bullet as at least one assertion (23 SPEC edges; all resolved).
- Run with `-race -count=1` in CI; Hub concurrency test iterates enough connections (≥ GOMAXPROCS) to expose races.
- Wave 0 gap: Go toolchain not installed → cannot run `go test` yet. First plan must install Go before any test can execute.

### Wave 0 Gaps (blockers before tests can run)
1. Install Go 1.26+, sqlc v1.31.1, golang-migrate CLI.
2. Decide Podman (install) vs Docker (present) for compose.
3. Bring up `docker-compose.server.yml` (PG + Redis) and confirm ports 5432/6379 reachable.
4. `go mod init` under `apps/server`; `go mod tidy`.

---

## Security Domain

### ASVS categories applicable to Phase 08

| ASVS section | Applies? | Phase 08 implementation |
|---|---|---|
| **V2 Authentication** | ✅ HIGH | Email/password; bcrypt; lockout not required v1 (note); rate limiting is Phase 9/10 |
| **V3 Session Management** | ✅ (token-as-session) | Short-lived JWT; no refresh; exp enforced; verify `alg` on parse |
| **V4 Access Control** | ✅ HIGH | RBAC middleware; role claims; default-deny; admin route protected |
| **V5 Input Validation** | ✅ | Gin binding validators; email normalization; WS read limit (`SetReadLimit`) |
| **V6 Cryptography** | ✅ HIGH | bcrypt cost ≥10; HS256 secret ≥256 bits; JWT never in logs/URLs |
| V7 Error Handling & Logging | ✅ | Unified error object; no secret echo (D-15/16); redacting logger |
| V8 Data Protection | partial | Passwords hashed at rest; no PII beyond email in Phase 08 |
| V9 Communications | partial | Localhost only in Phase 08; TLS is Phase 10 |
| V13 API & Web Service | ✅ | REST + WS; first-message auth; no query-string tokens |

### Threat patterns for this stack

| Threat | Vector | Mitigation in Phase 08 |
|---|---|---|
| **SQL injection** | raw string-built SQL | sqlc generates parameterized queries exclusively (D-05); pgx v5.10 fixes placeholder-confusion CVE [VERIFIED] |
| **Password storage weakness** | plaintext/weak-hash | bcrypt cost ≥10; never log/echo (D-15) |
| **JWT secret compromise / weak key** | short/guessable HS256 secret | Reject startup if `<32` bytes; load from env (`.env.example` placeholder only, D-14) |
| **JWT alg confusion** (`none`/RS256↔HS256) | attacker sets `alg:none` or tricks verifier | `jwt.WithValidMethods([]string{"HS256"})` + assert `*jwt.SigningMethodHMAC` in keyfunc (see code example) |
| **JWT in URL/logs** | query-string WS auth | BANNED by D-18; first-message handshake only |
| **WS auth bypass** | connecting without sending JWT | Auth-timeout context closes unauth conns; Hub never registers pre-auth |
| **Concurrent-write panic / data race** | Hub broadcast while client writes | coder/websocket concurrent-write safety + `-race` tests; map guarded by mutex in Hub |
| **Role escalation** | user claims admin | Server is the only issuer; roles sourced from DB at login; claims signed; admin route checks server-verified claims (not client-supplied) |
| **Duplicate role grant inflates authz** | race in role assignment | `UNIQUE(user_id, role_id)` constraint + idempotent `ON CONFLICT DO NOTHING` |
| **Bootstrap admin leak** | default password committed | D-14: `.env.example` placeholders only; real admin from env at runtime |
| **CORS wildcard in dev shipped to prod** | overly permissive CORS | Scope to `localhost:*` for dev; no wildcard; Phase 10 tightens |
| **Migration dirty-state DoS** | failed migration blocks startup | `force` recovery documented; startup treats `ErrNoChange` as success |
| **Information disclosure in errors** | stack traces / SQL in 500s | Unified `error.code`/`error.message`; Gin recovery middleware returns generic 500; details server-side only |

### Canon security notes deferred to `$gsd-secure-phase`
- Rate limiting / brute-force protection (Phase 9/10).
- Account lockout / password reset (out of scope per CONTEXT).
- TLS termination (Phase 10).
- Audit logging (Phase 9, ADM-01).

---

## Sources

### Primary (verified directly)
- pkg.go.dev — `github.com/gin-gonic/gin` versions page (v1.10.0 latest stable) [VERIFIED]
- pkg.go.dev — `github.com/jackc/pgx/v5` versions page (v5.10.0; ≤v5.9.x advisories GO-2026-4771/4772/5004) [VERIFIED]
- pkg.go.dev — `github.com/golang-migrate/migrate/v4` versions page (v4.19.1 latest) [VERIFIED]
- pkg.go.dev — `github.com/golang-jwt/jwt/v5` (v5.3.1, Jan 28 2026, imported by 15,146) [VERIFIED]
- pkg.go.dev — `github.com/redis/go-redis/v9` versions page (v9.21.0, Jun 22 2026) [VERIFIED]
- pkg.go.dev — `github.com/coder/websocket` (v1.8.15, Jun 15 2026; README "Comparison > gorilla/websocket") [VERIFIED]
- github.com/gorilla/websocket (v1.5.3 Jun 14 2024; last commit Mar 19 2025; revived maintenance) [VERIFIED]
- github.com/sqlc-dev/sqlc releases (v1.31.1 Apr 22 2026; v1.31.0 changelog: removed pgx/v4, Go 1.26, xid8→pgtype.Uint64 for pgx/v5) [VERIFIED]

### Secondary (cited)
- sqlc documentation — `sqlc.yaml` v2, `sql_package: "pgx/v5"`, emit options [CITED: docs.sqlc.dev]
- golang.org/x/crypto/bcrypt package docs [CITED: pkg.go.dev/golang.org/x/crypto/bcrypt]
- coder/websocket README — `r.Context()` warning, AcceptOptions.OriginPatterns [CITED]
- OWASP ASVS v4.0 — V2/V3/V4/V5/V6 sections [CITED: owasp.org/www-project-application-security-verification-standard]
- RFC 7519 (JWT), RFC 7518 (JWS/HS256 minimum key length) [CITED]

### Tertiary (assumed / community knowledge)
- Go stdlib `testing` + `httptest` patterns [ASSUMED: stable idiomatic Go]
- `references/wps-cowork/apps/api` directory structure (handlers/internal/pkg layering) [ASSUMED: representative Go service layout; used as layering reference only per D-02]
- bcrypt cost 10 acceptable for dev/test [ASSUMED]

---

## Metadata

| Field | Value |
|---|---|
| Phase | 08 — Go Server |
| Researched | 2026-07-04 |
| Researcher role | gsd-phase-researcher |
| Confidence | HIGH |
| Requirements covered | SRV-01, SRV-02, SRV-03, SRV-04 (all 4) |
| Locked decisions honored | D-01..D-27 (all CONTEXT decisions preserved, not re-litigated) |
| Key prescriptive picks | Gin v1.10.0 · pgx v5.10.0 · sqlc v1.31.1 · golang-migrate v4.19.1 · golang-jwt v5.3.1 (HS256) · go-redis v9.21.0 · **coder/websocket v1.8.15** |
| Wave 0 blockers | Go toolchain, sqlc CLI, migrate CLI, Podman-or-Docker decision |
| Next step | Planner creates `08-XX-PLAN.md` files from this research |

---

*Phase: 08-go-server*
*Research complete: 2026-07-04*

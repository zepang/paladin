# Phase 08: Go Server - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-03
**Phase:** 08-go-server
**Areas discussed:** Go service skeleton, Data access and migrations, Auth/RBAC, WebSocket Hub, Local development and verification

---

## Go Service Skeleton

| Option | Description | Selected |
|--------|-------------|----------|
| Standard library + lightweight router | Minimal dependencies; good for simple services. | |
| Gin | Mature ecosystem, convenient API/middleware, common Go web experience. | yes |
| Echo/Fiber | More application-framework style; no strong project tie. | |
| Agent decides | Lock only "keep it lightweight". | |

**User's choice:** Gin.
**Notes:** The user preferred Gin because it is more full-featured, convenient, and has broad community usage. The context still guards against importing heavy enterprise architecture.

| Option | Description | Selected |
|--------|-------------|----------|
| `apps/server` independent Go module + `internal/` layering | Aligns with monorepo app structure and keeps packages clear. | yes |
| Root Go workspace | Useful for multiple Go modules later, but early for Phase 08. | |
| Flat MVP structure | Fastest, but creates likely refactor debt. | |
| Agent decides | Lock only "Gin + clear layering". | |

**User's choice:** `apps/server` independent Go module + `internal/` layering.
**Notes:** Recommended structure: `cmd/server`, `internal/config`, `internal/http`, `internal/auth`, `internal/db`, `internal/ws`, and `migrations`.

---

## Data Access and Migrations

| Option | Description | Selected |
|--------|-------------|----------|
| Raw SQL + pgx + migration SQL | Transparent and small, but may become scan-heavy. | |
| sqlc + pgx + migration SQL | Hand-written SQL with generated type-safe Go methods. | yes |
| GORM | Convenient and widely adopted ORM, but hides more SQL details. | |
| Agent decides | Planner researches and chooses. | |

**User's choice:** `sqlc + pgx + migration SQL`.
**Notes:** The discussion explored raw SQL, sqlc, and GORM. The user initially leaned toward GORM for convenience/community size, then explicitly returned to sqlc + pgx to reduce future migration risk while preserving type safety and SQL visibility.

| Option | Description | Selected |
|--------|-------------|----------|
| golang-migrate-style versioned migrations | Clear up/down SQL files; common and CI-friendly. | yes |
| Goose | Also common and Go-friendly. | |
| Atlas | Powerful but heavier than Phase 08 needs. | |
| Agent decides | Lock only versioned SQL migrations. | |

**User's choice:** golang-migrate-style versioned SQL migrations.
**Notes:** Migrations must satisfy SPEC constraints around repeatability and uniqueness.

---

## Auth/RBAC

| Option | Description | Selected |
|--------|-------------|----------|
| Short-lived access token only | Simple and verifiable for Phase 08. | yes |
| Access + refresh tokens | More production-like, but adds storage/rotation scope. | |
| Long-lived JWT | Simple but higher leakage risk. | |
| Agent decides | Planner chooses token lifecycle. | |

**User's choice:** Short-lived access token only.
**Notes:** Refresh tokens are out of Phase 08.

| Option | Description | Selected |
|--------|-------------|----------|
| Claims include `sub`, `email`, `roles`, `exp` | Simple RBAC and WebSocket auth. | yes |
| Only `sub` and `exp`; roles from DB | Immediate role changes but more DB lookups. | |
| Mixed claims with DB role lookup | More consistent, more complex. | |
| Agent decides | Planner chooses claims. | |

**User's choice:** JWT claims include `sub`, `email`, `roles`, and `exp`.
**Notes:** This is acceptable because Phase 08 has only `user/admin` roles and no role-management API.

| Option | Description | Selected |
|--------|-------------|----------|
| Environment bootstrap admin | Uses env vars such as admin email/password. | yes |
| Fixed seed SQL admin | Simple, but risks committed default passwords. | |
| Manual DB role assignment | Avoids bootstrap flow but makes verification clumsy. | |
| Agent decides | Planner chooses bootstrap method. | |

**User's choice:** Environment-variable bootstrap admin.
**Notes:** `.env.example` must use placeholders only and logs must not print secrets.

| Option | Description | Selected |
|--------|-------------|----------|
| Unified JSON error object | Stable error codes/messages for API and tests. | yes |
| Simple JSON error string | Quick but less extensible. | |
| Gin default/plain text | Fastest but poor long-term API contract. | |
| Agent decides | Planner chooses error shape. | |

**User's choice:** Unified JSON error object.
**Notes:** Use a stable structure such as `error.code` and `error.message`.

---

## WebSocket Hub

| Option | Description | Selected |
|--------|-------------|----------|
| Query parameter token | Simple browser WebSocket flow but exposes token in URL/logs. | |
| First-message auth | Avoids token in URL; compatible with browser WebSocket. | yes |
| Cookie auth | Natural for browsers but conflicts with JWT-only phase shape. | |
| Agent decides | Planner chooses auth transport. | |

**User's choice:** First-message WebSocket auth.
**Notes:** Invalid or missing auth closes the connection.

| Option | Description | Selected |
|--------|-------------|----------|
| Registry by user ID with multiple connections | Matches SPEC and future user-targeted push. | yes |
| Global connection set | Simpler broadcast MVP, weaker user semantics. | |
| One connection per user | Simpler but violates SPEC multi-connection requirement. | |
| Agent decides | Planner chooses registry shape. | |

**User's choice:** Registry by user ID with multiple connections.
**Notes:** Supports multiple concurrent connections for the same user.

| Option | Description | Selected |
|--------|-------------|----------|
| Internal Hub method + Go tests | Keeps production API clean. | yes |
| Dev/test HTTP broadcast endpoint | Convenient but must be gated. | |
| Formal broadcast API | Too close to new business capability. | |
| Agent decides | Planner chooses test surface. | |

**User's choice:** Internal Hub method + Go tests.
**Notes:** Do not add broadcast HTTP APIs in Phase 08.

| Option | Description | Selected |
|--------|-------------|----------|
| MVP heartbeat | Ping/pong, deadline, stale connection cleanup. | yes |
| Close cleanup only | Simpler but weaker lifecycle reliability. | |
| Full reconnect protocol | Too broad for Phase 08. | |
| Agent decides | Planner chooses lifecycle detail. | |

**User's choice:** MVP heartbeat.
**Notes:** The user requested full reconnect protocol be recorded as a future follow-up.

---

## Local Development and Verification

| Option | Description | Selected |
|--------|-------------|----------|
| Root `docker-compose.server.yml` | Monorepo-friendly one-command dependency startup. | yes |
| `apps/server/docker-compose.yml` | Service-local but less convenient from root. | |
| Documentation only | Too weak for "locally runnable" acceptance. | |
| Agent decides | Planner chooses local dependency shape. | |

**User's choice:** Root `docker-compose.server.yml`.
**Notes:** The user uses Podman, so docs should lead with `podman compose` while optionally including Docker equivalents.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed default ports + `.env.example` | Simple defaults with env overrides. | yes |
| Non-default dependency ports | Avoids local conflicts but less familiar. | |
| All env, no defaults | Flexible but poor first-run experience. | |
| Agent decides | Planner chooses port/env defaults. | |

**User's choice:** Fixed default ports + `.env.example`.
**Notes:** Go server `9880`, PostgreSQL `5432`, Redis `6379`, all overrideable.

| Option | Description | Selected |
|--------|-------------|----------|
| Go unit tests + Podman-backed integration docs | Lightweight and Podman-compatible. | yes |
| testcontainers-go | Self-contained but more socket/runtime complexity. | |
| Manual curl only | Fast but insufficient for auth/RBAC/WS confidence. | |
| Agent decides | Planner chooses test strategy. | |

**User's choice:** Go unit tests + Podman-backed integration documentation.
**Notes:** Do not require testcontainers-go in Phase 08 by default.

---

## the agent's Discretion

- Exact package names and file names inside the locked `apps/server` + `internal/` shape.
- Exact golang-migrate CLI integration.
- Exact short access-token TTL.
- Exact WebSocket message envelope names.

## Deferred Ideas

- Full WebSocket reconnect protocol after Phase 08: client reconnect, close/error code semantics, and optional resume/compensation behavior.

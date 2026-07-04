# Phase 08: Go Server - Context

**Gathered:** 2026-07-03
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 08 delivers Paladin's first Go business server: a locally runnable Gin-based service under `apps/server` with PostgreSQL/Redis connectivity, email/password JWT authentication, user/admin RBAC, and a JWT-authenticated WebSocket Hub MVP.

This discussion clarified implementation decisions only. Requirements, boundaries, edge coverage, and must-NOT constraints are locked by `08-SPEC.md`.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `08-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `08-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Create the Go server application foundation in the existing monorepo structure.
- Add local PostgreSQL and Redis configuration needed for development and verification.
- Add migrations for `users`, `roles`, and `user_roles`.
- Add email/password registration and login APIs.
- Issue and validate JWTs for authenticated API access.
- Enforce `user` and `admin` RBAC on at least one protected admin route.
- Add a JWT-authenticated WebSocket Hub with connection lifecycle and broadcast MVP.
- Add tests or checks that prove the locked acceptance criteria.

**Out of scope (from SPEC.md):**
- Audit log persistence — Phase 9 Admin Systems owns audit history.
- Quota management and Redis counters for AI calls — Phase 9 owns quotas.
- Tauri sidecar management for the Go server — deferred until a server exists and belongs to later sidecar work.
- OAuth or third-party login — v1 uses internal RBAC auth only.
- Password reset, email verification, invitations, and account management UI — not required for the Phase 8 auth foundation.
- User-facing desktop integration with the Go server — this phase delivers the server contract, not the desktop client wiring.
- Production deployment, TLS termination, and packaging — Phase 10 owns distributable packaging concerns.
- WebSocket private messaging, rooms, persistence, or admin event streams — Phase 8 only requires the Hub MVP and broadcast path.

</spec_lock>

<decisions>
## Implementation Decisions

### Go Service Skeleton
- **D-01:** Use Gin for the Go HTTP server. The user chose Gin because it is familiar, convenient, full-featured, and has broad community adoption.
- **D-02:** Keep the Gin usage lightweight. Phase 08 should not introduce a heavy enterprise framework or copy `references/wps-cowork` architecture wholesale.
- **D-03:** Create an independent Go module under `apps/server`.
- **D-04:** Use an `internal/`-based layered structure, roughly: `cmd/server`, `internal/config`, `internal/http`, `internal/auth`, `internal/db`, `internal/ws`, and `migrations`.

### Data Access and Migrations
- **D-05:** Use `sqlc + pgx + SQL migrations` for PostgreSQL access.
- **D-06:** Rationale: this keeps SQL transparent, adds generated type-safe Go query methods, uses the modern PostgreSQL driver stack, and reduces the chance of later migrating away from hand-written scan-heavy raw SQL.
- **D-07:** Do not use GORM for Phase 08. GORM was considered, but the final decision changed back to `sqlc + pgx` for type safety and schema control.
- **D-08:** Use golang-migrate-style versioned SQL migration files, with clear `up`/`down` migration organization.
- **D-09:** Migration planning must preserve the SPEC constraints: duplicate email, duplicate role name, and duplicate user-role assignment are rejected by database constraints; repeated migrations are safe.

### Auth and RBAC
- **D-10:** Phase 08 uses short-lived access tokens only. Do not add refresh tokens in this phase.
- **D-11:** JWT claims include `sub`, `email`, `roles`, and `exp`.
- **D-12:** RBAC may use role claims from the JWT for Phase 08 because only `user/admin` roles are required and no role-management API exists yet. A future admin phase may revise this if role changes need immediate effect.
- **D-13:** Bootstrap the initial admin account from environment variables, such as `PALADIN_ADMIN_EMAIL` and `PALADIN_ADMIN_PASSWORD`.
- **D-14:** `.env.example` must contain placeholders only. Do not commit real secrets or default real passwords.
- **D-15:** Logs, error responses, and WebSocket messages must never include plaintext passwords or JWTs.
- **D-16:** API errors use a unified JSON error object, for example an `error.code` and `error.message` shape, rather than plain text or Gin defaults.

### WebSocket Hub
- **D-17:** WebSocket authentication uses a first-message auth handshake. The client connects, then its first message must provide a valid JWT; invalid auth or auth timeout closes the connection.
- **D-18:** Do not pass JWTs in the WebSocket query string for the Phase 08 implementation, to avoid URL/log exposure.
- **D-19:** The Hub registry is keyed by user ID and supports multiple concurrent connections per user.
- **D-20:** Broadcast remains an internal Hub method verified by Go tests. Do not add a dev/test HTTP broadcast endpoint or production broadcast API in Phase 08.
- **D-21:** Implement an MVP heartbeat: server ping/pong, read deadlines or pong handlers, and cleanup when a connection stops responding.
- **D-22:** Do not implement a full reconnect protocol in Phase 08.

### Local Development and Verification
- **D-23:** Add a root-level `docker-compose.server.yml` for local PostgreSQL and Redis dependencies.
- **D-24:** Document Podman-first commands, e.g. `podman compose -f docker-compose.server.yml up -d`. Docker-compatible equivalents may be included, but planning must not assume Docker is the only runtime.
- **D-25:** Use fixed default ports with env overrides: Go server `9880`, PostgreSQL `5432`, Redis `6379`.
- **D-26:** Provide `.env.example` with safe placeholders for database URL, Redis URL, JWT secret, bootstrap admin email/password, and server port.
- **D-27:** Verification should combine Go unit tests with documented Podman-backed integration checks. Do not require `testcontainers-go` in Phase 08 unless planning finds a compelling reason and keeps Podman compatibility clear.

### the agent's Discretion
- The planner may choose exact package names and file names inside the locked `apps/server` + `internal/` structure.
- The planner may choose the exact golang-migrate CLI integration pattern as long as versioned SQL migrations are clear and repeatable.
- The planner may choose exact JWT TTL, but it must remain a short-lived access-token-only design and be documented in `.env.example` or config defaults.
- The planner may choose exact WebSocket message envelope names for auth and broadcast tests, as long as first-message auth and internal broadcast-only scope are preserved.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked Phase Requirements
- `.planning/phases/08-go-server/08-SPEC.md` — Locked requirements, boundaries, constraints, acceptance criteria, edge coverage, and prohibitions for Phase 08.
- `.planning/ROADMAP.md` — Phase 08 placement and adjacent Phase 09/10 scope boundaries.
- `.planning/REQUIREMENTS.md` — SRV-01 through SRV-04 traceability and v1 out-of-scope items.
- `.planning/PROJECT.md` — Monorepo structure, Go business layer rationale, and Tauri/Python/Go/Rust stack constraints.
- `.planning/STATE.md` — Current project state and note that Phase 7b sidecar work remains deferred until after the Go server exists.

### Prior Phase Context
- `.planning/phases/07.2-legacy-sse-approval-cleanup/07.2-CONTEXT.md` — Confirms active approval path cleanup is complete and sidecar/admin work is out of scope.
- `.planning/phases/07.1-official-ag-ui-deferred-tool-approval/07.1-CONTEXT.md` — Official AG-UI approval path and Agent server integration that the Go server must not disturb.
- `.planning/phases/07-hitl-sidecar/07-CONTEXT.md` — Historical note that Go Server sidecar management was deferred until after the server exists.

### Current Code Integration Points
- `apps/agent/src/server/main.py` — Existing Python Agent FastAPI server owns `/copilotkit`, `/health`, and port `9876`; the Go server must use a separate port.
- `apps/agent/src/server/cli.py` — Existing Agent CLI prints health endpoint information and is a useful pattern for local developer ergonomics.
- `apps/desktop/src/App.tsx` — Desktop uses `HttpAgent` targeting `http://localhost:9876/copilotkit`; Phase 08 does not change this wiring.
- `apps/desktop/src/hooks/useAgentHealth.ts` — Current health-check pattern for the Python Agent; useful later when desktop integration with Go server is in scope.
- `apps/desktop/src-tauri/tauri.conf.json` — CSP currently allows `http://localhost:*`, so a local Go server port such as `9880` should not be blocked by desktop CSP.

### Reference Architecture
- `references/wps-cowork/apps/api/README.md` — Useful reference for Go service layering (`handlers`, `services`, `repo`, `internal`) and local service documentation, but do not copy its heavy framework choices.
- `references/wps-cowork/docs/local-dev-setup.md` — Useful reference for local dependency documentation style. Adapt to PostgreSQL/Redis + Podman for Paladin.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/agent/src/server/main.py`: Existing service shape for health endpoints and local dev CORS, but implemented in FastAPI/Python. Use as a behavior reference, not a Go code template.
- `apps/agent/src/server/cli.py`: Local developer output pattern for health URL and startup information.
- `apps/desktop/src-tauri/tauri.conf.json`: `connect-src` already permits `http://localhost:*`, which helps future desktop-to-Go integration.

### Established Patterns
- Monorepo applications live under `apps/`; Phase 08 should add `apps/server` to match `apps/desktop` and `apps/agent`.
- Project docs separate requirements (`SPEC.md`) from implementation decisions (`CONTEXT.md`). Planner must not re-litigate the locked SPEC.
- Recent approval cleanup removed legacy local HTTP/SSE approval paths. Do not reintroduce extra local service bridges while adding the Go server.
- Local services currently use explicit localhost ports; Python Agent uses `9876`, so Go Server defaults to `9880`.

### Integration Points
- No active Go server code exists yet: no `apps/server`, no `go.mod`, no migrations, and no Go tests.
- Phase 08 is server-only. Desktop client wiring, Tauri sidecar configuration, audit logs, and quotas are later phases.
- PostgreSQL and Redis are new dependencies for the active Paladin codebase and need local Podman-compatible setup.

</code_context>

<specifics>
## Specific Ideas

- The user wants explanations before major technical choices, especially when community practice or future migration risk is involved.
- The user explicitly changed the data-layer decision from GORM back to `sqlc + pgx + migration SQL` after discussing long-term maintainability.
- Podman is the user's local container runtime preference. Documentation should lead with Podman commands.

</specifics>

<deferred>
## Deferred Ideas

- Implement a complete WebSocket reconnect protocol after Phase 08. This should cover client reconnect behavior, close/error code semantics, and any future resume or message compensation strategy. Phase 08 only implements MVP ping/pong cleanup.

</deferred>

---

*Phase: 08-go-server*
*Context gathered: 2026-07-03*

# Phase 09: Admin Systems - Context

**Gathered:** 2026-07-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Phase 09 builds admin capabilities on top of the Phase 8 Go server foundation: durable PostgreSQL-backed audit logging of security-relevant actions, per-user AI-call quota management backed by Redis sliding-window counters, and a completed WebSocket Hub that can deliver structured per-user and admin event streams.

This discussion clarified implementation decisions only. Requirements, boundaries, edge coverage, and must-NOT constraints are locked by `09-SPEC.md`.

</domain>

<spec_lock>
## Requirements (locked via SPEC.md)

**6 requirements are locked.** See `09-SPEC.md` for full requirements, boundaries, and acceptance criteria.

Downstream agents MUST read `09-SPEC.md` before planning or implementing. Requirements are not duplicated here.

**In scope (from SPEC.md):**
- Add an `audit_logs` migration and recording hooks for auth, RBAC-denial, and quota events.
- Add an admin-only audit query API with cursor pagination and filtering.
- Add per-user AI-call quota state in Redis with configurable limit/window and a status query.
- Add a quota check-and-consume gate that rejects over-limit AI calls with 429 `quota_exceeded`.
- Complete the WebSocket Hub with structured envelopes, per-user delivery, and admin event streaming.
- Add tests proving the locked acceptance criteria (TDD per project config).

**Out of scope (from SPEC.md):**
- Tauri sidecar management for any process — still deferred (Phase 7b / later sidecar work).
- Desktop admin UI screens — this phase delivers server contracts and a WebSocket event stream, not a desktop admin console.
- Wiring the Python Agent or desktop AI path to call the Go quota gate end-to-end — the spec requires a functional, testable quota gate on the server side; full AI-path integration is a follow-on dependency.
- OAuth, password reset, email verification, invitations — v1 uses internal RBAC auth only.
- Audit log retention policies, archival, and long-term storage rotation.
- Production deployment, TLS termination, and packaging — Phase 10.

</spec_lock>

<decisions>
## Implementation Decisions

### Audit Log Storage Schema (R1)
- **D-01:** The `audit_logs` schema field set is left to the planner within the SPEC-locked minimum constraints. SPEC mandates at least `id`, nullable `user_id`, `action`, `status`, immutable `created_at`, and a JSONB `metadata` column; R2 acceptance additionally requires `request_ip`. The planner may add fields (e.g. `user_agent`, `trace_id`, `method`, `path`, `status_code`) in plan waves, but MUST satisfy the SPEC minimum, reject null `action`/`status`, and preserve monotonic `created_at` ordering. The decision to defer exact columns is intentional: schema is a plan-time trade-off between query ergonomics and write cost.

### Audit Log Recording (R2)
- **D-02:** Audit recording uses a hybrid entry-point strategy: a Gin post-handler middleware records HTTP-layer events (RBAC denials, route hits, status codes), while business-semantic events (login success/failure, registration, quota exceeded) are emitted via explicit `audit.Log()` calls inside the relevant handlers. This dual approach covers cases the middleware cannot infer (e.g. login success vs. invalid-credential failure need business logic) while ensuring RBAC denials—which occur at the middleware layer before a handler runs—are never missed.
- **D-03:** JSONB `metadata` is constructed via an explicit per-action allowlist. Each action type (e.g. `auth.login`, `auth.register`, `rbac.deny`, `quota.exceeded`) has a predefined set of fields it may carry (e.g. login = `{ip, user_agent}`); handlers pass only allowlisted fields. This structurally guarantees no password, password hash, JWT, or bearer token can leak into audit storage, satisfying the SPEC must-NOT prohibition without relying on a fallible recursive redaction pass.

### Audit Log Query API (R3)
- **D-04:** `GET /admin/audit-logs` uses cursor pagination based on a composite `(created_at, id)` keyset. This gives stable deep-paging performance on an append-only, chronologically ordered table (offset pagination degrades on page N as the table grows, and keyset-by-id alone cannot satisfy the SPEC `newest first` ordering requirement). Filters by user, action, and status compose with the cursor; an out-of-range cursor returns an empty page rather than an error.

### Quota Counting Algorithm (R4)
- **D-05:** Per-user AI-call quota uses a **sliding window** algorithm backed by a Redis Sorted Set (ZSET) and a Lua script. Each AI call is recorded as a ZSET member scored by timestamp; the window slides by evicting members older than `now - window`, then counting remaining members. This is the production-grade rate-limiting approach used by Stripe, GitHub, and Twitter, and provides smooth counting without the fixed-window boundary 2x burst. It also makes the SPEC R5 "no lost/over count under concurrency" acceptance provable, since the window is continuous rather than discrete.

### Redis Atomicity (R5)
- **D-06:** The check-and-consume operation is implemented as a single Redis Lua script (`EVALSHA`) that atomically executes `ZREMRANGEBYSCORE` (evict expired) + `ZCARD` (count) + conditional `ZADD` (record this call) + `EXPIRE` (auto-cleanup). Redis executes the entire script without interleaving other commands, which is the **only** way to eliminate the TOCTOU race (read-count → decide → write) that would otherwise allow concurrent over-limit requests through. This is mandatory for the SPEC R5 concurrency acceptance; WATCH/MULTI is rejected for retry storms under high contention, and no single native Redis command can express a sliding-window check-and-consume.

### Quota Gate Integration (R5)
- **D-07:** The quota check-and-consume gate is exposed as a Gin middleware mounted on protected AI routes. Before the AI handler runs, the middleware resolves the user ID from the JWT context, consults Redis via the Lua script, and either proceeds or aborts with 429 `quota_exceeded` plus a remaining/reset hint. AI handlers remain quota-unaware. Because Phase 9 does not wire the real Python Agent AI path end-to-end (that is a tracked dependency, not a deliverable), the middleware is validated against a mock/sample AI route that exercises the same contract.

### Unlimited Users (R5)
- **D-08:** The existing `admin` role doubles as the "unlimited" designation: any user whose JWT claims contain the `admin` role bypasses the quota gate entirely. This requires no new database column, no new migration, and no new configuration surface—it reuses the Phase 8 RBAC machinery. The SPEC R5 acceptance ("admin-configured unlimited users are not rejected by the quota gate") is satisfied because the middleware checks roles from the JWT context and short-circuits for admins before touching Redis.

### WebSocket Hub Completion (R6)
- **D-09:** The Hub registry is upgraded to a dual-index structure: `map[userID][]Conn` (preserved from Phase 8 for per-user delivery) plus `map[role][]userID` (new, for role-targeted fan-out). This mirrors the channel/role dispatch model used by chat platforms and lets `SendToUser(uid)` be O(1) while `SendToRole("admin", envelope)` avoids the O(N) full-scan that a single-index-plus-filter design would impose. The Phase 8 broadcast path is preserved unchanged.
- **D-10:** The WebSocket message envelope format is left to the planner within the SPEC-locked constraint of "a structured envelope with at least a type and payload" and "unknown types handled without panicking." The planner may settle on `{type, payload, ts}` or a richer `{event, data, meta}` shape in plan waves; the hard constraints are (a) the envelope is structured JSON, (b) dispatch is type-driven, and (c) an unrecognized type is a logged no-op rather than a panic or connection drop.
- **D-11:** Behavior when `SendToUser` targets an offline user is locked by SPEC R6 ("a no-op, not an error") and left to the planner to implement literally: the Hub returns no error and delivers nothing when no connection exists for the target user. This matches fire-and-forget event-stream semantics and is distinct from message-queue durability (which SPEC and Phase 8 explicitly defer).
- **D-12:** The path by which audit and quota events fan out to admin connections is left to the planner, with the hard constraint that admin-role connections receive these events. The planner may choose direct `hub.SendToRole("admin", envelope)` calls at the business event site (audit write, quota rejection) for real-time delivery and zero extra infrastructure, or route through an internal channel/Redis pubsub if decoupling is justified during planning. SPEC R6 acceptance only requires that admin connections receive the events, not a specific transport.

### Agent's Discretion
- The planner chooses the exact `audit_logs` column superset within the SPEC minimum (D-01).
- The planner chooses exact Gin middleware registration order and the explicit-audit call sites (D-02).
- The planner chooses the exact per-action metadata allowlist field names (D-03).
- The planner chooses the exact cursor encoding (opaque base64 token vs. transparent query params) for audit pagination (D-04).
- The planner chooses exact Redis key naming conventions (e.g. `quota:{uid}` vs. `paladin:quota:{uid}`) (D-05, D-06).
- The planner chooses the exact Lua script argument layout and return tuple shape (D-06).
- The planner chooses the exact mock/sample AI route used to validate the quota gate contract (D-07).
- The planner chooses the exact WebSocket envelope field names and unknown-type logging depth (D-10).
- The planner chooses the exact admin-event-fan-out transport (direct vs. decoupled) (D-12), as long as real-time delivery to admin connections is preserved.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Locked Phase Requirements
- `.planning/phases/09-admin-systems/09-SPEC.md` — Locked requirements, boundaries, constraints, acceptance criteria, edge coverage, and prohibitions for Phase 09.
- `.planning/ROADMAP.md` — Phase 09 placement and adjacent Phase 10 scope boundaries.
- `.planning/REQUIREMENTS.md` — ADM-01 through ADM-03 traceability and v1 out-of-scope items.

### Prior Phase Context (Phase 8 foundation this phase builds on)
- `.planning/phases/08-go-server/08-CONTEXT.md` — Phase 8 implementation decisions (D-01..D-27) that Phase 9 must not rewrite: Gin, sqlc+pgx, golang-migrate, JWT claims `{sub,email,roles,exp}`, RBAC `RequireRole`, Hub `map[userID][]Conn`, internal-only broadcast, Podman-first local dev.
- `.planning/phases/08-go-server/08-SPEC.md` — Phase 8 explicit hand-offs to Phase 9 (audit logs, quota + Redis counters, WebSocket completion beyond broadcast MVP).
- `.planning/phases/08-go-server/08-PATTERNS.md` — Pattern mapping for the Go service layer that Phase 9 extends (hub.go, redis.go, server.go, middleware chain).

### Current Code Integration Points
- `apps/server/internal/ws/hub.go` — Current `map[string]Conn` flat-broadcast Hub that Phase 9 upgrades to dual-index + structured envelopes + per-user/role delivery.
- `apps/server/internal/http/ws/handler.go` — Current `/ws` handler with JWT auth, ping loop, and discarded inbound frames; Phase 9 must preserve auth rejection and lifecycle.
- `apps/server/internal/db/redis.go` — Current Redis client factory (connect + ping only); Phase 9 adds the quota ZSET + Lua script.
- `apps/server/internal/http/server.go` — Current Gin engine route registration; Phase 9 adds `/admin/audit-logs`, the quota gate middleware, and any mock AI route.
- `apps/server/internal/http/middleware/jwt.go` + `rbac.go` (RequireRole) — Phase 8 RBAC machinery reused for admin-only audit API and quota-admin bypass.
- `apps/server/internal/auth/jwt.go` — `Claims{Email, Roles, Subject}` shape consumed by the quota middleware to resolve user ID and admin role.
- `apps/server/internal/http/handler/auth_handler.go` — Explicit audit call sites for login success/failure and registration.
- `apps/server/migrations/000001_init_schema.up.sql` — Existing `users`/`roles`/`user_roles` schema; Phase 9 adds a new migration for `audit_logs`.
- `apps/server/sqlc.yaml` — sqlc codegen config; Phase 9 adds audit-log query files under `internal/db/queries/`.
- `apps/server/internal/config/config.go` — Env-driven config; Phase 9 adds quota limit/window env vars.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `apps/server/internal/http/middleware/jwt.go` `Auth(secret)` + `RequireRole(want)` — Phase 9 reuses these directly for the admin-only audit API route and the quota middleware's admin bypass.
- `apps/server/internal/http/middleware/error.go` `WriteError(c, code, errorCode, message)` — Phase 9 reuses this for the unified `quota_exceeded` 429 response shape.
- `apps/server/internal/db/redis.go` `NewRedisClient` — Phase 9 reuses the connected client; no new Redis connection layer needed.
- `apps/server/internal/ws/hub.go` `Conn` interface + `Register`/`Unregister`/`Broadcast` — Phase 9 extends rather than replaces; the existing `Conn.ID()` contract is preserved.
- `apps/server/internal/db/sqlc/` codegen pipeline — Phase 9 adds audit-log SQL queries following the same `-- name: Foo :one` annotation convention.

### Established Patterns
- Migrations are golang-migrate-style versioned SQL (`NNNNNN_name.up.sql` / `.down.sql`); Phase 9 adds `000003_audit_logs.*` following the same idempotency rules.
- API errors use the unified `{"error":{"code","message"}}` shape (Phase 8 D-16); Phase 9's `quota_exceeded` follows the same shape.
- RBAC is JWT-claims-based (Phase 8 D-12); Phase 9 does not introduce DB-backed role lookups.
- The Hub is JWT-authenticated at `/ws` (Phase 8 D-17, D-18); Phase 9 preserves first-message/transport-auth behavior.
- Local dev is Podman-first via `docker-compose.server.yml` (Phase 8 D-23, D-24); Phase 9 adds no new dependencies.

### Integration Points
- Phase 9 is server-only. Desktop admin UI, Tauri sidecar wiring, and Python Agent AI-path integration are explicitly out of scope.
- The quota gate middleware will be mounted on a mock/sample AI route for Phase 9 verification; real AI-path wiring is a tracked dependency for a later phase.
- The audit table is append-only; no Phase 9 code path updates or deletes audit rows.
- Redis is the source of truth for live quota counters; PostgreSQL is the source of truth for audit history. The two do not cross-reference at runtime in Phase 9.

</code_context>

<specifics>
## Specific Ideas

- The user wants explanations before major technical choices and asks probing questions about production practices (e.g. "what would a production product use?" and "why must it be a Lua script?"). Planner research and plan waves should preserve this explanatory posture.
- The user explicitly chose the sliding-window quota algorithm after learning it matches Stripe/GitHub/Twitter production practice — the "求职讲解价值" (resume/interview talking-point value) of matching industry-standard rate limiting was a deciding factor. Plans should preserve this framing in code comments and any admin-facing docs.
- The user expects the Lua-script rationale (TOCTOU race, atomicity) to be documented in code or plan notes, not just assumed.
- Several decisions were intentionally deferred to the planner (audit schema columns, envelope field names, offline/admin-fan-out transport) — the user trusts the planner within the SPEC hard constraints. Plans should treat these as decided-at-plan-time, not as open questions for the user.

</specifics>

<deferred>
## Deferred Ideas

- Wiring the Python Agent / desktop AI path to call the Go quota gate end-to-end. Phase 9 delivers the server-side contract; full AI-path integration is a follow-on dependency tracked in `09-SPEC.md` Boundaries, not a Phase 9 deliverable.
- Desktop admin console UI for browsing audit logs and quota status. Phase 9 delivers server APIs and a WebSocket event stream only.
- Audit log retention policies, archival, and long-term storage rotation. Phase 9 persists and queries; lifecycle management is a future concern.
- Quota override UI and per-user custom limits beyond the admin-bypass rule. Phase 9 uses a single global limit/window with admin bypass; per-user custom limits would require a `user_quotas` table in a later phase.
- WebSocket message durability (offline message replay via Redis streams). Phase 9 is fire-and-forget per SPEC R6; durable replay remains out of scope consistent with Phase 8 boundaries.

</deferred>

---

*Phase: 09-admin-systems*
*Context gathered: 2026-07-04*

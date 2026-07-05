# Phase 09: Admin Systems — Specification

**Created:** 2026-07-04
**Ambiguity score:** 0.15 (gate: ≤ 0.20)
**Requirements:** 6 locked

## Goal

Paladin's Go business layer gains the v1 admin capabilities promised by the project architecture: durable audit logging of security-relevant actions, per-user AI-call quota management backed by Redis counters, and a completed WebSocket Hub that can deliver structured per-user and admin event streams.

## Background

Phase 8 delivered the Go server foundation: PostgreSQL/Redis connectivity, email/password JWT auth, `user`/`admin` RBAC, and a JWT-authenticated WebSocket Hub broadcast MVP. The Phase 8 spec explicitly deferred three concerns to Phase 9:

- Audit log persistence — "Phase 9 Admin Systems owns audit history."
- Quota management and Redis counters for AI calls — "Phase 9 owns quotas."
- WebSocket private messaging, rooms, persistence, and admin event streams — "Phase 8 only requires the Hub MVP and broadcast path."

Today the repository contains no admin systems on top of that foundation:

- The only database tables are `users`, `roles`, and `user_roles` (migration `000001_init_schema`); there is no audit table and no migration creating one.
- `apps/server/internal/ws/hub.go` keeps a flat `map[string]Conn` with `Register`, `Unregister`, `ClientCount`, and a single `Broadcast(msg []byte)` path. There is no message envelope/type, no per-user send, and no admin event fan-out.
- `apps/server/internal/http/ws/handler.go` authenticates `/ws`, runs a ping loop, and discards every inbound frame in `readLoop`; it never emits typed events to subsets of connections.
- `apps/server/internal/db/redis.go` only constructs and pings a client; no Redis key is read or written anywhere in `apps/server`.
- `apps/server/internal/http/server.go` registers `/healthz`, `/readyz`, `/auth/register`, `/auth/login`, `/me`, `/admin/health`, and `/ws`; there are no audit, quota, or admin event-stream routes, and no middleware records security events.

Phase 9 builds exclusively on the Phase 8 server contract. It must not rewrite the auth/RBAC foundation, and it must leave Phase 10 free to handle distributable packaging and Tauri sidecar process management.

## Requirements

1. **Audit log storage schema**: Database migrations create a durable audit log table that can record who did what, when, and with what outcome.
   - Current: No audit table or migration exists; the only persisted auth state is `users`, `roles`, and `user_roles`.
   - Target: A migration creates an `audit_logs` table with at least an auto-incrementing id, a nullable `user_id`, an `action`, a `status` (success/failure), an immutable `created_at`, and a JSONB `metadata` column; re-applying the migration is safe.
   - Acceptance: Applying migrations to an empty database creates `audit_logs`; applying migrations repeatedly is safe; the table rejects null `action`/`status` values; inserts preserve a monotonically increasing `created_at` order for chronology.

2. **Audit log recording**: Security-relevant server actions are persisted to the audit log without leaking secrets.
   - Current: No code path writes an audit record; login, registration, RBAC denials, and admin access are unobservable after the fact.
   - Target: Successful and failed login, registration, RBAC denials on protected/admin routes, and quota-exceeded events each produce an audit record with the resolved user id (nullable when unauthenticated), action, status, request IP, and a small JSONB metadata payload.
   - Acceptance: A successful login yields a success audit record; an invalid-credential login yields a failure audit record; registering a new email yields a registration record; a `user`-role request to an admin route yields an RBAC-denial record; a quota-exceeded AI request yields a quota record; no audit record or metadata field contains a password, password hash, JWT, or bearer token.

3. **Audit log admin query API**: Administrators can inspect audit history through an authenticated, paginated, filterable API.
   - Current: No audit query route exists.
   - Target: An admin-only `GET /admin/audit-logs` route returns audit records with cursor or offset pagination and filtering by user, action, and status.
   - Acceptance: Missing or invalid JWT returns 401; a `user`-role token returns 403; an `admin`-role token returns paginated results; filters narrow results correctly; an out-of-range page returns an empty page rather than an error.

4. **Quota management state**: Per-user AI-call quota is tracked in Redis with a configurable window and limit.
   - Current: No Redis key is written by the server; there is no quota counter, limit, or window configuration.
   - Target: The server reads a per-user AI-call limit and reset window from configuration and maintains a per-user counter in Redis keyed by user and window; quota status (used/limit/remaining/reset) is queryable.
   - Acceptance: A configured limit and window are honored for each user; the counter increments on each consumed AI call; the counter resets to zero after the window elapses; quota status reports used, limit, remaining, and reset time consistently with the counter.

5. **Quota enforcement gate**: AI calls that would exceed the per-user quota are rejected with a clear, distinguishable error before they are served.
   - Current: No quota check, consume, or rejection path exists; nothing in the server limits AI-call volume.
   - Target: The server exposes a quota check-and-consume gate such that a request past the configured limit is rejected with a `quota_exceeded` error (HTTP 429) and a remaining/reset hint, while a request within the limit is allowed and counted exactly once.
   - Acceptance: Requests within the limit succeed and increment the counter by exactly one each; the request that crosses the limit is rejected with 429 and a `quota_exceeded` code; concurrent in-limit requests are counted without losing increments; admin-configured unlimited users are not rejected by the quota gate; quota-exceeded rejections are themselves audit-logged (per R2).

6. **WebSocket Hub completion**: The Hub supports structured messages, per-user delivery, and an admin event stream, while preserving Phase 8 auth behavior.
   - Current: The Hub only broadcasts opaque bytes to all connections and ignores inbound frames; there are no message types, no per-user send, and no admin event fan-out.
   - Target: The Hub accepts a structured message envelope (at least a type and payload), can deliver a message to a single user's connection(s), and fans audit and quota events to admin-role connections; unauthenticated connections remain rejected.
   - Acceptance: A structured envelope with an unknown type is handled without panicking; a per-user message reaches only that user's connection(s) and no others when the user is connected, and is a no-op (not an error) when the user is offline; audit and quota events reach admin-role connections; a connection without a valid JWT is still rejected at `/ws`; broadcast still reaches all active connections.

## Boundaries

**In scope:**
- Add an `audit_logs` migration and the recording hooks for auth, RBAC-denial, and quota events.
- Add an admin-only audit query API with pagination and filtering.
- Add per-user AI-call quota state in Redis with configurable limit/window and a status query.
- Add a quota check-and-consume gate that rejects over-limit AI calls with 429 `quota_exceeded`.
- Complete the WebSocket Hub with structured envelopes, per-user delivery, and admin event streaming.
- Add tests proving the locked acceptance criteria (TDD per project config).

**Out of scope:**
- Tauri sidecar management for any process — still deferred (Phase 7b / later sidecar work).
- Desktop admin UI screens — this phase delivers server contracts and a WebSocket event stream, not a Paladin desktop admin console.
- Wiring the Python Agent or desktop AI path to call the Go quota gate end-to-end — the spec requires a functional, testable quota gate on the server side; full AI-path integration is a follow-on concern tracked as a dependency, not a Phase 9 deliverable.
- OAuth, password reset, email verification, invitations — v1 uses internal RBAC auth only.
- Audit log retention policies, archival, and long-term storage rotation — Phase 9 persists and queries audit history; retention/rotation is not required for v1.
- Production deployment, TLS termination, and packaging — Phase 10 owns distributable packaging.
- Token-bucket vs sliding-window algorithm selection beyond "a reset window with a per-user limit" — the exact counter algorithm is an implementation decision for planning.

## Constraints

- All work happens inside the existing `apps/server` Go service and its migrations; the auth/RBAC foundation from Phase 8 must not be rewritten.
- PostgreSQL is the source of truth for audit logs; Redis is the source of truth for live quota counters.
- Audit records are append-only; they must never be updated or deleted by application code in Phase 9.
- Audit logging and quota enforcement must not echo or persist secrets (passwords, hashes, JWTs, bearer tokens).
- Audit and quota admin APIs require a valid JWT carrying the `admin` role; RBAC reuse is mandatory, not reimplementation.
- The quota gate must be deterministic and safe under concurrent in-limit requests (no lost increments, no over-count).
- WebSocket auth stays JWT-based; Phase 8's `/ws` rejection of unauthenticated clients must remain in force.
- Local development must remain verifiable with the existing `docker-compose.server.yml` PostgreSQL + Redis stack and the existing migration runner.

## Acceptance Criteria

- [ ] A migration creates the `audit_logs` table on an empty database.
- [ ] Re-running migrations is safe and does not duplicate schema state.
- [ ] `audit_logs` rejects null `action` or null `status` values.
- [ ] A successful login produces a success audit record.
- [ ] An invalid-credential login produces a failure audit record.
- [ ] Registering a new email produces a registration audit record.
- [ ] A `user`-role request to an admin route produces an RBAC-denial audit record.
- [ ] A quota-exceeded AI request produces a quota audit record.
- [ ] No audit record or metadata field contains a password, password hash, JWT, or bearer token.
- [ ] `GET /admin/audit-logs` returns 401 for a missing or invalid JWT.
- [ ] `GET /admin/audit-logs` returns 403 for a `user`-role token.
- [ ] `GET /admin/audit-logs` returns paginated results for an `admin`-role token.
- [ ] Audit filters by user, action, and status narrow results correctly.
- [ ] An out-of-range audit page returns an empty page rather than an error.
- [ ] A configured per-user AI-call limit and reset window are honored.
- [ ] The Redis quota counter increments on each consumed AI call.
- [ ] The quota counter resets to zero after the window elapses.
- [ ] Quota status reports used, limit, remaining, and reset time consistently with the counter.
- [ ] In-limit AI requests succeed and increment the counter by exactly one each.
- [ ] The request that crosses the limit is rejected with HTTP 429 and a `quota_exceeded` code.
- [ ] Concurrent in-limit requests are counted without losing increments.
- [ ] Admin-configured unlimited users are not rejected by the quota gate.
- [ ] The Hub accepts a structured envelope and handles unknown types without panicking.
- [ ] A per-user message reaches only that user's connection(s).
- [ ] A per-user message to an offline user is a no-op, not an error.
- [ ] Audit and quota events reach admin-role WebSocket connections.
- [ ] A WebSocket connection without a valid JWT is still rejected at `/ws`.
- [ ] Broadcast still reaches all active WebSocket connections.
- [ ] Phase 9 does not implement Tauri sidecar management, a desktop admin console, OAuth, or packaging.

## Edge Coverage

**Coverage:** 18/18 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| empty | R1 | resolved / explicit | Applying migrations to an empty database creates the full `audit_logs` schema. |
| adjacency | R1 | resolved / explicit | Duplicate or null `action`/`status` values are rejected by table constraints. |
| ordering | R1 | resolved / explicit | Audit chronology is established by a monotonically increasing `created_at`. |
| idempotency | R1 | resolved / explicit | Re-running migrations is safe and does not duplicate schema state. |
| concurrency | R1 | dismissed | Migration execution is serialized by the existing migration runner; concurrent runners are out of scope. |
| empty | R2 | resolved / explicit | Unauthenticated actions still record an audit row with a null `user_id`. |
| encoding | R2 | resolved / explicit | Structured context is stored as JSONB metadata; secret fields are excluded by a documented allowlist. |
| idempotency | R2 | resolved / explicit | A single security action produces exactly one audit record, not duplicates. |
| concurrency | R2 | resolved / explicit | Audit recording must not lose a record under concurrent auth/admin requests. |
| adjacency | R3 | resolved / explicit | Filters by user/action/status compose to narrow results. |
| empty | R3 | resolved / explicit | An out-of-range page returns an empty page rather than an error. |
| ordering | R3 | resolved / explicit | Results are ordered by `created_at` (newest first) for predictable pagination. |
| idempotency | R3 | resolved / explicit | Repeating the same query returns the same page for unchanged data. |
| idempotency | R4 | resolved / explicit | Querying quota status does not mutate the counter. |
| concurrency | R4 | resolved / explicit | Counter reads/writes are atomic so concurrent status reads observe a consistent value. |
| empty | R5 | resolved / explicit | A user with zero usage is allowed (not rejected) on their first request. |
| concurrency | R5 | resolved / explicit | Concurrent in-limit requests are counted exactly once each; the over-limit request is the one that crosses the limit. |
| ordering | R5 | resolved / explicit | Check-then-consume is ordered so that the limit boundary request is deterministically rejected. |
| adjacency | R6 | resolved / explicit | Per-user delivery reaches only the target user's connection(s); others are unaffected. |
| empty | R6 | resolved / explicit | A per-user message to an offline user is a no-op; an unknown envelope type is handled without panicking. |
| idempotency | R6 | resolved / explicit | Unregister is safe if invoked more than once for the same connection (preserved from Phase 8). |
| concurrency | R6 | resolved / explicit | Admin event fan-out must not panic under concurrent active connections. |

## Prohibitions (must-NOT)

**Coverage:** 5/5 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT persist or echo passwords, password hashes, JWTs, or bearer tokens in audit logs or quota metadata. | R2, R5 | resolved / test | Negative checks verify audit rows and quota responses contain no secret fields. |
| MUST NOT allow the audit or quota admin APIs without a valid `admin`-role JWT. | R3, R4, R5 | resolved / test | Route tests cover missing/invalid JWT (401) and `user`-role (403) rejection. |
| MUST NOT allow an AI call to proceed once the per-user quota is exceeded. | R5 | resolved / test | Quota tests verify the over-limit request returns 429 `quota_exceeded`. |
| MUST NOT lose quota increments or over-count under concurrent in-limit requests. | R5 | resolved / test | Concurrency tests verify each in-limit request increments the counter exactly once. |
| MUST NOT rewrite the Phase 8 auth/RBAC foundation or weaken `/ws` JWT rejection. | R2, R3, R6 | resolved / test | Regression tests confirm auth, RBAC, and `/ws` unauthenticated-rejection behavior is unchanged. |

Canon security/compliance notes: SQL injection, Redis key injection, PII minimization, log injection, and general OWASP hardening are security review concerns for `$gsd-secure-phase` and implementation planning. They are not expanded here as bespoke Phase 9 prohibitions.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes |
|--------------------|-------|------|--------|-------|
| Goal Clarity       | 0.90  | 0.75 | met | Audit + quota + completed Hub is the locked deliverable; Phase 8 boundary statements anchor scope. |
| Boundary Clarity   | 0.86  | 0.70 | met | Sidecar, desktop admin UI, AI-path end-to-end wiring, retention, and packaging are explicitly out of scope. |
| Constraint Clarity | 0.82  | 0.65 | met | PostgreSQL for audit, Redis for quota, append-only audit, admin-only APIs, JWT `/ws` preserved. |
| Acceptance Criteria| 0.80  | 0.70 | met | Pass/fail criteria cover schema, recording, query API, quota state, quota gate, Hub completion, edges, and must-NOTs. |
| **Ambiguity**      | 0.15  | ≤0.20 | met | Gate passed after two interview rounds; the quota AI-path integration fork is locked as a dependency, not a deliverable. |

Status: met = dimension meets minimum, below = planner treats as assumption

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 1 | Researcher | What exists today for admin systems on the Go server? | No audit table/migration, no audit routes, Hub is broadcast-only with inbound frames discarded, Redis is connected but unused, no quota state or routes. |
| 1 | Researcher | What did Phase 8 explicitly hand to Phase 9? | Audit log persistence, quota management + Redis counters, and WebSocket completion (per-user/admin event streams beyond the broadcast MVP). |
| 1 | Researcher | Where do audit logs live? | PostgreSQL append-only `audit_logs` table with JSONB metadata; Redis is reserved for live quota. |
| 1 | Boundary Keeper | What is explicitly not part of Phase 9? | Tauri sidecar management, a desktop admin console, OAuth, retention/archival, and packaging all stay out of scope. |
| 2 | Simplifier | What is the quota model? | A per-user AI-call limit over a reset window, tracked by a Redis counter keyed by user + window, with a queryable used/limit/remaining/reset status. |
| 2 | Boundary Keeper | How is the quota gate related to the AI path? | Phase 9 delivers a functional, testable check-and-consume gate on the server; wiring the Python Agent/desktop AI path to call it is a follow-on dependency, not a Phase 9 deliverable. |
| 2 | Simplifier | What does "Hub completion" mean concretely? | Structured message envelope (type + payload), per-user delivery, and audit/quota event fan-out to admin connections, with Phase 8 JWT rejection preserved. |
| 2 | Boundary Keeper | Are unlimited/admin users quota-gated? | No — admin-configured unlimited users bypass the quota rejection, but their AI calls may still be audit-logged. |
| Edge Probe | Completeness | Which edge cases must be locked? | Idempotent migrations, null-action rejection, append-only ordering, exactly-once audit per action, no-secret metadata, out-of-range empty page, quota counter reset, exactly-once increment, deterministic over-limit rejection, per-user no-op for offline users, and unknown-envelope safety. |
| Prohibition Probe | Must-NOT | What must the feature never silently become? | No secret persistence, no admin-API access without admin role, no AI call past quota, no lost/over counted increments, and no regression of Phase 8 auth/RBAC/`/ws` guarantees. |

---

*Phase: 09-admin-systems*
*Spec created: 2026-07-04*
*Next step: $gsd-discuss-phase 09 — implementation decisions (how to build what's specified above)*

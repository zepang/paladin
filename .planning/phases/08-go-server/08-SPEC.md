# Phase 08: Go Server — Specification

**Created:** 2026-07-03
**Ambiguity score:** 0.15 (gate: <= 0.20)
**Requirements:** 6 locked

## Goal

Paladin gains a locally runnable Go business server that provides the v1 auth foundation: PostgreSQL/Redis connectivity, email/password JWT authentication, user/admin RBAC, and a JWT-authenticated WebSocket Hub.

## Background

Paladin currently has a working desktop shell, React/CopilotKit chat UI, Rust terminal/file commands, Python Pydantic AI Agent, AG-UI integration, Agent tools, Computer Use, and official AG-UI HITL approval. The repository does not yet contain a Go server: there is no `apps/server` source tree, no `go.mod`, no PostgreSQL or Redis application configuration, no auth API, no RBAC middleware, and no WebSocket Hub implementation.

Phase 8 starts the Go business layer promised by the project architecture. It is independent of the already completed desktop and Agent layers, but it must leave a clean contract for later Tauri sidecar management and Phase 9 admin systems. Phase 7 explicitly deferred Go Server sidecar management until after this server exists, and Phase 9 owns audit logs, quotas, and admin extensions.

## Requirements

1. **Go server skeleton**: A Go service exists under the monorepo and can start locally with health endpoints that report service, PostgreSQL, and Redis status.
   - Current: No Go server source tree, module, command entrypoint, or health endpoint exists.
   - Target: A Go server app can be launched locally and exposes health/readiness endpoints that verify PostgreSQL and Redis connectivity.
   - Acceptance: Starting the server with local configuration succeeds; health checks return success when PostgreSQL and Redis are reachable and return a failure status when either dependency is unavailable.

2. **PostgreSQL auth schema**: Database migrations create the minimum auth schema for users, roles, and user-role assignments.
   - Current: No PostgreSQL schema or migration files exist for the Go business layer.
   - Target: Migrations create `users`, `roles`, and `user_roles` tables with enough constraints to support email/password auth and at least `user` and `admin` roles.
   - Acceptance: Applying migrations to an empty database creates all three tables; applying migrations repeatedly is safe; duplicate emails, duplicate role names, and duplicate user-role assignments are rejected by database constraints.

3. **JWT registration and login**: Users can register and log in with email/password and receive a JWT for authenticated API access.
   - Current: No registration, login, password persistence, or token issuance exists.
   - Target: Register creates a user with a normalized unique email and default `user` role; login validates credentials and returns a JWT accepted by protected routes.
   - Acceptance: Registering a new email succeeds; registering the same email again returns conflict; empty email/password inputs are rejected; login with valid credentials returns a JWT; login with invalid credentials fails without returning a token.

4. **RBAC enforcement**: The server enforces at least `user` and `admin` roles and protects a sample admin route.
   - Current: No authorization middleware or role model exists.
   - Target: Authenticated requests carry role claims or role lookup state, and an admin-only route is accessible only to users with the `admin` role.
   - Acceptance: No token or an invalid token cannot access protected routes; a normal `user` cannot access the admin route; an `admin` can access the admin route; duplicate role assignment does not create duplicate effective authorization.

5. **WebSocket Hub MVP**: A WebSocket Hub accepts JWT-authenticated connections, tracks connect/disconnect lifecycle, and supports a testable broadcast path.
   - Current: No WebSocket endpoint, connection registry, or broadcast mechanism exists.
   - Target: The server exposes a WebSocket endpoint that rejects unauthenticated clients, registers authenticated connections, cleans them up on disconnect, and can broadcast a message to active connections.
   - Acceptance: Missing or invalid JWT WebSocket connection attempts are rejected; a valid JWT can connect; disconnect removes the connection from the registry; multiple connections for the same user can coexist; broadcast reaches active connected clients without panicking under concurrent connections.

6. **Local development configuration**: Local PostgreSQL and Redis dependencies can be started and checked by the Go server in development.
   - Current: The repo has no Go-server-specific local dependency configuration for PostgreSQL or Redis.
   - Target: The repo includes documented local configuration for PostgreSQL and Redis, plus environment variables or examples required by the Go server.
   - Acceptance: A developer can start PostgreSQL and Redis locally using the provided configuration, run migrations, start the Go server, and observe successful dependency health checks.

## Boundaries

**In scope:**
- Create the Go server application foundation in the existing monorepo structure.
- Add local PostgreSQL and Redis configuration needed for development and verification.
- Add migrations for `users`, `roles`, and `user_roles`.
- Add email/password registration and login APIs.
- Issue and validate JWTs for authenticated API access.
- Enforce `user` and `admin` RBAC on at least one protected admin route.
- Add a JWT-authenticated WebSocket Hub with connection lifecycle and broadcast MVP.
- Add tests or checks that prove the locked acceptance criteria.

**Out of scope:**
- Audit log persistence — Phase 9 Admin Systems owns audit history.
- Quota management and Redis counters for AI calls — Phase 9 owns quotas.
- Tauri sidecar management for the Go server — deferred until a server exists and belongs to later sidecar work.
- OAuth or third-party login — v1 uses internal RBAC auth only.
- Password reset, email verification, invitations, and account management UI — not required for the Phase 8 auth foundation.
- User-facing desktop integration with the Go server — this phase delivers the server contract, not the desktop client wiring.
- Production deployment, TLS termination, and packaging — Phase 10 owns distributable packaging concerns.
- WebSocket private messaging, rooms, persistence, or admin event streams — Phase 8 only requires the Hub MVP and broadcast path.

## Constraints

- The server belongs in the monorepo under `apps/` and must not replace the existing desktop or Python Agent applications.
- PostgreSQL is the source of truth for users, roles, and user-role assignments.
- Redis must be connected and health-checked in Phase 8 even though quota counters are Phase 9 scope.
- Auth uses email/password plus JWT, not session cookies or OAuth.
- RBAC must support at least `user` and `admin` roles.
- Local development must be verifiable without Tauri sidecar integration.
- The implementation must leave Phase 9 free to add audit logs and quota management without rewriting the auth foundation.

## Acceptance Criteria

- [ ] A Go server app exists in the monorepo and starts locally.
- [ ] Health/readiness endpoints report PostgreSQL and Redis connectivity.
- [ ] Health/readiness checks fail when PostgreSQL or Redis is unavailable.
- [ ] Migrations create `users`, `roles`, and `user_roles` tables on an empty database.
- [ ] Re-running migrations is safe and does not duplicate schema state.
- [ ] Duplicate email, duplicate role name, and duplicate user-role assignment are rejected by constraints.
- [ ] Registering a new normalized email creates a user with the default `user` role.
- [ ] Empty email or empty password registration/login inputs are rejected.
- [ ] Registering the same normalized email twice returns conflict.
- [ ] Login with valid credentials returns a JWT.
- [ ] Login with invalid credentials fails without returning a token.
- [ ] Protected HTTP routes reject missing or invalid JWTs.
- [ ] A normal `user` role cannot access the sample admin route.
- [ ] An `admin` role can access the sample admin route.
- [ ] Repeating a role assignment does not create duplicate effective authorization.
- [ ] WebSocket connections without a valid JWT are rejected.
- [ ] WebSocket connections with a valid JWT are accepted and registered.
- [ ] Disconnecting a WebSocket client removes it from the Hub registry.
- [ ] Multiple WebSocket connections for the same user can coexist.
- [ ] Broadcast reaches active connected clients without panicking under concurrent connections.
- [ ] Local PostgreSQL and Redis can be started from documented development configuration.
- [ ] A developer can run migrations, start the Go server, and observe successful dependency health checks.
- [ ] JWTs and plaintext passwords are not written to logs, error responses, or WebSocket messages.
- [ ] Phase 8 does not implement audit logs, quota management, or Tauri sidecar process management.

## Edge Coverage

**Coverage:** 23/23 applicable edges resolved · 0 unresolved

| Category | Requirement | Status | Resolution / Reason |
|----------|-------------|--------|---------------------|
| idempotency | R1 | resolved / explicit | Health checks and repeated local starts must not create duplicate persistent state. |
| concurrency | R1 | resolved / explicit | Concurrent health checks must not mutate service state or destabilize dependency checks. |
| adjacency | R2 | resolved / explicit | Duplicate email, role name, and user-role assignment are rejected by unique constraints. |
| empty | R2 | resolved / explicit | Applying migrations to an empty database creates the full minimum auth schema. |
| ordering | R2 | resolved / explicit | Role ordering is not semantically meaningful; authorization is membership-based, not order-based. |
| idempotency | R2 | resolved / explicit | Re-running migrations is safe and does not duplicate schema state. |
| concurrency | R2 | dismissed | Migration execution is expected to be serialized by the migration tool; concurrent migration runners are outside Phase 8 scope. |
| empty | R3 | resolved / explicit | Empty email/password inputs are rejected. |
| encoding | R3 | resolved / explicit | Email identity uses normalized lowercase comparison for uniqueness and login. |
| idempotency | R3 | resolved / explicit | Re-registering the same normalized email returns conflict rather than creating another account. |
| concurrency | R3 | resolved / explicit | Concurrent registration of the same normalized email can create at most one account. |
| adjacency | R4 | resolved / explicit | Duplicate role assignment does not create duplicate effective authorization. |
| empty | R4 | resolved / explicit | Missing role or missing/invalid token cannot access protected/admin routes. |
| ordering | R4 | resolved / explicit | Multi-role authorization is membership-based: containing `admin` grants admin route access regardless of role order. |
| idempotency | R4 | resolved / explicit | Repeated authorization checks for the same token and role state produce the same allow/deny result. |
| concurrency | R4 | resolved / backstop | Authorization behavior under concurrent requests should be covered by route tests or held-out integration checks. |
| adjacency | R5 | resolved / explicit | Multiple connections for the same user can coexist and are tracked as separate connections. |
| empty | R5 | resolved / explicit | Missing or invalid JWT WebSocket connection attempts are rejected. |
| ordering | R5 | dismissed | Broadcast delivery order is not specified in the Phase 8 MVP; only delivery to active clients is required. |
| idempotency | R5 | resolved / explicit | Disconnect cleanup is safe if invoked more than once for the same connection. |
| concurrency | R5 | resolved / explicit | Broadcast must not panic under concurrent active connections. |
| idempotency | R6 | resolved / explicit | Re-starting local dependencies and re-checking health should be stable for development use. |
| concurrency | R6 | dismissed | Concurrent local dependency startup orchestration is outside the Go server contract. |

## Prohibitions (must-NOT)

**Coverage:** 4/4 applicable prohibitions resolved · 0 unresolved

| Prohibition (must-NOT statement) | Requirement | Status | Verification / Reason |
|----------------------------------|-------------|--------|------------------------|
| MUST NOT write JWTs or plaintext passwords to logs, error responses, or WebSocket messages. | R3, R5 | resolved / test | Negative checks should verify auth failures and WebSocket errors do not echo secrets. |
| MUST NOT allow protected HTTP routes or WebSocket connections when authentication is missing or the token is invalid. | R3, R4, R5 | resolved / test | Route and WebSocket tests must cover missing/invalid JWT rejection. |
| MUST NOT allow a normal `user` role to access the sample admin route. | R4 | resolved / test | RBAC tests must verify `user` is denied and `admin` is allowed. |
| MUST NOT implement audit logs, quota management, or Tauri sidecar process management in Phase 8. | R1, R6 | resolved / judgment | Scope review must confirm these belong to Phase 9 or later sidecar work, not this phase. |

Canon security/compliance notes: SQL injection, password hashing strength, CORS/CSRF policy, and general OWASP hardening are security review concerns for `$gsd-secure-phase` and implementation planning. They are not expanded here as bespoke Phase 8 prohibitions.

## Ambiguity Report

| Dimension          | Score | Min  | Status | Notes |
|--------------------|-------|------|--------|-------|
| Goal Clarity       | 0.90  | 0.75 | met | Auth + WebSocket Go foundation is the locked deliverable. |
| Boundary Clarity   | 0.86  | 0.70 | met | Admin systems, sidecar management, and desktop integration are explicitly out of scope. |
| Constraint Clarity | 0.82  | 0.65 | met | JWT, PostgreSQL, Redis, user/admin RBAC, and local-run verification are fixed. |
| Acceptance Criteria| 0.78  | 0.70 | met | Pass/fail criteria cover startup, dependencies, auth, RBAC, WebSocket, edges, and must-NOTs. |
| **Ambiguity**      | 0.15  | <=0.20 | met | Gate passed after two interview rounds. |

Status: met = dimension meets minimum, below = planner treats as assumption

## Interview Log

| Round | Perspective | Question summary | Decision locked |
|-------|-------------|------------------|-----------------|
| 1 | Researcher | What is the main Phase 8 deliverable? | Auth + WebSocket foundation: Go service, PostgreSQL/Redis, registration/login, RBAC, WebSocket Hub. |
| 1 | Researcher | What must PostgreSQL and Redis reach in this phase? | Local dependencies must be runnable and visible through health checks. |
| 1 | Researcher | What is the auth/RBAC MVP? | Email/password login returns JWT; at least `user` and `admin` roles protect a sample route. |
| 2 | Researcher + Simplifier | What is the WebSocket Hub MVP? | JWT-authenticated connect/disconnect lifecycle plus testable broadcast path. |
| 2 | Simplifier | What schema is required? | Minimum `users`, `roles`, and `user_roles` tables. |
| 2 | Boundary Keeper | What is explicitly not part of Phase 8? | Admin/audit/quota systems and Tauri sidecar management stay out of scope. |
| Edge Probe | Completeness | Which edge cases must be locked? | Idempotent migrations, duplicate constraints, empty credentials, normalized email, concurrent same-email registration, multi-connection WebSocket behavior, and broadcast stability. |
| Prohibition Probe | Must-NOT | What must the feature never silently become? | No secret echoing, no auth bypass, no user access to admin route, and no Phase 9/sidecar scope creep. |

---

*Phase: 08-go-server*
*Spec created: 2026-07-03*
*Next step: $gsd-discuss-phase 08 — implementation decisions (how to build what's specified above)*

# Phase 09: Admin Systems - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-04
**Phase:** 09-admin-systems
**Areas discussed:** Audit log storage schema, Audit log recording, Audit log query API, Quota counting algorithm, Redis atomicity, Quota gate integration, Unlimited users, WebSocket Hub completion

---

## Audit Log Storage Schema

| Option | Description | Selected |
|--------|-------------|----------|
| Standard set (min + request_ip + user_agent + trace_id) | Enough for security audit + cross-service tracing without column explosion. JSONB metadata still carries business detail. | |
| Minimal set + request_ip | Only SPEC-forced fields + R2 acceptance; everything else in JSONB. Fewest columns, weaker query/index power. | |
| Complete set (standard + method + path + status_code + target_resource + duration) | Best for ops querying, but column-heavy and likely over-designed for v1. | |
| Agent decides | Lock only the SPEC minimum; planner weighs columns at plan time. | yes |

**User's choice:** Agent decides.
**Notes:** The user deferred the exact column superset to the planner. SPEC locks the hard floor (id, nullable user_id, action, status, immutable created_at, JSONB metadata, plus R2's request_ip) and the constraints (reject null action/status, monotonic created_at). Planner may add columns in plan waves but must satisfy the floor.

---

## Audit Log Recording

| Option | Description | Selected |
|--------|-------------|----------|
| Hybrid: middleware + explicit | Gin post-handler middleware records HTTP-layer events (RBAC denials, route hits); business events (login success/failure, registration, quota exceeded) emit via explicit audit.Log() in handlers. | yes |
| Pure middleware interception | One post-middleware infers action/status from route + status code. Centralized but cannot distinguish business semantics (e.g. login success vs failure needs response inspection). | |
| Pure handler explicit calls | Each audited handler calls audit.Log() manually. Most precise but easy to miss, and RBAC denials happen in middleware before the handler runs. | |
| Agent decides | Lock only "audit is unavoidable + no secret leak"; planner picks entry points. | |

**User's choice:** Hybrid (middleware + explicit).
**Notes:** RBAC denials occur in the middleware layer and never reach the handler, so pure-handler would miss them. Login success vs. invalid-credential failure requires business logic the middleware cannot infer, so pure-middleware is insufficient. The hybrid covers both: middleware catches HTTP-layer/RBAC events, handlers emit business-semantic events.

---

## JSONB Metadata Secret Filtering

| Option | Description | Selected |
|--------|-------------|----------|
| Explicit allowlist construction | Per-action predefined field sets (e.g. login = {ip, user_agent}); handlers pass only allowlisted fields. Structurally prevents secret leakage. | yes |
| Generic redaction function | Recursive map walk erasing keys named password/token/secret/authorization. Flexible but risks missing custom key names. | |
| Allowlist + redaction double-belt | Construct via allowlist, then run redaction before write. Safest but heavier code. | |
| Agent decides | Lock only the must-NOT + negative test coverage. | |

**User's choice:** Explicit allowlist construction.
**Notes:** The allowlist approach provides a structural guarantee — a password can never enter metadata if no action's allowlist names it. A recursive redaction function depends on recognizing secret key names and can miss variants. Given the SPEC must-NOT prohibition is hard, the structural guarantee was preferred over a best-effort filter.

---

## Audit Log Query Pagination

| Option | Description | Selected |
|--------|-------------|----------|
| Cursor pagination (created_at + id) | Stable deep-paging on append-only chronological table; ideal for ever-growing audit logs. Slightly more complex than offset. | yes |
| Offset pagination | LIMIT/OFFSET — simplest, but deep pages (e.g. page 1000) perform poorly and new inserts shift pages. | |
| Keyset pagination (id only) | Simple, but cannot support the SPEC R3 "newest first" ordering requirement (id alone is ascending). | |
| Agent decides | Lock only pagination + filter + empty-page behavior. | |

**User's choice:** Cursor pagination (created_at + id).
**Notes:** The audit table is append-only and grows indefinitely, which is the textbook case for cursor over offset. Keyset-by-id alone fails the R3 ordering edge (newest first requires created_at, not id, as the sort key). The composite (created_at, id) cursor handles both ordering and tie-breaking when multiple rows share a timestamp.

---

## Quota Counting Algorithm

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed window | Discrete windows (e.g. hourly), INCR + EXPIRE per window, reset at boundary. Simplest; 2x burst at window edge. | |
| Sliding window (ZSET) | ZSET of request timestamps, evict expired, count remaining. Smooth, no burst. Production standard (Stripe/GitHub/Twitter). | yes |
| Token bucket | Capacity + refill rate; supports burst + sustained limit. Most precise but over-designed for SPEC (no rate requirement). | |
| Agent decides | Lock per-user + window + limit; planner picks algorithm. | |

**User's choice:** Sliding window (ZSET).
**Notes:** The user initially asked what "quota" means in this project (clarified: per-user AI-call count per time window), then asked what a production product would use. After the facilitator explained that Stripe/GitHub/Twitter all use sliding-window rate limiting and that this matches the project's "求职亮点" (resume/interview talking-point) positioning, the user chose sliding window over the SPEC-minimal fixed window. The deciding factor was production realism and interview-question resilience, not a SPEC requirement (SPEC explicitly lists the algorithm as an implementation decision). Sliding window also makes the R5 concurrency acceptance more naturally provable by eliminating burst ambiguity.

---

## Redis Atomicity (Check-and-Consume)

| Option | Description | Selected |
|--------|-------------|----------|
| Lua script check-and-consume | EVALSHA executes ZREMRANGEBYSCORE + ZCARD + conditional ZADD + EXPIRE atomically. Single RTT, race-free. Mandatory for sliding window. | yes |
| INCR + EXPIRE + DECR rollback | Read INCR, if n==1 set EXPIRE, if n>limit DECR. Simple but has a TOCTOU window; can over-count under concurrency. | |
| WATCH/MULTI transaction | Optimistic lock; retry storms under high contention, poor performance. | |
| Agent decides | Lock no-lost/no-over-count; planner picks the mechanism. | |

**User's choice:** Lua script check-and-consume.
**Notes:** The user probed why a Lua script is mandatory. The facilitator explained the TOCTOU race: a sliding-window check is multi-step (evict → count → decide → write), and without atomicity two concurrent clients can both read "under limit" and both write, over-counting. Redis executes a Lua script without interleaving other commands — this is the only mechanism that eliminates the race for multi-step ZSET operations (single native commands like INCR are atomic but cannot express a sliding-window check). WATCH/MULTI retries under contention. This is why Stripe/GitHub's production limiters also use Lua. The Lua choice is therefore bound to the sliding-window choice, not an independent option.

---

## Quota Gate Integration Point

| Option | Description | Selected |
|--------|-------------|----------|
| Gin middleware | Mount on protected AI routes; check-and-consume before handler; abort 429 on over-limit. Reuses Phase 8 middleware pattern; AI handlers stay quota-unaware. | yes |
| Handler explicit call | AI handler calls quota.Consume(uid) inline. Flexible but easy to miss and inconsistent with the audit entry-point decision. | |
| Testable package + mock endpoint | Phase 9 has no real AI route (SPEC marks AI-path integration as a dependency, not deliverable); deliver a quota package + mock/sample route validating the contract. | |
| Agent decides | Lock server-side contract testability; planner picks mount point. | |

**User's choice:** Gin middleware.
**Notes:** The middleware approach reuses the Phase 8 RBAC middleware pattern, keeps AI handlers quota-unaware, and centralizes the 429 response shape. Because SPEC scopes out real AI-path wiring, the middleware is validated against a mock/sample AI route that exercises the same JWT-context → check-and-consume → 429 contract. The mock route is planner discretion per the SPEC boundary.

---

## Unlimited User Configuration

| Option | Description | Selected |
|--------|-------------|----------|
| admin role is unlimited | Reuse existing admin role; admins bypass the quota gate. Zero new tables, zero new config. | yes |
| DB user flag | New users.quota_unlimited BOOL or user_quotas table; precise per-user control. Requires new migration and Phase 9 has no user-management UI. | |
| env whitelist | PALADIN_QUOTA_UNLIMITED_USERS=uid1,uid2. Simple but non-persistent, lost on restart, hard to audit. | |
| Agent decides | Lock admin-bypass + over-limit-auditable; planner picks mechanism. | |

**User's choice:** admin role is unlimited.
**Notes:** Reusing the existing admin role avoids a new migration, a new config surface, and a new query path. The SPEC R5 acceptance ("admin-configured unlimited users are not rejected by the quota gate") is satisfied because the middleware reads roles from the JWT context (set by Phase 8's Auth middleware) and short-circuits for admins before touching Redis. Per-user custom limits are deferred (see CONTEXT deferred ideas).

---

## WebSocket Hub Registry Upgrade

| Option | Description | Selected |
|--------|-------------|----------|
| Dual index: userID + role | map[userID][]Conn (preserved from Phase 8) + map[role][]userID (new). SendToUser O(1), SendToRole avoids O(N) scan. Mirrors chat-platform dispatch. | yes |
| Single index + filter scan | Upgrade only map[userID][]Conn; admin fan-out iterates all connections filtering by role. Simple but admin events are O(N). | |
| Conn metadata refactor | Rebuild Conn to carry full metadata (userID/roles); multi-dim queries over one structure. Most flexible but largest rewrite. | |
| Agent decides | Lock per-user + admin-fanout capability; planner picks structure. | |

**User's choice:** Dual index (userID + role).
**Notes:** The dual index preserves the Phase 8 per-user registry (no breaking change to existing Conn.ID() contract) while making role-targeted fan-out efficient. The single-index-plus-filter design would impose an O(N) full scan on every admin event, which is acceptable at small scale but unnecessary when a second index removes it. The Conn metadata refactor was rejected as too invasive for Phase 9's scope.

---

## WebSocket Message Envelope Format

| Option | Description | Selected |
|--------|-------------|----------|
| type + payload + ts | Minimal structured envelope; type is a string enum (audit.log, quota.exceeded, system.broadcast), payload is arbitrary JSON. Easy for frontend switch(type). | |
| event + data + meta | event/data/meta:{user_id, roles, trace_id}. More context but heavier payload structure. | |
| Reuse AG-UI event format | Consistency with desktop. But the Go server is not an AG-UI endpoint; reuse is semantically inaccurate. | |
| Agent decides | Lock structured + unknown-type-safe; planner picks fields. | yes |

**User's choice:** Agent decides.
**Notes:** The user deferred the exact envelope field names to the planner. SPEC R6 locks the hard constraints: the envelope is structured JSON with at least a type and payload, dispatch is type-driven, and an unrecognized type is a logged no-op rather than a panic or connection drop. The planner may settle on {type, payload, ts} or a richer {event, data, meta} shape during planning.

---

## Offline User Delivery Behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Silent drop | SendToUser returns nil when no connection exists for the target user. Matches SPEC R6 "offline is a no-op, not an error". Fits fire-and-forget event-stream semantics. | |
| Redis stream staging + replay | Undelivered events stored in Redis stream, replayed on user reconnect. But SPEC does not require durability, and Phase 8 explicitly defers WS persistence. | |
| Return error | Let the caller decide. But SPEC R6 explicitly requires no-op-not-error; this would violate acceptance. | |
| Agent decides | Lock no-op + no-panic; planner picks behavior. | yes |

**User's choice:** Agent decides.
**Notes:** The user deferred the exact implementation but SPEC R6 already locks the behavior: a per-user message to an offline user is a no-op, not an error. The planner implements this literally (Hub returns no error, delivers nothing). This is distinct from message-queue durability, which both SPEC and Phase 8 defer.

---

## Admin Event Fan-Out Path

| Option | Description | Selected |
|--------|-------------|----------|
| Business site pushes Hub directly | At audit write / quota rejection, call hub.SendToRole("admin", envelope). Tight coupling but zero extra dependencies, best real-time latency. | |
| Event bus + consumer goroutine | Business sites emit to a Go channel / Redis pubsub; a consumer goroutine pushes to the Hub. Decoupled but adds a layer; over-heavy for v1. | |
| Broadcast + frontend filter | Reuse Phase 8 broadcast; admin events go to everyone, frontend filters. But this leaks admin-only events to normal users, violating least privilege. | |
| Agent decides | Lock admin-connections-receive-events; planner picks transport. | yes |

**User's choice:** Agent decides.
**Notes:** The user deferred the exact transport to the planner. The hard constraint from SPEC R6 is that admin-role connections receive audit and quota events. The planner may choose direct hub.SendToRole calls for real-time delivery and zero infra, or route through an internal channel/pubsub if decoupling is justified. The broadcast-plus-frontend-filter option was rejected during discussion as a least-privilege violation.

---

## Deferred Questions (intentionally left to planner)

The following were explicitly deferred to the planner within SPEC hard constraints, per the user's "Agent decides" answers. They are NOT open questions for the user and should be resolved at plan time:

- Exact `audit_logs` column superset (D-01).
- Exact Gin middleware registration order and explicit-audit call sites (D-02).
- Exact per-action metadata allowlist field names (D-03).
- Exact cursor encoding (opaque base64 vs. transparent query params) for audit pagination (D-04).
- Exact Redis key naming conventions (D-05, D-06).
- Exact Lua script argument layout and return tuple shape (D-06).
- Exact mock/sample AI route used to validate the quota gate contract (D-07).
- Exact WebSocket envelope field names and unknown-type logging depth (D-10).
- Exact admin-event-fan-out transport — direct vs. decoupled (D-12), preserving real-time delivery.

---

*Phase: 09-admin-systems*
*Discussion completed: 2026-07-04*

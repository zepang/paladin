# Phase 09 — Validation Matrix

**Date:** 2026-07-04
**SPEC:** 09-SPEC.md (6 requirements, 28 acceptance criteria)

Each SPEC acceptance criterion is mapped to its automated proof (test name / scope gate) or manual smoke step.

## R1 — Audit log storage schema

| Acceptance Criterion | Proof |
|---|---|
| Migration creates `audit_logs` on an empty database | `migrations/000003_audit_logs.up.sql`; live smoke applies cleanly |
| Re-running migrations is safe | golang-migrate versioned up/down; `000003_audit_logs.down.sql` drops the table |
| Rejects null `action` or null `status` | `CHECK(status IN ('success','failure'))` + `action TEXT NOT NULL` + `CHECK(btrim(action)<>'')` in migration |
| Monotonically increasing `created_at` for chronology | `created_at TIMESTAMPTZ NOT NULL DEFAULT now()` + index `idx_audit_logs_created_at_id (created_at DESC, id)` |

## R2 — Audit log recording

| Acceptance Criterion | Proof |
|---|---|
| Successful login → success audit record | `auth_handler.go` Login success path calls `record(... auth.login/success)`; manual smoke confirms row |
| Invalid-credential login → failure audit record | `auth_handler.go` Login failure path calls `record(... auth.login/failure)` |
| Registration → audit record | `auth_handler.go` Register success/failure paths call `record(... auth.register/...)` |
| RBAC denial → audit record | `middleware/audit.go` `AuditRBAC` post-handler records `rbac.deny` on 403 |
| Quota-exceeded → audit record | `middleware/quota.go` QuotaGate records `quota.exceeded` on 429 |
| No secret in audit fields | `audit_test.go::TestRecorder_PasswordKeyNotStored`; allowlist `FilterMetadata`; grep gate `NO_SECRET_LOG_OK` |

## R3 — Audit query API

| Acceptance Criterion | Proof |
|---|---|
| 401 missing/invalid JWT | Mounted behind `middleware.Auth` (Phase 8 contract, green) |
| 403 user-role JWT | Mounted behind `middleware.RequireRole("admin")` (Phase 8 contract, green) |
| Paginated results for admin | `audit_handler_test.go::TestListAudit_AdminRole_FirstPage` |
| Filters narrow results | `audit_handler_test.go::TestListAudit_FilterParamsPassedThrough` |
| Out-of-range page → empty page | `audit_handler_test.go::TestListAudit_OutOfRange_EmptyPage` |

## R4 — Quota management state

| Acceptance Criterion | Proof |
|---|---|
| Configured limit + window honored | `config.go` QuotaLimit/QuotaWindow; `config_test.go` |
| Counter increments on each call | `quota_test.go::TestCheckAndConsume_Increments` |
| Counter resets after window | `quota_test.go::TestWindowReset_EvictsOldEntries` |
| Status reports used/limit/remaining/reset | `quota_test.go::TestStatus_NewUser_ZeroUsed`, `TestStatus_DoesNotMutateCounter` |

## R5 — Quota enforcement gate

| Acceptance Criterion | Proof |
|---|---|
| In-limit requests succeed, +1 each | `quota_test.go::TestCheckAndConsume_Increments` |
| Over-limit → 429 `quota_exceeded` | `quota_test.go::TestCheckAndConsume_OverLimit_Rejected` |
| Concurrent in-limit: exact count | `quota_test.go::TestCheckAndConsume_Concurrent_Exact` (N=100, limit=50 → exactly 50 allowed) |
| Admin unlimited not rejected | `middleware/quota.go` role-bypass before Redis; manual smoke |
| Quota-exceeded audited | `middleware/quota.go` records `quota.exceeded` on 429 |

## R6 — WebSocket Hub completion

| Acceptance Criterion | Proof |
|---|---|
| Structured envelope, unknown type safe | `hub_test.go::TestEnvelope_ValidJSON`, `TestUnknownType_NoPanic` |
| Per-user message reaches only target | `hub_test.go::TestSendToUser_Online_ReachesOnlyTarget` |
| Offline user → no-op | `hub_test.go::TestSendToUser_Offline_NoOpNoError` |
| Audit/quota events → admin conns | `hub_test.go::TestSendToRole_AdminFanOut_ExcludesUserOnly`; recorder.WithNotifier wiring |
| Unauthenticated still rejected at /ws | Phase 8 `Auth` middleware on /ws (preserved) |
| Broadcast reaches all | `hub_test.go::TestHubBroadcastDeliversToAll` |

## Prohibitions (must-NOT)

| Prohibition | Proof |
|---|---|
| No secret in audit/quota metadata | allowlist + read-time `FilterMetadata`; `NO_SECRET_LOG_OK` grep gate |
| No admin API without admin JWT | `Auth + RequireRole("admin")` on audit route; `AuditRBAC` on admin group |
| No AI call past quota | `TestCheckAndConsume_OverLimit_Rejected` |
| No lost/over count under concurrency | `TestCheckAndConsume_Concurrent_Exact` (unique-member fix) |
| No Phase 8 regression | `go test ./... -race` includes all Phase 8 tests (auth, config, db, ws) green |

## Scope gates (out-of-scope NOT implemented)

| Scope gate | Result |
|---|---|
| No Tauri sidecar management | `grep` confirms no sidecar config changes for Go server |
| No OAuth code | `grep -RIn 'oauth\|oauth2' internal/` empty |
| No desktop admin UI | no `apps/desktop` changes in Phase 9 |
| No packaging | no tauri.conf.json / bundling changes |

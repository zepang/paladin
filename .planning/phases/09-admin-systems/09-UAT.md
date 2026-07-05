# Phase 09 — User Acceptance Test (UAT) Checklist

**Date:** 2026-07-04
**Prerequisites:** Podman/Docker running with `docker-compose.server.yml` (PostgreSQL + Redis); migrations applied.

## Live smoke flow

Setup (low quota for fast testing):

```bash
podman compose -f docker-compose.server.yml up -d
export PALADIN_QUOTA_LIMIT=5 PALADIN_QUOTA_WINDOW=1m
export PALADIN_JWT_SECRET=0123456789abcdef0123456789abcdef0123456789
export PALADIN_DATABASE_URL=postgres://paladin:change-me@localhost:5432/paladin?sslmode=disable
export PALADIN_REDIS_URL=redis://localhost:6379/0
export PALADIN_ADMIN_EMAIL=admin@example.local PALADIN_ADMIN_PASSWORD=change-me-admin-password
go run ./cmd/migrate up
go run ./cmd/server
```

| # | Step | Expected | Pass |
|---|------|----------|------|
| 1 | POST /auth/register `{user@test, pw}` | 201 `{id,email,roles:["user"]}` | ☐ |
| 2 | POST /auth/login `{user@test, pw}` | 200 `{token,...}` | ☐ |
| 3 | POST /auth/login `{user@test, wrong}` | 401 `invalid_credentials` | ☐ |
| 4 | POST /auth/register `{admin@example.local, ...}` (bootstrap) then login as admin → token A | 200 | ☐ |
| 5 | GET /admin/audit-logs (token A) | 200 paginated items incl. `auth.register`, `auth.login` rows | ☐ |
| 6 | GET /admin/audit-logs?status=failure (token A) | items only with status=failure | ☐ |
| 7 | GET /admin/audit-logs (user token) | 403 forbidden | ☐ |
| 8 | GET /admin/audit-logs (no token) | 401 | ☐ |
| 9 | GET /admin/health (user token) | 403; an `rbac.deny` audit row appears | ☐ |
| 10 | POST /ai/mock (user token) ×5 | 5×200; X-RateLimit-Remaining decrements 4→0 | ☐ |
| 11 | POST /ai/mock (user token) 6th | 429 `quota_exceeded`; X-RateLimit-Remaining: 0 | ☐ |
| 12 | GET /admin/audit-logs?action=quota.exceeded (token A) | a `quota.exceeded` row exists | ☐ |
| 13 | POST /ai/mock (admin token A) ×10 | 10×200 (admin bypass, no 429) | ☐ |
| 14 | Connect WS as admin (token A); trigger register event | admin WS receives `{type:"audit.log",...}` envelope | ☐ |
| 15 | Connect WS as user; trigger admin event | user WS does NOT receive `audit.log` | ☐ |
| 16 | Send WS frame `{type:"unknown"}` | connection stays open (no drop/panic) | ☐ |
| 17 | Wait > 1m; POST /ai/mock (user) | 200 again (window reset) | ☐ |

## Notes

- Steps 1–3 verify audit recording (R2).
- Steps 5–9 verify audit query API + RBAC (R3) + RBAC-denial audit.
- Steps 10–13 verify quota gate + admin bypass (R4, R5).
- Steps 14–16 verify WebSocket completion (R6).
- Step 17 verifies window reset (R4).

Manual UAT result: ☐ All passed / ☐ Issues found (see notes).

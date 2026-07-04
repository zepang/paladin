---
phase: 8
slug: go-server
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-07-04
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

**Source:** Derived from `08-RESEARCH.md` `## Validation Architecture` section. Locks the test plan the executor must satisfy.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Go stdlib `testing` + `github.com/stretchr/testify/assert` (optional helper) |
| **Config file** | none — Wave 0 installs Go toolchain + modules |
| **Quick run command** | `cd apps/server && go test ./... -race -count=1` |
| **Full suite command** | `cd apps/server && go test ./... -race -count=1 -v` |
| **Estimated runtime** | ~15-30 seconds (unit); integration adds Podman-backed PG/Redis startup |

**Note:** Wave 0 blocker — Go toolchain (1.26+), sqlc v1.31.1, and golang-migrate CLI are NOT installed on the current machine. The first plan must install these before any test can run.

---

## Sampling Rate

- **After every task commit:** Run `cd apps/server && go test ./... -race -count=1`
- **After every plan wave:** Run `cd apps/server && go test ./... -race -count=1 -v`
- **Before `/gsd-verify-work`:** Full suite must be green AND Podman-backed integration checks pass (per CONTEXT.md D-27)
- **Max feedback latency:** 30 seconds (unit); integration depends on compose startup

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD-01 | server-skeleton | 1 | SRV-01 | — | health probes do not mutate state | unit | `go test ./internal/http/ -run TestHealth -race` | ❌ W0 | ⬜ pending |
| TBD-02 | server-skeleton | 1 | SRV-01 | — | health fails when PG or Redis down | integration | Podman: stop pg container → `/readyz` returns 503 | ❌ W0 | ⬜ pending |
| TBD-03 | db-migrations | 1 | SRV-02 | — | migrations idempotent; constraints reject dups | integration | `migrate up && migrate up` (idempotent); dup email rejected | ❌ W0 | ⬜ pending |
| TBD-04 | auth-api | 2 | SRV-03 | T-08-01 | register normalizes email; empty input rejected | unit | `go test ./internal/auth/ -run TestRegister` | ❌ W0 | ⬜ pending |
| TBD-05 | auth-api | 2 | SRV-03 | T-08-02 | login issues JWT; wrong password → 401 no token | unit | `go test ./internal/auth/ -run TestLogin` | ❌ W0 | ⬜ pending |
| TBD-06 | auth-api | 2 | SRV-03 | T-08-03 | **no JWT/password in logs or error bodies** | unit (negative) | grep response bodies + logs; assert secret not present | ❌ W0 | ⬜ pending |
| TBD-07 | rbac-middleware | 2 | SRV-04 | T-08-04 | missing/invalid token → 401; user → 403 admin; admin → 200 | unit | `go test ./internal/auth/ -run TestRBAC` | ❌ W0 | ⬜ pending |
| TBD-08 | ws-hub | 3 | SRV-05 | T-08-05 | unauth WS rejected; valid connects+registered; multi-conn coexist | unit | `go test ./internal/ws/ -run TestAuth` | ❌ W0 | ⬜ pending |
| TBD-09 | ws-hub | 3 | SRV-05 | T-08-06 | broadcast panic-free under concurrency; disconnect cleanup idempotent | unit (race) | `go test ./internal/ws/ -run TestBroadcast -race` | ❌ W0 | ⬜ pending |
| TBD-10 | local-dev | 1 | SRV-06 | — | compose starts PG+Redis; documented Podman-first | manual + integration | `podman compose -f docker-compose.server.yml up -d`; ports reachable | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

*Note: Task IDs (TBD-NN) will be finalized by the planner; the requirement coverage and threat mapping is authoritative.*

---

## Wave 0 Requirements

- [ ] Install Go 1.26+, sqlc v1.31.1, golang-migrate CLI (Wave 0 blocker — none present on current machine)
- [ ] Decide Podman (install) vs Docker (present) for compose runtime — CONTEXT D-24 prefers Podman
- [ ] `apps/server/go.mod` — `go mod init github.com/paladin/apps/server` (or chosen module path)
- [ ] `apps/server/migrations/` — versioned SQL up/down files for users, roles, user_roles
- [ ] `apps/server/internal/db/` — sqlc.yaml + queries.sql + generated code
- [ ] `apps/server/internal/http/health_test.go` — stubs for SRV-01
- [ ] `apps/server/internal/auth/auth_test.go` — stubs for SRV-03
- [ ] `apps/server/internal/auth/rbac_test.go` — stubs for SRV-04
- [ ] `apps/server/internal/ws/hub_test.go` — stubs for SRV-05
- [ ] `docker-compose.server.yml` at repo root — PG + Redis for local dev
- [ ] `.env.example` with safe placeholders (no real secrets)

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Developer can start PG+Redis via Podman compose, run migrations, start server, observe healthy /healthz | SRV-06 | Requires human-run compose + local Go server process | Follow `apps/server/README.md`: `podman compose -f docker-compose.server.yml up -d`, `migrate up`, `go run ./cmd/server`, `curl localhost:9880/healthz` |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s (unit suite)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending

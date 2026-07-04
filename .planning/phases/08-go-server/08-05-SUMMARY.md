---
phase: 08
plan: 08-05
title: JWT auth + bcrypt + RBAC middleware (TDD)
status: complete
started: 2026-07-04T14:45:00+08:00
completed: 2026-07-04T15:00:00+08:00
requirements: [SRV-03, SRV-04]
---

# 08-05 Summary

## What was built

Implemented the full authentication stack using strict TDD: JWT issue/verify (HS256, `alg:none` rejected), bcrypt password hashing, the `AuthHandler` for `/auth/register` + `/auth/login`, the `Auth` + `RequireRole` middleware protecting `/me` and `/admin/health`, the `PgStore` adapter that wraps sqlc queries in a transaction, the `BootstrapAdmin` helper, and a real `cmd/migrate` CLI.

## TDD Cycle

- **RED:** wrote failing tests first (undefined symbols, compile errors).
- **GREEN:** implemented `auth.Issue/Verify`, `auth.HashPassword/ComparePassword`, `AuthHandler`, middleware, `PgStore`, `BootstrapAdmin`, and `cmd/migrate`.
- **REFACTOR:** extracted `AuthStore` interface so the handler is testable without a live DB; extracted `PgStore` for production wiring.

## Artifacts

### Auth core (`internal/auth/`)
- `jwt.go` — `Claims{Email, Roles, RegisteredClaims}`, `Issue(secret, userID, email, roles, ttl)`, `Verify(secret, tokenStr) (*Claims, error)` using `jwt.WithValidMethods([]string{"HS256"})` and an explicit HMAC signing-method check inside the keyfunc. `alg:none` rejected.
- `password.go` — `HashPassword(pw, cost)`, `ComparePassword(hash, pw)`; mismatches map to `ErrInvalidCredentials`. Min cost enforced.
- `bootstrap.go` — `BootstrapAdmin(ctx, q, pool, email, password, cost)` that opens a tx, hashes the password, idempotently creates the admin user (or reuses the existing row), and assigns the `admin` role.
- `jwt_test.go` — round-trip, expired rejection, `alg:none` rejection, wrong-secret rejection, claims shape (sub/email/exp).
- `password_test.go` — hash != input, match, mismatch → `ErrInvalidCredentials`.

### HTTP handlers (`internal/http/handler/`)
- `auth_handler.go` — `AuthStore` interface; `AuthHandler{Register, Login}`.
  - `Register`: `email` + `password (>=8)` validation via gin binding; `normalizeEmail` (lowercase + trim); bcrypt hash; `CreateUserTx` → `23505` maps to 409 `email_taken`; assigns default `user` role; 201 response with `{id,email,roles}`.
  - `Login`: lookup by email; constant-time bcrypt compare; failure → 401 `invalid_credentials` (no password/token echo); success → 200 `{token, token_type:"Bearer", expires_at}`.
- `pgstore.go` — production `PgStore` wrapping `*sqlcgen.Queries` + `*pgxpool.Pool`; `CreateUserTx` runs `CreateUser` inside a tx.
- `auth_handler_test.go` — fake store; 201 new email, 409 case-insensitive duplicate, 400 empty email/password/short password, 200 login returns JWT, 401 wrong password with no token/secret echo, response body never echoes the password.

### Middleware (`internal/http/middleware/`)
- `jwt.go` — `Auth(secret)` parses `Authorization: Bearer <tok>`, verifies, stores `userID`/`roles` in the gin context; 401 on missing/malformed/expired. `RequireRole(want)` returns 403 `forbidden` when the role is absent; order-independent.
- `auth_test.go` — 401 missing token, 401 invalid token, 403 user-on-admin, 200 admin-on-admin, 200 role in the middle of the list.

### Wiring
- `server.go` — registers `/auth/register`, `/auth/login`, `/me` (behind `Auth`), `/admin/health` (behind `Auth` + `RequireRole("admin")`).
- `cmd/server/main.go` — calls `BootstrapAdmin` on startup when `PALADIN_ADMIN_EMAIL`/`PALADIN_ADMIN_PASSWORD` are set (non-fatal on failure).
- `cmd/migrate/main.go` — real CLI: `up`, `down [n]`, `force <v>`, `version`, with `-path` / `-database` flags and `PALADIN_DATABASE_URL` fallback.

## Self-Check: PASSED

- `go build ./...` → clean.
- `go vet ./...` → clean.
- `go test ./... -race -count=1` → all packages green.
- JWT: round-trip ok; expired/wrong-secret/`alg:none` all rejected.
- Password: hash != input; bcrypt compare match/mismatch correct; `ErrInvalidCredentials` returned on mismatch.
- Register: 201 new, 409 case-insensitive duplicate, 400 on empty/short email/password.
- Login: 200 with JWT on valid creds, 401 on wrong password, response never echoes password or token on failure.
- Middleware: 401 missing/invalid token, 403 user-on-admin, 200 admin-on-admin, role order-independent.
- `auth.BootstrapAdmin` is idempotent (existing user gets the admin role).
- `cmd/migrate` is a working CLI (will be exercised end-to-end in 08-07).

## Deviations

- The Phase-08 plan suggested the handler depend on `*sqlcgen.Queries` directly. Introduced an `AuthStore` interface instead so unit tests run without a live Postgres (the fake store exercises every code path, including 23505). The production `PgStore` still wraps `*sqlcgen.Queries` + `*pgxpool.Pool`, so wiring is unchanged.
- `cmd/migrate` was stubbed in 08-01 and is now a real CLI in this plan (it shares the auth toolchain and was the natural place to land it). It will be exercised end-to-end against the compose stack in 08-07.

---
phase: 08
plan: 08-02
title: docker-compose.server.yml + golang-migrate CLI + auth schema migrations
status: complete
started: 2026-07-04T14:15:00+08:00
completed: 2026-07-04T14:25:00+08:00
requirements: [SRV-01, SRV-02]
---

# 08-02 Summary

## What was built

Provisioned the local PostgreSQL + Redis dependencies and the versioned auth schema (users / roles / user_roles) that every downstream data/auth plan depends on. Verified idempotent migration and all three duplicate-rejection constraints at the database layer.

## Wave 0 / Tooling

- **golang-migrate CLI:** Installed via `go install -tags 'postgres' github.com/golang-migrate/migrate/v4/cmd/migrate@v4.19.1` (Homebrew had no bottle — Tier 3 config). `migrate -version` reports `dev` (source-built) but the CLI is v4.19.1 and works correctly.
- **Docker:** Used `docker compose` (Podman fallback documented in the README at 08-07). Docker 28.4.0 with the `desktop-linux` context.

## Artifacts

- `docker-compose.server.yml` — `postgres:16-alpine` + `redis:7-alpine` services, healthchecks (`pg_isready`, `redis-cli ping`), named volumes, env-overridable ports (`${PALADIN_PG_PORT:-5432}`, `${PALADIN_REDIS_PORT:-6379}`), `restart: unless-stopped`. No MySQL/sandbox service.
- `apps/server/migrations/000001_init_schema.up.sql` — `users` (BIGSERIAL PK, email, password_hash, created_at), `roles` (BIGSERIAL PK, name), `user_roles` (composite PK). `UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email))`, `CHECK(length(btrim(email)) > 0)`, `UNIQUE(name)` on roles, composite PRIMARY KEY on user_roles.
- `apps/server/migrations/000001_init_schema.down.sql` — drops in reverse FK order.
- `apps/server/migrations/000002_seed_roles.up.sql` — `INSERT INTO roles (name) VALUES ('user'), ('admin') ON CONFLICT (name) DO NOTHING`.
- `apps/server/migrations/000002_seed_roles.down.sql` — deletes the two seeded roles.

## Self-Check: PASSED

- `docker compose -f docker-compose.server.yml up -d` → both services healthy (postgres:16-alpine, redis:7-alpine) on ports 5432/6379.
- First `migrate up` → applied versions 1 (init_schema) + 2 (seed_roles).
- Second `migrate up` → `no change` (idempotency proven).
- `\dt` → lists `roles`, `schema_migrations`, `user_roles`, `users`.
- Seed check → `admin`, `user` rows present.
- Duplicate role name (`'user'` second time) → SQLSTATE 23505 on `roles_name_unique`.
- Case-insensitive email collision (`'Foo@x.com'` vs `'foo@x.com'`) → SQLSTATE 23505 on `users_email_lower_uidx`.
- Duplicate user_roles `(1,1)` second time → SQLSTATE 23505 on `user_roles_pkey`.
- `migrate down 2` → drops both versions (tables gone except `schema_migrations`).
- `migrate up` again → restores schema and seeds — round-trip verified.

## Deviations

- **Podman vs Docker:** Plans are Podman-first (D-23/D-24). The local machine has Docker 28.4.0 and no Podman, so verification used `docker compose`. The README (08-07) will still lead with Podman and document Docker as fallback, per D-24.
- **migrate CLI version string:** Source-built binary reports `dev` instead of `4.19.x`. The binary is built from the v4.19.1 tag; behavior matches the spec.

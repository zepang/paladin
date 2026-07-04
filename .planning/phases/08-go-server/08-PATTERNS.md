# Phase 08: Go Server — Pattern Mapping

**Mapped:** 2026-07-04
**Phase:** 08 - Go Server (GREENFIELD — no existing Go code in the active codebase)
**Consumed by:** Planner (`08-XX-PLAN.md`)
**Source files read:** `08-CONTEXT.md` (D-01..D-27), `08-RESEARCH.md`, `08-SPEC.md`

> **How to read this document.** Phase 8 introduces Paladin's first Go service. There is **no Go code under `apps/`** today, so most "analogs" are cross-language (Python / Rust / TS) behavior references or the curated Go reference app under `references/wps-cowork/apps/api`. Per D-02 the wps-cowork reference is a **layering reference only — do NOT copy its heavy framework (meerkat/craft/protobuf/Eino) choices.** Excerpts below are quoted verbatim from the repo or from `08-RESEARCH.md`; nothing is fabricated.

---

## File Inventory → Analog Coverage

The locked structure (CONTEXT D-03, D-04) is an independent Go module under `apps/server` with tiers `cmd/server`, `internal/config`, `internal/http`, `internal/auth`, `internal/db`, `internal/ws`, and `migrations`. RESEARCH.md §"Recommended Project Structure" expands that into the concrete file list mapped below. Tier names are locked; exact file/package names inside each tier are planner discretion.

Legend — Analog kind:
- **XL** = cross-language behavior reference (different language; behavior only, NOT a code template)
- **GO-REF** = Go reference under `references/wps-cowork/` (layering reference; do not import its frameworks)
- **GF** = truly greenfield — no analog; rely on `08-RESEARCH.md` code examples
- **DOC** = documentation convention analog

| # | File (under `apps/server/` unless noted) | Role / data flow | Analog | Kind | Confidence |
|---|---|---|---|---|---|
| 1 | `go.mod` | Module manifest / dependency declaration | `references/wps-cowork/apps/api/go.mod`, `apps/desktop/src-tauri/Cargo.toml`, `apps/agent/pyproject.toml` | GO-REF + XL | HIGH |
| 2 | `go.sum` | Module checksums (generated) | `references/wps-cowork/apps/api/go.sum` | GO-REF | HIGH |
| 3 | `sqlc.yaml` | Codegen config (sqlc → pgx/v5) | (none in repo) — `08-RESEARCH.md` §sqlc.yaml | GF | HIGH |
| 4 | `.env.example` | Safe env placeholders (D-14, D-26) | `apps/agent/.env.example`, `references/wps-cowork/.env.example` | DOC | HIGH |
| 5 | `README.md` | Local-run docs, Podman-first | `apps/agent/README.md`, `references/wps-cowork/apps/api/README.md` | DOC | HIGH |
| 6 | `cmd/server/main.go` | Composition root: config→pool→redis→hub→handlers→engine; `Run(":9880")` | `references/wps-cowork/apps/api/main.go` (GO-REF), `apps/agent/src/server/cli.py` (XL startup output) | GO-REF + XL | HIGH |
| 7 | `cmd/migrate/main.go` (optional) | `migrate up/down` subcommand | `references/wps-cowork/apps/api/handlers/migrate_handler.go` (GO-REF, HTTP variant) | GO-REF | MED |
| 8 | `internal/config/config.go` | Env → typed struct; ports/DSN/JWT secret/admin bootstrap | `references/wps-cowork/apps/api/internal/config/config.go` | GO-REF | HIGH |
| 9 | `internal/http/server.go` | Gin `Engine` construction + route registration + middleware chain | `references/wps-cowork/apps/api/main.go` `newCraftHTTPService` (GO-REF), `apps/agent/src/server/main.py` CORS (XL) | GO-REF + XL | HIGH |
| 10 | `internal/http/handler/health_handler.go` | `/healthz` liveness + `/readyz` PG+Redis probes | `references/wps-cowork/apps/api/main.go` `/health` route (GO-REF), `apps/agent/src/server/main.py` `/health` (XL) | GO-REF + XL | HIGH |
| 11 | `internal/http/handler/auth_handler.go` | `POST /auth/register`, `POST /auth/login` → bcrypt + sqlc + JWT | (none in repo) — `08-RESEARCH.md` §"Gin handler (register)" | GF | HIGH |
| 12 | `internal/http/handler/sample_handler.go` | `/me` (any role), `/admin/health` (admin only) | (none in repo) — trivial handler; follows #11 shape | GF | HIGH |
| 13 | `internal/http/middleware/jwt.go` | Parse `Authorization: Bearer`, verify HS256, set claims in context | `references/wps-cowork/apps/api/pkg/middlewares/auth.go` (GO-REF shape), `08-RESEARCH.md` §"Gin auth middleware" | GO-REF + GF | HIGH |
| 14 | `internal/http/middleware/rbac.go` | `RequireRole("admin")` membership check | (none in repo) — `08-RESEARCH.md` §RBAC middleware | GF | HIGH |
| 15 | `internal/http/middleware/error.go` | Unified `error.code`/`error.message` writer (D-16) | `references/wps-cowork/apps/api/pkg/errs/error.go` (GO-REF `Status` type) | GO-REF | MED |
| 16 | `internal/http/middleware/recovery.go` | Panic → generic 500, never leak stack | Gin built-in `Recovery`; no repo analog | GF | HIGH |
| 17 | `internal/http/ws/handler.go` | `coder/websocket.Accept` + first-message JWT auth + register conn | (none in repo) — `08-RESEARCH.md` §"WebSocket first-message auth handshake" | GF | HIGH |
| 18 | `internal/auth/jwt.go` | HS256 issue + verify; claims `sub,email,roles,exp` | (none in repo) — `08-RESEARCH.md` §"JWT issue + verify (HS256)" | GF | HIGH |
| 19 | `internal/auth/password.go` | bcrypt hash/compare, cost from config | (none in repo) — `08-RESEARCH.md` §"bcrypt hash/compare" | GF | HIGH |
| 20 | `internal/auth/bootstrap.go` | Create admin from `PALADIN_ADMIN_*` if missing (idempotent) | `references/wps-cowork/apps/api/internal/config/config.go` validation (XL fail-fast); `08-RESEARCH.md` Pitfall #13 | GO-REF + GF | MED |
| 21 | `internal/db/pool.go` | `pgxpool.New` + `Ping` | `references/wps-cowork/apps/api/internal/db/db.go` `Open()` (GO-REF, GORM→pgx swap) | GO-REF | HIGH |
| 22 | `internal/db/redis.go` | `redis.ParseURL` + `Client.Ping` health | `references/wps-cowork/apps/api/main.go` `BuildRedisClient` usage (GO-REF) | GO-REF | MED |
| 23 | `internal/db/sqlc/*.sql.go` (+ `db.go`, `models.go`) | GENERATED typed queries — do not hand-edit | (none — output of sqlc) | GF | HIGH |
| 24 | `internal/db/queries/*.sql` | sqlc input queries (`CreateUser`, `GetUserByEmail`, `AssignDefaultRole`…) | (none in repo) — `08-RESEARCH.md` §"sqlc query + generated code" | GF | HIGH |
| 25 | `internal/ws/hub.go` | `map[userID][]*Conn` registry + internal `Broadcast`; mutex-guarded | (none in repo) — `08-RESEARCH.md` §Hub lifecycle, Pitfall #6 | GF | HIGH |
| 26 | `migrations/000001_init_schema.up.sql` + `.down.sql` | `users`, `roles`, `user_roles` DDL with UNIQUE constraints | (none in repo) — `08-RESEARCH.md` §sqlc queries + Pitfalls #9/#13/#14 | GF | HIGH |
| 27 | `migrations/000002_seed_roles.up.sql` + `.down.sql` | Seed `user`,`admin` rows | (none in repo) — RESEARCH Open Q #5 | GF | HIGH |
| 28 | `docker-compose.server.yml` (repo root) | Local PG 16 + Redis 7; Podman-first (D-23, D-24) | `references/wps-cowork/docker-compose.yml` (GO-REF compose shape) | GO-REF | HIGH |
| 29 | `internal/http/handler/health_test.go` | `httptest` health probes (200/503, concurrency) | `apps/agent/tests/test_server.py` `TestHealthEndpoint` (XL), `references/wps-cowork/apps/api/main_test.go` (GO-REF table-driven) | XL + GO-REF | HIGH |
| 30 | `internal/auth/auth_test.go` | Table-driven register/login edges | `apps/agent/tests/test_server.py` (XL edge style), `08-RESEARCH.md` SRV-02 test map | XL + GF | HIGH |
| 31 | `internal/auth/rbac_test.go` | 401/403/200 matrix + idempotent re-assign | `08-RESEARCH.md` SRV-03 test map | GF | HIGH |
| 32 | `internal/ws/hub_test.go` | Auth reject/accept, multi-conn, `-race` broadcast | `08-RESEARCH.md` SRV-04 test map | GF | HIGH |

**Analog coverage tally:** 32 files mapped.
- Cross-language (XL) behavior references found: **6** (`apps/agent/src/server/main.py`, `apps/agent/src/server/cli.py`, `apps/agent/pyproject.toml`, `apps/agent/.env.example`, `apps/agent/README.md`, `apps/agent/tests/test_server.py`, `apps/desktop/src-tauri/Cargo.toml`, `apps/desktop/src-tauri/tauri.conf.json`, `apps/desktop/src/hooks/useAgentHealth.ts` — several used as secondary refs).
- Go layering references under `references/wps-cowork/`: **8** (`main.go`, `go.mod`, `internal/config/config.go`, `internal/db/db.go`, `pkg/middlewares/auth.go`, `pkg/errs/error.go`, `main_test.go`, `docker-compose.yml`).
- Truly greenfield (no analog, RESEARCH-only): **14** (sqlc config, Gin auth/RBAC/error/recovery middleware, WS handler, JWT/password/bootstrap, Hub, generated sqlc, all migration SQL, 3 of 4 test files).

---

## Per-File Pattern Details

### 1. `apps/server/go.mod` — Module manifest
- **Role:** Independent Go module declaration (D-03); pins Go 1.26+ and the verified stack (Gin v1.10.0, pgx v5.10.0, sqlc v1.31.1, golang-migrate v4.19.1, golang-jwt v5.3.1, go-redis v9.21.0, coder/websocket v1.8.15).
- **Closest analog (GO-REF):** [go.mod](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/go.mod) — module declaration + version-pinned `require` blocks.
- **Closest analog (XL):** [Cargo.toml](file:///Users/kdocs/Workspace/paladin/apps/desktop/src-tauri/Cargo.toml) and [pyproject.toml](file:///Users/kdocs/Workspace/paladin/apps/agent/pyproject.toml) — same "one manifest per app under `apps/`" convention.
- **Excerpt (GO-REF head):**
  ```go
  module wps-cowork/api
  go 1.25.4
  require (
      github.com/redis/go-redis/v9 v9.18.0
      github.com/joho/godotenv v1.5.1
      gorm.io/gorm v1.31.1
      // ...
  )
  ```
- **What differs for Phase 8:** Module path becomes `github.com/<org>/paladin` or `paladin/server` (planner picks); drop GORM, meerkat, protobuf, Eino, ksogit.* deps entirely (D-02 lightweight). Add gin/pgx/pgxpool/golang-migrate/golang-jwt/go-redis/coder/websocket/golang.org/x/crypto per RESEARCH §"Installation commands". Pin `go 1.26` (sqlc v1.31 toolchain).

### 2. `apps/server/go.sum` — Checksums
- **Role:** Integrity lock for the module proxy + sum.golang.org (RESEARCH §"Package Legitimacy Audit").
- **Analog:** `references/wps-cowork/apps/api/go.sum`. Generated by `go mod tidy`. Commit it.

### 3. `apps/server/sqlc.yaml` — Codegen config
- **Role:** Tells sqlc to emit **pgx/v5-native** Go from `internal/db/queries/*.sql` against `migrations/` schema.
- **Analog:** None in repo. GF — use RESEARCH §"sqlc.yaml (prescriptive — pgx/v5 engine)" verbatim.
- **Excerpt (from `08-RESEARCH.md`):**
  ```yaml
  version: "2"
  sql:
    - engine: "postgresql"
      queries: "internal/db/queries"
      schema: "migrations"
      gen:
        go:
          package: "sqlcgen"
          out: "internal/db/sqlc"
          sql_package: "pgx/v5"          # CRITICAL
          emit_json_tags: true
          emit_interface: true
          emit_pointers_for_null_types: true
  ```
- **What differs for Phase 8:** First sqlc config in the repo. Pitfall #1 (RESEARCH): default would emit `database/sql`; MUST set `sql_package: "pgx/v5"`. Pitfall #12: pointing `schema:` at `migrations/` works for forward `.up.sql` but sqlc will also parse `.down.sql` — keep down files reverse-only.

### 4. `apps/server/.env.example` — Safe placeholders
- **Role:** Document every env var (D-14, D-26): DATABASE_URL, REDIS_URL, JWT secret, PALADIN_ADMIN_EMAIL/PASSWORD, PALADIN_PORT (9880), bcrypt cost, JWT TTL. Placeholders only — never real secrets.
- **Analog (DOC):** [apps/agent/.env.example](file:///Users/kdocs/Workspace/paladin/apps/agent/.env.example) — same "copy to `.env` and fill in" convention.
  ```
  # Paladin Agent — API Keys
  # 复制此文件为 .env 并填入真实值
  DEEPSEEK_API_KEY=sk-your-deepseek-key
  LM_STUDIO_API_KEY=not-needed
  ```
- **Secondary analog (GO-REF):** [references/wps-cowork/.env.example](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/.env.example) — shows DSN-style values and grouped sections.
- **What differs for Phase 8:** Must add a strong-commented JWT secret placeholder and document the ≥32-byte requirement (Pitfall #4). Admin email/password must be obvious placeholders (D-14). Document `PALADIN_JWT_TTL=15m` (RESEARCH Open Q #6) and `PALADIN_AUTO_MIGRATE=true` (Open Q #2).

### 5. `apps/server/README.md` — Local-run docs (Podman-first)
- **Role:** Developer onboarding: install Go/sqlc/migrate, bring up PG+Redis via Podman, run migrations, start server, hit `/healthz`.
- **Analog (DOC):** [apps/agent/README.md](file:///Users/kdocs/Workspace/paladin/apps/agent/README.md) — concise quick-start with exact commands:
  ```bash
  cd apps/agent
  cp .env.example .env           # 填入 DEEPSEEK_API_KEY
  uv run paladin-agent serve --dev    # 启动服务器 + 热重载 (:9876)
  curl localhost:9876/health          # 健康检查
  ```
- **Secondary analog (GO-REF):** [references/wps-cowork/apps/api/README.md](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/README.md) — "构建与运行" section: `cd apps/api; go build -o api-server .; ./api-server`.
- **What differs for Phase 8:** Lead with **Podman** (D-24): `podman compose -f docker-compose.server.yml up -d`. Document `migrate ... force <version>` recovery for dirty state (Pitfall #2). Document the four missing local CLIs from RESEARCH §"Environment Availability" (Go/sqlc/migrate/Podman-or-Docker) as Wave 0 install steps.

### 6. `apps/server/cmd/server/main.go` — Composition root
- **Role:** The only place that wires config → pool → redis → hub → handlers → Gin engine → `Run(":9880")`. No globals (RESEARCH anti-pattern). Signal handling for graceful shutdown.
- **Closest analog (GO-REF):** [references/wps-cowork/apps/api/main.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/main.go) — `func main()` is a linear composition sequence: load env → `config.Load()` → open DB → build Redis client → construct service → register routes → serve → `<-watchTerminateSignal()`.
- **Excerpt (GO-REF, signal handling + linear wiring):**
  ```go
  func main() {
      for _, p := range []string{".env", filepath.Join("..", ".env")} {
          if err := godotenv.Load(p); err == nil { break }
      }
      cfg, err := config.Load()
      if err != nil { log.Fatalf("load config: %v", err) }
      config.Set(cfg)
      // ... database, redis, service construction ...
      hostHandle, err := craft.NewServiceHost().
          WithHttpAddress(fmt.Sprintf(":%d", cfg.Port)).Serve()
      if err != nil { log.Fatalf("serve: %v", err) }
      hostHandle.WaitForStart(context.Background())
      log.Infof("starting server on port %d", cfg.Port)
      <-watchTerminateSignal()
  }

  var _stopSignals = []os.Signal{syscall.SIGTERM, syscall.SIGINT}
  func watchTerminateSignal() <-chan os.Signal {
      c := make(chan os.Signal, 1)
      signal.Notify(c, _stopSignals...)
      return c
  }
  ```
- **XL analog for startup banner:** [apps/agent/src/server/cli.py](file:///Users/kdocs/Workspace/paladin/apps/agent/src/server/cli.py) `run_serve` prints the health URL before binding — useful local-dev ergonomics (CONTEXT "Established Patterns"):
  ```python
  print(f"Paladin Agent — HTTP 服务器")
  print(f"地址:       http://localhost:{port}")
  print(f"健康检查:   http://localhost:{port}/health")
  ```
- **What differs for Phase 8:** Replace meerkat/craft/protobuf host with a plain `gin.Engine` + `http.Server`. Use `pgxpool.New` not GORM. Use port `9880` (D-25), never `9876` (Python Agent owns it — CONTEXT "Established Patterns"). Drop the `config.Set` global singleton (RESEARCH anti-pattern: "Global singleton DB/Redis"); pass deps explicitly into handlers so `httptest` can fake them.

### 7. `apps/server/cmd/migrate/main.go` — Migrate subcommand (optional)
- **Role:** Explicit `up`/`down`/`force` control of golang-migrate from embedded SQL (RESEARCH §"Migrations: file-based + embed (hybrid)", Open Q #2).
- **Analog (GO-REF, HTTP variant):** [references/wps-cowork/apps/api/handlers/migrate_handler.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/handlers/migrate_handler.go) exists but exposes migration via HTTP — Phase 8 wants a **subcommand**, not an HTTP route. Use the file-based + `//go:embed migrations/*.sql` + `migrate/source/iofs` pattern from RESEARCH instead.
- **What differs for Phase 8:** Treat `migrate.ErrNoChange` as success (RESEARCH idempotency note). No HTTP migration endpoint (D-09 + SPEC prohibition: no admin endpoints beyond the sample).

### 8. `apps/server/internal/config/config.go` — Config loading
- **Role:** Env → typed struct with defaults for ports 9880/5432/6379, JWT secret, admin bootstrap, bcrypt cost, JWT TTL (D-25, D-26). Fail-fast validation (e.g. JWT secret ≥32 bytes).
- **Closest analog (GO-REF, near-direct pattern):** [references/wps-cowork/apps/api/internal/config/config.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/internal/config/config.go).
- **Excerpt (GO-REF — struct tags + Load + validation):**
  ```go
  type Config struct {
      Port      int    `env:"API_PORT" envDefault:"8000"`
      DevMode   bool   `env:"API_DEV_MODE" envDefault:"false"`
      MySQLDSN  string `env:"MYSQL_DSN"`
      RedisURL  string `env:"REDIS_URL"`
      // ...
  }

  func Load() (*Config, error) {
      var cfg Config
      if err := env.Parse(&cfg); err != nil {
          return nil, fmt.Errorf("failed to parse config: %w", err)
      }
      if strings.TrimSpace(cfg.MySQLDSN) == "" {
          return nil, fmt.Errorf("MYSQL_DSN is required")
      }
      // ... more validation ...
      return &cfg, nil
  }
  ```
- **What differs for Phase 8:** RESEARCH "Don't Hand-Roll" row "Config loading" says **keep minimal; no viper** — hand-rolled `os.Getenv` with defaults is fine, or reuse `github.com/caarlos0/env/v10` like the GO-REF. Add: `PALADIN_PORT=9880`, `PALADIN_DATABASE_URL` (Postgres DSN, not MySQL), `PALADIN_REDIS_URL`, `PALADIN_JWT_SECRET` (reject if `<32` bytes — Pitfall #4), `PALADIN_ADMIN_EMAIL/PASSWORD`, `PALADIN_JWT_TTL=15m`, `PALADIN_BCRYPT_COST=10`. **Do NOT adopt the GO-REF's `globalConfig atomic.Pointer` singleton + `config.Set/Get`** — it conflicts with RESEARCH's "no global state" anti-pattern. Return `*Config` and inject.

### 9. `apps/server/internal/http/server.go` — Gin engine + routes
- **Role:** Construct `gin.New()`, attach middleware chain (recovery, logger, error, CORS-for-dev), register `/healthz`, `/readyz`, `/auth/register`, `/auth/login`, `/me`, `/admin/health`, `/ws`.
- **Closest analog (GO-REF):** [references/wps-cowork/apps/api/main.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/main.go) `newCraftHTTPService` — builds a base middleware slice, then per-route chains (e.g. `adminMw` for admin routes), and a trivial `/health` route:
  ```go
  baseMw := []http.HandlerFunc{
      middlewares.TracePropagationMiddleware,
      middlewares.RecordMiddleWare,
      middlewares.TrafficMiddleware,
      middlewares.HeaderMiddleware,
      middlewares.AuthMiddleware,
  }
  selfServiceMw := chainHandlers(baseMw, inject)
  adminMw := chainHandlers(baseMw, middlewares.AccessAdminMiddleware, inject)
  // ...
  httpSvc := craft.NewHttpServiceWithImpl(wrapped).
      WithGET("/health", func(_ context.Context, s *http.RequestScope) {
          s.JSON(200, map[string]string{"status": "ok"})
      })
  ```
- **XL analog for CORS:** [apps/agent/src/server/main.py](file:///Users/kdocs/Workspace/paladin/apps/agent/src/server/main.py) — explicit localhost origin allowlist (RESEARCH Pitfall #16 "scope to localhost origins"):
  ```python
  app.add_middleware(
      CORSMiddleware,
      allow_origins=["http://localhost:1420", "http://localhost:5173", "tauri://localhost"],
      allow_credentials=True, allow_methods=["*"], allow_headers=["*"],
  )
  ```
- **What differs for Phase 8:** Use Gin (`gin.New()` + `r.Use(...)`) not meerkat/craft. The admin-route pattern maps directly: `r.GET("/admin/health", middleware.Auth(secret), middleware.RequireRole("admin"), h.AdminHealth)` (RESEARCH §"Gin auth middleware" excerpt). CORS is localhost-only and dev-only (Pitfall #16). Keep route registration in one place so the "no broadcast HTTP endpoint" negative test (SPEC prohibition) can grep it.

### 10. `apps/server/internal/http/handler/health_handler.go` — Health/readiness
- **Role:** `/healthz` = liveness (always 200 if process alive); `/readyz` = PG `pool.Ping` + Redis `Ping` with 2s timeout, 503 when any down (R1 acceptance).
- **Closest analog (GO-REF):** wps-cowork `/health` route above (single-line 200). The dependency-probe shape is GF — use RESEARCH §"Health endpoint (PG + Redis probes)":
  ```go
  func (h *HealthHandler) Ready(c *gin.Context) {
      ctx, cancel := context.WithTimeout(c.Request.Context(), 2*time.Second); defer cancel()
      status := gin.H{}; ok := true
      if err := h.pool.Ping(ctx); err != nil { status["postgres"]="down"; ok=false } else { status["postgres"]="up" }
      if err := h.redis.Ping(ctx).Err(); err != nil { status["redis"]="down"; ok=false } else { status["redis"]="up" }
      code := 200; if !ok { code = 503 }
      c.JSON(code, gin.H{"status": status, "ok": ok})
  }
  ```
- **XL analog for the health-response shape:** [apps/agent/src/server/main.py](file:///Users/kdocs/Workspace/paladin/apps/agent/src/server/main.py) `/health` returns `{"status":"ok","agent":"paladin-agent","models":[...]}` — same "JSON status blob" convention.
- **What differs for Phase 8:** Two endpoints, not one (`/healthz` vs `/readyz`). R1 concurrency edge: concurrent health checks must not mutate state — keep the handler stateless.

### 11. `apps/server/internal/http/handler/auth_handler.go` — Register/Login
- **Role:** `POST /auth/register` (normalize email → bcrypt → sqlc `CreateUser` + `AssignDefaultRole` in tx → 201 or 409); `POST /auth/login` (sqlc lookup → bcrypt compare → issue JWT → 200 or 401). Never echo password/JWT (D-15, D-16).
- **Analog:** None in repo. GF — use RESEARCH §"Gin handler (register)" verbatim:
  ```go
  func (h *AuthHandler) Register(c *gin.Context) {
      var req struct {
          Email    string `json:"email"    binding:"required,email"`
          Password string `json:"password" binding:"required,min=8"`
      }
      if err := c.ShouldBindJSON(&req); err != nil {
          c.JSON(400, gin.H{"error": gin.H{"code": "invalid_input", "message": "email and password required"}})
          return
      }
      email := normalizeEmail(req.Email) // strings.ToLower + TrimSpace
      hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), h.cfg.BcryptCost)
      if err != nil { writeError(c, 500, "internal"); return }
      tx, err := h.pool.Begin(c.Request.Context())
      if err != nil { writeError(c, 500, "internal"); return }
      defer tx.Rollback(c.Request.Context())
      q := h.queries.WithTx(tx)
      user, err := q.CreateUser(c.Request.Context(), sqlcgen.CreateUserParams{Email: email, PasswordHash: string(hash)})
      if err != nil {
          if isUniqueViolation(err) { c.JSON(409, gin.H{"error": gin.H{"code":"email_taken","message":"email already registered"}}); return }
          writeError(c, 500, "internal"); return
      }
      if err := q.AssignDefaultRole(c.Request.Context(), user.ID); err != nil { writeError(c, 500, "internal"); return }
      if err := tx.Commit(c.Request.Context()); err != nil { writeError(c, 500, "internal"); return }
      c.JSON(201, gin.H{"id": user.ID, "email": user.Email, "roles": []string{"user"}})
  }
  ```
- **What differs for Phase 8:** First auth handler in repo. Login follows the same shape per RESEARCH §"Auth flow". Normalize email **before insert AND lookup** (Pitfall #9, R3 encoding edge). Use `ON CONFLICT DO NOTHING` semantics via sqlc (file #24) so duplicate role assignment is a no-op (Pitfall #14).

### 12. `apps/server/internal/http/handler/sample_handler.go` — `/me`, `/admin/health`
- **Role:** Trivial protected handlers proving RBAC: `/me` reads `userID`/`roles` from context (set by JWT middleware); `/admin/health` is gated by `RequireRole("admin")`.
- **Analog:** None in repo. GF — `c.JSON(200, gin.H{"user_id": uid, "roles": roles})`. Sits behind the middleware in file #13/#14.

### 13. `apps/server/internal/http/middleware/jwt.go` — JWT parse middleware
- **Role:** Extract `Bearer <jwt>`, verify HS256 with `jwt.WithValidMethods([]string{"HS256"})`, set `userID`/`roles` in Gin context, abort 401 on missing/invalid (R3, R4 empty edges).
- **Closest analog (GO-REF, middleware shape):** [references/wps-cowork/apps/api/pkg/middlewares/auth.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/pkg/middlewares/auth.go) — extract creds, call verifier, `AbortWithStatusJSON` on failure, `Set` user info, `Next()`:
  ```go
  func AuthMiddleware(ctx context.Context, s *http.RequestScope) {
      ctx = kso.WithAll(ctx, s.Request)
      s.Request = s.Request.WithContext(ctx)
      wpsSid, _ := s.Cookie(consts.WpsSid)
      userInfo, err := getUserInfo(ctx, s, wpsSid)
      if err != nil {
          s.AbortWithStatusJSON(errs.ErrAuthError.HttpCode(), errs.ErrAuthError.V7Response())
          return
      }
      s.Set(consts.AccountInfo, userInfo)
      ctx = context.WithValue(ctx, consts.AccountInfo, userInfo)
      s.Next(ctx)
  }
  ```
- **What differs for Phase 8:** Verifier is **local HS256** (file #18), not KSO/WpsSid external account service. Use Gin handler signature `func(c *gin.Context)`, not meerkat's `(ctx, RequestScope)`. Hand-roll 30 lines — do NOT use gin-jwt (RESEARCH "Alternatives Considered"). Hardening from RESEARCH §"JWT issue + verify": assert `*jwt.SigningMethodHMAC` in the keyfunc to block `alg:none`/RS256 confusion (Pitfall: JWT alg confusion).

### 14. `apps/server/internal/http/middleware/rbac.go` — `RequireRole`
- **Role:** Membership check on `claims.roles` (D-12: role-claim based is sufficient for v1). Order-independent (SPEC R4 ordering edge).
- **Analog:** None in repo. GF — RESEARCH §"Gin auth middleware":
  ```go
  func RequireRole(want string) gin.HandlerFunc {
      return func(c *gin.Context) {
          roles, _ := c.Get("roles")
          for _, r := range roles.([]string) { if r == want { c.Next(); return } }
          abort(c, 403, "forbidden")
      }
  }
  ```

### 15. `apps/server/internal/http/middleware/error.go` — Unified error writer
- **Role:** Produce `{"error":{"code":"...","message":"..."}}` for every non-2xx (D-16). Generic client-facing code; full detail server-side only with correlation ID (RESEARCH anti-pattern).
- **Closest analog (GO-REF):** [references/wps-cowork/apps/api/pkg/errs/error.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/pkg/errs/error.go) — a `Status` type with `Code int` + `Hint` (user message) + `Detail` (debug), `WithHint`/`WithDetail` return copies (thread-safe), and a bag of pre-declared sentinels (`ErrAuthError`, `ErrNoPermission`, `ErrNotFound`...):
  ```go
  type Status struct {
      Code     int    `json:"code"`
      Hint     string `json:"hint"`
      Detail   string `json:"detail"`
      v7Code   int
      hostname string
      module   string
  }
  func (s *Status) WithDetail(msg string) *Status { cp := *s; cp.Detail = msg; return &cp }
  func (s *Status) V7Response() map[string]any {
      return map[string]any{"code": s.v7Code, "msg": s.Hint}
  }
  var ErrAuthError    = newStatus(http.StatusUnauthorized, wps365.ErrorCodeCommonAuthError)
  var ErrNoPermission = newStatus(http.StatusForbidden,  wps365.ErrorCodeCommonNoPermission)
  ```
- **What differs for Phase 8:** Drop the wps365/v7 error-code dependency. Shape is `{"error":{"code","message"}}` (D-16), not `{"code","msg"}`. The thread-safe-copy pattern is worth keeping. Never put JWT/password/stack in `message` (D-15, Pitfall #10).

### 16. `apps/server/internal/http/middleware/recovery.go` — Recovery
- **Role:** Catch panics → log full stack server-side → return generic unified 500 (D-16, RESEARCH threat "Information disclosure in errors").
- **Analog:** None in repo. Use Gin's built-in `gin.Recovery()` reshaped to emit the unified error object, or a 15-line custom middleware writing via file #15.

### 17. `apps/server/internal/http/ws/handler.go` — WS upgrade + first-message auth
- **Role:** `coder/websocket.Accept` (OriginPatterns `localhost:*` for dev) → `context.WithTimeout(context.Background(), 5s)` (NOT `r.Context()` — Pitfall #8) → `wsjson.Read` first message `{type:"auth",token}` → verify JWT → `hub.Register(uid, conn)` → heartbeat ticker → read loop → `hub.Unregister` on exit (D-17, D-19, D-21).
- **Analog:** None in repo. GF — RESEARCH §"WebSocket first-message auth handshake (coder/websocket)":
  ```go
  func (h *WSHandler) ServeWS(c *gin.Context) {
      conn, err := websocket.Accept(c.Writer, c.Request, &websocket.AcceptOptions{
          OriginPatterns: []string{"localhost:*"},
      })
      if err != nil { return }
      defer conn.CloseNow()
      ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
      defer cancel()
      var msg struct{ Type, Token string `json:"type,token"` }
      if err := wsjson.Read(ctx, conn, &msg); err != nil || msg.Type != "auth" {
          conn.Close(websocket.StatusPolicyViolation, "auth required"); return
      }
      claims, err := auth.Verify(h.cfg.JWTSecret, msg.Token)
      if err != nil { conn.Close(websocket.StatusPolicyViolation, "bad token"); return }
      uid, _ := strconv.ParseInt(claims.Subject, 10, 64)
      h.hub.Register(uid, conn)
      defer h.hub.Unregister(uid, conn)
      heartbeat := time.NewTicker(30 * time.Second); defer heartbeat.Stop()
      readCtx, readCancel := context.WithCancel(context.Background()); defer readCancel()
      go func() { for { select { case <-heartbeat.C: if err := conn.Ping(readCtx); err != nil { return } } } }()
      for {
          if _, _, err := conn.Reader(readCtx); err != nil { return }
      }
  }
  ```
- **What differs for Phase 8:** First WS code in repo. Library choice is **`coder/websocket`** (not gorilla) for concurrent-write safety — this directly satisfies the "broadcast must not panic under concurrency" acceptance (R5). Do NOT pass JWT in query string (D-18). Envelope names `{type:"auth",token}` are planner discretion (CONTEXT "Claude's Discretion").

### 18. `apps/server/internal/auth/jwt.go` — HS256 issue/verify
- **Role:** `Claims{Email, Roles, jwt.RegisteredClaims{Subject, ExpiresAt, IssuedAt}}`; `Issue` signs HS256; `Verify` parses with `WithValidMethods([]string{"HS256"})` and asserts `*jwt.SigningMethodHMAC` in keyfunc (D-11, alg-confusion mitigation).
- **Analog:** None in repo (wps-cowork uses external KSO JWKS, not local HMAC). GF — RESEARCH §"JWT issue + verify (HS256)":
  ```go
  type Claims struct {
      Email string   `json:"email"`
      Roles []string `json:"roles"`
      jwt.RegisteredClaims
  }
  func Issue(secret string, userID int64, email string, roles []string, ttl time.Duration) (string, error) {
      now := time.Now()
      claims := Claims{Email: email, Roles: roles, RegisteredClaims: jwt.RegisteredClaims{
          Subject: strconv.FormatInt(userID, 10),
          ExpiresAt: jwt.NewNumericDate(now.Add(ttl)),
          IssuedAt: jwt.NewNumericDate(now),
      }}
      return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(secret))
  }
  func Verify(secret, tokenStr string) (*Claims, error) {
      c := &Claims{}
      tok, err := jwt.ParseWithClaims(tokenStr, c, func(t *jwt.Token) (any, error) {
          if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok { return nil, fmt.Errorf("unexpected alg") }
          return []byte(secret), nil
      }, jwt.WithValidMethods([]string{"HS256"}))
      if err != nil || !tok.Valid { return nil, err }
      return c, nil
  }
  ```
- **What differs for Phase 8:** Short-lived access tokens only — **no refresh** (D-10, Pitfall #15). TTL ~15m (RESEARCH Open Q #6). Secret ≥32 bytes enforced in config (file #8).

### 19. `apps/server/internal/auth/password.go` — bcrypt
- **Role:** Wrap `bcrypt.GenerateFromPassword` (cost from config, ≥10) and `bcrypt.CompareHashAndPassword`; map `ErrMismatchedHashAndPassword` → unified `invalid_credentials`.
- **Analog:** None in repo. GF — RESEARCH §"bcrypt hash/compare":
  ```go
  hash, _ := bcrypt.GenerateFromPassword([]byte(password), 10)
  err := bcrypt.CompareHashAndPassword([]byte(storedHash), []byte(suppliedPassword))
  // err == nil → valid; ErrMismatchedHashAndPassword → invalid credentials
  ```
- **What differs for Phase 8:** Pitfall #5 — keep cost at 10 for dev/test speed; allow env override for prod. Never log hash or password (D-15).

### 20. `apps/server/internal/auth/bootstrap.go` — Admin bootstrap
- **Role:** At startup, if `PALADIN_ADMIN_EMAIL` user doesn't exist, create it with hashed `PALADIN_ADMIN_PASSWORD` and `admin` role; idempotent (D-13, Pitfall #13).
- **Analog (GO-REF, fail-fast + idempotency spirit):** [references/wps-cowork/apps/api/internal/config/config.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/internal/config/config.go) `Load()` validates required fields before startup; wps-cowork does not bootstrap users but the "refuse to start if misconfigured" posture applies.
- **What differs for Phase 8:** Use `INSERT ... ON CONFLICT (email) DO NOTHING` then ensure admin role via `ON CONFLICT (user_id, role_id) DO NOTHING` (Pitfall #13). Re-running startup must not fail or duplicate (SPEC R4 idempotency edge).

### 21. `apps/server/internal/db/pool.go` — pgxpool
- **Role:** `pgxpool.New(ctx, dsn)` + `pool.Ping(ctx)`; apply pool config; close on shutdown.
- **Closest analog (GO-REF, near-direct):** [references/wps-cowork/apps/api/internal/db/db.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/internal/db/db.go) `Open()` — DSN-required guard, GORM open, pool tuning, `Ping` health check, explicit "schema managed by SQL migrations, do NOT AutoMigrate":
  ```go
  func Open(dsn string, cfg ...OpenConfig) (*DB, error) {
      if dsn == "" { return nil, fmt.Errorf("database DSN is required but not configured") }
      gormDB, err := gorm.Open(mysql.Open(dsn), &gorm.Config{ /* logger */ })
      if err != nil { return nil, fmt.Errorf("gorm open: %w", err) }
      sqlDB, err := gormDB.DB()
      if err != nil { return nil, fmt.Errorf("gorm db: %w", err) }
      if oc.MaxOpenConns > 0 { sqlDB.SetMaxOpenConns(oc.MaxOpenConns) }
      if oc.MaxIdleConns > 0 { sqlDB.SetMaxIdleConns(oc.MaxIdleConns) }
      if oc.ConnMaxLifeSec > 0 { sqlDB.SetConnMaxLifetime(time.Duration(oc.ConnMaxLifeSec) * time.Second) }
      if err := sqlDB.Ping(); err != nil { _ = sqlDB.Close(); return nil, fmt.Errorf("mysql ping: %w", err) }
      // Schema is managed by SQL migration scripts. Do NOT use AutoMigrate here.
      return &DB{DB: gormDB}, nil
  }
  ```
- **What differs for Phase 8:** Swap GORM/MySQL → `pgxpool`/PostgreSQL. Pin pgx **v5.10.0** (Pitfall #3 — ≤v5.9.x has SQL-injection advisory GO-2026-5004). Keep the "migrations own schema, no auto-migrate" comment — it matches D-08.

### 22. `apps/server/internal/db/redis.go` — go-redis client
- **Role:** `redis.ParseURL(PALADIN_REDIS_URL)` → `redis.NewClient` → `Ping` for health. No quota logic (Phase 9).
- **Analog (GO-REF):** [references/wps-cowork/apps/api/main.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/main.go) constructs the redis client conditionally:
  ```go
  var redisClient goredis.UniversalClient
  if rc := services.BuildRedisClient(cfg); rc != nil {
      streamStore = services.NewRedisStreamStore(rc, cfg.RedisKeyPrefix, cfg.StreamMaxLen)
      redisClient = rc
  }
  ```
- **What differs for Phase 8:** Redis is a **hard dependency** for Phase 8 (must be connected + health-checked per SPEC constraint), so do NOT copy the "soft/optional" posture — fail startup if Redis unreachable. Use `github.com/redis/go-redis/v9` (not the deprecated `go-redis/redis` v6/v7 — RESEARCH §"Package Legitimacy Audit" typosquat warning).

### 23. `apps/server/internal/db/sqlc/*.sql.go` (+ `db.go`, `models.go`) — GENERATED
- **Role:** Typed query methods produced by sqlc (`CreateUser`, `GetUserByEmail`, `AssignDefaultRole`, `GetRolesByUserID`). Marked `// Code generated by sqlc. DO NOT EDIT.`
- **Analog:** None — output of tooling. RESEARCH §"sqlc query + generated code" shows the expected signatures:
  ```go
  func (q *Queries) CreateUser(ctx context.Context, arg CreateUserParams) (User, error)
  func (q *Queries) GetUserByEmail(ctx context.Context, email string) (User, error)
  func (q *Queries) AssignDefaultRole(ctx context.Context, userID int64) error
  ```
- **What differs for Phase 8:** First generated code in repo. The `emit_interface: true` option (file #3) gives a `Querier` interface for test fakes (RESEARCH §"Validation Architecture" — DB layer tests fake the interface).

### 24. `apps/server/internal/db/queries/*.sql` — sqlc input
- **Role:** Annotated SQL (`-- name: CreateUser :one`) that sqlc compiles into file #23.
- **Analog:** None in repo. GF — RESEARCH §"sqlc query + generated code":
  ```sql
  -- name: CreateUser :one
  INSERT INTO users (email, password_hash)
  VALUES ($1, $2)
  RETURNING id, email, password_hash, created_at;

  -- name: GetUserByEmail :one
  SELECT id, email, password_hash, created_at FROM users WHERE email = $1;

  -- name: AssignDefaultRole :exec
  INSERT INTO user_roles (user_id, role_id)
  SELECT $1, id FROM roles WHERE name = 'user'
  ON CONFLICT (user_id, role_id) DO NOTHING;
  ```
- **What differs for Phase 8:** First SQL in repo. The `ON CONFLICT ... DO NOTHING` clause is what makes duplicate role assignment a no-op (SPEC R4 adjacency edge, Pitfall #14).

### 25. `apps/server/internal/ws/hub.go` — Hub registry + Broadcast
- **Role:** `map[userID][]*websocket.Conn` guarded by `sync.RWMutex`; `Register/Unregister` (idempotent); internal `Broadcast(msg)` fans out — no HTTP route (D-20).
- **Analog:** None in repo. GF — RESEARCH §"WebSocket Hub lifecycle (coder/websocket)" + Pitfall #6 (concurrent writes). coder/websocket is concurrent-write-safe so no per-conn mutex is needed (the deciding factor vs gorilla, per RESEARCH §"State of the Art").
- **What differs for Phase 8:** Keyed by userID, supports multiple concurrent conns per user (D-19). Broadcast is **internal method verified by Go tests only** — must NOT be exposed via HTTP (SPEC prohibition, negative test in #32).

### 26. `apps/server/migrations/000001_init_schema.up.sql` + `.down.sql` — Schema
- **Role:** `users(id, email UNIQUE/normalized, password_hash, created_at)`, `roles(id, name UNIQUE)`, `user_roles(user_id, role_id, UNIQUE(user_id, role_id))`. Idempotent re-run (D-08, D-09; SPEC R2 edges).
- **Analog:** None in repo. GF — RESEARCH §"sqlc queries" implies the schema; Pitfall #9 (email normalization via CITEXT or `LOWER()` unique index) and Pitfall #14 (`UNIQUE(user_id, role_id)`).
- **What differs for Phase 8:** First migrations in repo. golang-migrate filename convention `NNNNNN_name.up.sql` / `.down.sql` (RESEARCH §"Migrations"). Down file drops tables in reverse FK order. Email uniqueness must be case-insensitive at the DB layer (R3 encoding edge).

### 27. `apps/server/migrations/000002_seed_roles.up.sql` + `.down.sql` — Seed
- **Role:** Insert `user` and `admin` rows into `roles` (RESEARCH Open Q #5).
- **Analog:** None. GF. Use `INSERT INTO roles (name) VALUES ('user'),('admin') ON CONFLICT (name) DO NOTHING` for idempotency.

### 28. `docker-compose.server.yml` (repo root) — PG + Redis
- **Role:** Local Postgres 16 + Redis 7 with healthchecks; Podman-first invocation (D-23, D-24, D-25 ports 5432/6379).
- **Closest analog (GO-REF):** [references/wps-cowork/docker-compose.yml](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/docker-compose.yml) — service blocks with healthchecks, port mapping via env, networks, named containers:
  ```yaml
  redis:
    image: redis:7-alpine
    command: ["sh", "-c", "redis-server --requirepass \"$$REDIS_PASSWORD\""]
    environment:
      REDIS_PASSWORD: ${REDIS_PASSWORD:-sandbox-v2-redis}
    ports:
      - "${REDIS_PORT:-6379}:6379"
    healthcheck:
      test: ["CMD", "sh", "-c", "redis-cli -a \"$$REDIS_PASSWORD\" ping | grep -q PONG"]
      interval: 5s
      timeout: 3s
      retries: 5
    restart: unless-stopped
  ```
- **What differs for Phase 8:** Drop MySQL/sandbox/web/api/a2a/opensandbox services — Phase 8 needs **only** Postgres 16 + Redis 7. File lives at **repo root** (not `apps/server/`) per D-23. Postgres healthcheck uses `pg_isready`. Pin Postgres 16 + Redis 7 versions. Document `podman compose -f docker-compose.server.yml up -d` as the canonical command.

### 29. `internal/http/handler/health_test.go` — Health tests
- **Role:** Table-driven: 200 when PG+Redis up; 503 + `postgres:down` when PG killed; 503 + `redis:down` when Redis killed; concurrent checks don't mutate state (R1 edges).
- **Closest analog (XL):** [apps/agent/tests/test_server.py](file:///Users/kdocs/Workspace/paladin/apps/agent/tests/test_server.py) `TestHealthEndpoint` — patches env, builds a test client, asserts status + JSON shape:
  ```python
  def test_health_returns_200_and_json(self):
      with patch.dict(os.environ, {"DEEPSEEK_API_KEY": "fake-key"}):
          from src.server.main import app
          from fastapi.testclient import TestClient
          client = TestClient(app)
          response = client.get("/health")
          assert response.status_code == 200
          data = response.json()
          assert data["status"] == "ok"
  ```
- **GO-REF for Go table-driven shape:** [references/wps-cowork/apps/api/main_test.go](file:///Users/kdocs/Workspace/paladin/references/wps-cowork/apps/api/main_test.go):
  ```go
  func TestChainHandlersReturnsIndependentSlices(t *testing.T) {
      base1 := func(ctx context.Context, s *meerkathttp.RequestScope) {}
      // ... arrange ...
      chainA := chainHandlers(base, routeA, routeB)
      chainB := chainHandlers(base, routeC)
      if len(chainA) != 4 { t.Fatalf("len(chainA) = %d, want 4", len(chainA)) }
      // ... assert ...
  }
  ```
- **What differs for Phase 8:** Use `net/http/httptest` + `gin.CreateTestContext` or a full `httptest.Server` (RESEARCH §"Validation Architecture"). Inject fake PG/Redis Ping functions — no testcontainers-go (D-27). Run `go test -race ./...` (R1 concurrency edge).

### 30. `internal/auth/auth_test.go` — Register/Login edges
- **Role:** Table-driven R3 edges: valid register, dup email→409, empty email, empty password, short password; valid login returns parseable JWT with correct claims; wrong password→401 no token; normalized-email login (`Foo@` vs `foo@`).
- **Analog:** XL edge-coverage style of `apps/agent/tests/test_server.py` (multiple focused test methods per edge). GF for JWT-claim assertions — RESEARCH §"SRV-02 → Test Map".
- **What differs for Phase 8:** Negative test must assert auth-failure bodies do NOT contain the JWT string or password substring (SPEC prohibition "MUST NOT write JWTs/passwords to logs, error responses, or WS messages").

### 31. `internal/auth/rbac_test.go` — RBAC matrix
- **Role:** no token→401; bad token→401; user token on `/admin/health`→403; admin token→200; re-assign admin role then authz unchanged (R4 idempotency edge).
- **Analog:** None in repo. GF — RESEARCH §"SRV-03 → Test Map".

### 32. `internal/ws/hub_test.go` — Hub tests
- **Role:** unauth connect→closed; valid→registered; disconnect→unregistered (idempotent re-unregister); 2 conns same userID coexist (D-19); broadcast to N=100 conns under `-race` no panic (R5 concurrency); broadcast NOT exposed via HTTP (D-20 negative test — grep router registrations).
- **Analog:** None in repo. GF — RESEARCH §"SRV-04 → Test Map". Use `coder/websocket.Dial` for in-process test clients.

---

## Notes for the Planner

1. **Naming variant to reconcile.** CONTEXT D-04 and the task brief list flatter names (`internal/http/health.go`, `internal/http/router.go`, `internal/auth/handlers.go`, `internal/db/querier.go`, `internal/db/queries.sql`, `internal/db/sqlc.yaml`). RESEARCH §"Recommended Project Structure" prescribes a deeper `internal/http/{handler,middleware,ws}/` + `internal/auth/{jwt,password,bootstrap}.go` + `internal/db/{pool,redis,sqlc,queries}/` layout. **Both satisfy the locked tier names.** Recommend the RESEARCH layout (clearer separation, matches the GO-REF layering convention) — but call this out in the PLAN so it is a conscious decision, not a drift.

2. **Wave 0 toolchain gap is a hard blocker.** RESEARCH §"Environment Availability" confirms Go, sqlc, golang-migrate CLI, and Podman are all **missing** on this machine (only Docker 28.4.0 is present). The first plan wave MUST install Go 1.26+, sqlc v1.31.1, golang-migrate CLI, and decide Podman-install vs Docker-use. No Go file above can be compiled or tested until then.

3. **Do not inherit wps-cowork's "global singleton" pattern.** The GO-REF config uses `atomic.Pointer[Config]` + `config.Set/Get`, and main.go calls `config.Set(cfg)`. RESEARCH explicitly lists "Global singleton DB/Redis" as an anti-pattern (to enable `httptest` with fakes). Inject `*Config`, `*pgxpool.Pool`, `*redis.Client`, `*ws.Hub` through handler structs instead.

4. **Library pin discipline.** Several pitfalls collapse if versions are pinned exactly: pgx **must** be v5.10.0 (Pitfall #3 SQL-injection fix), golang-jwt **must** be `/v5` (not deprecated `dgrijalva/jwt-go`), go-redis **must** be `/v9` (not `go-redis/redis` v6/v7), websocket **must** be `coder/websocket` (not gorilla, unless the planner explicitly adds per-conn write mutexes). All four are RESEARCH "Alternatives Considered" decisions and should be enforced in `go.mod` and a brief code-review checklist.

5. **Two SPEC prohibitions need explicit negative tests.** (a) No JWT/password echo in any response or WS close reason — assert in `auth_test.go` and `hub_test.go`. (b) No broadcast HTTP endpoint and no Phase 9 scope (audit/quota) — assert by grepping route registrations. These are cheap to write and protect against scope creep.

6. **CSP already friendly.** [tauri.conf.json](file:///Users/kdocs/Workspace/paladin/apps/desktop/src-tauri/tauri.conf.json) `connect-src` permits `http://localhost:*`, so a future desktop→Go integration on :9880 will not be CSP-blocked (CONTEXT "Established Patterns"). Phase 8 is server-only, but the planner should not add any CORS/CSP friction that would block that later integration.

7. **`references/wps-cowork/apps/api` is fuller than CONTEXT implied.** CONTEXT D-02 says "use as reference but do NOT copy heavy framework." The directory is in fact a complete Go service (config/db/middlewares/errs/handlers all present), so it is a strong GO-REF for *Go idioms and layering* — just not for its meerkat/craft/protobuf/Eino/GORM/MySQL/KSO-auth choices, which Phase 8 swaps for Gin/pgx/sqlc/golang-migrate/golang-jwt/coder-websocket/Postgres/local-HS256.

8. **No existing test runner for Go.** Root [package.json](file:///Users/kdocs/Workspace/paladin/package.json) has `lint`/`format`/`check` (biome) for TS only. The planner should document `go test -race ./...` and `go vet ./...` (and optionally `golangci-lint`) in `apps/server/README.md` and consider whether to wire a `test:server` script at the root for symmetry — but per the "do nothing more than asked" rule, only if the user requests it.

---

*Phase: 08-go-server*
*Pattern mapping complete: 2026-07-04*

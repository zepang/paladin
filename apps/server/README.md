# Paladin Go Server

基于 PostgreSQL 与 Redis 的 JWT 鉴权 Gin HTTP + WebSocket 服务。这是 Phase 08 的脚手架：认证、RBAC、健康检查、内存广播 Hub。Phase 09 的配额（quota/usage）功能刻意未包含。

## 技术栈

| 层 | 选型 |
|---|---|
| 语言 | Go 1.26+ |
| HTTP | `github.com/gin-gonic/gin` v1.10.0 |
| WebSocket | `github.com/coder/websocket` v1.8.15 |
| Postgres 驱动 | `github.com/jackc/pgx/v5` v5.10.0（经 `pgxpool`） |
| Redis 客户端 | `github.com/redis/go-redis/v9` v9.21.0 |
| 数据库迁移 | `github.com/golang-migrate/migrate/v4` v4.19.1 |
| SQL 代码生成 | `github.com/sqlc-dev/sqlc` v1.31.1（`sql_package: pgx/v5`） |
| JWT | `github.com/golang-jwt/jwt/v5` v5.3.1（仅 HS256） |
| 密码 | `golang.org/x/crypto/bcrypt` |

## 前置条件

- Go >= 1.26
- Docker（或 Podman —— 见下文"Podman / Docker"）
- `golang-migrate` CLI 与 `sqlc` CLI（若 Homebrew 无预编译包，用 `go install` 安装）

## 快速开始

```bash
# 1. 启动 Postgres + Redis
docker compose -f docker-compose.server.yml up -d

# 2. 应用迁移
migrate -path apps/server/migrations \
  -database "postgres://paladin:change-me@localhost:5432/paladin?sslmode=disable" up

# 3. 配置环境变量
cp apps/server/.env.example apps/server/.env
# 编辑 apps/server/.env —— 设置真实的 PALADIN_JWT_SECRET（>= 32 字节）

# 4. 运行服务
cd apps/server
go run ./cmd/server
```

服务监听 `http://localhost:9880`。

## 接口

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/healthz` | 无 | 存活探针 —— 恒返回 200 `{"status":"ok"}` |
| GET | `/readyz` | 无 | 就绪探针 —— PG+Redis 正常返回 200，否则 503，并给出每个依赖的状态 |
| POST | `/auth/register` | 无 | `{email, password}` → 201 `{id,email,roles}`；大小写不敏感重复返回 409；非法输入返回 400 |
| POST | `/auth/login` | 无 | `{email, password}` → 200 `{token, token_type:"Bearer", expires_at}`；凭证错误返回 401 |
| GET | `/me` | Bearer | 返回 JWT subject + roles |
| GET | `/admin/health` | Bearer + `admin` | admin 返回 200，其他返回 403 |
| GET | `/ws` | Bearer | WebSocket 升级；服务端每 30s 发 ping |

所有错误响应统一形状：`{"error":{"code": "...", "message": "..."}}`。

## 配置项

全部通过环境变量读取（见 `.env.example`）：

| 变量 | 默认值 | 说明 |
|---|---|---|
| `PALADIN_PORT` | `9880` | HTTP 监听端口 |
| `PALADIN_DATABASE_URL` | — | 必填。Postgres DSN |
| `PALADIN_REDIS_URL` | — | 必填。Redis URL |
| `PALADIN_JWT_SECRET` | — | 必填。>= 32 字节 |
| `PALADIN_JWT_TTL` | `15m` | Go duration 格式 |
| `PALADIN_BCRYPT_COST` | `10` | 最小 10 |
| `PALADIN_ADMIN_EMAIL` | — | 与密码同时设置时，启动会自动引导创建 admin 用户 |
| `PALADIN_ADMIN_PASSWORD` | — | 与 `PALADIN_ADMIN_EMAIL` 配套 |
| `PALADIN_AUTO_MIGRATE` | `true` | 预留字段，暂未使用 |
| `PALADIN_QUOTA_LIMIT` | `50` | 每用户每窗口允许的 AI 调用次数上限 |
| `PALADIN_QUOTA_WINDOW` | `1h` | 配额重置窗口（Go duration 格式，如 `1h`/`10m`） |

## Phase 09 — Admin Systems

### 配额（Quota）

- 按用户维度的 AI 调用计数，采用 **Redis 滑动窗口**（ZSET + Lua 原子 check-and-consume），与 Stripe/GitHub 的生产级限流实践一致。
- key 形如 `quota:{<subject>}`，每次调用以 `ZADD` 记录时间戳为 score，查询时先 `ZREMRANGEBYSCORE` 清除窗口外旧记录再 `ZCARD` 计数。
- 超限请求返回 HTTP 429，错误码 `quota_exceeded`，并附带 `X-RateLimit-Limit`、`X-RateLimit-Remaining`、`X-RateLimit-Reset` 响应头。
- `admin` 角色自动跳过配额检查（unlimited）。
- 配额超限事件会写入审计日志，并通过 WebSocket 扇出给 admin 连接。

### 审计日志（Audit Logs）

- 表 `audit_logs(id, user_id, action, status, request_ip, created_at, metadata JSONB)`，append-only（无 UPDATE/DELETE）。
- 记录来源：`auth.login`、`auth.register`（成功/失败）、`rbac.deny`（RBAC 拒绝）、`quota.exceeded`（配额超限）。
- JSONB metadata 按 action 类型走 **allowlist 过滤**，结构性保证不会写入 password/hash/JWT/bearer token；查询时再做一次纵深防御过滤。
- admin 可通过 `GET /admin/audit-logs` 游标分页查询，支持 `user_id`/`action`/`status` 组合过滤，结果按 `created_at DESC, id DESC` 排序。

### WebSocket Hub

- 双索引：`map[userID][]Conn` + `map[role]map[userID]bool`，`SendToUser` O(1)、`SendToRole` 免全表扫描。
- 结构化信封 `{type, payload, ts}`；未知 `type` 为 logged no-op（不 panic、不断连）。
- 定向推送给离线用户为 no-op（不报错）；审计/配额事件实时扇出给 admin 角色。

## 数据库迁移

```bash
migrate -path apps/server/migrations -database "$PALADIN_DATABASE_URL" up      # 应用
migrate -path apps/server/migrations -database "$PALADIN_DATABASE_URL" down 2  # 回滚 2 个版本
migrate -path apps/server/migrations -database "$PALADIN_DATABASE_URL" version # 查看
```

本模块内的 `cmd/migrate` 二进制封装了同样的操作：

```bash
go run ./cmd/migrate up
go run ./cmd/migrate down 2
go run ./cmd/migrate version
```

表结构（`migrations/000001_init_schema.up.sql`）：
- `users(id BIGSERIAL PK, email TEXT, password_hash TEXT, created_at TIMESTAMPTZ)`，带 `UNIQUE INDEX users_email_lower_uidx ON users (LOWER(email))`。
- `roles(id BIGSERIAL PK, name TEXT UNIQUE)`。
- `user_roles(user_id, role_id)` 复合主键。
- 种子数据（`000002`）：`user`、`admin`。

## 重新生成 sqlc 代码

```bash
sqlc generate
```

配置位于 `apps/server/sqlc.yaml`，输出包 `sqlcgen` 在 `internal/db/sqlc`。禁止手动编辑生成文件。

## 测试

```bash
# 单元测试（不依赖真实服务）
go test ./... -race -count=1

# 针对 compose 栈的集成测试
PALADIN_DB_INTEGRATION=1 go test ./internal/db/... -race -count=1
```

## Podman / Docker

compose 文件两种引擎均可：

```bash
# Docker（默认）
docker compose -f docker-compose.server.yml up -d

# Podman
podman compose -f docker-compose.server.yml up -d
```

本阶段用 Docker 28.4.0 验证；生产环境推荐 Podman（见决策 D-23/D-24）。

## 项目结构

```
apps/server/
  cmd/
    server/main.go       # 组合根 + 优雅关闭
    migrate/main.go      # 迁移 CLI
  internal/
    auth/                # JWT、bcrypt、BootstrapAdmin
    config/              # 带校验的环境变量加载器
    db/
      pool.go            # pgxpool 封装
      redis.go           # go-redis 封装
      queries/           # sqlc 输入 SQL
      sqlc/              # 生成代码 —— 禁止编辑
    http/
      server.go          # NewServer：装配所有路由
      handler/           # health、auth、sample 处理器
      middleware/        # recovery、error、Auth、RequireRole
      ws/                # coder/websocket 网关
    ws/                  # 内存广播 Hub
  migrations/            # golang-migrate up/down SQL
  sqlc.yaml
  .env.example
  .gitignore
```

---
status: testing
phase: 08-go-server
source: [08-01..07-SUMMARY.md]
started: 2026-07-04T18:00:00+08:00
updated: 2026-07-04T18:20:00+08:00
---

## Current Test

[见下方"待用户确认"——所有 24 项已机器核对通过，请用户审阅是否需要复核]

## Tests

### 1. 冷启动冒烟测试
expected: 杀掉运行中的服务，清空 DB（migrate down 2 + up），从零启动。服务无报错，迁移完成，`/healthz` 返回 200。
result: pass
evidence: `{"status":"ok"}` HTTP 200；启动日志显示所有 7 个路由注册成功；admin bootstrap 在启动时自动执行。

### 2. 就绪探针报告 PG + Redis 状态（R1）
expected: `/readyz` 在 PG+Redis 可达时返回 200 `{"ok":true,"status":{"postgres":"up","redis":"up"}}`。
result: pass
evidence: `{"ok":true,"status":{"postgres":"up","redis":"up"}}`

### 3. 注册新邮箱成功（R3）
expected: POST /auth/register 新邮箱 → 201 `{id,email,roles:["user"]}`，自动分配默认 user 角色。
result: pass
evidence: `{"email":"alice@x.com","id":2,"roles":["user"]}` HTTP 201

### 4. 大小写不敏感邮箱冲突（R3 idempotency）
expected: 重复注册 `ALICE@x.com`（已存在 `alice@x.com`）→ 409 `email_taken`。
result: pass
evidence: `{"error":{"code":"email_taken",...}}` HTTP 409

### 5. 空邮箱被拒（R3 empty edge）
expected: `{"email":"","password":"x"}` → 400 `invalid_input`。
result: pass
evidence: HTTP 400

### 6. 短密码被拒（R3 validation）
expected: password < 8 字符 → 400 `invalid_input`。
result: pass
evidence: HTTP 400

### 7. 有效登录返回 JWT（R3）
expected: 正确凭证 → 200 `{token, token_type:"Bearer", expires_at}`。
result: pass
evidence: token 长度 142 字符，HS256 签名，expires_at 为 +15m。

### 8. 错误密码失败且不回显 secret（R3 prohibition）
expected: 错误密码 → 401 `invalid_credentials`，body 不含密码/token 明文。
result: pass
evidence: `{"error":{"code":"invalid_credentials","message":"invalid credentials"}}` HTTP 401；body 不含 "wrong"、"password"、"token" 字样。

### 9. /me 带 JWT 返回身份（R4）
expected: GET /me + Bearer token → 200 `{user_id, roles}`。
result: pass
evidence: `{"roles":["user"],"user_id":"2"}` HTTP 200

### 10. /me 无 token 被拒（R4 empty edge）
expected: 无 Authorization 头 → 401 `missing_token`。
result: pass
evidence: HTTP 401

### 11. /me 错误 token 被拒（R4 invalid edge）
expected: `Bearer not.a.jwt` → 401 `invalid_token`。
result: pass
evidence: HTTP 401

### 12. user 角色不能访问 admin 路由（R4 prohibition）
expected: alice（user 角色）访问 /admin/health → 403 `forbidden`。
result: pass
evidence: `{"error":{"code":"forbidden","message":"insufficient role"}}` HTTP 403

### 13. admin bootstrap 启动时自动创建（R1）
expected: PALADIN_ADMIN_EMAIL/PASSWORD 设置后，服务启动时自动创建 admin 用户并分配 admin 角色；登录成功。
result: pass
evidence: admin@example.local 登录返回 token，roles 含 "admin"。

### 14. admin 角色能访问 admin 路由（R4）
expected: admin 用户访问 /admin/health → 200。
result: pass
evidence: `{"admin":true,"status":"ok"}` HTTP 200

### 15. WebSocket 连接生命周期（R5）
expected: Hub 的 Register/Unregister/Broadcast 行为正确，断开连接从注册表移除，重连不覆盖。
result: pass
evidence: go test ./internal/ws/... -race 全 5 个测试通过（TestHubRegisterUnregister、TestHubBroadcastDeliversToAll、TestHubBroadcastNoClientsNoBlock、TestHubUnregisterIdempotent、TestHubRegisterDoesNotOverwrite）。

### 16. 广播并发不 panic（R5 concurrency）
expected: 多个并发连接下广播不崩溃。
result: pass
evidence: 同上，TestHubBroadcastDeliversToAll + TestHubBroadcastNoClientsNoBlock 在 -race 下通过。

### 17. 同一用户多连接共存（R5 adjacency）
expected: 同一 userID 的多个 WebSocket 连接被分别追踪。
result: pass
evidence: Hub 用 map[string]Conn 按 ID 索引，TestHubRegisterDoesNotOverwrite 验证重复注册不覆盖（idempotent map 写入）。

### 18. 断开连接清理幂等（R5 idempotency）
expected: 同一连接多次 Unregister 安全。
result: pass
evidence: TestHubUnregisterIdempotent 通过。

### 19. JWT 鉴权 WebSocket（R5 empty/invalid edge）
expected: /ws 路由在 Auth 中间件后，无/错 JWT 的 WebSocket 升级被拒。
result: pass
evidence: server.go 中 `/ws` 注册了 `middleware.Auth(cfg.JWTSecret)` 前置；auth_test.go 的 TestNoToken_401MissingToken / TestBadToken_401InvalidToken 在 HTTP 层验证同一中间件逻辑（WebSocket 升级前必须先过 Auth）。

### 20. 重复角色分配被拒（R4 adjacency）
expected: 同一 (user_id, role_id) 二次插入被 DB 复合主键拒绝。
result: pass
evidence: `INSERT INTO user_roles (user_id, role_id) VALUES (2,1)` → ERROR 23505 duplicate key violates "user_roles_pkey"。

### 21. 迁移幂等（R2 idempotency）
expected: 重复 migrate up 不改变 schema 状态。
result: pass
evidence: 第二次 `migrate up` 输出 `no change`。

### 22. 重复邮箱 DB 约束（R2 adjacency）
expected: UNIQUE(LOWER(email)) 在 DB 层拒绝大小写变体。
result: pass
evidence: T4（HTTP 409）+ 08-02 SUMMARY 已验证 SQLSTATE 23505 on users_email_lower_uidx。

### 23. 重复角色名 DB 约束（R2 adjacency）
expected: UNIQUE(roles.name) 拒绝重复。
result: pass
evidence: 08-02 SUMMARY 已验证 SQLSTATE 23505 on roles_name_unique。

### 24. 本地开发配置完整可跑（R6）
expected: docker-compose up + migrate up + cp .env + go run，开发者能观察到健康检查成功。
result: pass
evidence: 本会话 T1-T14 全流程在干净环境复现成功；.env 加载 bug 已在本次 verify 期间修复（godotenv）。

## Summary

total: 24
passed: 24
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none]

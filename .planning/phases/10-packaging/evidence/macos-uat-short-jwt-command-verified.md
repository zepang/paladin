# macOS installed UAT — short JWT secret, command verified

- Date: 2026-07-12 15:35 Asia/Shanghai
- App tested: `/Users/kdocs/Applications/Paladin-UAT-10-06-jwt-degraded-e8de5ce/Paladin.app`
- Launcher: `scripts/launch-paladin-macos.sh --app "$APP"`
- Environment scenario: `PALADIN_JWT_SECRET=short`, `PALADIN_DATABASE_URL` empty, `PALADIN_REDIS_URL` empty; API key inherited without printing its value.
- DMG SHA256: `0b073af79df11f3e28d63dbb76785c3ccc227bfbabc238d94fae8fcc73a5635b`

## Probe result

```text
t=1s agent=DOWN go_health=DOWN go_ready=DOWN code=000
t=2s agent=DOWN go_health=DOWN go_ready=DOWN code=000
t=3s agent=DOWN go_health=DOWN go_ready=DEGRADED code=503
t=4s agent=DOWN go_health=UP go_ready=DEGRADED code=503
...
t=20s agent=UP go_health=UP go_ready=DEGRADED code=503
```

## Health responses

Agent `/health`:

```json
{"status":"ok","agent":"paladin-agent","models":["deepseek-v4-pro","deepseek-v4-flash","lm-studio-local"]}
```

Go `/healthz`:

```json
{"status":"ok","mode":"degraded"}
```

Go `/readyz`:

```json
{"ok":false,"status":{"postgres":"missing","redis":"missing"},"mode":"degraded"}
```

This verifies that a short packaged JWT secret no longer makes the managed Go sidecar exit.

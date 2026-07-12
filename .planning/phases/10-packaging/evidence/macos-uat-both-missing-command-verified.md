# macOS installed UAT — both dependencies missing, command verified

- Date: 2026-07-12 14:38 Asia/Shanghai
- App: `/Users/kdocs/Applications/Paladin-UAT-10-06-degraded-1d6f2d4/Paladin.app`
- Launcher: `scripts/launch-paladin-macos.sh --app "$APP"`
- Environment scenario: `PALADIN_DATABASE_URL`, `PALADIN_REDIS_URL`, and `PALADIN_JWT_SECRET` intentionally empty; `DEEPSEEK_API_KEY` inherited from the shell without printing its value.
- DMG: `apps/desktop/src-tauri/target/release/bundle/dmg/paladin_0.1.0_aarch64.dmg`
- DMG SHA256: `6f7e52f59fc834026121386246150a048a61ca7f50d044e86b8d275d7a0f244d`

## Probe result

```text
t=1s agent=DOWN go_health=DOWN go_ready=DOWN code=000
t=2s agent=DOWN go_health=DOWN go_ready=DOWN code=000
t=3s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=4s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=5s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=6s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=7s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=8s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=9s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=10s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=11s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=12s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=13s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=14s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=15s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=16s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=17s agent=DOWN go_health=UP go_ready=DEGRADED code=503
t=18s agent=UP go_health=UP go_ready=DEGRADED code=503
```

## Wrapper log

```text
Missing recommended environment variables:
- PALADIN_DATABASE_URL
- PALADIN_REDIS_URL
Paladin will still launch so packaged diagnostics can report the final app state.
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

No secret values are included in this evidence.

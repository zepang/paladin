# macOS installed UAT — postgres_missing, command verified

- Date: 2026-07-12 16:30 Asia/Shanghai
- App: `/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app`
- Launcher: `scripts/launch-paladin-macos.sh --app "$APP"`
- Commit: `2d5dcf768503b61f9f8bf331ed70d568d11699e7`
- DMG SHA256: `9ddfb59f75c824ce1a358e3a11f808016a4283f51d247d47119089ad6fb7c281`
- Secret policy: environment values were provided only to the launched process; this evidence contains variable names and health results only.

## Probe result

```text
t=1s agent=DOWN go_health=DOWN go_ready=DOWN ready_code=000000
t=2s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=3s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=4s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=5s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=6s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=7s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=8s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=9s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=10s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=11s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=12s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=13s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=14s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=15s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=16s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=17s agent=DOWN go_health=UP go_ready=DEGRADED ready_code=503
t=18s agent=UP go_health=UP go_ready=DEGRADED ready_code=503

APP_PID=91239

WRAPPER_STDERR_START
Missing recommended environment variables:
- PALADIN_DATABASE_URL
Paladin will still launch so packaged diagnostics can report the final app state.
WRAPPER_STDERR_END

AGENT_HEALTH
{"status":"ok","agent":"paladin-agent","models":["deepseek-v4-pro","deepseek-v4-flash","lm-studio-local"]}

GO_HEALTHZ
{"status":"ok","mode":"degraded"}

GO_READYZ
{"ok":false,"status":{"postgres":"missing","redis":"unknown"},"mode":"degraded"}
```

No secret values are included in this evidence.

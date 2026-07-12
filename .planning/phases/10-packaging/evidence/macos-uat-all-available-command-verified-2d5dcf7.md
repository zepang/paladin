# macOS installed UAT — all_available, command verified

- Date: 2026-07-12 16:30 Asia/Shanghai
- App: `/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app`
- Launcher: `scripts/launch-paladin-macos.sh --app "$APP"`
- Commit: `2d5dcf768503b61f9f8bf331ed70d568d11699e7`
- DMG SHA256: `9ddfb59f75c824ce1a358e3a11f808016a4283f51d247d47119089ad6fb7c281`
- Secret policy: environment values were provided only to the launched process; this evidence contains variable names and health results only.

## Probe result

```text
t=1s agent=DOWN go_health=DOWN go_ready=DOWN ready_code=000000
t=2s agent=DOWN go_health=DOWN go_ready=DOWN ready_code=000000
t=3s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=4s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=5s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=6s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=7s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=8s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=9s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=10s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=11s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=12s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=13s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=14s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=15s agent=DOWN go_health=UP go_ready=READY ready_code=200
t=16s agent=UP go_health=UP go_ready=READY ready_code=200

APP_PID=90870

WRAPPER_STDERR_START
WRAPPER_STDERR_END

AGENT_HEALTH
{"status":"ok","agent":"paladin-agent","models":["deepseek-v4-pro","deepseek-v4-flash","lm-studio-local"]}

GO_HEALTHZ
{"status":"ok"}

GO_READYZ
{"ok":true,"status":{"postgres":"up","redis":"up"}}
```

No secret values are included in this evidence.

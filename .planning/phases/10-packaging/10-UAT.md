# Phase 10 macOS Installed-App UAT

**Status:** Command verified complete; pending human confirmation
**Release-ready:** No
**Updated:** 2026-07-12

This file is the human-readable companion to `10-UAT.json`. The JSON file is append-only for scenario attempts; this Markdown file summarizes the latest state without replacing the structured record.

## Artifact and install path

| Field | Value |
|---|---|
| Commit | `2d5dcf768503b61f9f8bf331ed70d568d11699e7` |
| DMG | `paladin_0.1.0_aarch64.dmg` |
| SHA-256 | `9ddfb59f75c824ce1a358e3a11f808016a4283f51d247d47119089ad6fb7c281` |
| Install path | `/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app` |
| Source evidence | `evidence/macos-build.json` |

The app was copied from the verified DMG into a non-repository UAT install path. This is an artifact checkpoint and installed-app setup step; it is not yet the four-scenario UAT pass.

## Supported launch path

Use the same wrapper for first-run documentation and UAT:

```bash
scripts/launch-paladin-macos.sh --app "/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app"
```

Configuration values must be provided through the current process environment. For the current DeepSeek-backed Agent and Go Server, the required names are `DEEPSEEK_API_KEY`, `PALADIN_DATABASE_URL`, and `PALADIN_REDIS_URL`. Do not pass API keys, database URLs, Redis URLs, tokens, or passwords as CLI arguments. The wrapper may report missing variable names, but it must not print their values.

## Required macOS scenarios

| Scenario | Expected result | Latest status |
|---|---|---|
| `all_available` | Agent ready; Go ready; workspace usable | Command verified PASS on `2d5dcf7`; human confirmation pending |
| `postgres_missing` | Agent ready; Go degraded/non-blocking; workspace usable | Command verified PASS on `2d5dcf7`; human confirmation pending |
| `redis_missing` | Agent ready; Go degraded/non-blocking; workspace usable | Command verified PASS on `2d5dcf7`; human confirmation pending |
| `both_missing` | Agent ready; Go degraded/non-blocking; workspace usable | Command verified PASS on `2d5dcf7`; human confirmation pending |

## Windows status

Windows x86_64 native MSI buildability has been verified by CI, but installed-app UAT is deferred. Windows remains `release_ready: false`.

## Evidence policy

- Store screenshots or short redacted log excerpts in `evidence/`.
- JSON attempts must reference evidence paths relative to this phase directory.
- Do not commit installer binaries, secret values, full DSNs, tokens, passwords, or raw environment dumps.

## Latest command verification

- Commit: `2d5dcf768503b61f9f8bf331ed70d568d11699e7`
- DMG SHA-256: `9ddfb59f75c824ce1a358e3a11f808016a4283f51d247d47119089ad6fb7c281`
- Installed app: `/Users/kdocs/Applications/Paladin-UAT-10-06-2d5dcf7/Paladin.app`
- Evidence files:
  - `evidence/macos-uat-all-available-command-verified-2d5dcf7.md`
  - `evidence/macos-uat-postgres-missing-command-verified-2d5dcf7.md`
  - `evidence/macos-uat-redis-missing-command-verified-2d5dcf7.md`
  - `evidence/macos-uat-both-missing-command-verified-2d5dcf7.md`

Release-ready remains **No** until the human checkpoint confirms the installed-app observations and evidence.

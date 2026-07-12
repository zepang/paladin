# Phase 10 macOS Installed-App UAT

**Status:** Pending four-scenario installed-app verification  
**Release-ready:** No  
**Updated:** 2026-07-12

This file is the human-readable companion to `10-UAT.json`. The JSON file is append-only for scenario attempts; this Markdown file summarizes the latest state without replacing the structured record.

## Artifact and install path

| Field | Value |
|---|---|
| Commit | `e90106eda048a0b1cb1a5a232c93109f18726683` |
| DMG | `paladin_0.1.0_aarch64.dmg` |
| SHA-256 | `efba7fc1b27dbb946a6d45f3bb1e5c780336128da3edf348f855151e27c9ef60` |
| Install path | `/Users/kdocs/Applications/Paladin-UAT-10-06/Paladin.app` |
| Source evidence | `evidence/macos-build.json` |

The app was copied from the verified DMG into a non-repository UAT install path. This is an artifact checkpoint and installed-app setup step; it is not yet the four-scenario UAT pass.

## Supported launch path

Use the same wrapper for first-run documentation and UAT:

```bash
scripts/launch-paladin-macos.sh --app "/Users/kdocs/Applications/Paladin-UAT-10-06/Paladin.app"
```

Configuration values must be provided through the current process environment. Do not pass API keys, database URLs, Redis URLs, tokens, or passwords as CLI arguments. The wrapper may report missing variable names, but it must not print their values.

## Required macOS scenarios

| Scenario | Expected result | Latest status |
|---|---|---|
| `all_available` | Agent ready; Go ready; workspace usable | Pending |
| `postgres_missing` | Agent ready; Go degraded/non-blocking; workspace usable | Pending |
| `redis_missing` | Agent ready; Go degraded/non-blocking; workspace usable | Pending |
| `both_missing` | Agent ready; Go degraded/non-blocking; workspace usable | Pending |

## Windows status

Windows x86_64 native MSI buildability has been verified by CI, but installed-app UAT is deferred. Windows remains `release_ready: false`.

## Evidence policy

- Store screenshots or short redacted log excerpts in `evidence/`.
- JSON attempts must reference evidence paths relative to this phase directory.
- Do not commit installer binaries, secret values, full DSNs, tokens, passwords, or raw environment dumps.

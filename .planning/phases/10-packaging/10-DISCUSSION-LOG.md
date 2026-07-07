# Phase 10: Packaging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md - this log preserves the alternatives considered.

**Date:** 2026-07-07
**Phase:** 10-packaging
**Areas discussed:** Sidecar bundle layout, Build chain, Packaged process config, Installed UAT, Packaged log rotation

---

## Sidecar Bundle Layout

| Option | Description | Selected |
|--------|-------------|----------|
| Tauri externalBin style | Use Tauri `externalBin` style or equivalent resource layout. Build `paladin-agent-sidecar` and `paladin-server-sidecar`; Rust packaged runtime resolves them from app resources/sidecar paths. | x |
| Plain resources | Copy sidecars as ordinary resources and maintain custom cross-platform path lookup. | |
| Agent decides | Leave exact layout to the planner. | |

**User's choice:** 1.1 - Tauri `externalBin` style or equivalent resource layout.
**Notes:** This matches prior Phase 07.4 direction: packaged builds use supervisor-owned bundled sidecars and no dev tools.

---

## Build Chain

| Option | Description | Selected |
|--------|-------------|----------|
| Single release command | One release script orchestrates PyInstaller, Go build, and Tauri build, exposed through an npm/pnpm command. | x |
| Distributed scripts | Each subproject owns its build command and documentation manually strings them together. | |
| Agent decides | Leave exact scripting shape to the planner. | |

**User's choice:** 2.1 - single release-oriented command.
**Notes:** The command should fail early if sidecar binaries are missing before installer packaging starts.

---

## Packaged Process Config

| Option | Description | Selected |
|--------|-------------|----------|
| Separate/generated packaged config | Preserve dev `processes.json`; add or generate packaged config for the bundle while keeping `cmd: string[]`. | x |
| Rust fallback only | Embed packaged config in Rust and use external `processes.json` only for dev. | |
| Agent decides | Leave config mechanics to the planner. | |

**User's choice:** 3.1 - keep dev config, add or generate packaged config.
**Notes:** The existing `cmd: string[]` schema remains locked by SPEC and prior phases.

---

## Installed UAT

| Option | Description | Selected |
|--------|-------------|----------|
| macOS and Windows installed UAT | Both platforms require real installed-app UAT; PG/Redis use Podman/local services as prerequisites; record ready and degraded paths. | x |
| macOS installed, Windows checklist | macOS is real installed UAT; Windows is initially a manual checklist. | |
| Agent decides | Leave UAT split to the planner. | |

**User's choice:** 4.1 - macOS and Windows both require installed-app UAT.
**Notes:** Any platform that lacks passing UAT must be marked not release-ready.

---

## Packaged Log Rotation

| Option | Description | Selected |
|--------|-------------|----------|
| Rotate in supervisor capture path | Implement 10 MB x 5 retention around Rust `capture_lines`, preserving UI event emission. | x |
| Logging/appender crate | Introduce a logging/appender crate for rotation and keep supervisor focused on events. | |
| Agent decides | Leave logging implementation to the planner. | |

**User's choice:** 5.1 - rotate in the Rust supervisor capture path.
**Notes:** Rotation must happen after redaction, preserve complete lines, and keep `process-log` emission uninterrupted.

## Agent Discretion

- Exact script filenames, release output directories, and generated-config mechanics are left to the planner.
- The planner may choose checked-in packaged config, generated packaged config, or copied release config if installed-app runtime and validation requirements are met.

## Deferred Ideas

None.

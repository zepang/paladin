# Phase 10: Packaging - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-07-11
**Phase:** 10-packaging
**Areas discussed:** macOS launch environment, packaged `.env` boundary, Windows build proof, UAT evidence format

---

## macOS Launch Environment

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Injection entry | Supported wrapper; docs-only terminal launch; `launchctl setenv` | Supported wrapper |
| Audience | User + UAT; UAT-only; user-only | User + UAT |
| Missing variables | Report names and continue; abort; no precheck | Report names and continue |
| App lookup | `/Applications` default + `--app`; fixed path; auto-search | Default + explicit override |
| Sidecar environment | Business allowlist; full inheritance; separate per-service lists | Business allowlist |
| Empty values | Missing; present; per-variable rules | Missing |
| System variables | Explicit minimal baseline; business-only; denylist | Explicit minimal baseline |
| Secret CLI args | Prohibited; all allowed; some allowed | Prohibited |

**User's choice:** Selected the recommended strict, non-persisting path for all eight decisions.
**Notes:** `--app <path>` remains allowed because it is a non-secret location argument. Application diagnostics remain the final truth source.

---

## Packaged `.env` Boundary

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| `.env` behavior | Disable only in packaged; disable everywhere; fixed packaged `.env` | Disable only in packaged |
| Mode signal | Supervisor marker; executable name; cwd/resource inference | Supervisor marker |
| Marker precedence | Supervisor override; parent override; conflict failure | Supervisor override |
| `.env` in release inputs | Fail build; silently exclude; warning | Fail build |

**User's choice:** Preserve dev convenience but make packaged environment-only and fail closed.
**Notes:** `PALADIN_RUNTIME_MODE=packaged` is internal supervisor truth, not user configuration.

---

## Windows Build Proof

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Build host | GitHub Actions Windows runner; script-only; macOS cross-build | Windows runner |
| Trigger | Manual + packaging PR paths; manual-only; every change | Manual + packaging PR paths |
| Evidence | MSI + manifest; MSI-only; full build directory | MSI + manifest |
| Architecture | x64 only; x64 + ARM64; parameterized | x64 only |

**User's choice:** Native Windows x64 CI build with auditable artifact metadata.
**Notes:** Build success is not installed-app UAT and does not make Windows release-ready.

---

## UAT Evidence Format

| Decision | Alternatives considered | Selected |
|----------|-------------------------|----------|
| Primary record | Markdown + JSON; Markdown-only; JSON-only | Markdown + JSON |
| Evidence storage | Phase-local redacted evidence; external links; full raw logs | Phase-local redacted evidence |
| Required metadata | Full reproducible fields; PASS/FAIL only; free-form | Full reproducible fields |
| Retest history | Immutable attempts + current verdict; overwrite; separate documents | Immutable attempts + current verdict |

**User's choice:** Human-readable and machine-checkable evidence with durable, redacted local references.
**Notes:** Installer binaries stay outside Git. Release-ready derives from the latest complete required matrix.

---

## the agent's Discretion

- Exact script/file names, allowlist contents derived from actual consumers, JSON schema naming, evidence filenames, and CI retention period.
- Exact packaged config copy/generation mechanics and focused negative-test implementation within locked constraints.

## Deferred Ideas

- Real Windows installed-app UAT, pending access to Windows hardware or VM.
- Windows ARM64 packaging.

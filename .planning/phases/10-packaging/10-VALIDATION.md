---
phase: 10
slug: packaging
status: ready
nyquist_compliant: true
wave_0_complete: true
created: 2026-07-07
updated: 2026-07-11
---

# Phase 10 — Validation Strategy

本合同映射当前 `10-01`～`10-09` 计划。`nyquist_compliant` 表示每个任务已有可执行自动化门或明确的人工 checkpoint，不表示尚未执行的任务已经通过。

## 发布门定义

- 唯一 installed-app 阻塞门：macOS 已安装应用四场景矩阵（依赖全可用、仅 PostgreSQL 缺失、仅 Redis 缺失、两者均缺失）。
- Windows：`windows-latest` 原生 x64 MSI workflow 只证明 `buildability-only`；installed-app UAT deferred，始终 `non-release-ready`，不阻塞 Phase 10。
- Linux 与 Windows ARM64 均非本阶段阻塞目标。

## 反馈延迟层级

| 层级 | 目标延迟 | 用途 |
|---|---:|---|
| Quick | `< 60s` | Node/shell unit、单个 Rust/RTL/pytest/Go focused test |
| Focused | `< 10min` | sidecar staging smoke、Rust process group、desktop focused UI、sentinel aggregate scan |
| Full | closure only | desktop full Vitest、full cargo test+clippy、Agent pytest、Go tests |
| External/manual | 不计入 quick latency | Windows CI wait、DMG build、真实安装与 macOS UAT |

规则：每个 task commit 运行其行内 gate；每 wave 运行相关 focused 集；10-07 先 focused fail-fast，再运行 full closure。

## 当前 Task Verification Map

| Task ID | Wave | Requirement | Automated gate / evidence | Latency | Status |
|---|---:|---|---|---|---|
| 10-01/T0 | 1 | PKG-01~03 | Validation current-ID/legacy-text fail-closed contract check | Quick | pending |
| 10-01/T1 | 1 | PKG-01/02 | `node --test apps/desktop/scripts/release.test.mjs` | Quick | pending |
| 10-01/T2 | 1 | PKG-01/02 | `pnpm release -- --sidecars-only --target current --verify` | Focused | pending |
| 10-04/T1 | 1 | PKG-03 | `cargo test process::log_rotate --lib` | Quick | pending |
| 10-04/T2 | 1 | PKG-03 | `cargo test process:: --lib log -- --nocapture` | Focused | pending |
| 10-02/T1 | 2 | PKG-01/02 | `cargo test process::config --lib` | Quick | pending |
| 10-02/T2 | 2 | PKG-01/02 | `cargo test process:: --lib && cargo check` | Focused | pending |
| 10-03/T1 | 3 | PKG-01/02 | owner test binary must report the named 4 lifecycle cases and nonzero test count | Quick | pending |
| 10-03/T2 | 3 | PKG-01/02 | Agent CLI pytest + Go cmd/config tests | Focused | pending |
| 10-05/T1 | 4 | PKG-02/03 | build-manifest Node tests | Quick | pending |
| 10-05/T2 | 4 | PKG-02/03 | workflow/docs/README entry assertions | Quick | pending |
| 10-05/T3 | 4 | PKG-02 | successful native Windows run + exact MSI/manifest hash evidence | External workflow checkpoint | pending |
| 10-08/T1 | 4 | PKG-01/03 | StartupMask RTL packaged-copy and Go-nonblocking tests | Quick | pending |
| 10-08/T2 | 4 | PKG-01/03 | ProcessLight RTL degraded-copy/owner-action tests | Quick | pending |
| 10-09/T1 | 5 | PKG-01/03 | secret-sentinel fail-closed unit tests | Quick | pending |
| 10-09/T2 | 5 | PKG-01/03 | staging smoke + `secret-sentinel --require-all` | Focused | pending |
| 10-09/T3 | 5 | PKG-01 | nonempty DMG + SHA-256 + final sentinel scan | External blocking checkpoint | pending |
| 10-06/T1 | 6 | PKG-01/03 | macOS wrapper shell tests | Quick | pending |
| 10-06/T2 | 6 | PKG-01/02/03 | DMG evidence/hash/UAT schema quick check | Quick | pending |
| 10-06/T3 | 6 | PKG-01/03 | four latest macOS scenario records complete + human installed-app confirmation | Manual blocking checkpoint | pending |
| 10-07/T1 | 7 | PKG-01~03 | focused fail-fast then full suites; record elapsed time | Full closure | pending |
| 10-07/T2 | 7 | PKG-01~03 | Goal/PKG/D-01..D-25/R1..R7/Prohibition 1..4 coverage gate | Quick | pending |

## Edge Coverage Gates

| Edge | Gate |
|---|---|
| R1 fresh installed macOS, no dev dependency | 10-09/T3 artifact identity + 10-06/T3 installed UAT |
| R2 build/UAT/release-ready separation | 10-05/T3 Windows evidence + 10-07/T2 release-honesty audit |
| R3 target-triple and `.exe` resolution | 10-01/T1 + 10-02/T1 |
| R4 startup environment snapshot/no hot reload | 10-03/T1/T2 + 10-06/T1 |
| R5 PG/Redis degraded combinations non-blocking | 10-08/T1/T2 + 10-06/T3 four-scenario matrix |
| R6 10 MB × 5 complete-line rotation/UI continuity | 10-04/T1/T2 + 10-09 sentinel scan |
| R7 per-platform build/UAT/release-ready status | 10-05/T2/T3 + 10-06/T2 + 10-07/T2 |

## Prohibition Gates

| Prohibition | Fail-closed gate |
|---|---|
| Prohibition 1: no false release-ready | Windows evidence schema forces `buildability-only`/`release_ready:false`; macOS derives status only from complete matrix |
| Prohibition 2: no secret values in bundle/log/UI/docs/evidence | 10-09 injects four unique sentinels; any hit or missing/empty/unreadable target fails |
| Prohibition 3: no packaged developer-command/source-path guidance | 10-08 rendered UI negatives + 10-05 docs assertions + 10-09 recursive copy scan |
| Prohibition 4: no external process termination | 10-03/T1 executes three external lifecycle negative cases plus supervisor-owned positive case; zero tests fails |

## Manual / External Evidence

- Windows evidence: `.planning/phases/10-packaging/evidence/windows-build.json` records workflow run URL/id, commit, artifact identity, MSI/manifest hashes. It never proves installed UAT.
- macOS artifact evidence: `.planning/phases/10-packaging/evidence/macos-build.json` records staging smoke, final scan, DMG identity/hash.
- macOS installed evidence: `10-UAT.json` append-only attempts plus redacted `evidence/`; all four scenarios must pass and receive human confirmation.

## Sign-Off Contract

- [x] Every current task ID has an automated gate or explicit checkpoint.
- [x] Seven edges and four bespoke prohibitions map to fail-closed gates.
- [x] No watch-mode command.
- [x] Quick/focused/full/external latency is explicit.
- [x] macOS four-scenario installed UAT is the only installed-app blocking gate.
- [x] Windows native build evidence is buildability-only; installed UAT remains deferred and non-release-ready.

**Approval:** contract complete; execution pending

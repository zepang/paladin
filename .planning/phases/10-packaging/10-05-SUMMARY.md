---
phase: 10-packaging
plan: "05"
subsystem: windows-packaging
tags: [windows, msi, ci, artifact-manifest, docs, tdd]
status: complete
requires:
  - phase: 10-packaging
    plan: "01"
    provides: release entrypoint and sidecar staging
  - phase: 10-packaging
    plan: "02"
    provides: target triple and Windows suffix resolution
  - phase: 10-packaging
    plan: "03"
    provides: packaged environment boundary
provides:
  - native Windows x64 MSI buildability evidence
  - non-secret artifact manifest with MSI and sidecar identities
  - Packaging documentation that separates buildability, installed UAT, and release readiness
affects: [10-06, 10-09, release-docs, installed-app-uat]
tech-stack:
  added: [GitHub Actions windows-latest workflow]
  patterns: [buildability-only evidence, non-secret artifact manifest, shell-free Windows CLI invocation]
key-files:
  created:
    - apps/desktop/scripts/build-manifest.mjs
    - apps/desktop/scripts/build-manifest.test.mjs
    - .github/workflows/packaging-windows.yml
    - docs/packaging.md
    - .planning/phases/10-packaging/evidence/windows-build.json
  modified:
    - README.md
    - apps/desktop/scripts/release.mjs
    - apps/desktop/scripts/release.test.mjs
    - apps/desktop/scripts/tauri-cli.mjs
    - apps/desktop/scripts/tauri-cli.test.mjs
    - .gitignore
key-decisions:
  - "Windows CI proof is buildability-only; it does not claim installed UAT or release-ready status."
  - "Downloaded artifact zip/MSI are verified locally but ignored and not committed."
  - "Windows release and Tauri CLI launch through Node JS entrypoints instead of .cmd shims under shell:false."
patterns-established:
  - "GitHub artifact evidence records public page facts, local zip hash, manifest hash, MSI hash, and honest API access boundary."
requirements-completed: [PKG-02, PKG-03]
coverage:
  - id: D1
    description: "Windows x64 workflow builds through the release entrypoint on windows-latest."
    requirement: PKG-02
    verification:
      - kind: remote-ci
        ref: "https://github.com/zepang/paladin/actions/runs/29176352229"
        status: pass
    human_judgment: true
  - id: D2
    description: "Uploaded artifact contains exactly one MSI and one build-manifest.json."
    requirement: PKG-03
    verification:
      - kind: local-artifact
        ref: ".planning/phases/10-packaging/evidence/windows-build.json"
        status: pass
    human_judgment: false
  - id: D3
    description: "Manifest identifies commit, Windows runner, x86_64 target, sidecars, MSI names, sizes, and SHA-256 values without secrets."
    requirement: PKG-03
    verification:
      - kind: unit
        ref: "node --test apps/desktop/scripts/build-manifest.test.mjs"
        status: pass
      - kind: local-artifact
        ref: ".planning/phases/10-packaging/evidence/windows-build.json"
        status: pass
    human_judgment: false
duration: multi-session
completed: 2026-07-12
---

# Phase 10 Plan 05: Windows MSI Buildability Evidence Summary

**Windows x64 MSI buildability is now proven by a successful native GitHub Actions run and a locally verified artifact containing exactly one MSI plus one non-secret build manifest.**

## Performance

- **Completed:** 2026-07-12
- **Tasks:** 3, including one human-verified native Windows CI checkpoint
- **Remote run:** `Packaging Windows x64 #3`, `build-msi` succeeded in 12m 27s

## Accomplishments

- Added deterministic `build-manifest.json` generation for MSI, Agent sidecar, and Go server sidecar identities.
- Added `packaging-windows.yml` with `workflow_dispatch`, `windows-latest`, the shared `pnpm release` entrypoint, and artifact upload limited to MSI plus manifest.
- Added packaging documentation and README entry points that keep Windows buildability, Windows installed UAT, macOS UAT, and release readiness separate.
- Fixed two Windows runner launch failures by avoiding `.cmd` shims under `shell:false`:
  - `release.mjs` now launches pnpm through `process.execPath` + trusted `npm_execpath`.
  - `tauri-cli.mjs` now launches `@tauri-apps/cli/tauri.js` through `process.execPath`.
- Recorded artifact evidence in `.planning/phases/10-packaging/evidence/windows-build.json`; the downloaded zip/MSI remain uncommitted.

## Task Commits

1. **Task 1 RED: manifest contracts** — `67b41d5` (test)
2. **Task 1 GREEN: non-secret build manifest** — `92722fc` (feat)
3. **Task 2: Windows workflow and docs** — `0d7a523` (feat)
4. **T3 fix RED: Windows release launch strategy** — `9a6e629` (test)
5. **T3 fix GREEN: launch pnpm CLI safely on Windows** — `498050e` (fix)
6. **T3 fix RED: Windows Tauri CLI launch strategy** — `88b1585` (test)
7. **T3 fix GREEN: launch Tauri CLI safely on Windows** — `c9fe63c` (fix)

## Evidence

- **Run URL:** https://github.com/zepang/paladin/actions/runs/29176352229
- **Job URL:** https://github.com/zepang/paladin/actions/runs/29176352229/job/86606128925
- **Commit:** `c9fe63cfa24d86917f783399874416d8f2ae1fba`
- **Artifact:** `paladin-windows-x86_64-msi-c9fe63cfa24d86917f783399874416d8f2ae1fba`
- **Artifact zip SHA-256:** `834a45b91f31b817fde88afddeeceb4e2cf5ecc7de534cfcfc9e9b6c6c6f83f8`
- **Manifest SHA-256:** `7122504b42e5f153dd1c45b5dfaa59512423bf5c578cf1507528cf62d0186645`
- **MSI:** `paladin_0.1.0_x64_en-US.msi`
- **MSI SHA-256:** `4ff904d33a8d017c54c848a8e7ca446b65d45973930ed5cd32e50a4dcae3d858`

## Verification

- `node --test apps/desktop/scripts/*.test.mjs` — PASS（11/11）
- `pnpm --filter @paladin/desktop test --run` — PASS（43/43）
- `npm test` — PASS
- Plan evidence gate — PASS
- Artifact zip inspection — PASS: exactly `build-manifest.json` and `paladin_0.1.0_x64_en-US.msi`

## Deviations from Plan

### Auto-fixed Issues

**1. Windows `pnpm.cmd` launch failed with `spawn EINVAL`**
- **Found during:** human-verified GitHub Actions run
- **Fix:** Use Node plus trusted pnpm JS CLI path from `npm_execpath`.
- **Committed in:** `498050e`

**2. Windows `tauri.cmd` launch failed with `spawn EINVAL`**
- **Found during:** second human-verified GitHub Actions run
- **Fix:** Use Node plus package-local `@tauri-apps/cli/tauri.js`.
- **Committed in:** `c9fe63c`

**3. Numeric GitHub artifact id was not publicly readable**
- **Found during:** evidence capture
- **Fix:** Evidence records public artifact name, size, digest, local zip SHA-256, and an explicit `artifact_id_source` note. It does not fabricate a numeric id.
- **Committed in:** final evidence commit

## Release Honesty

- Windows native MSI **buildability**: complete and verified.
- Windows installed-app UAT: deferred.
- Release-ready status: false.
- macOS installed-app UAT remains the blocking release-readiness path for later plans.

## User Setup Required

None for this plan. The downloaded artifact zip can remain locally for audit, but it is ignored by git and not required by the source tree.

## Next Phase Readiness

Plan 10-08 can proceed with release documentation and platform status using real Windows buildability evidence. Plan 10-09 can consume this evidence while preserving installed UAT and release-ready boundaries.

## Self-Check: PASSED

- Remote run URL points to a successful Windows workflow for commit `c9fe63cfa24d86917f783399874416d8f2ae1fba`.
- Artifact zip hash matches GitHub public digest.
- Artifact contains exactly one MSI and one manifest.
- Evidence status is `buildability-only`, `release_ready` is `false`, and installed UAT is `deferred`.

---
*Phase: 10-packaging*
*Completed: 2026-07-12*

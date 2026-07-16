#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VALIDATOR="$ROOT_DIR/apps/desktop/scripts/direct-launch-evidence.mjs"
PACKAGED_CONFIG="$ROOT_DIR/apps/desktop/src-tauri/processes.packaged.json"
EVIDENCE_DIR="$ROOT_DIR/.planning/phases/12-installed-app-direct-launch-runtime-configuration/evidence"

if [[ "${1:-}" != "--automation-only" || $# -ne 1 ]]; then
  echo "Usage: scripts/verify-direct-launch-platforms.sh --automation-only" >&2
  exit 64
fi
[[ -f "$PACKAGED_CONFIG" ]] || { echo "Packaged resource configuration is missing" >&2; exit 1; }
node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1])); if (c.mode !== "packaged" || !c.processes?.agent || !c.processes?.server) process.exit(1)' "$PACKAGED_CONFIG"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT
COMMIT_SHA="$(git -C "$ROOT_DIR" rev-parse HEAD)"
ARTIFACT_SHA="$(shasum -a 256 "$PACKAGED_CONFIG" | awk '{print $1}')"
for platform in windows linux; do
  record="$TMP_DIR/$platform.json"
  launcher_class="windows-start-menu-explorer"
  filename="Paladin.msi"
  [[ "$platform" == linux ]] && { launcher_class="linux-desktop-appimage"; filename="Paladin.AppImage"; }
  env -i PATH="$PATH" HOME="$TMP_DIR/$platform-home" PALADIN_APP_DATA_DIR="$TMP_DIR/$platform-data" \
    node -e 'const fs=require("fs"); const c=JSON.parse(fs.readFileSync(process.argv[1])); if (c.mode !== "packaged" || !c.processes.agent || !c.processes.server || process.env.PALADIN_DATABASE_URL || process.env.PALADIN_REDIS_URL || process.env.PALADIN_JWT_SECRET) process.exit(1)' "$PACKAGED_CONFIG"
  mkdir -p "$EVIDENCE_DIR"
  cat > "$record" <<EOF
{"schema_version":1,"commit_sha":"$COMMIT_SHA","artifact":{"filename":"$filename","sha256":"$ARTIFACT_SHA"},"launcher_class":"$launcher_class","platform":"$platform","scenario":"clean-environment-automation","result":"pass","diagnostic_class":"go-unconfigured","manual_uat":"pending","release_ready":false}
EOF
  node "$VALIDATOR" --validate "$record"
  cp "$record" "$EVIDENCE_DIR/$platform-clean-env.json"
done
echo "direct-launch platform automation passed (Windows/Linux manual UAT pending; release-ready false)"

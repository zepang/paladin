#!/usr/bin/env bash
set -euo pipefail

APP_PATH="/Applications/Paladin.app"

usage() {
  cat >&2 <<'USAGE'
Usage: PALADIN_DIRECT_LAUNCH_UAT=1 scripts/launch-paladin-macos.sh [--app /path/to/Paladin.app]

Diagnostic/UAT wrapper only; Finder is the normal installed-app launcher.
Configuration values must be provided through the current environment.
Only the non-secret --app path argument is supported.
USAGE
}

print_rejected_config_arg() {
  local name="$1"
  {
    echo "Configuration values must be provided through the current environment, not CLI arguments."
    echo "Rejected argument: $name"
  } >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app)
      if [[ $# -lt 2 || -z "${2:-}" ]]; then
        echo "--app requires a path" >&2
        usage
        exit 64
      fi
      APP_PATH="$2"
      shift 2
      ;;
    --DEEPSEEK_API_KEY|--OPENAI_API_KEY|--LM_STUDIO_API_KEY|--PALADIN_AI_API_KEY|--PALADIN_DATABASE_URL|--PALADIN_REDIS_URL|--PALADIN_PORT|--PALADIN_JWT_SECRET|--PALADIN_ADMIN_PASSWORD)
      print_rejected_config_arg "$1"
      exit 64
      ;;
    --*=*)
      case "$1" in
        --DEEPSEEK_API_KEY=*|--OPENAI_API_KEY=*|--LM_STUDIO_API_KEY=*|--PALADIN_AI_API_KEY=*|--PALADIN_DATABASE_URL=*|--PALADIN_REDIS_URL=*|--PALADIN_PORT=*|--PALADIN_JWT_SECRET=*|--PALADIN_ADMIN_PASSWORD=*)
          print_rejected_config_arg "${1%%=*}"
          exit 64
          ;;
        *)
          echo "Unsupported argument: ${1%%=*}" >&2
          usage
          exit 64
          ;;
      esac
      ;;
    --*)
      echo "Unsupported argument: $1" >&2
      usage
      exit 64
      ;;
    *)
      echo "Unsupported positional argument. Use --app for the application path." >&2
      usage
      exit 64
      ;;
  esac
done

if [[ "${PALADIN_DIRECT_LAUNCH_UAT:-}" != "1" ]]; then
  echo "This wrapper is diagnostic/UAT-only. Set PALADIN_DIRECT_LAUNCH_UAT=1 for an explicit session override." >&2
  exit 64
fi

echo "Launcher class: wrapper-diagnostic-uat (not Finder primary evidence)" >&2

missing=()
for name in PALADIN_DATABASE_URL PALADIN_REDIS_URL; do
  if [[ -z "${!name:-}" ]]; then
    missing+=("$name")
  fi
done

if [[ ${#missing[@]} -gt 0 ]]; then
  {
    echo "Missing recommended environment variables:"
    for name in "${missing[@]}"; do
      echo "- $name"
    done
    echo "Paladin will still launch so packaged diagnostics can report the final app state."
  } >&2
fi

EXECUTABLE="$APP_PATH/Contents/MacOS/Paladin"
if [[ ! -x "$EXECUTABLE" ]]; then
  echo "Paladin executable not found or not executable: $EXECUTABLE" >&2
  exit 66
fi

exec env -u DEEPSEEK_API_KEY -u OPENAI_API_KEY -u LM_STUDIO_API_KEY "$EXECUTABLE"

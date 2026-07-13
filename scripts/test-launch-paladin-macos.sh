#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRAPPER="$ROOT_DIR/scripts/launch-paladin-macos.sh"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

assert_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" != *"$needle"* ]]; then
    echo "Expected output to contain: $needle" >&2
    echo "Actual output:" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

assert_not_contains() {
  local haystack="$1"
  local needle="$2"
  if [[ "$haystack" == *"$needle"* ]]; then
    echo "Expected output not to contain: $needle" >&2
    echo "Actual output:" >&2
    echo "$haystack" >&2
    exit 1
  fi
}

make_fake_app() {
  local app_path="$1"
  local executable_name="${2:-Paladin}"
  mkdir -p "$app_path/Contents/MacOS"
  cat > "$app_path/Contents/MacOS/$executable_name" <<'APP'
#!/usr/bin/env bash
echo "PALADIN_FAKE_APP_EXECUTED"
echo "PALADIN_FAKE_APP_ARGC=$#"
echo "PALADIN_FAKE_APP_DEEPSEEK_API_KEY=${DEEPSEEK_API_KEY:-}"
echo "PALADIN_FAKE_APP_PALADIN_AI_API_KEY=${PALADIN_AI_API_KEY:-}"
APP
  chmod +x "$app_path/Contents/MacOS/$executable_name"
}

APP="$TMP_DIR/Paladin.app"
make_fake_app "$APP"

output="$(DEEPSEEK_API_KEY='sk-test-secret' PALADIN_DATABASE_URL='postgres://secret' PALADIN_REDIS_URL='redis://secret' "$WRAPPER" --app "$APP" 2>&1)"
assert_contains "$output" "PALADIN_FAKE_APP_EXECUTED"
assert_contains "$output" "PALADIN_FAKE_APP_ARGC=0"
assert_contains "$output" "PALADIN_FAKE_APP_DEEPSEEK_API_KEY=sk-test-secret"

provider_output="$(PALADIN_AI_PROVIDER='openai-compatible' PALADIN_AI_API_KEY='paladin-ai-secret' PALADIN_DATABASE_URL='postgres://secret' PALADIN_REDIS_URL='redis://secret' "$WRAPPER" --app "$APP" 2>&1)"
assert_contains "$provider_output" "PALADIN_FAKE_APP_EXECUTED"
assert_contains "$provider_output" "PALADIN_FAKE_APP_PALADIN_AI_API_KEY=paladin-ai-secret"

LOWER_APP="$TMP_DIR/PaladinLower.app"
make_fake_app "$LOWER_APP" "paladin"
lower_output="$(DEEPSEEK_API_KEY='sk-test-secret' PALADIN_DATABASE_URL='postgres://secret' PALADIN_REDIS_URL='redis://secret' "$WRAPPER" --app "$LOWER_APP" 2>&1)"
assert_contains "$lower_output" "PALADIN_FAKE_APP_EXECUTED"

missing_output="$(env -u DEEPSEEK_API_KEY -u PALADIN_AI_API_KEY -u PALADIN_DATABASE_URL -u PALADIN_REDIS_URL "$WRAPPER" --app "$APP" 2>&1)"
assert_contains "$missing_output" "Missing recommended environment variables:"
assert_not_contains "$missing_output" "- DEEPSEEK_API_KEY"
assert_not_contains "$missing_output" "- PALADIN_AI_API_KEY"
assert_contains "$missing_output" "PALADIN_DATABASE_URL"
assert_contains "$missing_output" "PALADIN_REDIS_URL"
assert_contains "$missing_output" "PALADIN_FAKE_APP_EXECUTED"
assert_not_contains "$missing_output" "postgres://secret"
assert_not_contains "$missing_output" "redis://secret"
assert_not_contains "$missing_output" "sk-test-secret"

empty_output="$(DEEPSEEK_API_KEY='' PALADIN_DATABASE_URL='' PALADIN_REDIS_URL='' "$WRAPPER" --app "$APP" 2>&1)"
assert_not_contains "$empty_output" "- DEEPSEEK_API_KEY"
assert_contains "$empty_output" "PALADIN_DATABASE_URL"
assert_contains "$empty_output" "PALADIN_REDIS_URL"

if "$WRAPPER" --app "$TMP_DIR/Missing.app" >/tmp/paladin-missing-app.out 2>&1; then
  echo "Expected missing app to fail" >&2
  exit 1
fi
assert_contains "$(cat /tmp/paladin-missing-app.out)" "Paladin executable not found or not executable"
assert_contains "$(cat /tmp/paladin-missing-app.out)" "$TMP_DIR/Missing.app/Contents/MacOS/Paladin"

if "$WRAPPER" --DEEPSEEK_API_KEY sk-test-secret --app "$APP" >/tmp/paladin-secret-arg.out 2>&1; then
  echo "Expected secret CLI argument to fail" >&2
  exit 1
fi
secret_arg_output="$(cat /tmp/paladin-secret-arg.out)"
assert_contains "$secret_arg_output" "Configuration values must be provided through the current environment"
assert_contains "$secret_arg_output" "--DEEPSEEK_API_KEY"
assert_not_contains "$secret_arg_output" "sk-test-secret"

if "$WRAPPER" --PALADIN_AI_API_KEY paladin-ai-secret --app "$APP" >/tmp/paladin-ai-secret-arg.out 2>&1; then
  echo "Expected PALADIN_AI_API_KEY CLI argument to fail" >&2
  exit 1
fi
paladin_ai_secret_arg_output="$(cat /tmp/paladin-ai-secret-arg.out)"
assert_contains "$paladin_ai_secret_arg_output" "Configuration values must be provided through the current environment"
assert_contains "$paladin_ai_secret_arg_output" "--PALADIN_AI_API_KEY"
assert_not_contains "$paladin_ai_secret_arg_output" "paladin-ai-secret"

if "$WRAPPER" --PALADIN_AI_API_KEY=paladin-ai-secret --app "$APP" >/tmp/paladin-ai-secret-equals-arg.out 2>&1; then
  echo "Expected PALADIN_AI_API_KEY= CLI argument to fail" >&2
  exit 1
fi
paladin_ai_secret_equals_output="$(cat /tmp/paladin-ai-secret-equals-arg.out)"
assert_contains "$paladin_ai_secret_equals_output" "Configuration values must be provided through the current environment"
assert_contains "$paladin_ai_secret_equals_output" "--PALADIN_AI_API_KEY"
assert_not_contains "$paladin_ai_secret_equals_output" "paladin-ai-secret"

if "$WRAPPER" --app >/tmp/paladin-missing-app-arg.out 2>&1; then
  echo "Expected --app without a path to fail" >&2
  exit 1
fi
assert_contains "$(cat /tmp/paladin-missing-app-arg.out)" "--app requires a path"

echo "launch-paladin-macos wrapper tests passed"

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
  mkdir -p "$app_path/Contents/MacOS"
  cat > "$app_path/Contents/MacOS/Paladin" <<'APP'
#!/usr/bin/env bash
echo "PALADIN_FAKE_APP_EXECUTED"
echo "PALADIN_FAKE_APP_ARGC=$#"
echo "PALADIN_FAKE_APP_OPENAI_API_KEY=${OPENAI_API_KEY:-}"
APP
  chmod +x "$app_path/Contents/MacOS/Paladin"
}

APP="$TMP_DIR/Paladin.app"
make_fake_app "$APP"

output="$(OPENAI_API_KEY='sk-test-secret' DATABASE_URL='postgres://secret' REDIS_URL='redis://secret' "$WRAPPER" --app "$APP" 2>&1)"
assert_contains "$output" "PALADIN_FAKE_APP_EXECUTED"
assert_contains "$output" "PALADIN_FAKE_APP_ARGC=0"
assert_contains "$output" "PALADIN_FAKE_APP_OPENAI_API_KEY=sk-test-secret"

missing_output="$(env -u OPENAI_API_KEY -u DATABASE_URL -u REDIS_URL "$WRAPPER" --app "$APP" 2>&1)"
assert_contains "$missing_output" "Missing recommended environment variables:"
assert_contains "$missing_output" "OPENAI_API_KEY"
assert_contains "$missing_output" "DATABASE_URL"
assert_contains "$missing_output" "REDIS_URL"
assert_contains "$missing_output" "PALADIN_FAKE_APP_EXECUTED"
assert_not_contains "$missing_output" "postgres://secret"
assert_not_contains "$missing_output" "redis://secret"
assert_not_contains "$missing_output" "sk-test-secret"

empty_output="$(OPENAI_API_KEY='' DATABASE_URL='' REDIS_URL='' "$WRAPPER" --app "$APP" 2>&1)"
assert_contains "$empty_output" "OPENAI_API_KEY"
assert_contains "$empty_output" "DATABASE_URL"
assert_contains "$empty_output" "REDIS_URL"

if "$WRAPPER" --app "$TMP_DIR/Missing.app" >/tmp/paladin-missing-app.out 2>&1; then
  echo "Expected missing app to fail" >&2
  exit 1
fi
assert_contains "$(cat /tmp/paladin-missing-app.out)" "Paladin executable not found or not executable"
assert_contains "$(cat /tmp/paladin-missing-app.out)" "$TMP_DIR/Missing.app/Contents/MacOS/Paladin"

if "$WRAPPER" --OPENAI_API_KEY sk-test-secret --app "$APP" >/tmp/paladin-secret-arg.out 2>&1; then
  echo "Expected secret CLI argument to fail" >&2
  exit 1
fi
secret_arg_output="$(cat /tmp/paladin-secret-arg.out)"
assert_contains "$secret_arg_output" "Configuration values must be provided through the current environment"
assert_contains "$secret_arg_output" "--OPENAI_API_KEY"
assert_not_contains "$secret_arg_output" "sk-test-secret"

if "$WRAPPER" --app >/tmp/paladin-missing-app-arg.out 2>&1; then
  echo "Expected --app without a path to fail" >&2
  exit 1
fi
assert_contains "$(cat /tmp/paladin-missing-app-arg.out)" "--app requires a path"

echo "launch-paladin-macos wrapper tests passed"

#!/usr/bin/env bash
# Verifies the SDK: type-check, unit tests and the publishable build.
#
#   scripts/verify.sh          tsc + jest + build (no installs beyond the root)
#   scripts/verify.sh --e2e    also runs the example app in Expo Go on an iOS
#                              simulator. Needs WONDERCHAT_CHATBOT_ID and at
#                              least 5 GB free; it is the only step that
#                              installs example/node_modules.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

E2E=0
for arg in "$@"; do
  case "$arg" in
    --e2e) E2E=1 ;;
    -h|--help) sed -n '2,9p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

step() { printf '\n==> %s\n' "$1"; }

if [ ! -d node_modules ]; then
  step "Installing dev dependencies"
  npm install --no-audit --no-fund
fi

step "Type-check (src + tests)"
npx tsc -p tsconfig.test.json

step "Unit tests"
npx jest --ci

step "Build"
rm -rf lib
npm run build --silent
for file in lib/index.js lib/index.d.ts; do
  [ -f "$file" ] || { echo "build did not produce $file" >&2; exit 1; }
done
# The published entry must load without a bundler, and nothing may import
# from tests or the example.
if grep -rqE "from \"\.\./(test|example)" lib; then
  echo "lib references test or example code" >&2
  exit 1
fi
npm pack --dry-run --json 2>/dev/null | node -e '
  const files = JSON.parse(require("fs").readFileSync(0, "utf8"))[0].files.map((f) => f.path);
  for (const needed of ["lib/index.js", "lib/index.d.ts", "src/index.tsx", "README.md", "LICENSE"]) {
    if (!files.includes(needed)) { console.error(`package is missing ${needed}`); process.exit(1); }
  }
  const stray = files.filter((f) => /^(test|example|scripts)\//.test(f));
  if (stray.length) { console.error(`package includes ${stray.join(", ")}`); process.exit(1); }
  console.log(`package contents ok (${files.length} files)`);
'

if [ "$E2E" -eq 0 ]; then
  printf '\nAll checks passed. (Simulator E2E skipped; run with --e2e.)\n'
  exit 0
fi

step "E2E: preflight"
: "${WONDERCHAT_CHATBOT_ID:?set WONDERCHAT_CHATBOT_ID to an agent with a mobile app set up}"
# Installing example deps and Expo Go takes most of the space; a re-run needs little.
if [ -d example/node_modules ]; then MIN_FREE_GB=1; else MIN_FREE_GB=5; fi
FREE_KB=$(df -k "$ROOT" | awk 'NR==2 {print $4}')
if [ "$FREE_KB" -lt $((MIN_FREE_GB * 1024 * 1024)) ]; then
  echo "only $((FREE_KB / 1024)) MB free; the E2E needs ${MIN_FREE_GB} GB (example deps + Expo Go). Free space and retry." >&2
  exit 1
fi
command -v xcrun >/dev/null || { echo "Xcode command line tools are required" >&2; exit 1; }
SIMULATOR="${WONDERCHAT_SIMULATOR:-iPhone 17 Pro}"

step "E2E: installing example dependencies"
(cd example && npm install --no-audit --no-fund && npx expo install react-native-safe-area-context expo-asset)

step "E2E: booting $SIMULATOR"
xcrun simctl boot "$SIMULATOR" 2>/dev/null || true
open -a Simulator

METRO_PORT="${METRO_PORT:-8081}"
LOG="$(mktemp -t wonderchat-e2e)"
step "E2E: starting the example in Expo Go (log: $LOG)"
(
  cd example
  EXPO_PUBLIC_SETUP_CHECK=1 \
  EXPO_PUBLIC_WONDERCHAT_CHATBOT_ID="$WONDERCHAT_CHATBOT_ID" \
  EXPO_PUBLIC_WONDERCHAT_BASE_URL="${WONDERCHAT_BASE_URL:-}" \
  CI=1 npx expo start --clear --port "$METRO_PORT"
) >"$LOG" 2>&1 &
EXPO_PID=$!
# Killing the subshell alone leaves Metro holding the port for the next run.
trap 'pkill -f "expo start --clear --port $METRO_PORT" 2>/dev/null; kill "$EXPO_PID" 2>/dev/null || true' EXIT

# `expo start --ios` opens the project URL straight after installing Expo Go,
# which a fresh simulator rejects (LSApplicationWorkspace error 115) until Expo
# Go has launched once. So Metro starts without --ios; Expo Go is installed
# through expo only when missing, launched once, then given the URL with retries.
for _ in $(seq 1 60); do
  curl -s -o /dev/null "http://127.0.0.1:$METRO_PORT/status" && break
  sleep 2
done
if ! xcrun simctl listapps booted 2>/dev/null | grep -q "host.exp.Exponent"; then
  (cd example && CI=1 npx expo start --ios --port $((METRO_PORT + 1)) >/dev/null 2>&1 &
    sleep 90; pkill -f "expo start --ios --port $((METRO_PORT + 1))") || true
fi
# Fresh Expo Go each run; the query flags skip its onboarding sheet and
# floating dev button, which would otherwise cover the app (as expo start does).
xcrun simctl terminate booted host.exp.Exponent >/dev/null 2>&1 || true
xcrun simctl launch booted host.exp.Exponent >/dev/null 2>&1 || true
sleep 5
EXPO_URL="exp://127.0.0.1:$METRO_PORT?__expo_disable_fab=1&__expo_disable_auto_launch=1&__expo_disable_onboarding=1"
for _ in $(seq 1 10); do
  xcrun simctl openurl booted "$EXPO_URL" 2>/dev/null && break
  sleep 3
done

for _ in $(seq 1 180); do
  if grep -q "WONDERCHAT_SETUP_CHECK chat-open" "$LOG"; then break; fi
  if ! kill -0 "$EXPO_PID" 2>/dev/null; then
    echo "expo exited early:" >&2; tail -40 "$LOG" >&2; exit 1
  fi
  sleep 2
done
if ! grep -q "WONDERCHAT_SETUP_CHECK chat-open" "$LOG"; then
  echo "the chat never opened within 6 minutes:" >&2; tail -40 "$LOG" >&2; exit 1
fi
grep -E "ERROR|Wonderchat:" "$LOG" && { echo "the app logged errors (above)" >&2; exit 1; }

# Give the page time to load and send the setup-check message.
sleep 15
SHOT="$ROOT/e2e-ios.png"
xcrun simctl io booted screenshot "$SHOT" >/dev/null
printf '\nE2E passed: the chat opened in Expo Go. Screenshot: %s\n' "$SHOT"

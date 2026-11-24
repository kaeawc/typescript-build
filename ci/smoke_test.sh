#!/usr/bin/env bash
#
# smoke_test.sh
#
# Smoke-run the production image built from ci/Dockerfile:
#   1. `--help` exits 0.
#   2. `serve` answers GET /health.
#   3. /mcp answers an MCP `initialize` with serverInfo.
#   4. /mcp serves the MCP App view with its bundled script inlined, so a
#      missing build-time macro or runtime dependency fails here.
#
# Usage:
#   ./ci/smoke_test.sh <image> [host-port]
#
# Exit codes:
#   0 - All checks passed
#   1 - A check failed (container logs are printed)
#
set -euo pipefail

IMAGE="${1:?Usage: smoke_test.sh <image> [host-port]}"
PORT="${2:-3000}"
BASE_URL="http://127.0.0.1:${PORT}"
CONTAINER=""

cleanup() {
  if [[ -n "$CONTAINER" ]]; then
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT

fail() {
  echo "::error::Docker smoke test: $1"
  if [[ -n "$CONTAINER" ]]; then
    echo "--- container logs ---"
    docker logs "$CONTAINER" 2>&1 || true
  fi
  exit 1
}

mcp_post() {
  curl -fsS --max-time 10 \
    -H "Content-Type: application/json" \
    -H "Accept: application/json, text/event-stream" \
    -H "MCP-Protocol-Version: 2025-06-18" \
    "${BASE_URL}/mcp" -d "$1"
}

echo "[1/4] --help"
if ! help_output=$(docker run --rm "$IMAGE" --help 2>&1); then
  echo "$help_output"
  fail "--help exited non-zero"
fi
grep -q "serve" <<<"$help_output" || fail "--help output does not list the serve command"

echo "[2/4] serve + GET /health"
CONTAINER=$(docker run -d -p "127.0.0.1:${PORT}:3000" "$IMAGE" serve --port 3000)
healthy=false
for _ in $(seq 1 30); do
  if health=$(curl -fsS --max-time 2 "${BASE_URL}/health" 2>/dev/null); then
    healthy=true
    break
  fi
  if [[ "$(docker inspect -f '{{.State.Running}}' "$CONTAINER")" != "true" ]]; then
    fail "container exited before /health answered"
  fi
  sleep 1
done
[[ "$healthy" == true ]] || fail "/health did not answer within 30s"
grep -q '"ok":true' <<<"$health" || fail "/health returned unexpected body: $health"

echo "[3/4] MCP initialize"
init=$(mcp_post '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"docker-smoke","version":"1.0.0"}}}') ||
  fail "MCP initialize request failed"
grep -q '"serverInfo":{"name":"notes"' <<<"$init" || fail "initialize response has no notes serverInfo: ${init:0:500}"

echo "[4/4] MCP App view (bundled at build time)"
view=$(mcp_post '{"jsonrpc":"2.0","id":2,"method":"resources/read","params":{"uri":"ui://notes/board.html"}}') ||
  fail "resources/read for the MCP App view failed"
grep -q '<script type=\\"module\\">' <<<"$view" || fail "MCP App view has no inline module script"
# The bundled view is ~300 KB; an empty or failed bundle is a few KB of HTML.
((${#view} > 50000)) || fail "MCP App view is only ${#view} bytes; the view bundle is missing"

echo "OK: Docker smoke test passed for $IMAGE"

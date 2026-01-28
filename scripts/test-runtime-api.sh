#!/bin/bash
#
# Runtime API Structure Test Script
#
# Tests the local runtime HTTP API endpoints for correct structure
# and error handling without requiring actual agent spawning.
#
# This is useful when node-pty has issues on the local machine.
#
# Usage:
#   ./scripts/test-runtime-api.sh
#

set -e

# Configuration
RUNTIME_URL="${RUNTIME_URL:-http://localhost:3100}"
API_URL="${RUNTIME_URL}/api"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

TESTS_PASSED=0
TESTS_FAILED=0

pass() {
  echo -e "${GREEN}[PASS]${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

log() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

# Check HTTP status and body
check_endpoint() {
  local method="$1"
  local endpoint="$2"
  local expected_status="$3"
  local body="$4"
  local description="$5"

  local tmpfile=$(mktemp)
  local http_code

  if [[ "$method" == "POST" && -n "$body" ]]; then
    http_code=$(curl -s -w "%{http_code}" -o "$tmpfile" -X POST -H "Content-Type: application/json" -d "$body" "$endpoint")
  elif [[ "$method" == "DELETE" ]]; then
    http_code=$(curl -s -w "%{http_code}" -o "$tmpfile" -X DELETE "$endpoint")
  else
    http_code=$(curl -s -w "%{http_code}" -o "$tmpfile" "$endpoint")
  fi

  local response_body=$(cat "$tmpfile")
  rm -f "$tmpfile"

  if [[ "$http_code" == "$expected_status" ]]; then
    pass "$description (HTTP $http_code)"
    return 0
  else
    fail "$description - Expected $expected_status, got $http_code"
    echo "  Response: $response_body"
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────

test_root() {
  log "Testing root endpoint..."
  check_endpoint "GET" "$RUNTIME_URL/" "200" "" "GET /"
}

test_health() {
  log "Testing health endpoint..."
  check_endpoint "GET" "$API_URL/health" "200" "" "GET /api/health"

  # Verify health response structure
  local health=$(curl -s "$API_URL/health")
  if echo "$health" | grep -q '"healthy"'; then
    pass "Health response contains 'healthy' field"
  else
    fail "Health response missing 'healthy' field"
  fi
}

test_list_agents() {
  log "Testing list agents endpoint..."
  check_endpoint "GET" "$API_URL/agents" "200" "" "GET /api/agents"

  # Verify response structure
  local agents=$(curl -s "$API_URL/agents")
  if echo "$agents" | grep -q '"agents"'; then
    pass "Agents response contains 'agents' array"
  else
    fail "Agents response missing 'agents' array"
  fi
}

test_spawn_validation() {
  log "Testing spawn validation..."

  # Missing type
  check_endpoint "POST" "$API_URL/agents" "400" '{"name":"test"}' \
    "POST /api/agents (missing type returns 400)"

  # Missing name
  check_endpoint "POST" "$API_URL/agents" "400" '{"type":"echo"}' \
    "POST /api/agents (missing name returns 400)"
}

test_agent_not_found() {
  log "Testing agent not found..."
  check_endpoint "GET" "$API_URL/agents/nonexistent-id" "404" "" \
    "GET /api/agents/:id (nonexistent returns 404)"
}

test_send_to_nonexistent() {
  log "Testing send to nonexistent agent..."
  check_endpoint "POST" "$API_URL/agents/nonexistent-id/send" "500" \
    '{"message":"hello"}' \
    "POST /api/agents/:id/send (nonexistent returns error)"
}

test_logs_nonexistent() {
  log "Testing logs for nonexistent agent..."
  check_endpoint "GET" "$API_URL/agents/nonexistent-id/logs" "500" "" \
    "GET /api/agents/:id/logs (nonexistent returns error)"
}

test_stop_nonexistent() {
  log "Testing stop nonexistent agent..."
  check_endpoint "DELETE" "$API_URL/agents/nonexistent-id" "500" "" \
    "DELETE /api/agents/:id (nonexistent returns error)"
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║     Parallax Runtime API Structure Tests                   ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo "Runtime URL: $RUNTIME_URL"
  echo ""

  # Check server is running
  if ! curl -s --connect-timeout 2 "$RUNTIME_URL/" > /dev/null 2>&1; then
    echo -e "${RED}[ERROR]${NC} Runtime server is not available at $RUNTIME_URL"
    echo ""
    echo "Please start the local runtime server first:"
    echo "  cd runtimes/local && pnpm build && RUNTIME_PORT=3100 pnpm start"
    echo ""
    exit 1
  fi

  pass "Runtime server is running"
  echo ""

  # Run tests
  test_root
  test_health
  test_list_agents
  test_spawn_validation
  test_agent_not_found
  test_send_to_nonexistent
  test_logs_nonexistent
  test_stop_nonexistent

  # Summary
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║                     Test Summary                           ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo -e "  ${GREEN}Passed:${NC}  ${TESTS_PASSED}"
  echo -e "  ${RED}Failed:${NC}  ${TESTS_FAILED}"
  echo ""

  if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
  else
    echo -e "${GREEN}All API structure tests passed!${NC}"
    echo ""
    echo "Note: Agent spawn tests were skipped. If you need to test"
    echo "actual agent spawning, ensure node-pty is properly built:"
    echo "  cd runtimes/local && npm rebuild node-pty"
    exit 0
  fi
}

main "$@"

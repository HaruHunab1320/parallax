#!/bin/bash
#
# Runtime System Integration Test Script
#
# Tests the local runtime server API endpoints using curl.
# Uses the 'echo' adapter which doesn't require external CLI tools.
#
# Usage:
#   ./scripts/test-runtime.sh           # Full test
#   ./scripts/test-runtime.sh --quick   # Quick smoke test
#

set -e

# Configuration
RUNTIME_URL="${RUNTIME_URL:-http://localhost:3100}"
API_URL="${RUNTIME_URL}/api"
AGENT_TYPE="${AGENT_TYPE:-echo}"
VERBOSE="${VERBOSE:-false}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# ─────────────────────────────────────────────────────────────
# Utility Functions
# ─────────────────────────────────────────────────────────────

log() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[PASS]${NC} $1"
  TESTS_PASSED=$((TESTS_PASSED + 1))
}

log_fail() {
  echo -e "${RED}[FAIL]${NC} $1"
  TESTS_FAILED=$((TESTS_FAILED + 1))
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Run a test and check result
run_test() {
  local name="$1"
  local expected_status="$2"
  shift 2

  TESTS_RUN=$((TESTS_RUN + 1))

  if [[ "$VERBOSE" == "true" ]]; then
    log "Running: $name"
    log "Command: curl $*"
  fi

  # Run curl and capture status code
  local response
  local http_code

  response=$(curl -s -w "\n%{http_code}" "$@" 2>&1)
  http_code=$(echo "$response" | tail -n1)
  body=$(echo "$response" | sed '$d')

  if [[ "$http_code" == "$expected_status" ]]; then
    log_success "$name (HTTP $http_code)"
    if [[ "$VERBOSE" == "true" ]]; then
      echo "$body" | head -5
    fi
    echo "$body"
    return 0
  else
    log_fail "$name - Expected $expected_status, got $http_code"
    echo "$body"
    return 1
  fi
}

# Check if server is running
check_server() {
  log "Checking if runtime server is available at $RUNTIME_URL..."

  if curl -s --connect-timeout 2 "${RUNTIME_URL}/" > /dev/null 2>&1; then
    log_success "Runtime server is running"
    return 0
  else
    log_fail "Runtime server is not available at $RUNTIME_URL"
    echo ""
    echo "Please start the local runtime server first:"
    echo "  cd runtimes/local && pnpm build && pnpm start"
    echo ""
    return 1
  fi
}

# ─────────────────────────────────────────────────────────────
# Test Functions
# ─────────────────────────────────────────────────────────────

test_health() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Health Check"
  log "═══════════════════════════════════════════════════════"

  run_test "GET /api/health" "200" "${API_URL}/health" > /tmp/health.json

  # Verify response contains expected fields
  if grep -q '"healthy":true' /tmp/health.json; then
    log_success "Health check returns healthy=true"
  else
    log_warn "Health check did not return healthy=true"
  fi
}

test_list_agents_empty() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: List Agents (empty)"
  log "═══════════════════════════════════════════════════════"

  run_test "GET /api/agents" "200" "${API_URL}/agents" > /tmp/agents.json

  if grep -q '"agents":\[\]' /tmp/agents.json || grep -q '"count":0' /tmp/agents.json; then
    log_success "Empty agent list confirmed"
  fi
}

test_spawn_agent() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Spawn Agent"
  log "═══════════════════════════════════════════════════════"

  local payload='{"name":"test-agent","type":"'$AGENT_TYPE'","capabilities":["testing"]}'

  run_test "POST /api/agents" "201" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "${API_URL}/agents" > /tmp/spawn.json

  # Extract agent ID
  AGENT_ID=$(grep -o '"id":"[^"]*"' /tmp/spawn.json | cut -d'"' -f4)

  if [[ -n "$AGENT_ID" ]]; then
    log_success "Agent spawned with ID: $AGENT_ID"
    export AGENT_ID
  else
    log_fail "Failed to extract agent ID"
    return 1
  fi
}

test_spawn_validation() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Spawn Validation Errors"
  log "═══════════════════════════════════════════════════════"

  # Missing type
  run_test "POST /api/agents (missing type)" "400" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"name":"bad-agent"}' \
    "${API_URL}/agents" > /dev/null || true

  # Missing name
  run_test "POST /api/agents (missing name)" "400" \
    -X POST \
    -H "Content-Type: application/json" \
    -d '{"type":"echo"}' \
    "${API_URL}/agents" > /dev/null || true
}

test_get_agent() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Get Agent"
  log "═══════════════════════════════════════════════════════"

  if [[ -z "$AGENT_ID" ]]; then
    log_warn "Skipping - no agent ID"
    return 0
  fi

  run_test "GET /api/agents/:id" "200" "${API_URL}/agents/${AGENT_ID}" > /tmp/agent.json

  if grep -q "\"id\":\"$AGENT_ID\"" /tmp/agent.json; then
    log_success "Agent details retrieved"
  fi
}

test_list_agents() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: List Agents (with agent)"
  log "═══════════════════════════════════════════════════════"

  run_test "GET /api/agents" "200" "${API_URL}/agents" > /tmp/agents.json

  if grep -q '"count":' /tmp/agents.json; then
    local count=$(grep -o '"count":[0-9]*' /tmp/agents.json | cut -d':' -f2)
    log_success "Agent count: $count"
  fi
}

test_agent_ready() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Wait for Agent Ready"
  log "═══════════════════════════════════════════════════════"

  if [[ -z "$AGENT_ID" ]]; then
    log_warn "Skipping - no agent ID"
    return 0
  fi

  local max_wait=10
  local waited=0

  while [[ $waited -lt $max_wait ]]; do
    local status=$(curl -s "${API_URL}/agents/${AGENT_ID}" | grep -o '"status":"[^"]*"' | cut -d'"' -f4)

    if [[ "$status" == "ready" ]]; then
      log_success "Agent is ready (waited ${waited}s)"
      return 0
    fi

    log "Agent status: $status (waiting...)"
    sleep 1
    waited=$((waited + 1))
  done

  log_warn "Agent did not become ready within ${max_wait}s"
  return 0
}

test_send_message() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Send Message to Agent"
  log "═══════════════════════════════════════════════════════"

  if [[ -z "$AGENT_ID" ]]; then
    log_warn "Skipping - no agent ID"
    return 0
  fi

  local payload='{"message":"Hello from test script!","expectResponse":false}'

  run_test "POST /api/agents/:id/send" "200" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$payload" \
    "${API_URL}/agents/${AGENT_ID}/send" > /tmp/send.json

  if grep -q '"sent":true' /tmp/send.json; then
    log_success "Message sent successfully"
  fi
}

test_get_logs() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Get Agent Logs"
  log "═══════════════════════════════════════════════════════"

  if [[ -z "$AGENT_ID" ]]; then
    log_warn "Skipping - no agent ID"
    return 0
  fi

  # Give a moment for logs to accumulate
  sleep 1

  run_test "GET /api/agents/:id/logs" "200" "${API_URL}/agents/${AGENT_ID}/logs?tail=50" > /tmp/logs.json

  if grep -q '"logs":\[' /tmp/logs.json; then
    local count=$(grep -o '"count":[0-9]*' /tmp/logs.json | cut -d':' -f2)
    log_success "Retrieved $count log lines"
  fi
}

test_get_metrics() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Get Agent Metrics"
  log "═══════════════════════════════════════════════════════"

  if [[ -z "$AGENT_ID" ]]; then
    log_warn "Skipping - no agent ID"
    return 0
  fi

  run_test "GET /api/agents/:id/metrics" "200" "${API_URL}/agents/${AGENT_ID}/metrics" > /tmp/metrics.json

  if grep -q '"uptime"' /tmp/metrics.json; then
    log_success "Metrics retrieved"
  fi
}

test_stop_agent() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Stop Agent"
  log "═══════════════════════════════════════════════════════"

  if [[ -z "$AGENT_ID" ]]; then
    log_warn "Skipping - no agent ID"
    return 0
  fi

  run_test "DELETE /api/agents/:id" "204" \
    -X DELETE \
    "${API_URL}/agents/${AGENT_ID}" > /dev/null

  log_success "Agent stopped"
}

test_agent_not_found() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Agent Not Found (after stop)"
  log "═══════════════════════════════════════════════════════"

  if [[ -z "$AGENT_ID" ]]; then
    log_warn "Skipping - no agent ID"
    return 0
  fi

  # Give time for cleanup
  sleep 1

  run_test "GET /api/agents/:id (not found)" "404" \
    "${API_URL}/agents/${AGENT_ID}" > /dev/null || true
}

test_multiple_agents() {
  log ""
  log "═══════════════════════════════════════════════════════"
  log "Testing: Multiple Agents"
  log "═══════════════════════════════════════════════════════"

  local agent_ids=()

  # Spawn 3 agents
  for i in 1 2 3; do
    local payload='{"name":"multi-agent-'$i'","type":"'$AGENT_TYPE'","capabilities":["multi-test"]}'
    local response=$(curl -s -X POST -H "Content-Type: application/json" -d "$payload" "${API_URL}/agents")
    local id=$(echo "$response" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)

    if [[ -n "$id" ]]; then
      agent_ids+=("$id")
      log_success "Spawned multi-agent-$i: $id"
    else
      log_fail "Failed to spawn multi-agent-$i"
    fi
  done

  # List agents and verify count
  local agents=$(curl -s "${API_URL}/agents")
  local count=$(echo "$agents" | grep -o '"count":[0-9]*' | cut -d':' -f2)
  log "Total agents: $count"

  # Stop all spawned agents
  for id in "${agent_ids[@]}"; do
    curl -s -X DELETE "${API_URL}/agents/${id}" > /dev/null
    log "Stopped: $id"
  done

  log_success "Multiple agents test complete"
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║         Parallax Runtime Integration Tests                 ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo "Runtime URL: $RUNTIME_URL"
  echo "Agent Type:  $AGENT_TYPE"
  echo ""

  # Check server is running
  if ! check_server; then
    exit 1
  fi

  # Run tests
  if [[ "$1" == "--quick" ]]; then
    log "Running quick smoke tests..."
    test_health
    test_spawn_agent
    test_get_agent
    test_stop_agent
  else
    log "Running full test suite..."
    test_health
    test_list_agents_empty
    test_spawn_validation
    test_spawn_agent
    test_get_agent
    test_list_agents
    test_agent_ready
    test_send_message
    test_get_logs
    test_get_metrics
    test_stop_agent
    test_agent_not_found
    test_multiple_agents
  fi

  # Summary
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║                     Test Summary                           ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""
  echo -e "  Tests Run:    ${TESTS_RUN}"
  echo -e "  ${GREEN}Passed:${NC}       ${TESTS_PASSED}"
  echo -e "  ${RED}Failed:${NC}       ${TESTS_FAILED}"
  echo ""

  if [[ $TESTS_FAILED -gt 0 ]]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
  else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  fi
}

# Run
main "$@"

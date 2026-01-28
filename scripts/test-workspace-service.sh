#!/bin/bash
#
# Workspace Service Test Script
#
# Tests the workspace provisioning and credential management.
# Requires a running control-plane server.
#
# Usage:
#   ./scripts/test-workspace-service.sh
#

set -e

# Configuration
API_URL="${API_URL:-http://localhost:3000/api}"

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

# ─────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────

test_branch_naming() {
  log "Testing branch naming..."

  # Test via Node.js since this is a TypeScript module
  node -e "
    const { generateBranchName, parseBranchName } = require('./packages/control-plane/dist/workspace/branch-naming');

    // Test generation
    const branch = generateBranchName({
      executionId: 'exec-abc123',
      role: 'engineer',
      slug: 'implement-auth',
      baseBranch: 'main'
    });

    if (branch !== 'parallax/exec-abc123/engineer-implement-auth') {
      console.error('Expected parallax/exec-abc123/engineer-implement-auth, got:', branch);
      process.exit(1);
    }

    // Test parsing
    const parsed = parseBranchName(branch);
    if (parsed.executionId !== 'exec-abc123' || parsed.role !== 'engineer') {
      console.error('Parse failed:', parsed);
      process.exit(1);
    }

    console.log('Branch naming tests passed');
  " && pass "Branch naming" || fail "Branch naming"
}

test_workspace_provision_api() {
  log "Testing workspace provision API..."

  # This requires the server to be running with GitHub App configured
  # For now, just test the endpoint exists

  local response=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${API_URL}/workspaces" \
    -H "Content-Type: application/json" \
    -d '{}')

  # Should return 400 (bad request) for missing required fields
  if [[ "$response" == "400" ]]; then
    pass "Workspace provision API returns 400 for invalid request"
  else
    fail "Workspace provision API - expected 400, got $response"
  fi
}

test_credential_request_api() {
  log "Testing credential request API..."

  local response=$(curl -s -o /dev/null -w "%{http_code}" \
    -X POST "${API_URL}/credentials/git" \
    -H "Content-Type: application/json" \
    -d '{}')

  # Should return 400 (bad request) for missing required fields
  if [[ "$response" == "400" ]]; then
    pass "Credential request API returns 400 for invalid request"
  else
    fail "Credential request API - expected 400, got $response"
  fi
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

main() {
  echo ""
  echo "╔═══════════════════════════════════════════════════════════╗"
  echo "║         Workspace Service Tests                            ║"
  echo "╚═══════════════════════════════════════════════════════════╝"
  echo ""

  # Unit tests (don't need server)
  test_branch_naming

  # API tests (need server)
  log "Checking if server is available at ${API_URL}..."
  if curl -s --connect-timeout 2 "${API_URL}/../" > /dev/null 2>&1; then
    pass "Server is running"
    test_workspace_provision_api
    test_credential_request_api
  else
    echo -e "${YELLOW}[SKIP]${NC} Server not available - skipping API tests"
    echo "Start the control-plane server to run API tests:"
    echo "  cd packages/control-plane && pnpm start"
  fi

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
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
  fi
}

main "$@"

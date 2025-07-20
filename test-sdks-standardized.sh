#!/bin/bash

# Run Standardized SDK Tests
# All SDKs must pass the same tests

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🧪 Parallax Standardized SDK Tests"
echo "=================================="
echo
echo "All SDKs will be tested with identical test cases:"
echo "1. Agent Creation"
echo "2. Simple Analysis" 
echo "3. Validation"
echo "4. Error Handling"
echo "5. Client API (if control plane running)"
echo

# Check if control plane is running
CONTROL_PLANE_RUNNING=false
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    CONTROL_PLANE_RUNNING=true
    echo -e "${GREEN}✓ Control plane is running - full tests will run${NC}"
else
    echo -e "${YELLOW}⚠ Control plane not running - client tests will be skipped${NC}"
fi
echo

# Results tracking
declare -A SDK_RESULTS

# Function to run standardized test
run_sdk_test() {
    local sdk=$1
    local command=$2
    
    echo -e "${BLUE}Testing $sdk SDK...${NC}"
    
    if eval "$command" 2>&1 | tee /tmp/sdk-test-$sdk.log | grep -E "(PASS|FAIL|SKIP|Summary)"; then
        # Extract summary
        SUMMARY=$(grep "Summary:" /tmp/sdk-test-$sdk.log | tail -1)
        SDK_RESULTS[$sdk]=$SUMMARY
        echo
        return 0
    else
        SDK_RESULTS[$sdk]="Failed to run"
        echo -e "${RED}Failed to run $sdk tests${NC}"
        echo
        return 1
    fi
}

# Run all SDK tests
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# TypeScript
run_sdk_test "TypeScript" "cd apps/demo-typescript && pnpm install --silent && pnpm test"

# Python
run_sdk_test "Python" "cd apps/demo-python && poetry install --quiet 2>/dev/null && poetry run python standardized_test.py"

# Go
run_sdk_test "Go" "cd apps/demo-go && go run standardized_test.go"

# Rust
run_sdk_test "Rust" "cd apps/demo-rust && cargo build --quiet --bin standardized_test 2>/dev/null && cargo run --quiet --bin standardized_test"

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Final Results${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo

ALL_PASSED=true
for sdk in TypeScript Python Go Rust; do
    if [[ -n "${SDK_RESULTS[$sdk]}" ]]; then
        echo "$sdk: ${SDK_RESULTS[$sdk]}"
        if [[ ! "${SDK_RESULTS[$sdk]}" =~ "5/5" ]] && [[ ! "${SDK_RESULTS[$sdk]}" =~ "4/4" ]]; then
            ALL_PASSED=false
        fi
    else
        echo "$sdk: No results"
        ALL_PASSED=false
    fi
done

echo
if [ "$ALL_PASSED" = true ]; then
    echo -e "${GREEN}✅ All SDKs implement the required functionality correctly!${NC}"
    echo
    echo "Your SDKs are consistent and ready for production."
else
    echo -e "${YELLOW}⚠️  Some SDKs have differences or failures${NC}"
    echo
    echo "Review the test output above to identify which SDKs need fixes."
    echo "All SDKs should pass the same tests to ensure consistency."
fi

# Cleanup
rm -f /tmp/sdk-test-*.log
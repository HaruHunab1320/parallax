#!/bin/bash

# Test All Parallax SDKs
# This script runs demo apps for each SDK to verify functionality

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo "🧪 Parallax SDK Test Suite"
echo "=========================="
echo

# Check if control plane is running
CONTROL_PLANE_RUNNING=false
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    CONTROL_PLANE_RUNNING=true
    echo -e "${GREEN}✓ Control plane is running${NC}"
else
    echo -e "${YELLOW}⚠ Control plane not running - SDK demos will run in offline mode${NC}"
    echo "  To test full functionality, run: pnpm run dev:control-plane"
fi
echo

# Function to run a demo
run_demo() {
    local name=$1
    local command=$2
    
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}Testing $name SDK${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo
    
    if eval "$command"; then
        echo -e "\n${GREEN}✅ $name SDK test passed${NC}\n"
        return 0
    else
        echo -e "\n${RED}❌ $name SDK test failed${NC}\n"
        return 1
    fi
}

# Track results
PASSED=0
FAILED=0

# Test TypeScript SDK
if run_demo "TypeScript" "cd apps/demo-typescript && pnpm install --silent && pnpm run dev"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Test Python SDK
if run_demo "Python" "cd apps/demo-python && poetry install --quiet && poetry run python demo_agent.py"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Test Go SDK
if run_demo "Go" "cd apps/demo-go && go mod tidy && go run main.go"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Test Rust SDK
if run_demo "Rust" "cd apps/demo-rust && cargo run --quiet"; then
    ((PASSED++))
else
    ((FAILED++))
fi

# Summary
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}Test Summary${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo
echo "Total SDKs tested: 4"
echo -e "Passed: ${GREEN}$PASSED${NC}"
echo -e "Failed: ${RED}$FAILED${NC}"
echo

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}🎉 All SDK tests passed!${NC}"
    echo
    echo "Your SDKs are ready for production deployment!"
else
    echo -e "${RED}⚠️  Some SDK tests failed${NC}"
    echo
    echo "Please check the output above for details."
    exit 1
fi

# Additional recommendations
echo
echo "📝 Next Steps:"
echo "1. If not running, start the control plane to test full functionality:"
echo "   pnpm run dev:control-plane"
echo
echo "2. Run the pattern demo to see SDKs working together:"
echo "   pnpm run demo:patterns"
echo
echo "3. Check individual SDK documentation:"
echo "   - TypeScript: packages/sdk-typescript/README.md"
echo "   - Python: packages/sdk-python/README.md"
echo "   - Go: packages/sdk-go/README.md"
echo "   - Rust: packages/sdk-rust/README.md"
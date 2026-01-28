#!/bin/bash

# Simple Production System Test Script for Parallax
# This script runs basic tests to verify system functionality

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "🚀 Parallax Production System Test"
echo "=================================="
echo

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Please run this script from the Parallax root directory${NC}"
    exit 1
fi

echo "1️⃣  Checking prerequisites..."

# Check Docker
if ! command -v docker &> /dev/null; then
    echo -e "${RED}✗ Docker not installed${NC}"
    echo "Please install Docker from https://docker.com"
    exit 1
fi
echo -e "${GREEN}✓ Docker installed${NC}"

# Check pnpm
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}✗ pnpm not installed${NC}"
    echo "Please install pnpm: npm install -g pnpm"
    exit 1
fi
echo -e "${GREEN}✓ pnpm installed${NC}"

echo
echo "2️⃣  Starting services..."
echo "This will start:"
echo "  - PostgreSQL (port 5432)"
echo "  - Redis (port 6379)"
echo "  - etcd (port 2379)"
echo "  - Control Plane API (port 8080)"
echo "  - Prometheus (port 9090)"
echo "  - Grafana (port 3000)"
echo "  - Jaeger (port 16686)"
echo

# Check if services are already running
if curl -s http://localhost:8080/health > /dev/null 2>&1; then
    echo -e "${YELLOW}Services appear to be already running!${NC}"
    echo "Skipping startup..."
else
    echo "Starting production stack..."
    echo "Run 'pnpm run dev:prod' in another terminal, then press Enter when ready"
    read -p "Press Enter when services are started: "
fi

echo
echo "3️⃣  Testing core services..."

# Function to test a service
test_service() {
    local name=$1
    local url=$2
    local expected=$3
    
    printf "Testing %-20s" "$name..."
    
    if curl -s -f "$url" 2>/dev/null | grep -q "$expected" 2>/dev/null || curl -s -f "$url" > /dev/null 2>&1; then
        echo -e "${GREEN}✓ Working${NC}"
        return 0
    else
        echo -e "${RED}✗ Not responding${NC}"
        return 1
    fi
}

# Test each service
test_service "Control Plane API" "http://localhost:8080/health" "healthy"

# Test PostgreSQL differently since it doesn't use HTTP
printf "Testing %-20s" "PostgreSQL..."
if docker exec parallax-postgres pg_isready -U parallax > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Working${NC}"
else
    echo -e "${RED}✗ Not responding${NC}"
fi

test_service "etcd" "http://localhost:2379/health" "true"
test_service "Prometheus" "http://localhost:9090/-/ready" "ready"
test_service "Grafana" "http://localhost:3000/api/health" "ok"
test_service "Jaeger" "http://localhost:16686" "Jaeger"

echo
echo "4️⃣  Testing API functionality..."

# Test pattern listing
echo -n "Fetching patterns... "
PATTERNS=$(curl -s http://localhost:8080/api/patterns 2>/dev/null)
if echo "$PATTERNS" | grep -q "ConsensusBuilder"; then
    PATTERN_COUNT=$(echo "$PATTERNS" | grep -o '"name"' | wc -l | tr -d ' ')
    echo -e "${GREEN}✓ Found $PATTERN_COUNT patterns${NC}"
else
    echo -e "${RED}✗ No patterns found${NC}"
fi

# Test pattern execution
echo -n "Executing test pattern... "
RESULT=$(curl -s -X POST http://localhost:8080/api/executions \
    -H "Content-Type: application/json" \
    -d '{"patternName": "SimpleConsensus", "input": {"task": "Test the system"}}' 2>/dev/null)

if echo "$RESULT" | grep -q "accepted"; then
    echo -e "${GREEN}✓ Pattern execution started successfully${NC}"
    # Get the execution ID
    EXEC_ID=$(echo "$RESULT" | grep -o '"id":"[^"]*"' | cut -d'"' -f4)
    if [ ! -z "$EXEC_ID" ]; then
        echo "  Execution ID: $EXEC_ID"
    fi
else
    echo -e "${RED}✗ Pattern execution failed${NC}"
    echo "Response: $RESULT"
fi

echo
echo "5️⃣  Testing monitoring..."

# Check Prometheus metrics
echo -n "Checking metrics collection... "
METRICS=$(curl -s http://localhost:8080/metrics 2>/dev/null | grep -c "parallax_" || echo "0")
if [ "$METRICS" -gt "0" ]; then
    echo -e "${GREEN}✓ Found $METRICS Parallax metrics${NC}"
else
    echo -e "${RED}✗ No metrics found${NC}"
fi

echo
echo "6️⃣  Quick performance test..."

# Run 5 executions and measure time
echo -n "Running 5 pattern executions... "
START=$(date +%s)
SUCCESS=0

for i in {1..5}; do
    if curl -s -X POST http://localhost:8080/api/executions \
        -H "Content-Type: application/json" \
        -d "{\"patternName\": \"SimpleConsensus\", \"input\": {\"task\": \"Performance test $i\"}}" \
        2>/dev/null | grep -q "accepted"; then
        ((SUCCESS++))
    fi
done

END=$(date +%s)
DURATION=$((END - START))

if [ "$SUCCESS" -eq 5 ]; then
    echo -e "${GREEN}✓ All executions completed in ${DURATION}s${NC}"
else
    echo -e "${YELLOW}⚠ Only $SUCCESS/5 executions succeeded${NC}"
fi

echo
echo "=================================="
echo "📊 Test Summary"
echo "=================================="
echo
echo "✅ Services to access:"
echo "  - API Health: http://localhost:8080/health"
echo "  - Grafana: http://localhost:3000 (admin/admin)"
echo "  - Prometheus: http://localhost:9090"
echo "  - Jaeger: http://localhost:16686"
echo
echo "📝 Next steps:"
echo "  1. Check Grafana dashboards for metrics"
echo "  2. View traces in Jaeger"
echo "  3. Run full demo: pnpm run demo:patterns"
echo "  4. Run load test: k6 run load-test.js"
echo
echo "🛑 To stop all services:"
echo "  docker-compose down (in the control-plane directory)"
echo "  or press Ctrl+C in the terminal running dev:prod"
echo
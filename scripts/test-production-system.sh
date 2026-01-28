#!/bin/bash

# Production System Test Script for Parallax
# This script automates testing of all major systems

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test results
PASSED=0
FAILED=0

# Helper functions
test_pass() {
    echo -e "${GREEN}✓ $1${NC}"
    ((PASSED++))
}

test_fail() {
    echo -e "${RED}✗ $1${NC}"
    echo "  Error: $2"
    ((FAILED++))
}

section() {
    echo
    echo -e "${YELLOW}=== $1 ===${NC}"
    echo
}

wait_for_service() {
    local url=$1
    local service=$2
    local max_attempts=30
    local attempt=1
    
    echo -n "Waiting for $service to be ready..."
    while [ $attempt -le $max_attempts ]; do
        if curl -s -f "$url" > /dev/null 2>&1; then
            echo " Ready!"
            return 0
        fi
        echo -n "."
        sleep 2
        ((attempt++))
    done
    echo " Timeout!"
    return 1
}

# Start of tests
echo "🚀 Parallax Production System Test Suite"
echo "========================================"

section "1. Prerequisites Check"

# Check Docker
if command -v docker &> /dev/null; then
    test_pass "Docker installed"
else
    test_fail "Docker not found" "Please install Docker"
    exit 1
fi

# Check Docker Compose
if command -v docker-compose &> /dev/null 2>&1; then
    test_pass "Docker Compose installed (standalone)"
elif docker compose version &> /dev/null 2>&1; then
    test_pass "Docker Compose installed (plugin)"
else
    test_fail "Docker Compose not found" "Please install Docker Compose"
    exit 1
fi

# Check ports
echo "Checking port availability..."
for port in 2379 3000 5432 6379 8080 9090 16686; do
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        test_fail "Port $port in use" "Stop service using port $port"
    else
        test_pass "Port $port available"
    fi
done

section "2. Starting Production Stack"

echo "Starting production stack with 'pnpm run dev:prod'..."
echo "Note: This will start all services in Docker containers"
echo "Press Ctrl+C to cancel..."
sleep 3

# Start the stack in background
cd "$(dirname "$0")"
nohup pnpm run dev:prod > production-stack.log 2>&1 &
STACK_PID=$!

# Wait for services to start
sleep 10

section "3. Infrastructure Health Checks"

# Check PostgreSQL
if docker exec parallax-postgres pg_isready -U parallax > /dev/null 2>&1; then
    test_pass "PostgreSQL is ready"
    
    # Check TimescaleDB
    if docker exec parallax-postgres psql -U parallax -d parallax -c "SELECT 1 FROM pg_extension WHERE extname = 'timescaledb';" > /dev/null 2>&1; then
        test_pass "TimescaleDB extension loaded"
    else
        test_fail "TimescaleDB extension not found" "Extension may not be installed"
    fi
else
    test_fail "PostgreSQL not responding" "Check docker logs parallax-postgres"
fi

# Check Redis
if docker exec parallax-redis redis-cli ping | grep -q PONG 2>/dev/null; then
    test_pass "Redis is ready"
else
    test_fail "Redis not responding" "Check docker logs parallax-redis"
fi

# Check etcd
if curl -s http://localhost:2379/health | grep -q true 2>/dev/null; then
    test_pass "etcd is healthy"
else
    test_fail "etcd not responding" "Check docker logs parallax-etcd"
fi

section "4. Control Plane API Tests"

# Wait for API to be ready
if wait_for_service "http://localhost:8080/health" "Control Plane API"; then
    test_pass "Control Plane API is ready"
    
    # Health endpoint
    if curl -s http://localhost:8080/health | grep -q healthy; then
        test_pass "Health endpoint working"
    else
        test_fail "Health endpoint not healthy" "Check API logs"
    fi
    
    # Ready endpoint with dependencies
    if curl -s http://localhost:8080/health/ready | grep -q true; then
        test_pass "Ready endpoint shows all dependencies healthy"
    else
        test_fail "Dependencies not ready" "Check service connections"
    fi
    
    # List patterns
    PATTERNS=$(curl -s http://localhost:8080/api/patterns)
    if echo "$PATTERNS" | grep -q "ConsensusBuilder"; then
        test_pass "Pattern API working - found patterns"
    else
        test_fail "Pattern API not returning patterns" "Check pattern loading"
    fi
    
    # Execute a pattern
    EXECUTION=$(curl -s -X POST http://localhost:8080/api/executions \
        -H "Content-Type: application/json" \
        -d '{"patternName": "SimpleConsensus", "input": {"task": "Test task"}}')
    
    if echo "$EXECUTION" | grep -q "completed"; then
        test_pass "Pattern execution working"
    else
        test_fail "Pattern execution failed" "$EXECUTION"
    fi
else
    test_fail "Control Plane API not ready" "Check docker logs"
fi

section "5. Monitoring Stack Tests"

# Check Prometheus
if wait_for_service "http://localhost:9090/-/ready" "Prometheus"; then
    test_pass "Prometheus is ready"
    
    # Check targets
    TARGETS=$(curl -s http://localhost:9090/api/v1/targets | grep -c "health.*up" || true)
    if [ "$TARGETS" -gt 0 ]; then
        test_pass "Prometheus has active targets"
    else
        test_fail "No Prometheus targets up" "Check scrape configuration"
    fi
else
    test_fail "Prometheus not ready" "Check monitoring stack"
fi

# Check Grafana
if wait_for_service "http://localhost:3000/api/health" "Grafana"; then
    test_pass "Grafana is ready"
    
    # Check dashboards
    DASHBOARDS=$(curl -s -u admin:admin http://localhost:3000/api/search?type=dash-db | grep -c "uid" || true)
    if [ "$DASHBOARDS" -gt 0 ]; then
        test_pass "Grafana dashboards loaded ($DASHBOARDS found)"
    else
        test_fail "No Grafana dashboards found" "Check provisioning"
    fi
else
    test_fail "Grafana not ready" "Check monitoring stack"
fi

# Check Jaeger
if wait_for_service "http://localhost:16686/" "Jaeger"; then
    test_pass "Jaeger is ready"
else
    test_fail "Jaeger not ready" "Check monitoring stack"
fi

section "6. Data Persistence Test"

# Check if executions are being saved
EXEC_COUNT=$(docker exec parallax-postgres psql -U parallax -d parallax -t -c "SELECT COUNT(*) FROM executions;" 2>/dev/null | tr -d ' ' || echo "0")
if [ "$EXEC_COUNT" -gt "0" ]; then
    test_pass "Executions persisted to database ($EXEC_COUNT records)"
else
    test_fail "No executions in database" "Check database connection"
fi

section "7. Performance Quick Test"

# Run 10 quick executions and measure time
echo "Running 10 pattern executions..."
START_TIME=$(date +%s)
SUCCESS_COUNT=0

for i in {1..10}; do
    if curl -s -X POST http://localhost:8080/api/v1/executions \
        -H "Content-Type: application/json" \
        -d "{\"pattern\": \"SimpleConsensus\", \"input\": {\"task\": \"Perf test $i\"}}" \
        | grep -q "completed" 2>/dev/null; then
        ((SUCCESS_COUNT++))
    fi
done

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))
AVG_TIME=$((DURATION * 100 / 10))

if [ "$SUCCESS_COUNT" -eq 10 ]; then
    test_pass "All 10 executions completed (avg ${AVG_TIME}ms)"
else
    test_fail "Only $SUCCESS_COUNT/10 executions succeeded" "Check system load"
fi

section "Test Summary"

echo
echo "========================================"
echo "Tests Passed: $PASSED"
echo "Tests Failed: $FAILED"
echo

if [ "$FAILED" -eq 0 ]; then
    echo -e "${GREEN}✅ All tests passed! System is ready for production.${NC}"
    echo
    echo "Next steps:"
    echo "1. Access Grafana at http://localhost:3000 (admin/admin)"
    echo "2. View traces at http://localhost:16686"
    echo "3. Run 'pnpm run demo:patterns' for a full demonstration"
    echo "4. Check logs with 'docker-compose logs -f'"
else
    echo -e "${RED}❌ Some tests failed. Please check the errors above.${NC}"
    echo
    echo "Debug commands:"
    echo "- View all logs: docker-compose logs"
    echo "- Check specific service: docker logs parallax-control-plane"
    echo "- Service status: docker-compose ps"
fi

echo
echo "To stop the production stack: docker-compose down"
echo "Stack is running with PID: $STACK_PID"

# Optionally kill the background process
# kill $STACK_PID 2>/dev/null || true
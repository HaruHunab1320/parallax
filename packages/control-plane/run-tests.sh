#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${YELLOW}🧪 Running Parallax Control Plane Tests${NC}"
echo "========================================"

# Check if test database is already running
if docker ps | grep -q parallax-test-db; then
  echo -e "${YELLOW}⚠️  Test database already running, stopping it...${NC}"
  docker stop parallax-test-db 2>/dev/null || true
fi

# Run different test suites
echo -e "\n${GREEN}📦 Running Unit Tests${NC}"
pnpm vitest run tests/unit --reporter=verbose

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Unit tests passed${NC}"
else
  echo -e "${RED}❌ Unit tests failed${NC}"
  exit 1
fi

echo -e "\n${GREEN}🔗 Running Integration Tests${NC}"
pnpm vitest run tests/integration --reporter=verbose

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Integration tests passed${NC}"
else
  echo -e "${RED}❌ Integration tests failed${NC}"
  exit 1
fi

echo -e "\n${GREEN}🚀 Running E2E Tests${NC}"
pnpm vitest run tests/e2e --reporter=verbose

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ E2E tests passed${NC}"
else
  echo -e "${RED}❌ E2E tests failed${NC}"
  exit 1
fi

# Generate coverage report
echo -e "\n${GREEN}📊 Generating Coverage Report${NC}"
pnpm vitest run --coverage

echo -e "\n${GREEN}✨ All tests completed!${NC}"
echo "Coverage report available at: coverage/index.html"
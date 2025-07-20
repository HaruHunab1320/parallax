#!/bin/bash

# Start Production Test Environment
# This script starts all services needed for production testing

set -e

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "🚀 Starting Parallax Production Test Environment"
echo "=============================================="
echo

# Change to control-plane directory
cd packages/control-plane

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${YELLOW}Creating .env file from example...${NC}"
    if [ -f .env.example ]; then
        cp .env.example .env
        # Update with proper values
        cat > .env << 'EOF'
# Database connection
DATABASE_URL="postgresql://parallax:parallax123@localhost:5432/parallax?schema=public"
POSTGRES_USER=parallax
POSTGRES_PASSWORD=parallax123
POSTGRES_DB=parallax

# JWT Secret (change this in production!)
JWT_SECRET=development-secret-key-change-in-production

# Parallax environment variables
NODE_ENV=development
LOG_LEVEL=info
PORT=8080

# Etcd configuration
PARALLAX_ETCD_ENDPOINTS=localhost:2379

# Pattern directory
PARALLAX_PATTERNS_DIR=../../patterns

# Redis
REDIS_URL=redis://localhost:6379

# Monitoring
ENABLE_METRICS=true
ENABLE_TRACING=true
JAEGER_ENDPOINT=http://localhost:14268/api/traces
EOF
        echo -e "${GREEN}✓ Created .env file${NC}"
    fi
fi

# Start infrastructure services
echo -e "${YELLOW}Starting infrastructure services...${NC}"
docker-compose -f docker-compose.prod.yml up -d postgres redis etcd

# Wait for services to be ready
echo "Waiting for services to start..."
sleep 10

# Check PostgreSQL
echo -n "Checking PostgreSQL... "
if docker exec parallax-postgres pg_isready -U parallax > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Ready${NC}"
else
    echo -e "${RED}✗ Not ready${NC}"
fi

# Check Redis
echo -n "Checking Redis... "
if docker exec parallax-redis redis-cli ping | grep -q PONG 2>/dev/null; then
    echo -e "${GREEN}✓ Ready${NC}"
else
    echo -e "${RED}✗ Not ready${NC}"
fi

# Check etcd
echo -n "Checking etcd... "
if curl -s http://localhost:2379/health | grep -q true 2>/dev/null; then
    echo -e "${GREEN}✓ Ready${NC}"
else
    echo -e "${RED}✗ Not ready${NC}"
fi

# Run database migrations
echo
echo -e "${YELLOW}Running database migrations...${NC}"
cd ../..
if pnpm --filter @parallax/control-plane run prisma:migrate; then
    echo -e "${GREEN}✓ Migrations completed${NC}"
else
    echo -e "${YELLOW}⚠ Migration issues (may be normal if already applied)${NC}"
fi

# Start monitoring stack
echo
echo -e "${YELLOW}Starting monitoring services...${NC}"
cd packages/control-plane
docker-compose -f docker-compose.prod.yml up -d prometheus grafana jaeger

# Start the control plane
echo
echo -e "${YELLOW}Starting Control Plane API...${NC}"
cd ../..
echo "Run this in a new terminal:"
echo -e "${GREEN}pnpm run dev:control-plane${NC}"
echo
echo "Once the API is running, you can:"
echo "1. Run tests: ${GREEN}./test-production-system-simple.sh${NC}"
echo "2. Run demo: ${GREEN}pnpm run demo:patterns${NC}"
echo
echo "Services available at:"
echo "  - API: http://localhost:8080/health"
echo "  - Grafana: http://localhost:3000 (admin/admin)"
echo "  - Prometheus: http://localhost:9090"
echo "  - Jaeger: http://localhost:16686"
echo
echo "To stop all services:"
echo "  ${YELLOW}cd packages/control-plane && docker-compose -f docker-compose.prod.yml down${NC}"
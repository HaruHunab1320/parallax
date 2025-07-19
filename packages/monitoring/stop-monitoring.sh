#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🛑 Stopping Parallax Monitoring Stack${NC}"
echo "========================================"

# Stop monitoring stack
docker-compose -f docker-compose.monitoring.yml down

echo -e "${GREEN}✅ Monitoring stack stopped${NC}"

# Ask if user wants to remove volumes
echo ""
read -p "Remove monitoring data volumes? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Removing volumes...${NC}"
    docker-compose -f docker-compose.monitoring.yml down -v
    echo -e "${GREEN}✅ Volumes removed${NC}"
fi
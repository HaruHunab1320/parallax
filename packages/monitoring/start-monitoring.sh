#!/bin/bash

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${YELLOW}🚀 Starting Parallax Monitoring Stack${NC}"
echo "========================================"

# Check if parallax-network exists, create if not
if ! docker network ls | grep -q parallax-network; then
    echo -e "${YELLOW}Creating parallax-network...${NC}"
    docker network create parallax-network
fi

# Start monitoring stack
echo -e "${GREEN}Starting monitoring services...${NC}"
docker-compose -f docker-compose.monitoring.yml up -d

# Wait for services to be ready
echo -e "${YELLOW}Waiting for services to be ready...${NC}"
sleep 10

# Check service health
echo -e "\n${GREEN}Checking service status:${NC}"

# Prometheus
if curl -s -o /dev/null -w "%{http_code}" http://localhost:9090/-/healthy | grep -q "200"; then
    echo -e "✅ Prometheus: ${GREEN}Running${NC} at http://localhost:9090"
else
    echo -e "❌ Prometheus: ${RED}Not ready${NC}"
fi

# Grafana
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health | grep -q "200"; then
    echo -e "✅ Grafana: ${GREEN}Running${NC} at http://localhost:3000 (admin/admin)"
else
    echo -e "❌ Grafana: ${RED}Not ready${NC}"
fi

# Jaeger
if curl -s -o /dev/null -w "%{http_code}" http://localhost:16686 | grep -q "200"; then
    echo -e "✅ Jaeger: ${GREEN}Running${NC} at http://localhost:16686"
else
    echo -e "❌ Jaeger: ${RED}Not ready${NC}"
fi

echo -e "\n${GREEN}✨ Monitoring stack started!${NC}"
echo ""
echo "Access points:"
echo "  - Grafana: http://localhost:3000 (admin/admin)"
echo "  - Prometheus: http://localhost:9090"
echo "  - Jaeger UI: http://localhost:16686"
echo "  - AlertManager: http://localhost:9093"
echo ""
echo "To view logs: docker-compose -f docker-compose.monitoring.yml logs -f"
echo "To stop: ./stop-monitoring.sh"
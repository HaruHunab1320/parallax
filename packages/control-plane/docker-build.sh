#!/bin/bash

# Script to build and optionally run the Parallax Control Plane Docker image

set -e

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

# Default values
VERSION=${VERSION:-latest}
REGISTRY=${REGISTRY:-}
RUN_AFTER_BUILD=${RUN_AFTER_BUILD:-false}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --version)
      VERSION="$2"
      shift 2
      ;;
    --registry)
      REGISTRY="$2"
      shift 2
      ;;
    --run)
      RUN_AFTER_BUILD=true
      shift
      ;;
    --push)
      PUSH_TO_REGISTRY=true
      shift
      ;;
    --help)
      echo "Usage: $0 [options]"
      echo "Options:"
      echo "  --version <version>    Set image version tag (default: latest)"
      echo "  --registry <registry>  Set Docker registry (e.g., docker.io/myorg)"
      echo "  --run                  Run the container after building"
      echo "  --push                 Push image to registry after building"
      echo "  --help                 Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Construct image name
if [ -n "$REGISTRY" ]; then
  IMAGE_NAME="${REGISTRY}/parallax/control-plane:${VERSION}"
else
  IMAGE_NAME="parallax/control-plane:${VERSION}"
fi

echo -e "${YELLOW}Building Parallax Control Plane Docker image...${NC}"
echo "Image: ${IMAGE_NAME}"

# Build from workspace root
cd ../..

# Build the image
echo -e "${GREEN}Building Docker image...${NC}"
docker build \
  -f packages/control-plane/Dockerfile \
  -t "${IMAGE_NAME}" \
  --build-arg VERSION="${VERSION}" \
  .

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Docker image built successfully${NC}"
  echo "Image: ${IMAGE_NAME}"
else
  echo -e "${RED}❌ Docker build failed${NC}"
  exit 1
fi

# Push to registry if requested
if [ "${PUSH_TO_REGISTRY}" = true ] && [ -n "$REGISTRY" ]; then
  echo -e "${YELLOW}Pushing image to registry...${NC}"
  docker push "${IMAGE_NAME}"
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Image pushed to registry${NC}"
  else
    echo -e "${RED}❌ Failed to push image${NC}"
    exit 1
  fi
fi

# Run the container if requested
if [ "${RUN_AFTER_BUILD}" = true ]; then
  echo -e "${YELLOW}Starting container...${NC}"
  
  # Check if .env file exists
  if [ ! -f packages/control-plane/.env ]; then
    echo -e "${YELLOW}No .env file found. Creating from example...${NC}"
    cp packages/control-plane/env.example packages/control-plane/.env
    echo -e "${RED}Please edit packages/control-plane/.env with your configuration${NC}"
    exit 1
  fi
  
  cd packages/control-plane
  
  # Start services
  docker-compose up -d
  
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✅ Services started successfully${NC}"
    echo ""
    echo "Services:"
    echo "  - API: http://localhost:8080"
    echo "  - gRPC: localhost:8081"
    echo "  - Metrics: http://localhost:9090/metrics"
    echo "  - PostgreSQL: localhost:5432"
    echo "  - etcd: localhost:2379"
    echo ""
    echo "To view logs: docker-compose logs -f"
    echo "To stop: docker-compose down"
  else
    echo -e "${RED}❌ Failed to start services${NC}"
    exit 1
  fi
fi

echo -e "${GREEN}✨ Done!${NC}"
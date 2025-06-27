#!/bin/bash

# Build all Docker images for Parallax

set -e

echo "🐳 Building Parallax Docker images..."

# Build base images
echo "📦 Building Control Plane..."
docker build -f docker/control-plane.Dockerfile -t parallax/control-plane:latest .

echo "📦 Building TypeScript Agent base..."
docker build -f docker/agent-typescript.Dockerfile -t parallax/agent-typescript:latest .

echo "📦 Building Python Agent base..."
docker build -f docker/agent-python.Dockerfile -t parallax/agent-python:latest .

# Build example agents
echo "📦 Building Sentiment Agent..."
docker build -f examples/standalone-agent/Dockerfile -t parallax/sentiment-agent:latest examples/standalone-agent

echo "📦 Building Weather Agent..."
docker build -f examples/python-agent/Dockerfile -t parallax/weather-agent:latest examples/python-agent

echo "✅ All images built successfully!"
echo ""
echo "To run the platform:"
echo "  docker-compose up"
echo ""
echo "To run in development mode:"
echo "  docker-compose -f docker-compose.dev.yml up"
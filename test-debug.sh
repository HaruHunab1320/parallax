#!/bin/bash

echo "Testing Docker..."
docker --version

echo "Testing Docker Compose..."
if command -v docker-compose &> /dev/null; then
    echo "Found docker-compose command"
    docker-compose --version
elif docker compose version &> /dev/null; then
    echo "Found docker compose subcommand"
    docker compose version
else
    echo "Docker Compose not found"
fi

echo "Testing port check..."
lsof -Pi :8080 -sTCP:LISTEN -t
echo "Exit code: $?"

echo "All tests complete"
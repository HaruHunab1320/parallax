#!/bin/bash

# Start the Parallax platform locally for development/testing

echo "🚀 Starting Parallax Platform..."
echo ""

# Check if docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is required but not installed."
    echo "   Please install Docker from https://docker.com"
    exit 1
fi

# Check if Docker daemon is running
echo "🔍 Checking Docker status..."
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker daemon is not running."
    echo "   Please start Docker Desktop or the Docker daemon."
    exit 1
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down Parallax..."
    
    # Stop all background processes
    jobs -p | xargs -r kill 2>/dev/null
    
    # Stop docker compose
    docker-compose down 2>/dev/null
    
    echo "✅ Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Start etcd using docker-compose
echo "📦 Starting etcd for service discovery..."
docker-compose up -d etcd

# Check if etcd started successfully
if [ $? -ne 0 ]; then
    echo "❌ Failed to start etcd. Please check Docker is running."
    exit 1
fi

# Wait for etcd to be ready
echo "⏳ Waiting for etcd to be ready..."
for i in {1..10}; do
    if curl -s http://localhost:2379/version > /dev/null 2>&1; then
        echo "✅ etcd is ready!"
        break
    fi
    echo "   Attempt $i/10..."
    sleep 2
done

# Check if packages are built
echo "🔍 Checking build status..."
if [ ! -d "packages/runtime/dist" ]; then
    echo "🔨 Building packages (this may take a minute)..."
    pnpm run build
else
    echo "✅ Packages already built"
fi

# Start the control plane
echo "🎯 Starting Control Plane..."
cd packages/control-plane
PARALLAX_PATTERNS_DIR="$PWD/../../patterns" pnpm run dev &
CONTROL_PLANE_PID=$!
cd ../..

# Give control plane time to start
echo "⏳ Waiting for Control Plane to start..."
sleep 5

echo ""
echo "✅ Parallax Platform is running!"
echo ""
echo "Services running:"
echo "  - etcd: http://localhost:2379"
echo "  - Control Plane: http://localhost:3000"
echo ""
echo "You can now run in another terminal:"
echo "  - Pattern Demo: pnpm run demo:patterns"
echo "  - Simple Demo: pnpm run demo:simple"
echo "  - Web Dashboard: pnpm run dev:web"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user to stop
wait
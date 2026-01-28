#!/bin/bash

# Start Parallax without Docker - using local etcd

echo "🚀 Starting Parallax Platform (No Docker)..."
echo ""

# Check if etcd is installed
if ! command -v etcd &> /dev/null; then
    echo "📦 etcd is not installed. Installing with Homebrew..."
    if command -v brew &> /dev/null; then
        brew install etcd
    else
        echo "❌ Homebrew not found. Please install etcd manually:"
        echo "   brew install etcd"
        echo "   or download from: https://github.com/etcd-io/etcd/releases"
        exit 1
    fi
fi

# Function to cleanup on exit
cleanup() {
    echo ""
    echo "🛑 Shutting down Parallax..."
    
    # Kill etcd
    pkill etcd 2>/dev/null
    
    # Stop all background processes
    jobs -p | xargs -r kill 2>/dev/null
    
    echo "✅ Cleanup complete"
}

# Set trap to cleanup on exit
trap cleanup EXIT INT TERM

# Start etcd in background
echo "📦 Starting etcd locally..."
etcd > /tmp/etcd.log 2>&1 &
ETCD_PID=$!

# Wait for etcd to be ready
echo "⏳ Waiting for etcd to be ready..."
for i in {1..10}; do
    if curl -s http://localhost:2379/version > /dev/null 2>&1; then
        echo "✅ etcd is ready!"
        break
    fi
    echo "   Attempt $i/10..."
    sleep 1
done

# Start the control plane
echo "🎯 Starting Control Plane..."
cd packages/control-plane
pnpm run dev &
CONTROL_PLANE_PID=$!
cd ../..

# Give control plane time to start
sleep 3

# Start example agent
echo "🤖 Starting example agent..."
cd examples/standalone-agent
pnpm run dev &
AGENT_PID=$!
cd ../..

echo ""
echo "✅ Parallax Platform is running!"
echo ""
echo "Services running:"
echo "  - etcd: http://localhost:2379 (PID: $ETCD_PID)"
echo "  - Control Plane: http://localhost:3000 (PID: $CONTROL_PLANE_PID)"
echo "  - Example Agent: Running (PID: $AGENT_PID)"
echo ""
echo "Logs:"
echo "  - etcd: tail -f /tmp/etcd.log"
echo ""
echo "You can now run demos in another terminal:"
echo "  - Pattern Demo: pnpm run demo:patterns"
echo "  - Simple Demo: pnpm run demo:simple"
echo ""
echo "Press Ctrl+C to stop all services"
echo ""

# Wait for user to stop
wait
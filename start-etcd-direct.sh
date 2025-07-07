#!/bin/bash

# Start etcd directly with Docker (without docker-compose)

echo "🚀 Starting etcd directly with Docker..."

# Check if Docker is working
echo "🔍 Testing Docker..."
if ! docker version > /dev/null 2>&1; then
    echo "❌ Docker is not responding. Try:"
    echo "   1. Restart Docker Desktop"
    echo "   2. Or install etcd locally: brew install etcd"
    exit 1
fi

# Stop any existing etcd container
echo "🧹 Cleaning up old containers..."
docker stop etcd 2>/dev/null
docker rm etcd 2>/dev/null

# Start etcd
echo "📦 Starting etcd..."
docker run -d \
  --name etcd \
  -p 2379:2379 \
  -p 2380:2380 \
  -e ETCD_ADVERTISE_CLIENT_URLS=http://0.0.0.0:2379 \
  -e ETCD_LISTEN_CLIENT_URLS=http://0.0.0.0:2379 \
  quay.io/coreos/etcd:latest \
  /usr/local/bin/etcd \
  --advertise-client-urls http://0.0.0.0:2379 \
  --listen-client-urls http://0.0.0.0:2379

# Check if it started
sleep 3
if curl -s http://localhost:2379/version > /dev/null 2>&1; then
    echo "✅ etcd is running!"
    echo ""
    echo "You can now run:"
    echo "  npm run demo:patterns"
    echo "  npm run dev:control-plane"
else
    echo "❌ etcd failed to start"
    echo "Check logs with: docker logs etcd"
fi
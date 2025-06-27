#!/bin/bash

# Parallax Test Environment Setup Script

set -e

echo "🚀 Setting up Parallax test environment..."

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js 18 or higher."
    exit 1
fi

if ! command -v pnpm &> /dev/null; then
    echo "❌ pnpm is not installed. Installing pnpm..."
    npm install -g pnpm
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker."
    exit 1
fi

echo "✅ Prerequisites check passed"

# Create test environment file
echo "Creating test environment configuration..."
cat > .env.test << EOF
# Test Database Configuration
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=test-token-super-secret
INFLUXDB_ORG=test-org
INFLUXDB_BUCKET=test-bucket

# Test etcd Configuration
ETCD_ENDPOINTS=http://localhost:2379

# Test Security
JWT_SECRET=test-secret-key-min-32-characters-long
CERTIFICATE_PATH=/tmp/test-certs

# Test Services
CONTROL_PLANE_URL=http://localhost:8080
AGENT_PORT_START=50100

# Test Settings
NODE_ENV=test
LOG_LEVEL=error
EOF

echo "✅ Test environment configuration created"

# Create Docker Compose file for test services
echo "Creating test services configuration..."
cat > docker-compose.test.yml << EOF
version: '3.8'

services:
  # Test InfluxDB
  test-influxdb:
    image: influxdb:2.7-alpine
    container_name: parallax-test-influxdb
    ports:
      - "8086:8086"
    environment:
      - DOCKER_INFLUXDB_INIT_MODE=setup
      - DOCKER_INFLUXDB_INIT_USERNAME=test
      - DOCKER_INFLUXDB_INIT_PASSWORD=testpass123
      - DOCKER_INFLUXDB_INIT_ORG=test-org
      - DOCKER_INFLUXDB_INIT_BUCKET=test-bucket
      - DOCKER_INFLUXDB_INIT_ADMIN_TOKEN=test-token-super-secret
    volumes:
      - test-influxdb-data:/var/lib/influxdb2

  # Test etcd
  test-etcd:
    image: quay.io/coreos/etcd:v3.5.11
    container_name: parallax-test-etcd
    ports:
      - "2379:2379"
      - "2380:2380"
    environment:
      - ETCD_NAME=test-etcd
      - ETCD_DATA_DIR=/etcd-data
      - ETCD_ADVERTISE_CLIENT_URLS=http://0.0.0.0:2379
      - ETCD_LISTEN_CLIENT_URLS=http://0.0.0.0:2379
      - ETCD_INITIAL_ADVERTISE_PEER_URLS=http://0.0.0.0:2380
      - ETCD_LISTEN_PEER_URLS=http://0.0.0.0:2380
      - ETCD_INITIAL_CLUSTER=test-etcd=http://0.0.0.0:2380
    volumes:
      - test-etcd-data:/etcd-data

  # Test Redis (for rate limiting)
  test-redis:
    image: redis:7-alpine
    container_name: parallax-test-redis
    ports:
      - "6379:6379"
    volumes:
      - test-redis-data:/data

volumes:
  test-influxdb-data:
  test-etcd-data:
  test-redis-data:
EOF

echo "✅ Test services configuration created"

# Start test services
echo "Starting test services..."
docker-compose -f docker-compose.test.yml up -d

# Wait for services to be ready
echo "Waiting for services to be ready..."
sleep 5

# Check if services are running
echo "Verifying services..."
docker-compose -f docker-compose.test.yml ps

# Create test certificates directory
echo "Creating test certificates directory..."
mkdir -p /tmp/test-certs

# Install dependencies
echo "Installing project dependencies..."
pnpm install

# Create Jest configuration
echo "Creating Jest configuration..."
cat > jest.config.base.js << EOF
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: [
    '**/__tests__/**/*.test.ts',
    '**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/index.ts',
    '!src/**/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFilesAfterEnv: ['<rootDir>/../../test-setup.ts'],
  testTimeout: 30000
};
EOF

# Create test setup file
echo "Creating test setup file..."
cat > test-setup.ts << EOF
// Global test setup
import dotenv from 'dotenv';
import path from 'path';

// Load test environment
dotenv.config({ path: path.resolve(__dirname, '.env.test') });

// Increase test timeout for integration tests
if (process.env.TEST_TYPE === 'integration') {
  jest.setTimeout(60000);
}

// Global test utilities
global.testUtils = {
  delay: (ms: number) => new Promise(resolve => setTimeout(resolve, ms)),
  randomPort: () => Math.floor(Math.random() * 10000) + 50000,
};
EOF

# Create test utilities package
echo "Setting up test utilities..."
mkdir -p packages/test-utils/src
cat > packages/test-utils/package.json << EOF
{
  "name": "@parallax/test-utils",
  "version": "0.1.0",
  "description": "Test utilities for Parallax platform",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "tsc",
    "dev": "tsc --watch"
  },
  "dependencies": {
    "@parallax/common": "workspace:*",
    "@parallax/runtime": "workspace:*",
    "@parallax/auth": "workspace:*",
    "@parallax/tenant": "workspace:*"
  },
  "devDependencies": {
    "@types/node": "^22.14.1",
    "typescript": "^5.7.2"
  }
}
EOF

echo "
✅ Test environment setup complete!

🧪 To run tests:
   - All tests:        pnpm test
   - With coverage:    pnpm test:coverage  
   - Specific package: pnpm --filter @parallax/runtime test
   - Watch mode:       pnpm test:watch

📚 Documentation:
   - Test Plan:      docs/testing/test-plan.md
   - Test Checklist: docs/testing/test-checklist.md
   - Testing Guide:  docs/testing/testing-guide.md

🛑 To stop test services:
   docker-compose -f docker-compose.test.yml down

Happy testing! 🎉
"
# Parallax Platform Testing Guide

This guide covers all testing scenarios for the Parallax platform, from quick validation to comprehensive test coverage.

## Quick Start

### Step 1: Start Infrastructure
```bash
./scripts/start-production-test.sh
```

This starts:
- PostgreSQL with TimescaleDB
- Redis
- etcd
- Prometheus
- Grafana
- Jaeger

### Step 2: Start Control Plane API
In a new terminal:
```bash
pnpm run dev:control-plane
```

Wait for: "Control plane server started on port 8080"

### Step 3: Run Tests
In another terminal:
```bash
./scripts/test-production-system-simple.sh
```

### Step 4: Verify Services

| Service | URL | Expected |
|---------|-----|----------|
| API Health | http://localhost:8080/health | "healthy" |
| Patterns | http://localhost:8080/api/v1/patterns | List of patterns |
| Grafana | http://localhost:3000 | Login page (admin/admin) |
| Jaeger | http://localhost:16686 | Trace search UI |

### Step 5: Run Full Demo
```bash
pnpm run demo:patterns
```

This executes all patterns and populates monitoring dashboards.

---

## Test Commands

```bash
# Run unit tests
pnpm test

# Run integration tests
pnpm test:integration

# Run e2e tests
pnpm test:e2e

# Run performance tests
pnpm test:perf

# Run security tests
pnpm test:security

# Generate test coverage
pnpm test:coverage
```

---

## Test Categories

### 1. Core Runtime Tests

#### 1.1 Agent Management
- [ ] Agent registration and discovery
- [ ] Agent health checks and monitoring
- [ ] Agent capability detection
- [ ] Agent lifecycle management (start/stop/restart)
- [ ] gRPC communication between agents and runtime
- [ ] Agent proxy functionality

#### 1.2 Pattern Execution
- [ ] Pattern loading and validation
- [ ] Epistemic orchestrator pattern execution
- [ ] Consensus builder pattern execution
- [ ] Pattern execution with multiple agents
- [ ] Confidence score calculation and tracking
- [ ] Parallel path exploration for high-confidence disagreements

#### 1.3 Confidence Protocol
- [ ] Confidence scoring accuracy
- [ ] Weighted consensus calculation
- [ ] Threshold-based decision making
- [ ] Confidence history tracking
- [ ] Anomaly detection in confidence patterns

### 2. Security Tests

#### 2.1 mTLS Authentication
- [ ] Certificate generation and validation
- [ ] Mutual TLS handshake between agents and control plane
- [ ] Certificate rotation
- [ ] Certificate revocation handling
- [ ] Secure agent communication channels

#### 2.2 JWT Authentication
- [ ] JWT token generation
- [ ] Token validation and verification
- [ ] Token refresh flow
- [ ] Token expiration handling
- [ ] Token blacklisting/revocation

#### 2.3 OAuth2 Integration
- [ ] OAuth2 provider configuration
- [ ] Authorization flow
- [ ] Token exchange
- [ ] User profile retrieval
- [ ] OAuth2 error handling

#### 2.4 RBAC (Role-Based Access Control)
- [ ] Role creation and management
- [ ] Permission assignment
- [ ] Role hierarchy validation
- [ ] Access control enforcement
- [ ] Default roles functionality

### 3. Data Plane Tests

#### 3.1 Metrics Collection
- [ ] InfluxDB integration
- [ ] Time-series data writing
- [ ] Metrics aggregation
- [ ] Query performance
- [ ] Data retention policies

#### 3.2 Confidence Tracking
- [ ] Real-time confidence monitoring
- [ ] Historical confidence analysis
- [ ] Anomaly detection algorithms
- [ ] Confidence visualization data

### 4. Control Plane Tests

#### 4.1 Service Registry
- [ ] Service registration
- [ ] Service discovery
- [ ] Health status tracking
- [ ] Service metadata management
- [ ] Load balancing configuration

#### 4.2 Pattern Management
- [ ] Pattern CRUD operations
- [ ] Pattern versioning
- [ ] Pattern validation
- [ ] Pattern deployment
- [ ] Pattern rollback

### 5. Telemetry Tests

#### 5.1 OpenTelemetry Integration
- [ ] Trace collection
- [ ] Span propagation
- [ ] Metric collection
- [ ] Log correlation
- [ ] Export to various backends (Jaeger, OTLP)

#### 5.2 Distributed Tracing
- [ ] Cross-service trace correlation
- [ ] Pattern execution tracing
- [ ] Agent communication tracing
- [ ] Performance bottleneck identification

### 6. Multi-Tenancy Tests

#### 6.1 Tenant Isolation
- [ ] Data isolation between tenants
- [ ] Resource isolation
- [ ] Network isolation
- [ ] Configuration isolation

#### 6.2 Tenant Management
- [ ] Tenant creation and deletion
- [ ] Tenant quota management
- [ ] Tenant-specific configurations
- [ ] Cross-tenant security validation

### 7. Kubernetes Integration Tests

#### 7.1 CRD Operations
- [ ] ParallaxAgent CRD functionality
- [ ] ParallaxPattern CRD functionality
- [ ] Custom resource validation
- [ ] Status updates

#### 7.2 Operator Functionality
- [ ] Agent operator reconciliation
- [ ] Pattern operator reconciliation
- [ ] Autoscaling based on confidence metrics
- [ ] Resource management

### 8. Web Dashboard Tests

#### 8.1 UI Functionality
- [ ] Authentication flow
- [ ] Agent status visualization
- [ ] Pattern execution monitoring
- [ ] Metrics dashboard
- [ ] Real-time updates

#### 8.2 API Integration
- [ ] REST API endpoints
- [ ] WebSocket connections
- [ ] Error handling
- [ ] Loading states

### 9. Integration Tests

#### 9.1 End-to-End Workflows
- [ ] Complete agent lifecycle
- [ ] Pattern execution with multiple agents
- [ ] Security flow (auth → RBAC → execution)
- [ ] Multi-tenant agent coordination

#### 9.2 Performance Tests
- [ ] Agent scalability (10, 100, 1000 agents)
- [ ] Pattern execution throughput
- [ ] Message passing latency
- [ ] Database query performance

#### 9.3 Failure Scenarios
- [ ] Agent failure recovery
- [ ] Network partition handling
- [ ] Database failure recovery
- [ ] Control plane failover

### 10. SDK Pre-requisites

Before implementing SDKs, ensure:
- [ ] All core APIs are stable
- [ ] Protocol buffers are finalized
- [ ] Authentication flows are tested
- [ ] Error handling patterns are established
- [ ] Performance baselines are set

---

## Test Environment Setup

### Local Development
```bash
# Start all services
docker-compose up -d

# Run migrations
pnpm migrate

# Seed test data
pnpm seed
```

### Kubernetes Testing
```bash
# Deploy test cluster
kubectl apply -f k8s/test/

# Run k8s tests
pnpm test:k8s
```

---

## Success Criteria

| Test Type | Coverage Target |
|-----------|----------------|
| Unit tests | > 80% |
| Integration tests | > 70% |
| E2E tests | > 60% |
| Performance benchmarks | Met |
| Security audit | Passed |
| Critical bugs | None |

---

## Stopping Services

```bash
cd packages/control-plane
docker-compose -f docker-compose.prod.yml down
```

---

## Troubleshooting

### Services Won't Start
```bash
# Check what's running
docker ps

# Check logs
docker logs parallax-postgres
docker logs parallax-redis
docker logs parallax-etcd

# Reset everything
docker-compose -f docker-compose.prod.yml down -v
./scripts/start-production-test.sh
```

### API Won't Connect to Database
1. Check .env file exists in packages/control-plane/
2. Verify DATABASE_URL matches the docker service
3. Check migrations: `pnpm --filter @parallax/control-plane run prisma:migrate`

### Monitoring Shows No Data
1. Make sure API is running with metrics enabled
2. Execute some patterns to generate data
3. Check Prometheus targets: http://localhost:9090/targets

---

## Pro Tips

Keep all three terminals open during testing:
1. **Infrastructure logs**: `docker-compose -f docker-compose.prod.yml logs -f`
2. **API logs**: The terminal running `pnpm run dev:control-plane`
3. **Test terminal**: For running tests and demos

---

## Hands-On Testing Commands

### Verify Core Infrastructure

#### Database Connectivity
```bash
# Test PostgreSQL connection
docker exec -it parallax-postgres psql -U parallax -d parallax -c "SELECT version();"

# Verify TimescaleDB extension
docker exec -it parallax-postgres psql -U parallax -d parallax -c "SELECT default_version FROM pg_extension WHERE extname = 'timescaledb';"

# Check database schema
docker exec -it parallax-postgres psql -U parallax -d parallax -c "\dt"
```

#### Service Discovery (etcd)
```bash
# Check etcd health
curl http://localhost:2379/health

# List registered services
docker exec -it parallax-etcd etcdctl get /parallax --prefix
```

#### Redis Cache
```bash
# Test Redis connection
docker exec -it parallax-redis redis-cli ping

# Check Redis info
docker exec -it parallax-redis redis-cli info server
```

### Test Control Plane API

#### Health Checks
```bash
curl http://localhost:8080/health
curl http://localhost:8080/health/ready
curl http://localhost:8080/health/live
```

#### Pattern Execution
```bash
# Execute a pattern
curl -X POST http://localhost:8080/api/executions \
  -H "Content-Type: application/json" \
  -d '{
    "patternName": "SimpleConsensus",
    "input": {
      "task": "Analyze this test request",
      "data": "Test data for consensus analysis"
    }
  }'

# Get execution status
curl http://localhost:8080/api/v1/executions/{execution-id}
```

#### WebSocket Streaming
```bash
npm install -g wscat
wscat -c ws://localhost:8080/ws
# Once connected: {"type": "execute", "pattern": "SimpleConsensus", "input": {"task": "Stream test"}}
```

### Load Testing

```bash
# Install k6
brew install k6

# Create load test script
cat > load-test.js << 'EOF'
import http from 'k6/http';
import { check } from 'k6';

export let options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 50 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.1'],
  },
};

export default function() {
  let payload = JSON.stringify({
    pattern: 'SimpleConsensus',
    input: { task: 'Load test task' }
  });
  let res = http.post('http://localhost:8080/api/v1/executions', payload, {
    headers: { 'Content-Type': 'application/json' },
  });
  check(res, {
    'status is 200': (r) => r.status === 200,
  });
}
EOF

# Run load test
k6 run load-test.js
```

### Test High Availability

```bash
# Stop and restart control plane
docker stop parallax-control-plane
docker start parallax-control-plane
sleep 10
curl http://localhost:8080/health

# Simulate database connection loss
docker pause parallax-postgres
curl http://localhost:8080/api/v1/patterns  # Should fail gracefully
docker unpause parallax-postgres
curl http://localhost:8080/api/v1/patterns  # Should recover
```

### Database Query Performance

```bash
docker exec -it parallax-postgres psql -U parallax -d parallax -c "
EXPLAIN ANALYZE
SELECT * FROM executions
WHERE pattern_name = 'SimpleConsensus'
AND started_at > NOW() - INTERVAL '1 hour'
ORDER BY started_at DESC
LIMIT 100;"
```

### Debug Commands

```bash
# View all container logs
docker-compose logs -f

# Check container resource usage
docker stats

# Inspect specific container
docker inspect parallax-control-plane

# Database connection test
docker exec -it parallax-postgres pg_isready -U parallax

# Network connectivity
docker network inspect parallax_default
```

---

## Next Steps After Testing

1. Finalize API contracts
2. Document all endpoints and behaviors
3. Create SDK implementation guide
4. Begin SDK development (TypeScript → Go → Rust → Python)

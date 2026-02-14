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

### 1. Agent Runtime Tests

#### 1.1 Runtime Interface
- [ ] Runtime provider selection works (`local`, `docker`, `kubernetes`)
- [ ] Runtime initialization succeeds
- [ ] Runtime shutdown cleans up resources
- [ ] Runtime health check returns accurate status
- [ ] Multiple runtimes can be configured (not simultaneous)

#### 1.2 Runtime: Local Provider
```bash
# Test local runtime
pnpm test --filter @parallax/runtime-local
```
- [ ] Agent process spawning works
- [ ] Agent process receives environment variables
- [ ] Agent stdout/stderr captured
- [ ] Agent process cleanup on stop
- [ ] Agent process cleanup on control plane shutdown
- [ ] Orphan process detection and cleanup
- [ ] Max concurrent agent limit enforced
- [ ] Agent working directory created
- [ ] Agent working directory cleaned up

#### 1.3 Runtime: Docker Provider
```bash
# Test docker runtime
pnpm test --filter @parallax/runtime-docker

# Manual verification
docker ps | grep parallax-agent
```
- [ ] Docker daemon connection works
- [ ] Agent container creation works
- [ ] Agent container starts successfully
- [ ] Agent container receives environment variables
- [ ] Agent container logs accessible
- [ ] Agent container stop works (graceful)
- [ ] Agent container stop works (force)
- [ ] Agent container cleanup on control plane shutdown
- [ ] Orphan container detection and cleanup
- [ ] Container resource limits applied
- [ ] Container network connectivity
- [ ] Volume mounts work for workspaces
- [ ] Custom agent images work

#### 1.4 Runtime: Kubernetes Provider
```bash
# Test k8s runtime (requires cluster)
pnpm test --filter @parallax/runtime-k8s

# Manual verification
kubectl get parallaxagents -n parallax-agents
kubectl get pods -n parallax-agents
```
- [ ] Kubernetes cluster connection works
- [ ] ParallaxAgent CRD can be created
- [ ] Agent pod is created from CRD
- [ ] Agent pod receives environment variables
- [ ] Agent pod logs accessible
- [ ] Agent CRD deletion cleans up pod
- [ ] Agent pod status syncs to CRD status
- [ ] Agent endpoint discovery works
- [ ] RBAC permissions sufficient
- [ ] Namespace isolation works
- [ ] Resource requests/limits applied
- [ ] Pod security context applied

#### 1.5 Agent Management (All Runtimes)
- [ ] Agent registration and discovery
- [ ] Agent health checks and monitoring
- [ ] Agent capability detection
- [ ] Agent lifecycle management (start/stop/restart)
- [ ] gRPC communication between agents and runtime
- [ ] Agent proxy functionality
- [ ] Agent reconnection after network issues
- [ ] Agent timeout and cleanup

#### 1.6 Pattern Execution
- [ ] Pattern loading and validation
- [ ] Epistemic orchestrator pattern execution
- [ ] Consensus builder pattern execution
- [ ] Pattern execution with multiple agents
- [ ] Confidence score calculation and tracking
- [ ] Parallel path exploration for high-confidence disagreements

#### 1.8 Confidence Protocol
- [ ] Confidence scoring accuracy
- [ ] Weighted consensus calculation
- [ ] Threshold-based decision making
- [ ] Confidence history tracking
- [ ] Anomaly detection in confidence patterns

---

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

### 10. Workspace Service Tests

#### 10.1 Git Operations
```bash
# Test workspace service
pnpm test --filter @parallax/control-plane -- --testPathPattern=workspace
```
- [ ] Repository cloning (HTTPS)
- [ ] Repository cloning (SSH)
- [ ] Repository cloning (private repos)
- [ ] Branch creation from default branch
- [ ] Branch creation from specific commit
- [ ] File read operations
- [ ] File write operations
- [ ] Commit creation
- [ ] Push to remote
- [ ] Pull/fetch updates
- [ ] Merge operations
- [ ] Conflict detection

#### 10.2 Workspace Isolation
- [ ] Each agent gets isolated workspace
- [ ] Workspaces don't interfere with each other
- [ ] Workspace cleanup after agent termination
- [ ] Workspace persistence across agent restarts (if configured)
- [ ] Large repository handling (> 1GB)
- [ ] Shallow clone support

#### 10.3 GitHub App Integration
```bash
# Test GitHub integration (requires GitHub App setup)
curl -X POST http://localhost:8080/api/webhooks/github \
  -H "Content-Type: application/json" \
  -H "X-GitHub-Event: ping" \
  -d '{"zen": "test"}'
```
- [ ] Webhook endpoint accessible
- [ ] Webhook signature validation
- [ ] Push event handling
- [ ] Pull request event handling
- [ ] Installation token generation
- [ ] Token refresh on expiration
- [ ] Repository access via installation token

---

### 11. SDK Tests

#### 11.1 TypeScript SDK
```bash
# Run TypeScript SDK tests
pnpm test --filter @parallax/sdk-typescript

# Integration test with control plane
cd apps/demo-typescript && pnpm test
```
- [ ] SDK installation works (`npm install @parallax/sdk-typescript`)
- [ ] gRPC channel creation
- [ ] Agent registration
- [ ] Agent heartbeat
- [ ] Send message to control plane
- [ ] Receive message from control plane
- [ ] Report confidence score
- [ ] Handle disconnection gracefully
- [ ] Automatic reconnection
- [ ] TypeScript types are correct

#### 11.2 Python SDK
```bash
# Run Python SDK tests
cd packages/sdk-python && poetry run pytest

# Integration test
cd apps/demo-python && poetry run pytest
```
- [ ] SDK installation works (`pip install parallax-sdk`)
- [ ] gRPC channel creation
- [ ] Agent registration
- [ ] Agent heartbeat
- [ ] Send/receive messages
- [ ] Confidence reporting
- [ ] Async support (asyncio)
- [ ] Error handling

#### 11.3 Go SDK
```bash
# Run Go SDK tests
cd packages/sdk-go && go test ./...

# Integration test
cd apps/demo-go && go test ./...
```
- [ ] SDK installation works (`go get github.com/HaruHunab1320/parallax/sdk-go`)
- [ ] gRPC channel creation
- [ ] Agent registration
- [ ] Agent heartbeat
- [ ] Send/receive messages
- [ ] Confidence reporting
- [ ] Context cancellation support
- [ ] Error handling

#### 11.4 Rust SDK
```bash
# Run Rust SDK tests
cd packages/sdk-rust && cargo test

# Integration test
cd apps/demo-rust && cargo test
```
- [ ] SDK builds (`cargo build`)
- [ ] gRPC channel creation
- [ ] Agent registration
- [ ] Agent heartbeat
- [ ] Send/receive messages
- [ ] Confidence reporting
- [ ] Async support (tokio)
- [ ] Error handling

#### 11.5 Cross-SDK Compatibility
- [ ] TypeScript agent can communicate with Python agent
- [ ] Go agent can communicate with Rust agent
- [ ] All SDKs produce compatible confidence scores
- [ ] All SDKs handle same message formats

---

### 12. CLI Tests

```bash
# Run CLI tests
pnpm test --filter @parallax/cli
```

#### 12.1 Authentication
- [ ] `parallax login` prompts for credentials
- [ ] `parallax login --token <token>` works
- [ ] `parallax logout` clears credentials
- [ ] `parallax whoami` shows current user

#### 12.2 Agent Commands
- [ ] `parallax agent list` shows all agents
- [ ] `parallax agent list --status running` filters by status
- [ ] `parallax agent status <id>` shows agent details
- [ ] `parallax agent logs <id>` streams logs
- [ ] `parallax agent stop <id>` stops agent

#### 12.3 Pattern Commands
- [ ] `parallax pattern list` shows all patterns
- [ ] `parallax pattern show <name>` shows pattern details
- [ ] `parallax pattern validate <file>` validates pattern file
- [ ] `parallax pattern execute <name>` executes pattern
- [ ] `parallax pattern execute <name> --input '{"key":"value"}'` with input

#### 12.4 Execution Commands
- [ ] `parallax execution list` shows executions
- [ ] `parallax execution status <id>` shows execution details
- [ ] `parallax execution logs <id>` shows execution logs
- [ ] `parallax execution cancel <id>` cancels execution

#### 12.5 Configuration
- [ ] `parallax config set endpoint <url>` sets control plane URL
- [ ] `parallax config get endpoint` shows current endpoint
- [ ] Config persists across CLI invocations
- [ ] Environment variables override config file

---

### 13. Pattern Builder Tests

```bash
# Run pattern builder tests
pnpm test --filter @parallax/pattern-builder
```

#### 13.1 Visual Editor
- [ ] Canvas renders correctly
- [ ] Nodes can be added
- [ ] Nodes can be connected
- [ ] Nodes can be deleted
- [ ] Connections can be deleted
- [ ] Undo/redo works
- [ ] Zoom and pan works
- [ ] Node properties can be edited

#### 13.2 Pattern Export
- [ ] Export to YAML produces valid pattern
- [ ] Export to JSON produces valid pattern
- [ ] Exported patterns can be executed
- [ ] Round-trip (export then import) preserves structure

#### 13.3 Pattern Import
- [ ] Import YAML pattern works
- [ ] Import JSON pattern works
- [ ] Invalid patterns show error message
- [ ] Large patterns render correctly

#### 13.4 Pattern Validation
- [ ] Missing required fields detected
- [ ] Invalid connections detected
- [ ] Circular dependencies detected
- [ ] Validation errors shown in UI

---

### 14. End-to-End Workflow Tests

#### 14.1 Complete Agent Lifecycle
```bash
# Full lifecycle test
./scripts/test-agent-lifecycle.sh
```
1. [ ] Start control plane
2. [ ] Register agent via SDK
3. [ ] Agent appears in `parallax agent list`
4. [ ] Send message to agent
5. [ ] Agent receives and responds
6. [ ] Agent reports confidence
7. [ ] Confidence visible in metrics
8. [ ] Stop agent
9. [ ] Agent removed from registry
10. [ ] Cleanup verified

#### 14.2 Complete Pattern Execution
```bash
# Full pattern execution test
./scripts/test-pattern-execution.sh
```
1. [ ] Create pattern via API/CLI
2. [ ] Pattern appears in list
3. [ ] Execute pattern
4. [ ] Agents spawned automatically
5. [ ] Agents communicate
6. [ ] Consensus reached
7. [ ] Result returned
8. [ ] Execution recorded in history
9. [ ] Metrics captured
10. [ ] Agents cleaned up

#### 14.3 Git Workflow Integration
```bash
# Full git workflow test
./scripts/test-git-workflow.sh
```
1. [ ] Clone repository
2. [ ] Create feature branch
3. [ ] Agent makes code changes
4. [ ] Agent commits changes
5. [ ] Agent pushes branch
6. [ ] (Optional) Create pull request
7. [ ] Workspace cleaned up

---

### 15. Performance Tests

#### 15.1 Agent Scalability
```bash
# Scale test
./scripts/test-agent-scale.sh
```
- [ ] 10 concurrent agents: < 1s spawn time
- [ ] 50 concurrent agents: < 5s spawn time
- [ ] 100 concurrent agents: < 10s spawn time
- [ ] Memory usage scales linearly
- [ ] No agent starvation under load

#### 15.2 Runtime Performance
| Runtime | Spawn Time | Memory/Agent | Cleanup Time |
|---------|-----------|--------------|--------------|
| Local | < 100ms | < 100MB | < 50ms |
| Docker | < 2s | < 200MB | < 1s |
| Kubernetes | < 10s | < 200MB | < 5s |

---

### 16. SDK Pre-requisites

Before releasing SDKs, ensure:
- [ ] All core APIs are stable
- [ ] Protocol buffers are finalized
- [ ] Authentication flows are tested
- [ ] Error handling patterns are established
- [ ] Performance baselines are set
- [ ] All four SDKs pass integration tests
- [ ] Cross-SDK compatibility verified

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

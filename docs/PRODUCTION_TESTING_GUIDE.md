# Production System Testing Guide

This guide provides comprehensive instructions to test all Parallax systems in a production-like environment locally. Follow these steps to verify that every component is fully functional and ready for deployment.

## Prerequisites

Ensure you have:
- Docker and Docker Compose installed
- Kubernetes cluster (minikube, kind, or Docker Desktop)
- kubectl and helm installed
- At least 8GB RAM available
- Ports 2379, 3000, 5432, 6379, 8080, 9090, 16686 available

## 1. Start Full Production Stack

### Option A: Docker Compose (Recommended for Testing)

```bash
# Start the complete production stack
pnpm run dev:prod

# This starts:
# - PostgreSQL with TimescaleDB
# - Redis for caching
# - etcd for service discovery
# - Control Plane API
# - Prometheus, Grafana, Jaeger
# - All required infrastructure
```

### Option B: Kubernetes Deployment

```bash
# Create namespace
kubectl create namespace parallax

# Install with production values
helm install parallax ./k8s/helm/parallax \
  -n parallax \
  -f ./k8s/helm/parallax/values-prod.yaml

# Wait for all pods to be ready
kubectl wait --for=condition=ready pod -l app=parallax -n parallax --timeout=300s
```

## 2. Verify Core Infrastructure

### 2.1 Database Connectivity

```bash
# Test PostgreSQL connection
docker exec -it parallax-postgres psql -U parallax -d parallax -c "SELECT version();"

# Verify TimescaleDB extension
docker exec -it parallax-postgres psql -U parallax -d parallax -c "SELECT default_version FROM pg_extension WHERE extname = 'timescaledb';"

# Check database schema
docker exec -it parallax-postgres psql -U parallax -d parallax -c "\dt"
```

Expected: You should see PostgreSQL version, TimescaleDB version, and tables including patterns, agents, executions, etc.

### 2.2 Service Discovery (etcd)

```bash
# Check etcd health
curl http://localhost:2379/health

# List registered services
docker exec -it parallax-etcd etcdctl get /parallax --prefix
```

Expected: {"health":"true"} and list of registered services

### 2.3 Redis Cache

```bash
# Test Redis connection
docker exec -it parallax-redis redis-cli ping

# Check Redis info
docker exec -it parallax-redis redis-cli info server
```

Expected: "PONG" response and Redis server information

## 3. Test Control Plane API

### 3.1 Health Checks

```bash
# API health
curl http://localhost:8080/health

# Detailed health with dependencies
curl http://localhost:8080/health/ready

# Liveness check
curl http://localhost:8080/health/live
```

Expected: All should return 200 OK with healthy status

### 3.2 Pattern Management

```bash
# List patterns
curl http://localhost:8080/api/v1/patterns

# Get specific pattern
curl http://localhost:8080/api/v1/patterns/ConsensusBuilder

# Upload new pattern (create test pattern first)
echo '/**
 * @name TestPattern
 * @version 1.0.0
 * @description Test pattern for verification
 */
 
let result = uncertain {
  confidence: 0.8,
  value: "test successful"
};

return result;' > test-pattern.prism

curl -X POST http://localhost:8080/api/v1/patterns \
  -F "file=@test-pattern.prism"
```

Expected: Pattern list, pattern details, and successful upload

### 3.3 Agent Management

```bash
# List agents
curl http://localhost:8080/api/v1/agents

# Get agent details
curl http://localhost:8080/api/v1/agents/{agent-id}

# Check agent health
curl http://localhost:8080/api/v1/agents/{agent-id}/health
```

Expected: List of registered agents with their capabilities and health status

### 3.4 Pattern Execution

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

# List execution history
curl http://localhost:8080/api/v1/executions
```

Expected: Successful execution with confidence scores and results

### 3.5 WebSocket Streaming

```bash
# Test WebSocket connection (requires wscat)
npm install -g wscat
wscat -c ws://localhost:8080/ws

# Once connected, send:
{"type": "execute", "pattern": "SimpleConsensus", "input": {"task": "Stream test"}}
```

Expected: Real-time execution updates via WebSocket

## 4. Test Monitoring Stack

### 4.1 Grafana Dashboards

1. Open http://localhost:3000 (admin/admin)
2. Navigate to Dashboards
3. Check each dashboard:
   - **System Overview**: Should show agent count, pattern executions, system metrics
   - **Pattern Execution**: Execution times, confidence scores, success rates
   - **Agent Performance**: Individual agent metrics, response times
   - **Confidence Analytics**: Confidence trends, calibration metrics

Expected: All dashboards populated with real-time data

### 4.2 Prometheus Metrics

```bash
# Check Prometheus targets
curl http://localhost:9090/api/v1/targets

# Query pattern metrics
curl http://localhost:9090/api/v1/query?query=parallax_pattern_executions_total

# Query agent metrics
curl http://localhost:9090/api/v1/query?query=parallax_active_agents
```

Expected: All targets UP, metrics returning data

### 4.3 Distributed Tracing (Jaeger)

1. Open http://localhost:16686
2. Select "parallax-control-plane" service
3. Click "Find Traces"
4. Open a trace to see the execution flow

Expected: Traces showing pattern execution flow through the system

## 5. Load Testing

### 5.1 Basic Load Test

```bash
# Install k6 for load testing
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
    http_req_duration: ['p(95)<500'], // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],   // Error rate under 10%
  },
};

export default function() {
  let payload = JSON.stringify({
    pattern: 'SimpleConsensus',
    input: { task: 'Load test task' }
  });

  let params = {
    headers: { 'Content-Type': 'application/json' },
  };

  let res = http.post('http://localhost:8080/api/v1/executions', payload, params);
  
  check(res, {
    'status is 200': (r) => r.status === 200,
    'execution completed': (r) => JSON.parse(r.body).status === 'completed',
  });
}
EOF

# Run load test
k6 run load-test.js
```

Expected: 95% of requests under 500ms, less than 10% error rate

### 5.2 Concurrent Pattern Execution

```bash
# Test concurrent execution of different patterns
for pattern in SimpleConsensus ConsensusBuilder LoadBalancer; do
  for i in {1..10}; do
    curl -X POST http://localhost:8080/api/v1/executions \
      -H "Content-Type: application/json" \
      -d "{\"pattern\": \"$pattern\", \"input\": {\"task\": \"Concurrent test $i\"}}" &
  done
done

# Wait for all to complete
wait

# Check execution history
curl http://localhost:8080/api/v1/executions?limit=30
```

Expected: All executions complete successfully

## 6. Test Data Persistence

### 6.1 Execution History

```bash
# Query execution history from database
docker exec -it parallax-postgres psql -U parallax -d parallax -c "
SELECT 
  pattern_name, 
  status, 
  started_at, 
  completed_at,
  confidence_score
FROM executions 
ORDER BY started_at DESC 
LIMIT 10;"
```

Expected: Recent executions with timestamps and confidence scores

### 6.2 Time-Series Data

```bash
# Check time-series optimization
docker exec -it parallax-postgres psql -U parallax -d parallax -c "
SELECT 
  time_bucket('1 minute', started_at) as minute,
  pattern_name,
  COUNT(*) as executions,
  AVG(confidence_score) as avg_confidence
FROM executions
WHERE started_at > NOW() - INTERVAL '10 minutes'
GROUP BY minute, pattern_name
ORDER BY minute DESC;"
```

Expected: Aggregated metrics by time bucket

## 7. Test High Availability

### 7.1 Service Restart

```bash
# Stop control plane
docker stop parallax-control-plane

# Verify other services still healthy
curl http://localhost:3000  # Grafana should work
curl http://localhost:9090  # Prometheus should work

# Restart control plane
docker start parallax-control-plane

# Test API recovery
sleep 10
curl http://localhost:8080/health
```

Expected: Monitoring continues during outage, API recovers automatically

### 7.2 Database Connection Recovery

```bash
# Simulate database connection loss
docker pause parallax-postgres

# Try API call (should fail gracefully)
curl http://localhost:8080/api/v1/patterns

# Restore database
docker unpause parallax-postgres

# Verify automatic recovery
sleep 5
curl http://localhost:8080/api/v1/patterns
```

Expected: Graceful error during outage, automatic recovery

## 8. Security Testing

### 8.1 API Authentication (if enabled)

```bash
# Test unauthorized access
curl -I http://localhost:8080/api/v1/patterns

# Test with invalid token
curl -H "Authorization: Bearer invalid-token" \
  http://localhost:8080/api/v1/patterns
```

### 8.2 Input Validation

```bash
# Test SQL injection attempt
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "SimpleConsensus",
    "input": {
      "task": "Test'; DROP TABLE executions; --"
    }
  }'

# Test XSS attempt
curl -X POST http://localhost:8080/api/v1/executions \
  -H "Content-Type: application/json" \
  -d '{
    "pattern": "SimpleConsensus",
    "input": {
      "task": "<script>alert(\"xss\")</script>"
    }
  }'
```

Expected: Inputs properly sanitized, no security vulnerabilities

## 9. Performance Benchmarks

### 9.1 Response Time Testing

```bash
# Test pattern execution latency
for i in {1..100}; do
  time curl -s -X POST http://localhost:8080/api/v1/executions \
    -H "Content-Type: application/json" \
    -d '{"pattern": "SimpleConsensus", "input": {"task": "Perf test"}}' \
    -o /dev/null
done
```

Expected: Average response time under 100ms

### 9.2 Database Query Performance

```bash
# Test query performance
docker exec -it parallax-postgres psql -U parallax -d parallax -c "
EXPLAIN ANALYZE
SELECT * FROM executions 
WHERE pattern_name = 'SimpleConsensus' 
AND started_at > NOW() - INTERVAL '1 hour'
ORDER BY started_at DESC
LIMIT 100;"
```

Expected: Query execution under 10ms with proper index usage

## 10. Full System Integration Test

Run the complete demo to test all components working together:

```bash
# Run comprehensive pattern demo
pnpm run demo:patterns

# Expected output:
# - All patterns load successfully
# - Agents register properly
# - All pattern executions complete
# - Confidence scores calculated
# - Results persisted to database
# - Metrics visible in Grafana
# - Traces visible in Jaeger
```

## Production Readiness Checklist

After completing all tests, verify:

- [ ] All health endpoints return healthy
- [ ] Database connections stable
- [ ] Redis caching functional
- [ ] Pattern execution working
- [ ] WebSocket streaming operational
- [ ] All Grafana dashboards populated
- [ ] Prometheus collecting all metrics
- [ ] Jaeger showing distributed traces
- [ ] Load tests pass performance thresholds
- [ ] Data persistence verified
- [ ] High availability tested
- [ ] Security measures in place
- [ ] Error handling graceful
- [ ] Logs aggregated and searchable
- [ ] Resource usage acceptable

## Troubleshooting

### Common Issues

1. **Port conflicts**: Check `lsof -i :PORT` and stop conflicting services
2. **Memory issues**: Increase Docker memory limit in Docker Desktop settings
3. **Database connection**: Verify PostgreSQL is running and credentials are correct
4. **etcd not responding**: Ensure etcd container is healthy
5. **Metrics missing**: Check Prometheus targets and scrape configuration

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

## Next Steps

Once all tests pass:

1. Document any issues found
2. Create performance baseline metrics
3. Set up alerting rules based on observed thresholds
4. Plan production deployment strategy
5. Configure backup and disaster recovery procedures

---

*This guide ensures your Parallax deployment is production-ready with all systems verified and operational.*
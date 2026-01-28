# Production Readiness Checklist

This comprehensive checklist covers everything needed to deploy Parallax to production.

## Quick Start Test

```bash
# Run automated production test suite
./scripts/test-production-system.sh

# Or start full production stack manually
pnpm run dev:prod
```

## What's Verified by Tests

### Core Functionality
- [x] All services start and communicate correctly
- [x] Pattern execution engine works
- [x] Database persistence functional
- [x] Monitoring and observability active
- [x] API endpoints responding
- [x] Performance meets baseline (200ms avg execution)

### Infrastructure
- [x] Docker containers build and run
- [x] Database migrations work
- [x] Service discovery operational
- [x] Metrics collection functioning

---

## Core Systems Checklist

### Database
- [ ] PostgreSQL running and accessible
- [ ] TimescaleDB extension installed
- [ ] Database migrations applied
- [ ] Connection pooling configured
- [ ] Backup strategy defined
- [ ] Production PostgreSQL instance provisioned
- [ ] Replication/HA setup configured

### Cache
- [ ] Redis running and accessible
- [ ] Cache eviction policies set
- [ ] Memory limits configured
- [ ] Persistence configured (if needed)

### Service Discovery
- [ ] etcd cluster healthy
- [ ] Services registering correctly
- [ ] Health checks working
- [ ] Failure detection configured

---

## Control Plane API

### Endpoints
- [ ] GET `/health` returns 200
- [ ] GET `/health/ready` shows all deps healthy
- [ ] GET `/health/live` returns 200
- [ ] GET `/api/v1/patterns` lists patterns
- [ ] POST `/api/v1/executions` executes patterns
- [ ] WebSocket `/ws` accepts connections

### Performance
- [ ] Response time < 100ms (p95)
- [ ] Can handle 100+ concurrent requests
- [ ] Memory usage stable under load
- [ ] No memory leaks after 1hr run

---

## Security Hardening

### Credentials (Critical)
- [ ] **Change default credentials**
  - PostgreSQL password (default: parallax123)
  - Grafana admin password (default: admin/admin)
  - JWT secret (default: development-secret-key)

### API Security
- [ ] Input validation working
- [ ] SQL injection protection verified
- [ ] XSS protection verified
- [ ] Rate limiting configured
- [ ] CORS configured properly

### TLS/HTTPS
- [ ] API endpoints use TLS
- [ ] Database connections encrypted
- [ ] Inter-service communication secured

### Network Security
- [ ] Firewall rules configured
- [ ] VPC/network isolation
- [ ] Unnecessary ports closed

### Secrets Management
- [ ] Use vault/secret manager
- [ ] Credentials rotated regularly
- [ ] Sensitive data encrypted at rest

### Infrastructure Security
- [ ] etcd authentication configured
- [ ] Agent runtime isolates sessions (PTY or container)
- [ ] MCP API keys stored per agent and rotated
- [ ] Web terminal access gated by auth + audit logging

---

## Monitoring & Observability

### Metrics (Prometheus)
- [ ] All targets UP at http://localhost:9090/targets
- [ ] Pattern execution metrics collected
- [ ] Agent performance metrics collected
- [ ] System resource metrics collected
- [ ] Custom business metrics working

### Dashboards (Grafana)
- [ ] Login works at http://localhost:3000
- [ ] System Overview dashboard has data
- [ ] Pattern Execution dashboard has data
- [ ] Agent Performance dashboard has data
- [ ] Confidence Analytics dashboard has data

### Tracing (Jaeger)
- [ ] UI accessible at http://localhost:16686
- [ ] Traces visible for pattern executions
- [ ] Span details include all operations
- [ ] No missing spans or errors

### Alerts
- [ ] High failure rate alert configured
- [ ] Low agent availability alert configured
- [ ] Database connection alert configured
- [ ] High latency alert configured
- [ ] PagerDuty/on-call integration (production)
- [ ] SLA monitoring configured

### Logging
- [ ] Structured logging configured
- [ ] Log levels appropriate
- [ ] Centralized log aggregation
- [ ] Log retention policies set
- [ ] Security audit logs enabled
- [ ] Error tracking (Sentry, etc.)

---

## High Availability & Scale

### Resilience
- [ ] Service auto-restarts on failure
- [ ] Database connection recovery works
- [ ] Circuit breakers functioning
- [ ] Graceful degradation tested

### Scalability
- [ ] Horizontal scaling tested
- [ ] Load balancing configured
- [ ] Session affinity handled
- [ ] Stateless design verified
- [ ] Auto-scaling configured

### Load Balancing
- [ ] Multiple API instances
- [ ] Health-based routing
- [ ] SSL termination

---

## Data Management

### Persistence
- [ ] Execution history saved correctly
- [ ] Pattern versions tracked
- [ ] Agent registrations persisted
- [ ] Time-series data optimized

### Backup & Recovery
- [ ] Database backup automated
- [ ] Point-in-time recovery tested
- [ ] Configuration backed up
- [ ] Disaster recovery plan documented
- [ ] Recovery time objectives (RTO) defined

---

## Operational Readiness

### Container Registry
- [ ] Images pushed to private registry
- [ ] Tagged with version numbers
- [ ] Vulnerability scanning enabled

### Kubernetes/Cloud Setup
- [ ] Production cluster configured
- [ ] Resource limits set
- [ ] Health checks and probes configured

### Documentation
- [ ] API documentation complete
- [ ] Runbooks created
- [ ] Architecture diagrams updated
- [ ] Team trained on operations

### Change Management
- [ ] Deployment procedures documented
- [ ] Rollback plans tested
- [ ] Blue-green deployment configured
- [ ] Feature flags implemented

---

## Compliance & Governance

- [ ] GDPR/privacy compliance
- [ ] Security audit completed
- [ ] Penetration testing done
- [ ] Vulnerability assessment completed

---

## Performance Benchmarks

Run these tests to establish baselines:

```bash
# Load test with k6
k6 run load-test.js

# Database performance
docker exec -it parallax-postgres pgbench -U parallax -d parallax -c 10 -j 2 -T 60

# Memory profiling
docker stats --no-stream
```

**Expected Results:**
| Metric | Target |
|--------|--------|
| API latency (p50) | < 50ms |
| API latency (p95) | < 100ms |
| API latency (p99) | < 500ms |
| Throughput | > 1000 executions/minute |
| Error rate | < 0.1% |
| Memory per service | < 1GB |
| CPU under normal load | < 50% |

---

## Deployment Phases

### Phase 1: Staging Environment
1. Deploy to staging with production configs
2. Run full test suite
3. Performance testing
4. Security scanning

### Phase 2: Production Pilot
1. Deploy to production with limited traffic
2. Monitor all metrics closely
3. Gradual traffic increase
4. Full cutover after stability confirmed

### Phase 3: Full Production
1. Enable all production features
2. Scale to meet demand
3. Continuous monitoring
4. Regular updates and patches

---

## Production Configuration Examples

### Environment Variables
```bash
# Production .env
NODE_ENV=production
DATABASE_URL=postgresql://user:SECURE_PASSWORD@prod-db:5432/parallax?sslmode=require
JWT_SECRET=<generate-with-openssl-rand-base64-32>
REDIS_URL=redis://:SECURE_REDIS_PASSWORD@prod-redis:6379/0
LOG_LEVEL=info
ENABLE_METRICS=true
ENABLE_TRACING=true
```

### Kubernetes Resources
```yaml
resources:
  requests:
    memory: "512Mi"
    cpu: "500m"
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

### Database Optimizations
```sql
ALTER SYSTEM SET max_connections = 200;
ALTER SYSTEM SET shared_buffers = '256MB';
ALTER SYSTEM SET effective_cache_size = '1GB';
```

---

## Troubleshooting

### Services Not Starting
```bash
# Check logs
docker-compose logs -f

# Verify network
docker network ls

# Check resources
docker system df
```

### Poor Performance
```bash
# Check database indexes
docker exec -it parallax-postgres psql -U parallax -d parallax -c "\di"

# Monitor connections
docker exec -it parallax-postgres psql -U parallax -d parallax -c "SELECT count(*) FROM pg_stat_activity;"

# Check cache hit rate
docker exec -it parallax-redis redis-cli info stats | grep keyspace
```

### Monitoring Gaps
```bash
# Verify Prometheus scraping
curl http://localhost:9090/api/v1/targets

# Check Grafana data sources
curl -u admin:admin http://localhost:3000/api/datasources

# Test metric endpoint
curl http://localhost:8080/metrics
```

---

## Final Sign-off

Before deploying to production, ensure:

- [ ] All automated tests pass
- [ ] Manual testing completed
- [ ] Performance benchmarks met
- [ ] Security scan completed
- [ ] Team review conducted
- [ ] Rollback plan prepared

**Approved by:** ___________________ **Date:** ___________________

---

*Use this checklist for every production deployment to ensure consistency and reliability.*

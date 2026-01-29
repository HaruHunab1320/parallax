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

## Agent Runtimes

The control plane supports multiple agent runtime providers. Configure based on your deployment model.

### Runtime Selection
- [ ] Runtime provider configured (`PARALLAX_RUNTIME`: local | docker | kubernetes)
- [ ] Runtime-specific dependencies available
- [ ] Runtime health check endpoint responding

### Runtime: Local (Development/Single-Node)
- [ ] Node.js available for spawning agent processes
- [ ] Agent working directories configured
- [ ] Process cleanup on shutdown verified
- [ ] Resource limits configured (max concurrent agents)
- [ ] Orphan process detection enabled

### Runtime: Docker (Recommended for Production)
- [ ] Docker daemon accessible from control plane
- [ ] Agent images built and available
  - `parallax/agent-claude:latest`
  - `parallax/agent-codex:latest`
  - `parallax/agent-gemini:latest`
  - `parallax/agent-aider:latest`
- [ ] Docker network configured for agent communication
- [ ] Container resource limits set (CPU, memory)
- [ ] Container cleanup policy configured
- [ ] Volume mounts for workspaces configured
- [ ] Docker socket permissions secured

### Runtime: Kubernetes (Enterprise/Scale)
- [ ] Kubernetes cluster accessible
- [ ] KUBECONFIG or in-cluster auth configured
- [ ] Agent namespace created (`parallax-agents`)
- [ ] ParallaxAgent CRD installed
- [ ] RBAC permissions for pod management
- [ ] Pod security policies configured
- [ ] Resource quotas set for agent namespace
- [ ] Network policies for agent isolation
- [ ] Image pull secrets configured (if private registry)

### Runtime Environment Variables
```bash
# Runtime configuration
PARALLAX_RUNTIME=docker                    # local | docker | kubernetes
PARALLAX_AGENT_TIMEOUT=300000              # Agent idle timeout (ms)
PARALLAX_MAX_CONCURRENT_AGENTS=10          # Max simultaneous agents

# Docker runtime
DOCKER_HOST=unix:///var/run/docker.sock
PARALLAX_DOCKER_NETWORK=parallax-agents
PARALLAX_AGENT_IMAGE_PREFIX=parallax

# Kubernetes runtime
PARALLAX_K8S_NAMESPACE=parallax-agents
PARALLAX_K8S_IN_CLUSTER=false
KUBECONFIG=/path/to/kubeconfig
```

---

## Workspace Service (Git Provisioning)

### Git Integration
- [ ] Git available on control plane host
- [ ] SSH keys configured for private repos
- [ ] GitHub/GitLab credentials configured
- [ ] Workspace base directory configured
- [ ] Workspace cleanup policy set

### Workspace Operations
- [ ] Repository cloning works
- [ ] Branch creation works
- [ ] Commit and push works
- [ ] Workspace isolation between agents verified
- [ ] Large repo handling tested

### GitHub App Integration (Optional)
- [ ] GitHub App created and installed
- [ ] App ID and private key configured
- [ ] Webhook endpoint accessible (`/api/webhooks/github`)
- [ ] Webhook secret configured
- [ ] Installation access token refresh working
- [ ] Repository permissions verified (contents, pull_requests)

### Workspace Environment Variables
```bash
# Workspace configuration
PARALLAX_WORKSPACE_DIR=/var/lib/parallax/workspaces
PARALLAX_WORKSPACE_CLEANUP_HOURS=24

# GitHub App (optional)
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY_PATH=/secrets/github-app.pem
GITHUB_WEBHOOK_SECRET=<webhook-secret>
```

---

## SDKs

### TypeScript SDK
- [ ] Package published to npm (or private registry)
- [ ] gRPC connection to control plane works
- [ ] Agent registration works
- [ ] Message send/receive works
- [ ] Confidence reporting works
- [ ] Reconnection on disconnect works

### Python SDK
- [ ] Package published to PyPI (or private registry)
- [ ] gRPC connection works
- [ ] All agent operations functional
- [ ] Async support working

### Go SDK
- [ ] Module available (go get)
- [ ] gRPC connection works
- [ ] All agent operations functional

### Rust SDK
- [ ] Crate published (or git dependency)
- [ ] gRPC connection works
- [ ] All agent operations functional

### SDK Environment Variables
```bash
# SDK configuration (used by agents)
PARALLAX_CONTROL_PLANE_URL=localhost:50051
PARALLAX_AGENT_ID=<auto-generated>
PARALLAX_AGENT_TYPE=claude
PARALLAX_API_KEY=<agent-specific-key>
```

---

## CLI

### Installation
- [ ] CLI installable (`npm install -g @parallax/cli`)
- [ ] CLI connects to control plane
- [ ] Authentication working

### Commands
- [ ] `parallax login` - Authentication
- [ ] `parallax agent list` - List agents
- [ ] `parallax agent status <id>` - Agent details
- [ ] `parallax pattern list` - List patterns
- [ ] `parallax pattern execute <name>` - Execute pattern
- [ ] `parallax execution list` - List executions
- [ ] `parallax execution status <id>` - Execution details

---

## Pattern Builder (Optional)

### Web Interface
- [ ] Pattern builder UI accessible
- [ ] Visual pattern creation works
- [ ] Pattern export to YAML works
- [ ] Pattern import works
- [ ] Pattern validation works

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

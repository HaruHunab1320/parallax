# Production Readiness Checklist

Use this checklist to verify all systems before deploying to production.

## 🚀 Quick Start Test

```bash
# Run automated test suite
./test-production-system.sh

# Or start full production stack manually
pnpm run dev:prod
```

## ✅ Core Systems

### Database
- [ ] PostgreSQL running and accessible
- [ ] TimescaleDB extension installed
- [ ] Database migrations applied
- [ ] Connection pooling configured
- [ ] Backup strategy defined

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

## ✅ Control Plane API

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

## ✅ Monitoring & Observability

### Metrics (Prometheus)
- [ ] All targets UP at http://localhost:9090/targets
- [ ] Pattern execution metrics collected
- [ ] Agent performance metrics collected
- [ ] System resource metrics collected
- [ ] Custom business metrics working

### Dashboards (Grafana)
- [ ] Login works at http://localhost:3000 (admin/admin)
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

## ✅ Security

### API Security
- [ ] Input validation working
- [ ] SQL injection protection verified
- [ ] XSS protection verified
- [ ] Rate limiting configured
- [ ] CORS configured properly

### Infrastructure Security
- [ ] Database credentials secure
- [ ] Redis password set (if exposed)
- [ ] etcd authentication configured
- [ ] TLS enabled for production
- [ ] Secrets management configured
- [ ] Agent runtime isolates sessions (PTY or container)
- [ ] MCP API keys stored per agent and rotated
- [ ] Web terminal access gated by auth + audit logging

## ✅ High Availability

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

## ✅ Data Management

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

## ✅ Operational Readiness

### Logging
- [ ] Structured logging configured
- [ ] Log levels appropriate
- [ ] Log aggregation working
- [ ] Log retention policies set

### Deployment
- [ ] Docker images built and tagged
- [ ] Helm charts validated
- [ ] Environment variables documented
- [ ] Resource limits set

### Documentation
- [ ] API documentation complete
- [ ] Runbooks created
- [ ] Architecture diagrams updated
- [ ] Team trained on operations

## 🎯 Performance Benchmarks

Run these tests to establish baselines:

```bash
# Load test with k6
k6 run load-test.js

# Database performance
docker exec -it parallax-postgres pgbench -U parallax -d parallax -c 10 -j 2 -T 60

# Memory profiling
docker stats --no-stream
```

Expected results:
- API latency: p50 < 50ms, p95 < 100ms, p99 < 500ms
- Throughput: > 1000 executions/minute
- Error rate: < 0.1%
- Memory usage: < 1GB per service
- CPU usage: < 50% under normal load

## 🚨 Common Issues

### Issue: Services not starting
```bash
# Check logs
docker-compose logs -f

# Verify network
docker network ls

# Check resources
docker system df
```

### Issue: Poor performance
```bash
# Check database indexes
docker exec -it parallax-postgres psql -U parallax -d parallax -c "\di"

# Monitor connections
docker exec -it parallax-postgres psql -U parallax -d parallax -c "SELECT count(*) FROM pg_stat_activity;"

# Check cache hit rate
docker exec -it parallax-redis redis-cli info stats | grep keyspace
```

### Issue: Monitoring gaps
```bash
# Verify Prometheus scraping
curl http://localhost:9090/api/v1/targets

# Check Grafana data sources
curl -u admin:admin http://localhost:3000/api/datasources

# Test metric endpoint
curl http://localhost:8080/metrics
```

## 📋 Sign-off

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

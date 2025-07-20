# Quick Production Testing Guide

## 🚀 Easy Way to Test Everything

### Step 1: Start Infrastructure
```bash
./start-production-test.sh
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
./test-production-system-simple.sh
```

## 🔍 What to Check

### 1. API Health
- http://localhost:8080/health - Should show "healthy"
- http://localhost:8080/api/v1/patterns - Should list patterns

### 2. Monitoring
- **Grafana**: http://localhost:3000 (login: admin/admin)
  - Go to Dashboards → Browse
  - Open "System Overview" 
  - You should see metrics after running some tests

### 3. Tracing
- **Jaeger**: http://localhost:16686
  - Select "parallax-control-plane" service
  - Click "Find Traces"
  - You should see execution traces

### 4. Run Full Demo
```bash
pnpm run demo:patterns
```

This will execute all patterns and populate all monitoring dashboards.

## 🛑 Stopping Everything

```bash
cd packages/control-plane
docker-compose -f docker-compose.prod.yml down
```

## 🔧 Troubleshooting

### If services won't start:
```bash
# Check what's running
docker ps

# Check logs
docker logs parallax-postgres
docker logs parallax-redis
docker logs parallax-etcd

# Reset everything
docker-compose -f docker-compose.prod.yml down -v
./start-production-test.sh
```

### If API won't connect to database:
1. Check .env file exists in packages/control-plane/
2. Verify DATABASE_URL matches the docker service
3. Check migrations: `pnpm --filter @parallax/control-plane run prisma:migrate`

### If monitoring shows no data:
1. Make sure API is running with metrics enabled
2. Execute some patterns to generate data
3. Check Prometheus targets: http://localhost:9090/targets

---

**Pro tip**: Keep all three terminals open:
1. Infrastructure logs: `docker-compose -f docker-compose.prod.yml logs -f`
2. API logs: The terminal running `pnpm run dev:control-plane`
3. Test terminal: For running tests and demos
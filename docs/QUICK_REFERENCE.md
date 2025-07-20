# Parallax Quick Reference

## 🚀 Common Commands

### Starting Services

```bash
# Quick start (minimal)
pnpm start                    # Start etcd + control plane

# Development environments
pnpm run dev                  # Same as pnpm start
pnpm run dev:monitor         # + Prometheus, Grafana, Jaeger
pnpm run dev:full           # + PostgreSQL, all services
pnpm run dev:prod          # Production setup locally

# Individual services
pnpm run control-plane      # Just control plane
pnpm run web               # Just web dashboard
pnpm run monitor:start     # Just monitoring stack
```

### Running Demos

```bash
pnpm run demo:simple       # Basic agent demo
pnpm run demo:patterns     # Pattern execution demo
pnpm run demo             # Full demo app
```

### Testing

```bash
npm test                  # Run all tests
pnpm run test:unit        # Unit tests only
pnpm run test:integration # Integration tests
pnpm run test:e2e        # End-to-end tests
pnpm run test:watch      # Watch mode
```

### Infrastructure Management

```bash
# Start specific infrastructure
pnpm run infra:etcd       # Just etcd
pnpm run infra:postgres   # Just PostgreSQL
pnpm run infra:all       # All infrastructure

# Stop everything
pnpm run stop:all        # Stop all services
pnpm run reset          # Stop all + clean Docker
```

### Pattern & Agent Commands

```bash
pnpm run pattern:list                    # List available patterns
pnpm run pattern:execute -- --pattern consensus --input '{}'
pnpm run agent:list                      # List registered agents
```

### Kubernetes

```bash
pnpm run k8s:install      # Install with dev values
pnpm run k8s:upgrade      # Upgrade deployment
pnpm run k8s:uninstall    # Remove from cluster
```

## 📍 Service URLs

| Service | URL | Credentials |
|---------|-----|-------------|
| Control Plane API | http://localhost:8080 | - |
| Control Plane gRPC | localhost:8081 | - |
| Web Dashboard | http://localhost:3000 | - |
| Grafana | http://localhost:3000 | admin/admin |
| Prometheus | http://localhost:9090 | - |
| Jaeger UI | http://localhost:16686 | - |
| etcd | http://localhost:2379 | - |
| PostgreSQL | localhost:5432 | parallax/parallax123 |

## 🛠️ Environment Variables

### Essential
```bash
PORT=8080                           # API port
DATABASE_URL=postgresql://...       # If using external DB
ETCD_ENDPOINTS=http://localhost:2379
```

### Optional
```bash
# Authentication
AUTH_ENABLED=true
JWT_SECRET=your-secret

# Monitoring
ENABLE_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317

# Logging
LOG_LEVEL=debug
NODE_ENV=development
```

## 🐳 Docker Commands

### Control Plane
```bash
cd packages/control-plane

# Development stack
docker-compose -f docker-compose.dev.yml up -d

# Production stack
docker-compose up -d

# View logs
docker-compose logs -f control-plane

# Stop
docker-compose down -v
```

### Monitoring
```bash
cd packages/monitoring

# Start monitoring
./start-monitoring.sh

# Stop monitoring
./stop-monitoring.sh
```

## 🏗️ Project Structure

```
parallax/
├── packages/
│   ├── control-plane/    # Main API server
│   ├── runtime/         # Core runtime
│   ├── data-plane/      # Execution engine
│   ├── sdk-typescript/  # TS SDK
│   ├── sdk-python/      # Python SDK
│   ├── cli/            # CLI tool
│   ├── web-dashboard/   # React UI
│   └── monitoring/      # Grafana/Prometheus
├── patterns/           # Prism patterns
├── examples/          # Example agents
├── k8s/              # Kubernetes configs
└── docs/             # Documentation
```

## 🔧 Troubleshooting

### Port already in use
```bash
# Find what's using port
lsof -i :8080

# Stop all Parallax services
pnpm run stop:all
```

### Docker issues
```bash
# Clean restart
pnpm run reset

# Nuclear option
docker system prune -a --volumes
```

### Database issues
```bash
cd packages/control-plane
pnpm run db:reset
pnpm run db:migrate
```

## 📚 More Resources

- [Full Startup Guide](./STARTUP_GUIDE.md)
- [API Documentation](./api/README.md)
- [Pattern Guide](../patterns/README.md)
- [Testing Guide](./testing/testing-guide.md)
- [Kubernetes Deployment](../k8s/helm/parallax/README.md)
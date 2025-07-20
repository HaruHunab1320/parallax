# Parallax Startup Guide

This guide covers all the ways to start and run the Parallax platform, from simple development to full production deployments.

## 🚀 Quick Start (Simplest)

Just want to get Parallax running? One command:

```bash
pnpm start
```

This starts:
- ✅ etcd (service registry)
- ✅ Control Plane API (port 8080)
- ✅ Ready for agents and pattern execution

**Next steps:**
```bash
# In another terminal, run demos:
pnpm run demo:simple      # Basic agent demo
pnpm run demo:patterns    # Pattern execution demo
```

## 📊 Development Environments

### Basic Development
The default for everyday development:

```bash
pnpm run dev
```
- Starts etcd and control plane
- Hot reloading enabled
- Minimal resource usage

### Development with Monitoring
Full observability stack included:

```bash
pnpm run dev:monitor
```
- Everything from basic dev
- Prometheus (http://localhost:9090)
- Grafana (http://localhost:3000) - admin/admin
- Jaeger (http://localhost:16686)

### Development with Database
Includes PostgreSQL/TimescaleDB:

```bash
pnpm run dev:full
```
- Everything from basic dev
- PostgreSQL with TimescaleDB
- Database migrations auto-run
- Web dashboard available

### Production-like Development
Test production setup locally:

```bash
pnpm run dev:prod
```
- All services in containers
- Production configurations
- Performance monitoring
- Full security enabled

## 🐳 Docker Compose Options

### Control Plane Development Stack
```bash
cd packages/control-plane
docker-compose -f docker-compose.dev.yml up
```

**Services:**
- PostgreSQL (port 5432)
- TimescaleDB extension
- etcd (port 2379)
- Redis (port 6379)
- Grafana (port 3001)
- Prometheus (port 9090)

### Control Plane Production Stack
```bash
cd packages/control-plane
docker-compose up
```

**Services:**
- All development services
- Nginx reverse proxy (port 80)
- Production configurations
- Health checks enabled

### Monitoring Stack Only
```bash
cd packages/monitoring
pnpm run start:local
# or
docker-compose -f docker-compose.monitoring.yml up
```

**Services:**
- Prometheus (port 9090)
- Grafana (port 3000)
- Jaeger (port 16686)
- Node Exporter (port 9100)
- AlertManager (port 9093)

## ☸️ Kubernetes Deployment

### Local Kubernetes (Minikube/Kind)

```bash
# Start minikube
minikube start --memory=8192 --cpus=4

# Install with development values
helm install parallax ./k8s/helm/parallax -f ./k8s/helm/parallax/values-dev.yaml

# Get the URL
minikube service parallax-control-plane --url
```

### Production Kubernetes

```bash
# Basic installation
helm install parallax ./k8s/helm/parallax \
  --namespace parallax-system \
  --create-namespace

# Full production with all features
helm install parallax ./k8s/helm/parallax \
  --namespace parallax-system \
  --create-namespace \
  -f ./k8s/helm/parallax/values-production.yaml \
  --set controlPlane.auth.jwt.secret=$JWT_SECRET \
  --set postgresql.auth.password=$DB_PASSWORD
```

## 🛠️ Component-Specific Startup

### Just etcd
```bash
pnpm run infra:etcd
# or
docker run -d -p 2379:2379 --name etcd quay.io/coreos/etcd:latest
```

### Just Control Plane (requires etcd)
```bash
pnpm run control-plane
# or
cd packages/control-plane && pnpm run dev
```

### Just Web Dashboard
```bash
pnpm run web
# or
cd packages/web-dashboard && pnpm run dev
```

### Just an Agent
```bash
# TypeScript agent
cd examples/standalone-agent && pnpm start

# Python agent
cd examples/python-agent && python weather_agent.py
```

## 🔧 Configuration Options

### Environment Variables

**Control Plane:**
```bash
# Core settings
PORT=8080                    # API port
GRPC_PORT=8081              # gRPC port
METRICS_PORT=9090           # Metrics port

# Database (if using external)
DATABASE_URL=postgresql://user:pass@host:5432/parallax

# etcd
ETCD_ENDPOINTS=http://localhost:2379

# Authentication
AUTH_ENABLED=true
JWT_SECRET=your-secret-here

# Monitoring
ENABLE_TRACING=true
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
```

**Web Dashboard:**
```bash
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
NEXT_PUBLIC_AUTH_ENABLED=false
```

### Configuration Files

**Control Plane** (`packages/control-plane/.env`):
```env
NODE_ENV=development
LOG_LEVEL=debug
PATTERNS_DIR=/app/patterns
```

**Docker Compose** (`packages/control-plane/.env`):
```env
POSTGRES_PASSWORD=secure_password
JWT_SECRET=your_jwt_secret
VERSION=latest
```

## 📝 Common Workflows

### 1. Start Everything for Development
```bash
# Terminal 1
pnpm run dev:full

# Terminal 2 (after services are up)
pnpm run demo:patterns
```

### 2. Test Pattern Execution
```bash
# Start platform
pnpm start

# In another terminal
pnpm run pattern:execute -- --pattern consensus --input '{"task": "analyze"}'
```

### 3. Monitor System Performance
```bash
# Start with monitoring
pnpm run dev:monitor

# Open Grafana
open http://localhost:3000

# View traces in Jaeger
open http://localhost:16686
```

### 4. Run Tests with Infrastructure
```bash
# Start test infrastructure
pnpm run test:infra

# Run tests
npm test

# Stop test infrastructure
pnpm run test:infra:stop
```

## 🚨 Troubleshooting

### Port Conflicts
If you get port already in use errors:

```bash
# Check what's using the port
lsof -i :8080  # or whatever port

# Stop all Parallax services
pnpm run stop:all

# Clean up Docker containers
docker-compose down -v
```

### etcd Connection Issues
```bash
# Check if etcd is running
curl http://localhost:2379/health

# Restart etcd
docker restart etcd
```

### Database Issues
```bash
# Reset database
cd packages/control-plane
pnpm run db:reset

# Run migrations manually
pnpm run db:migrate
```

## 📋 Service Endpoints

| Service | Default URL | Purpose |
|---------|------------|---------|
| Control Plane API | http://localhost:8080 | Main API |
| Control Plane gRPC | localhost:8081 | Agent communication |
| Metrics | http://localhost:9090/metrics | Prometheus metrics |
| Web Dashboard | http://localhost:3000 | UI (if enabled) |
| etcd | http://localhost:2379 | Service registry |
| PostgreSQL | localhost:5432 | Database |
| Grafana | http://localhost:3000 | Metrics dashboards |
| Prometheus | http://localhost:9090 | Metrics storage |
| Jaeger | http://localhost:16686 | Distributed tracing |

## 🎯 Recommended Setups

### For Agent Development
```bash
pnpm run dev  # Basic setup
```

### For Pattern Development
```bash
pnpm run dev:full  # Includes database for persistence
```

### For UI Development
```bash
pnpm run dev:full  # Full stack
cd packages/web-dashboard && pnpm run dev
```

### For Production Testing
```bash
pnpm run dev:prod  # Everything containerized
```

## 🧹 Cleanup

### Stop Everything
```bash
pnpm run stop:all
```

### Clean Docker Resources
```bash
# Stop and remove containers
docker-compose down

# Remove volumes too
docker-compose down -v

# Nuclear option - remove everything
docker system prune -a --volumes
```

### Reset Development Environment
```bash
pnpm run clean
pnpm run reset
npm install
pnpm run build
```
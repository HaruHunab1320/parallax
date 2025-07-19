# Parallax Startup Guide

This guide covers all the ways to start and run the Parallax platform, from simple development to full production deployments.

## 🚀 Quick Start (Simplest)

Just want to get Parallax running? One command:

```bash
npm start
```

This starts:
- ✅ etcd (service registry)
- ✅ Control Plane API (port 8080)
- ✅ Ready for agents and pattern execution

**Next steps:**
```bash
# In another terminal, run demos:
npm run demo:simple      # Basic agent demo
npm run demo:patterns    # Pattern execution demo
```

## 📊 Development Environments

### Basic Development
The default for everyday development:

```bash
npm run dev
```
- Starts etcd and control plane
- Hot reloading enabled
- Minimal resource usage

### Development with Monitoring
Full observability stack included:

```bash
npm run dev:monitor
```
- Everything from basic dev
- Prometheus (http://localhost:9090)
- Grafana (http://localhost:3000) - admin/admin
- Jaeger (http://localhost:16686)

### Development with Database
Includes PostgreSQL/TimescaleDB:

```bash
npm run dev:full
```
- Everything from basic dev
- PostgreSQL with TimescaleDB
- Database migrations auto-run
- Web dashboard available

### Production-like Development
Test production setup locally:

```bash
npm run dev:prod
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
npm run start:local
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
npm run infra:etcd
# or
docker run -d -p 2379:2379 --name etcd quay.io/coreos/etcd:latest
```

### Just Control Plane (requires etcd)
```bash
npm run control-plane
# or
cd packages/control-plane && npm run dev
```

### Just Web Dashboard
```bash
npm run web
# or
cd packages/web-dashboard && npm run dev
```

### Just an Agent
```bash
# TypeScript agent
cd examples/standalone-agent && npm start

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
npm run dev:full

# Terminal 2 (after services are up)
npm run demo:patterns
```

### 2. Test Pattern Execution
```bash
# Start platform
npm start

# In another terminal
npm run pattern:execute -- --pattern consensus --input '{"task": "analyze"}'
```

### 3. Monitor System Performance
```bash
# Start with monitoring
npm run dev:monitor

# Open Grafana
open http://localhost:3000

# View traces in Jaeger
open http://localhost:16686
```

### 4. Run Tests with Infrastructure
```bash
# Start test infrastructure
npm run test:infra

# Run tests
npm test

# Stop test infrastructure
npm run test:infra:stop
```

## 🚨 Troubleshooting

### Port Conflicts
If you get port already in use errors:

```bash
# Check what's using the port
lsof -i :8080  # or whatever port

# Stop all Parallax services
npm run stop:all

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
npm run db:reset

# Run migrations manually
npm run db:migrate
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
npm run dev  # Basic setup
```

### For Pattern Development
```bash
npm run dev:full  # Includes database for persistence
```

### For UI Development
```bash
npm run dev:full  # Full stack
cd packages/web-dashboard && npm run dev
```

### For Production Testing
```bash
npm run dev:prod  # Everything containerized
```

## 🧹 Cleanup

### Stop Everything
```bash
npm run stop:all
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
npm run clean
npm run reset
npm install
npm run build
```
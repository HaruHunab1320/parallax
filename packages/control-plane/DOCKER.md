# Parallax Control Plane - Docker Setup

This document describes how to build and run the Parallax Control Plane using Docker.

## Prerequisites

- Docker 20.10+ and Docker Compose 2.0+
- 4GB+ RAM available for Docker
- Ports 8080, 8081, 9090, 5432, and 2379 available

## Quick Start

### 1. Configure Environment

Copy the example environment file and edit it:

```bash
cp env.example .env
# Edit .env with your configuration
```

### 2. Build and Run

Using Make:
```bash
# Build production image
make build

# Run production environment
make run

# View logs
make logs
```

Using Docker Compose directly:
```bash
# Build and start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
```

## Docker Images

### Production Image

The production Dockerfile uses a multi-stage build:

1. **Base stage**: Sets up Node.js and pnpm
2. **Dependencies stage**: Installs npm packages
3. **Build stage**: Compiles TypeScript and generates Prisma client
4. **Runtime stage**: Minimal image with only production dependencies

Features:
- Non-root user for security
- Health check endpoint
- Optimized image size (~200MB)
- Production-ready configuration

### Development Image

The development Dockerfile includes:
- Hot reload with tsx watch
- Full development dependencies
- Volume mounts for code changes
- Debugging support

## Services

The docker-compose.yml includes:

### 1. PostgreSQL with TimescaleDB
- Time-series optimized database
- Persistent volume for data
- Automatic schema migrations

### 2. etcd
- Service registry and discovery
- Configuration management
- Leader election support

### 3. Control Plane
- REST API on port 8080
- gRPC server on port 8081
- Prometheus metrics on port 9090

### 4. Nginx (optional)
- Reverse proxy with SSL termination
- Rate limiting
- Load balancing

## Common Operations

### Building Images

```bash
# Build with specific version
make build VERSION=1.0.0

# Build and push to registry
make push REGISTRY=docker.io/myorg VERSION=1.0.0

# Build development image
make build-dev
```

### Running Services

```bash
# Start production
make run

# Start development with hot reload
make run-dev

# Stop all services
make stop

# Clean up everything (including volumes)
make clean
```

### Database Operations

```bash
# Run migrations
make db-migrate

# Seed database
make db-seed

# Open Prisma Studio
make db-studio
```

### Debugging

```bash
# View logs
docker-compose logs -f control-plane

# Shell into container
make shell

# Check service health
curl http://localhost:8080/health

# View metrics
curl http://localhost:9090/metrics
```

## Environment Variables

Key configuration options:

### Server Configuration
- `PORT`: API server port (default: 8080)
- `GRPC_PORT`: gRPC server port (default: 8081)
- `METRICS_PORT`: Prometheus metrics port (default: 9090)

### Database Configuration
- `DATABASE_URL`: PostgreSQL connection string
- `POSTGRES_USER`: Database username
- `POSTGRES_PASSWORD`: Database password

### etcd Configuration
- `ETCD_ENDPOINTS`: etcd server URLs
- `ETCD_PREFIX`: Key prefix for etcd storage

### Pattern Engine
- `PATTERNS_DIR`: Directory containing pattern files
- `MAX_EXECUTION_TIME`: Maximum pattern execution time in ms

See `env.example` for complete list.

## Production Deployment

### 1. Security Considerations

- Always use strong passwords in production
- Enable authentication with `AUTH_ENABLED=true`
- Use HTTPS with proper certificates
- Restrict metrics endpoint access
- Regular security updates

### 2. Scaling

Horizontal scaling options:
- Multiple control plane instances behind load balancer
- PostgreSQL read replicas for query scaling
- etcd cluster for high availability

### 3. Monitoring

Recommended monitoring stack:
- Prometheus for metrics collection
- Grafana for visualization
- AlertManager for alerting
- ELK/Loki for log aggregation

### 4. Backup

Important data to backup:
- PostgreSQL database
- etcd data
- Pattern files
- Configuration files

## Troubleshooting

### Container fails to start

Check logs:
```bash
docker-compose logs control-plane
```

Common issues:
- Port conflicts: Change ports in .env
- Database connection: Ensure PostgreSQL is healthy
- Missing environment variables: Check .env file

### Database migrations fail

```bash
# Reset database (WARNING: destroys data)
docker-compose down -v
docker-compose up -d postgres
make db-migrate
```

### Performance issues

- Increase memory limits in docker-compose.yml
- Check resource usage: `docker stats`
- Review pattern execution logs
- Enable debug logging: `LOG_LEVEL=debug`

## Development Workflow

1. Make code changes
2. If using development image, changes auto-reload
3. Run tests: `make test`
4. Build production image: `make build`
5. Test production build locally
6. Push to registry: `make push`

## CI/CD Integration

Example GitHub Actions workflow:

```yaml
- name: Build and push Docker image
  run: |
    make build VERSION=${{ github.sha }}
    make push REGISTRY=ghcr.io/${{ github.repository_owner }} VERSION=${{ github.sha }}
```

## Support

For issues or questions:
- Check logs with `docker-compose logs`
- Review environment configuration
- Ensure all services are healthy
- Check GitHub issues for known problems
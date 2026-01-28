---
sidebar_position: 2
title: Docker
---

# Docker Deployment

Deploy Parallax using Docker containers for consistent, reproducible environments.

## Quick Start

### Pull the Image

```bash
docker pull parallax/control-plane:latest
```

### Run the Control Plane

```bash
docker run -d \
  --name parallax \
  -p 8080:8080 \
  parallax/control-plane:latest
```

### Verify It's Running

```bash
curl http://localhost:8080/health
```

Expected response:

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 42
}
```

## Docker Compose

### Basic Setup

Create `docker-compose.yaml`:

```yaml
version: '3.8'

services:
  control-plane:
    image: parallax/control-plane:latest
    ports:
      - "8080:8080"
    environment:
      - PARALLAX_LOG_LEVEL=info
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3
```

Start the service:

```bash
docker compose up -d
```

### With Persistence

```yaml
version: '3.8'

services:
  control-plane:
    image: parallax/control-plane:latest
    ports:
      - "8080:8080"
    environment:
      - PARALLAX_LOG_LEVEL=info
      - PARALLAX_STORAGE_TYPE=sqlite
      - PARALLAX_STORAGE_PATH=/data/parallax.db
    volumes:
      - parallax-data:/data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3

volumes:
  parallax-data:
```

### With Redis (for HA)

```yaml
version: '3.8'

services:
  control-plane:
    image: parallax/control-plane:latest
    ports:
      - "8080:8080"
    environment:
      - PARALLAX_LOG_LEVEL=info
      - PARALLAX_REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

### Full Stack (Control Plane + Agents)

```yaml
version: '3.8'

services:
  control-plane:
    image: parallax/control-plane:latest
    ports:
      - "8080:8080"
    environment:
      - PARALLAX_LOG_LEVEL=info
      - PARALLAX_REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 10s
      timeout: 5s
      retries: 3

  agent-classification:
    image: parallax/agent:latest
    environment:
      - PARALLAX_CONTROL_PLANE_URL=http://control-plane:8080
      - AGENT_CAPABILITIES=classification
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - control-plane
    deploy:
      replicas: 3

  agent-analysis:
    image: parallax/agent:latest
    environment:
      - PARALLAX_CONTROL_PLANE_URL=http://control-plane:8080
      - AGENT_CAPABILITIES=analysis,summarization
      - OPENAI_API_KEY=${OPENAI_API_KEY}
    depends_on:
      - control-plane
    deploy:
      replicas: 3

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  redis-data:
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PARALLAX_PORT` | HTTP/WebSocket port | `8080` |
| `PARALLAX_HOST` | Bind address | `0.0.0.0` |
| `PARALLAX_LOG_LEVEL` | Log level | `info` |
| `PARALLAX_LOG_FORMAT` | Log format (`json`, `text`) | `json` |
| `PARALLAX_STORAGE_TYPE` | Storage backend | `memory` |
| `PARALLAX_STORAGE_PATH` | File/SQLite path | - |
| `PARALLAX_REDIS_URL` | Redis connection URL | - |
| `PARALLAX_MAX_AGENTS` | Max agent connections | `1000` |
| `PARALLAX_EXECUTION_TIMEOUT` | Default timeout (ms) | `30000` |

### Configuration File

Mount a configuration file:

```yaml
services:
  control-plane:
    image: parallax/control-plane:latest
    volumes:
      - ./parallax.config.yaml:/etc/parallax/config.yaml:ro
    environment:
      - PARALLAX_CONFIG=/etc/parallax/config.yaml
```

Example `parallax.config.yaml`:

```yaml
server:
  port: 8080
  host: 0.0.0.0

logging:
  level: info
  format: json

storage:
  type: sqlite
  path: /data/parallax.db

execution:
  defaultTimeout: 30000
  maxConcurrentExecutions: 100

agents:
  maxConnections: 1000
  heartbeatInterval: 10000
  reconnectTimeout: 30000

patterns:
  autoReload: true
  directory: /patterns
```

### Mount Patterns Directory

```yaml
services:
  control-plane:
    image: parallax/control-plane:latest
    volumes:
      - ./patterns:/patterns:ro
    environment:
      - PARALLAX_PATTERNS_DIR=/patterns
      - PARALLAX_PATTERNS_AUTO_RELOAD=true
```

## Building Custom Images

### Custom Control Plane

```dockerfile
# Dockerfile.control-plane
FROM parallax/control-plane:latest

# Add custom patterns
COPY patterns/ /patterns/

# Add custom configuration
COPY parallax.config.yaml /etc/parallax/config.yaml

ENV PARALLAX_CONFIG=/etc/parallax/config.yaml
ENV PARALLAX_PATTERNS_DIR=/patterns
```

Build and run:

```bash
docker build -f Dockerfile.control-plane -t my-parallax:latest .
docker run -d -p 8080:8080 my-parallax:latest
```

### Custom Agent

```dockerfile
# Dockerfile.agent
FROM node:20-slim

WORKDIR /app

# Install dependencies
COPY package.json pnpm-lock.yaml ./
RUN npm install -g pnpm && pnpm install --frozen-lockfile

# Copy agent code
COPY agent.ts ./
COPY tsconfig.json ./

# Build
RUN pnpm build

# Run
CMD ["node", "dist/agent.js"]
```

Example `agent.ts`:

```typescript
import { ParallaxAgent } from '@parallax/sdk-typescript';

const agent = new ParallaxAgent({
  controlPlaneUrl: process.env.PARALLAX_CONTROL_PLANE_URL!,
  capabilities: process.env.AGENT_CAPABILITIES?.split(',') || [],
});

agent.onTask('classification', async (task) => {
  // Your logic here
  return { category: 'result', confidence: 0.9 };
});

agent.connect();
console.log('Agent connected');
```

## Networking

### Bridge Network (Default)

Services communicate via container names:

```yaml
services:
  control-plane:
    networks:
      - parallax-net

  agent:
    environment:
      - PARALLAX_CONTROL_PLANE_URL=http://control-plane:8080
    networks:
      - parallax-net

networks:
  parallax-net:
    driver: bridge
```

### Host Network

For performance-sensitive deployments:

```yaml
services:
  control-plane:
    network_mode: host
    environment:
      - PARALLAX_PORT=8080
```

### External Access

Expose via reverse proxy:

```yaml
services:
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./certs:/etc/nginx/certs:ro
    depends_on:
      - control-plane

  control-plane:
    image: parallax/control-plane:latest
    # Not exposed directly
```

Example `nginx.conf`:

```nginx
upstream parallax {
    server control-plane:8080;
}

server {
    listen 80;
    server_name parallax.example.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl;
    server_name parallax.example.com;

    ssl_certificate /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;

    location / {
        proxy_pass http://parallax;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

## Health Checks

### Control Plane Health

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
  interval: 10s
  timeout: 5s
  retries: 3
  start_period: 10s
```

### Health Endpoints

| Endpoint | Description |
|----------|-------------|
| `/health` | Basic health check |
| `/health/ready` | Readiness probe (for load balancers) |
| `/health/live` | Liveness probe (for orchestrators) |

### Detailed Health Response

```bash
curl http://localhost:8080/health?detailed=true
```

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 3600,
  "components": {
    "storage": "healthy",
    "redis": "healthy",
    "agents": {
      "connected": 9,
      "healthy": 9
    }
  },
  "metrics": {
    "executionsTotal": 1234,
    "executionsActive": 5,
    "avgExecutionTime": 2340
  }
}
```

## Logging

### Log Configuration

```yaml
environment:
  - PARALLAX_LOG_LEVEL=info
  - PARALLAX_LOG_FORMAT=json
```

### View Logs

```bash
# Follow logs
docker compose logs -f control-plane

# Last 100 lines
docker compose logs --tail 100 control-plane

# Filter by time
docker compose logs --since 1h control-plane
```

### Log Output (JSON)

```json
{"timestamp":"2024-01-15T10:30:00Z","level":"info","message":"Execution started","executionId":"exec_abc123","pattern":"classifier"}
{"timestamp":"2024-01-15T10:30:01Z","level":"debug","message":"Agent selected","agentId":"agent_1","capabilities":["classification"]}
{"timestamp":"2024-01-15T10:30:02Z","level":"info","message":"Execution completed","executionId":"exec_abc123","duration":2340}
```

### Log Aggregation

Send logs to centralized logging:

```yaml
services:
  control-plane:
    logging:
      driver: "fluentd"
      options:
        fluentd-address: "localhost:24224"
        tag: "parallax.control-plane"
```

## Resource Limits

### Memory and CPU

```yaml
services:
  control-plane:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
        reservations:
          cpus: '0.5'
          memory: 512M
```

### Recommended Resources

| Component | Min CPU | Min Memory | Recommended |
|-----------|---------|------------|-------------|
| Control Plane | 0.5 | 512MB | 2 CPU, 2GB |
| Agent | 0.25 | 256MB | 1 CPU, 1GB |
| Redis | 0.25 | 256MB | 1 CPU, 1GB |

## Scaling

### Scale Agents

```bash
# Scale to 5 agent instances
docker compose up -d --scale agent-classification=5
```

### Auto-Scaling with Docker Swarm

```yaml
services:
  agent:
    deploy:
      mode: replicated
      replicas: 3
      update_config:
        parallelism: 1
        delay: 10s
      restart_policy:
        condition: on-failure
```

## Security

### Run as Non-Root

```yaml
services:
  control-plane:
    user: "1000:1000"
```

### Read-Only Filesystem

```yaml
services:
  control-plane:
    read_only: true
    tmpfs:
      - /tmp
    volumes:
      - parallax-data:/data
```

### Secrets Management

```yaml
services:
  agent:
    secrets:
      - openai_api_key
    environment:
      - OPENAI_API_KEY_FILE=/run/secrets/openai_api_key

secrets:
  openai_api_key:
    file: ./secrets/openai_api_key.txt
```

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs control-plane

# Check container status
docker compose ps

# Inspect container
docker inspect parallax-control-plane-1
```

### Connection Refused

```bash
# Check container is running
docker compose ps

# Check port mapping
docker compose port control-plane 8080

# Check from inside container
docker compose exec control-plane curl localhost:8080/health
```

### Out of Memory

```bash
# Check memory usage
docker stats

# Increase limits in docker-compose.yaml
```

### Disk Full

```bash
# Check disk usage
docker system df

# Clean up
docker system prune -a
```

## Next Steps

- [Kubernetes](/docs/deployment/kubernetes) - Production orchestration
- [High Availability](/docs/enterprise/high-availability) - Multi-node setup
- [Security](/docs/enterprise/security) - Production security

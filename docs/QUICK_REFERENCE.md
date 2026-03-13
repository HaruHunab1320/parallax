# Parallax Quick Reference

This is the fast operator cheat sheet for the current Parallax stack.

For architecture and design context, use:

- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [THREAD_RUNTIME_PROPOSAL.md](./THREAD_RUNTIME_PROPOSAL.md)
- [THREAD_RUNTIME_IMPLEMENTATION_PLAN.md](./THREAD_RUNTIME_IMPLEMENTATION_PLAN.md)

## Common Commands

### Install and Build

```bash
pnpm install
pnpm build
pnpm type-check
```

### Start the Platform

```bash
# Simplest local startup
pnpm start

# Same as start-local dev flow
pnpm run dev

# Bring up local infra from control-plane docker-compose
pnpm run infra:all

# Run only the control plane
pnpm run dev:control-plane

# Run only the web dashboard
pnpm run dev:web
```

### Runtime and MCP

```bash
# Local PTY runtime
pnpm --filter @parallaxai/runtime-local dev

# Runtime MCP server
pnpm --filter @parallaxai/runtime-mcp dev
```

### Demos

```bash
pnpm run demo:patterns
pnpm run demo:typescript
pnpm run demo:python
pnpm run demo:go
pnpm run demo:rust
```

### Testing

Workspace-level:

```bash
pnpm test
pnpm run test:watch
pnpm run test:coverage
```

Control-plane specific:

```bash
pnpm --filter @parallaxai/control-plane test
pnpm --filter @parallaxai/control-plane test:db
pnpm --filter @parallaxai/control-plane test:all
pnpm --filter @parallaxai/control-plane type-check
```

Runtime MCP:

```bash
pnpm --filter @parallaxai/runtime-mcp test:run
pnpm --filter @parallaxai/runtime-mcp type-check
```

Local runtime:

```bash
pnpm --filter @parallaxai/runtime-local type-check
```

### Managed Thread Smoke Test

```bash
WORKSPACE_PATH=/absolute/path/to/repo \
./scripts/smoke-managed-threads.sh
```

Examples:

```bash
THREAD_AGENT_TYPE=gemini \
WORKSPACE_PATH=/Users/jakobgrant/Workspaces/parallax \
./scripts/smoke-managed-threads.sh
```

```bash
THREAD_AGENT_TYPE=claude \
BLOCKED_KEYS=enter \
BLOCKED_MAX_SENDS=5 \
WORKSPACE_PATH=/Users/jakobgrant/Workspaces/parallax \
./scripts/smoke-managed-threads.sh
```

## Service URLs

Typical local endpoints:

| Service | URL |
|---------|-----|
| Control Plane API | http://localhost:8080 |
| Local Runtime API | http://localhost:9876 |
| Local Runtime MCP | depends on CLI invocation |
| Web Dashboard | http://localhost:3000 |
| etcd | http://localhost:2379 |

Optional local infra from `packages/control-plane/docker-compose.dev.yml` may also expose:

| Service | URL |
|---------|-----|
| PostgreSQL | localhost:5435 |
| Redis | localhost:6380 |
| Grafana | http://localhost:3001 |
| Prometheus | http://localhost:9090 |

## Important Paths

| Path | Purpose |
|------|---------|
| `packages/control-plane` | Main orchestration service |
| `packages/primitives` | Prism primitives |
| `packages/runtime-interface` | Shared agent/thread contracts |
| `packages/runtime-local` | PTY-backed local runtime |
| `packages/runtime-docker` | Docker runtime |
| `packages/runtime-k8s` | Kubernetes runtime |
| `packages/runtime-mcp` | MCP server for agent/thread operations |
| `packages/coding-agent-adapters` | Claude/Codex/Gemini/Aider adapters |
| `packages/pty-manager` | PTY session engine |
| `patterns/` | Example and generated patterns |
| `docs/` | Internal architecture and implementation docs |

## Architecture Cheatsheet

### Core Layers

1. **Control plane**
   Loads patterns, manages executions, persists threads, builds preparation and memory context.
2. **Runtime layer**
   Hosts agents and threads across local, Docker, and Kubernetes backends.
3. **Agent layer**
   SDK agents and interactive coding CLIs.

### Important Distinction

- `agent` = execution substrate
- `thread` = orchestration substrate

Managed threads are the control-plane unit for long-lived supervised work.

### Key Thread Surfaces

- REST: `/api/managed-threads`
- local runtime: `/api/threads`
- event stream: `/ws/events`
- memory surfaces:
  - shared decisions
  - episodic experiences
  - prepared `.parallax/thread-memory.md`

## Useful Environment Variables

Common local settings:

```bash
PORT=8080
PARALLAX_LOCAL_RUNTIME_URL=http://localhost:9876
DATABASE_URL=postgresql://postgres:postgres@localhost:5435/parallax
ETCD_ENDPOINTS=http://localhost:2379
LOG_LEVEL=debug
NODE_ENV=development
```

For smoke tests and thread execution:

```bash
CONTROL_PLANE_URL=http://localhost:8080
LOCAL_RUNTIME_URL=http://localhost:9876
RUNTIME_NAME=local
THREAD_AGENT_TYPE=codex
WORKSPACE_PATH=/absolute/path/to/repo
```

## Docker and Infra

Bring up local infra:

```bash
pnpm run infra:all
```

Directly from the control-plane package:

```bash
cd packages/control-plane
docker-compose -f docker-compose.dev.yml up -d
docker-compose -f docker-compose.dev.yml down
```

## Troubleshooting

### Ports

```bash
lsof -i :8080
lsof -i :9876
lsof -i :5435
```

### Stop local infra

```bash
pnpm run stop:all
```

### Control-plane DB

```bash
pnpm --filter @parallaxai/control-plane db:migrate
pnpm --filter @parallaxai/control-plane db:migrate:prod
pnpm --filter @parallaxai/control-plane db:generate
pnpm --filter @parallaxai/control-plane db:studio
```

### Rebuild runtime-facing packages

```bash
pnpm --filter coding-agent-adapters build
pnpm --filter @parallaxai/runtime-local build
pnpm --filter @parallaxai/runtime-mcp build
```

## More Resources

- [STARTUP_GUIDE.md](./STARTUP_GUIDE.md)
- [TESTING_GUIDE.md](./TESTING_GUIDE.md)
- [ARCHITECTURE.md](./ARCHITECTURE.md)
- [README.md](./README.md)

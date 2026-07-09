# Parallax Architecture

> **Pattern-Driven AI Agent Orchestration Platform**

## Overview

Parallax is an open-source platform that orchestrates teams of real CLI coding agents. Team topology is declared as org-chart YAML (or custom logic as TypeScript pattern modules); the control plane spawns agents into that structure across multiple runtimes and routes work through the hierarchy with verification-driven escalation.

### Key Features

- **Pattern as Code**: Org-chart YAML for team topologies, plus version-controlled TypeScript pattern modules (`@parallaxai/patterns`) for custom logic
- **Verification-Driven Confidence**: Per-role escalation (`accept` / `retryBelow` / `escalateBelow`) fed by test/review signals — attention allocation, not a correctness claim ([CONFIDENCE.md](CONFIDENCE.md))
- **Language Agnostic**: Maintained TS + Python SDKs; any language joins over the gRPC contract
- **Multi-Runtime**: Local PTY, Docker containers, Kubernetes pods, or a NAT-traversing gateway for edge agents
- **Managed Threads**: Long-lived supervised work streams for coding and orchestration
- **Git Integration**: Automatic workspace provisioning, branching, and PR creation
- **Enterprise Ready**: Licensing, RBAC, audit logging, scheduled execution

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         Client Layer                                 │
│  ┌──────────┐  ┌──────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │   CLI    │  │ Web Dashboard│  │   REST API  │  │   gRPC API  │  │
│  └──────────┘  └──────────────┘  └─────────────┘  └─────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                        Control Plane                                 │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                     Pattern Engine                            │  │
│  │  ┌────────────┐  ┌────────────┐  ┌────────────────────────┐  │  │
│  │  │  Pattern   │  │  Pattern   │  │   Execution Manager    │  │  │
│  │  │  Loader    │  │  Runtime   │  │   (scheduling, events) │  │  │
│  │  └────────────┘  └────────────┘  └────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────────┘  │
│  ┌────────────┐  ┌────────────┐  ┌────────────┐  ┌────────────┐   │
│  │  Service   │  │ Credential │  │ Workspace  │  │  Thread    │   │
│  │  Registry  │  │  Service   │  │  Service   │  │ Persistence│   │
│  │   (etcd)   │  │ (GitHub)   │  │   (git)    │  │ & Memory   │   │
│  └────────────┘  └────────────┘  └────────────┘  └────────────┘   │
│  ┌────────────┐  ┌────────────┐                                     │
│  │  Thread    │  │  Scheduler │                                     │
│  │Preparation │  │  Service   │                                     │
│  │  Service   │  │  (cron)    │                                     │
│  └────────────┘  └────────────┘                                     │
└────────────────────────────┬────────────────────────────────────────┘
                             │ gRPC / HTTP
┌────────────────────────────┴────────────────────────────────────────┐
│                       Agent Runtime Layer                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │ Local Runtime│  │Docker Runtime│  │  Kubernetes Runtime      │  │
│  │  (PTY/CLI)   │  │ (containers) │  │      (pods)              │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└────────────────────────────┬────────────────────────────────────────┘
                             │
┌────────────────────────────┴────────────────────────────────────────┐
│                         Agent Layer                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│  │TypeScript│  │  Python  │  │    Go    │  │   Rust   │  ← SDKs   │
│  │  Agent   │  │  Agent   │  │  Agent   │  │  Agent   │           │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘           │
│  ┌──────────────────────────────────────────────────────┐          │
│  │  CLI Agents: Claude Code, Codex CLI, Gemini CLI      │          │
│  └──────────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────────┘
```

## Core Components

### Control Plane (`/packages/control-plane`)

The central orchestration service that manages pattern execution:

| Component | Purpose |
|-----------|---------|
| **Pattern Engine** | Executes pattern modules and org-chart workflows |
| **Pattern Modules** | TypeScript pattern library (`@parallaxai/patterns`) |
| **Service Registry** | Agent discovery via etcd |
| **Execution Events** | WebSocket streaming of execution progress |
| **Thread Persistence** | Stores long-lived thread state and events |
| **Thread Preparation** | Builds workspace, memory, and approval context before spawn |
| **Memory Services** | Shared decisions and episodic experiences for future work |
| **Scheduler Service** | Cron-based pattern scheduling (Enterprise) |
| **Trigger Service** | Webhook and event-based triggers (Enterprise) |
| **Database** | PostgreSQL/TimescaleDB for executions, patterns |

### Agent Runtimes

Three runtime environments for spawning and managing agents:

| Runtime | Package | Port | Use Case |
|---------|---------|------|----------|
| **Local** | `runtime-local` | 9876 | Development, CLI agents (PTY-based) |
| **Docker** | `runtime-docker` | 9877 | Isolated containers, reproducible |
| **Kubernetes** | `runtime-k8s` | 9878 | Production, auto-scaling |

Each runtime provides:
- Agent lifecycle management (spawn, stop, restart)
- Health monitoring and status reporting
- WebSocket terminal streaming for CLI agents
- Resource limits and isolation
- Thread-backed worker execution through the shared runtime contract

### Managed Threads

Managed threads are the control-plane abstraction Parallax now uses for long-lived supervised work.

They sit above concrete agent sessions and give the orchestrator a stable unit for:

- coding swarms in mutable repositories
- explicit supervision over blocked, idle, and turn-complete states
- thread summaries and completion artifacts
- shared-decision capture across workers
- episodic memory retrieval and injection into future work

At the contract level:

- `agent` is the execution substrate
- `thread` is the orchestration substrate

This keeps Parallax's explicit coordination model intact while making distributed CLI-agent swarms a first-class feature.

### Workspace Service

Git workspace provisioning for coding tasks:

| Feature | Description |
|---------|-------------|
| **Branch Naming** | `parallax/{execution-id}/{role}-{slug}` |
| **Credential Service** | Short-lived GitHub App tokens |
| **Workspace Provisioning** | Clone repos into isolated directories |
| **PR Creation** | Automatic pull requests after execution |
| **Audit Logging** | All credential grants tracked in database |

### Patterns (`/packages/patterns`)

Built-in pattern modules and the `PatternModule` contract. Custom-logic
patterns are TypeScript modules (`execute(ctx)`) deployed with the control
plane; org-chart topologies are YAML. See "Pattern System" below.

### Confidence (`/packages/confidence`)

`@parallaxai/confidence` — the `Confident<T>` type and combinators
(`cf`/`best`/`gate`/`uncertain`/`coalesce`, aggregation) that the escalation
policy is built on. See [CONFIDENCE.md](CONFIDENCE.md) and [VERIFY.md](VERIFY.md).

### SDKs

Two maintained agent SDKs; other languages join over the raw gRPC contract
(`/proto`, see [any-language.md](any-language.md)).

| SDK | Package | Protocol | Status |
|-----|---------|----------|--------|
| TypeScript | `sdk-typescript` | gRPC | ✅ Maintained |
| Python | `sdk-python` | gRPC | ✅ Maintained |
| Go | `examples/polyglot/go-agent` | gRPC | Example (not an SDK) |
| Rust | `examples/polyglot/rust-agent` | gRPC | Example (not an SDK) |

## Package Structure

```
parallax/
├── apps/
│   ├── docs/                 # Docusaurus documentation site
│   ├── web-dashboard/        # React admin dashboard
│   ├── marketing/            # Marketing site
│   ├── demo-typescript/      # TypeScript demo app
│   └── demo-python/          # Python demo app
│
├── packages/
│   ├── control-plane/        # Core orchestration service (+ org-patterns compiler/executor)
│   ├── patterns/             # PatternModule contract + built-in pattern library
│   ├── confidence/           # @parallaxai/confidence — the confidence algebra
│   │
│   ├── runtime-local/        # Local PTY-based runtime
│   ├── runtime-docker/       # Docker container runtime
│   ├── runtime-k8s/          # Kubernetes pod runtime
│   ├── runtime-mcp/          # MCP surface for runtime/thread operations
│   ├── runtime-interface/    # Common runtime interface
│   │
│   ├── sdk-typescript/       # TypeScript agent SDK (maintained)
│   ├── sdk-python/           # Python agent SDK (maintained)
│   │
│   ├── cli/                  # Command-line interface
│   ├── telemetry/            # OpenTelemetry integration
│   ├── auth/                 # Authentication service
│   ├── security/             # mTLS and certificates
│   └── ...                   # confidence-tracker, circuit-breaker, ha, etc.
│
├── patterns/                 # Org-chart YAML patterns (org-*.yaml)
│
├── examples/
│   └── polyglot/             # Go + Rust example agents (gRPC, not SDKs)
│
├── demos/
│   ├── coding-swarm/         # Flagship: CLI-agent org-chart team
│   ├── multi-model-voting/   # Multi-agent voting demo
│   ├── pr-review-bot/        # PR review automation
│   └── ...                   # document-analysis, rag-quality-gate, etc.
│
├── monitoring/               # Prometheus/Grafana/Jaeger configs
├── scripts/                  # Development & deployment scripts
├── k8s/                      # Kubernetes manifests & Helm charts
└── docs/                     # Architecture & guides
```

## Pattern System

### TypeScript Pattern Modules

Custom-logic patterns are TypeScript modules deployed with the control plane
(see `packages/patterns` for the contract and built-in library). The engine
selects agents and fans the task out; the module aggregates the collected
results using the `@parallaxai/confidence` algebra:

```typescript
import { averageConfidence, cf } from '@parallaxai/confidence';
import type { PatternModule } from '@parallaxai/patterns';

export const consensusBuilder: PatternModule = {
  meta: {
    name: 'ConsensusBuilder',
    version: '2.0.0',
    description: 'Multi-agent consensus with confidence tracking',
    minAgents: 2,
  },
  async execute(ctx) {
    const avg = averageConfidence(
      ctx.results.map((r) => cf(r.result, r.confidence))
    );
    return cf(
      { decision: avg > 0.8 ? 'consensus' : 'escalate-to-human', avg },
      avg
    );
  },
};
```

The confidence library ports the full uncertainty algebra (min-propagation
chains, best-of selection, threshold gates, `uncertain()` band dispatch,
voting/consensus aggregation) — see `packages/confidence/README.md` for the
complete operator reference.

### Org-Chart YAML Patterns

Team topologies are declared in YAML (`patterns/org-*.yaml`) and executed by
the workflow executor with managed CLI-agent threads — roles, hierarchy,
workflow steps, and escalation paths. Patterns can request git workspace
provisioning (`workspace: { enabled: true, createPr: true }`) and
thread-backed execution (`threads: { enabled: true, agentType: "codex" }`).

## Communication Flow

### Pattern Execution

```
1. Client Request
   └─→ REST/gRPC API
       └─→ Pattern Engine
           ├─→ Resolve pattern (module manifest or YAML)
           ├─→ Provision workspace (if needed)
           ├─→ Select agents from registry
           └─→ Execute via runtime
               ├─→ Spawn agents (PTY/Docker/K8s)
               ├─→ Send tasks via gRPC
               ├─→ Collect results with confidence
               ├─→ Aggregate using pattern logic
               └─→ Finalize workspace (push, create PR)
```

### WebSocket Streaming

Real-time execution progress via WebSocket:

```
ws://control-plane/api/executions/{id}/stream

Events:
- started
- workspace_provisioning / workspace_ready
- agents_selected
- agent_started / agent_completed / agent_failed
- progress
- workspace_pr_created
- completed / failed
```

### Terminal Streaming (for CLI agents)

```
ws://runtime/ws/agents/{id}/terminal

Raw PTY data for xterm.js integration
```

## Enterprise Features

Licensed features for production deployments:

| Feature | License Tier | Description |
|---------|--------------|-------------|
| **Scheduled Patterns** | Enterprise | Cron-based pattern execution |
| **Webhook Triggers** | Enterprise | HTTP webhook triggers |
| **Event Triggers** | Enterprise | Event-driven pattern execution |
| **Multi-User RBAC** | Enterprise | Role-based access control |
| **Audit Logging** | Enterprise | Complete audit trail |
| **Pattern Management** | Enterprise | Database-backed patterns with versioning |
| **SSO Integration** | Enterprise Plus | SAML/OAuth2 authentication |
| **High Availability** | Enterprise Plus | Multi-instance clustering |

## Deployment

### Development

```bash
# Start all services locally
./scripts/start-local.sh

# Or individual components
pnpm --filter @parallaxai/control-plane start
pnpm --filter @parallaxai/runtime-local start
```

### Production (Docker Compose)

```yaml
services:
  control-plane:
    image: parallax/control-plane:latest
    environment:
      - DATABASE_URL=postgresql://...
      - PARALLAX_GITHUB_APP_ID=...
      - PARALLAX_LOCAL_RUNTIME_URL=http://runtime:9876
    ports:
      - "3000:3000"

  runtime:
    image: parallax/runtime-local:latest
    ports:
      - "9876:9876"

  etcd:
    image: quay.io/coreos/etcd:v3.5.0
```

### Production (Kubernetes)

```bash
helm install parallax ./k8s/helm/parallax \
  --set license.key=$PARALLAX_LICENSE_KEY \
  --set github.appId=$GITHUB_APP_ID \
  --set github.privateKey="$(cat private-key.pem)"
```

## Security

| Layer | Mechanism |
|-------|-----------|
| **API** | JWT authentication, API keys |
| **Agent Communication** | mTLS (production) |
| **Git Credentials** | Short-lived GitHub App tokens (1 hour max) |
| **Secrets** | Kubernetes secrets, env injection |
| **Audit** | All actions logged to database |

## Observability

- **Metrics**: Prometheus metrics at `/metrics`
- **Tracing**: OpenTelemetry with Jaeger/OTLP export
- **Logging**: Structured JSON logs (pino)
- **Dashboards**: Grafana dashboards in `/monitoring`
- **Health**: `/health`, `/health/ready`, `/health/live` endpoints

## API Reference

### REST API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/patterns` | GET | List patterns |
| `/api/patterns/:name` | GET | Get pattern details |
| `/api/executions` | POST | Execute pattern |
| `/api/executions/:id` | GET | Get execution status |
| `/api/executions/:id/stream` | WS | Stream execution events |
| `/api/agents` | GET | List registered agents |
| `/api/workspaces` | POST | Provision workspace |
| `/api/credentials/git` | POST | Request git credentials |

### gRPC API

See `/packages/control-plane/proto/` for full definitions.

## Related Documentation

- [Getting Started](./GETTING_STARTED.md)
- [Pattern SDK](./PATTERN_SDK_ARCHITECTURE.md)
- [Orchestration Patterns](./ORCHESTRATION_PATTERNS.md)
- [Production Checklist](./PRODUCTION_CHECKLIST.md)
- [Testing Guide](./TESTING_GUIDE.md)

# Parallax Architecture

> **Pattern-Driven AI Agent Orchestration Platform**

## Overview

Parallax is an open-source AI orchestration platform that coordinates agent swarms using uncertainty-aware patterns written as TypeScript modules. It enables complex multi-agent workflows with confidence tracking, automatic consensus building, and enterprise-grade reliability.

### Key Features

- **Pattern as Code**: Orchestration patterns are version-controlled TypeScript modules (`@parallaxai/patterns`), plus org-chart YAML for team topologies
- **Primitive Composition**: 30+ composable primitives create unlimited patterns
- **Uncertainty-Aware**: All decisions include confidence scores (0.0-1.0)
- **Language Agnostic**: Agents in TypeScript, Python, Go, Rust, or any language
- **Multi-Runtime**: Local PTY, Docker containers, or Kubernetes pods
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

### Pattern SDK (`/packages/pattern-sdk`)

Tools for creating and testing patterns:

- Pattern generation from primitives
- Validation and type checking
- Local testing with mock agents
- Pattern versioning support

### SDKs

Language-specific SDKs for building agents:

| SDK | Package | Protocol | Status |
|-----|---------|----------|--------|
| TypeScript | `sdk-typescript` | gRPC | ✅ Complete |
| Python | `sdk-python` | gRPC | ✅ Complete |
| Go | `sdk-go` | gRPC | ✅ Complete |
| Rust | `sdk-rust` | gRPC | ✅ Complete |

## Package Structure

```
parallax/
├── apps/
│   ├── docs/                 # Docusaurus documentation site
│   ├── web-dashboard/        # React admin dashboard
│   ├── demo-typescript/      # TypeScript demo app
│   ├── demo-python/          # Python demo app
│   ├── demo-go/              # Go demo app
│   └── demo-rust/            # Rust demo app
│
├── packages/
│   ├── control-plane/        # Core orchestration service
│   ├── pattern-sdk/          # Pattern generation toolkit
│   ├── primitives/           # Composable pattern building blocks
│   │
│   ├── runtime-local/        # Local PTY-based runtime
│   ├── runtime-docker/       # Docker container runtime
│   ├── runtime-k8s/          # Kubernetes pod runtime
│   ├── runtime-interface/    # Common runtime interface
│   │
│   ├── sdk-typescript/       # TypeScript agent SDK
│   ├── sdk-python/           # Python agent SDK
│   ├── sdk-go/               # Go agent SDK
│   ├── sdk-rust/             # Rust agent SDK
│   │
│   ├── cli/                  # Command-line interface
│   ├── telemetry/            # OpenTelemetry integration
│   ├── auth/                 # Authentication service
│   ├── security/             # mTLS and certificates
│   └── monitoring/           # Prometheus/Grafana stack
│
├── patterns/                 # Pattern library
│   ├── aggregation/          # consensus, voting, merge, reduce
│   ├── execution/            # parallel, sequential, race, batch
│   ├── control/              # retry, fallback, circuit, timeout
│   ├── confidence/           # threshold, transform
│   ├── coordination/         # delegate, quorum, synchronize
│   └── ...                   # 30+ primitives total
│
├── demos/                    # Example applications
│   ├── multi-model-voting/   # Multi-agent voting demo
│   ├── document-analysis/    # Document analysis pipeline
│   ├── pr-review-bot/        # PR review automation
│   ├── specialized-extractors/
│   ├── prompt-testing/
│   ├── translation-verification/
│   └── rag-quality-gate/
│
├── scripts/                  # Development & deployment scripts
├── k8s/                      # Kubernetes manifests & Helm charts
├── docker/                   # Docker configurations
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

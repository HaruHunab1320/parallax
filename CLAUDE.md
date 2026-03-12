# CLAUDE.md

## Security

**This is a public repository. NEVER commit hardcoded secrets, API keys, passwords, tokens, or credentials anywhere in the codebase.** This includes:
- API keys (Gemini, OpenAI, Anthropic, GCP, etc.)
- Passwords or auth tokens
- Private keys or certificates
- Connection strings with credentials
- `.env` files (already in `.gitignore`)

Always use environment variables for secrets. If you spot a secret in code, remove it immediately and flag it to the user.

## Repository Overview

Parallax is an AI agent orchestration platform with uncertainty/confidence as a first-class citizen. It coordinates multiple AI agents via gRPC, executes orchestration patterns written in Prism (a custom DSL), and provides runtime environments for agents across local, Docker, and Kubernetes deployments.

## Monorepo Structure

```
parallax/
  packages/         # Core libraries and services (31 packages)
  apps/             # Full applications (web dashboard, docs, marketing)
  demos/            # Demo applications (signal-noise, pi-demo, etc.)
  examples/         # Example agent integrations
  proto/            # Protocol Buffer definitions (source of truth)
  k8s/              # Kubernetes configs and Helm charts
  terraform/        # GCP infrastructure (GKE, Cloud SQL, Redis)
  monitoring/       # Grafana/Prometheus/Jaeger configs
  scripts/          # Utility scripts
  patterns/         # Pattern definitions
```

## Build System

- **Package manager**: pnpm (v10.11.0) with workspaces
- **Task runner**: Turbo (v2.3.3)
- **TypeScript compiler**: tsc for most packages, tsup for published libraries needing dual CJS/ESM
- **Workspace deps**: Use `workspace:*` protocol — must be replaced with real versions for standalone deployment (e.g., Raspberry Pi)

Key commands:
```bash
pnpm build          # Build all packages (excludes demos/examples/apps)
pnpm test           # Run all tests via Turbo
pnpm dev:control-plane  # Dev mode for control plane
pnpm dev:web        # Dev mode for web dashboard
```

## Package Naming

Not all packages use the `@parallaxai` npm scope. Several published packages are unscoped:

| Package | npm name | Description |
|---------|----------|-------------|
| pty-manager | `pty-manager` | PTY session manager with pluggable adapters |
| pty-state-capture | `pty-state-capture` | VT-aware frame reduction from CLI sessions |
| pty-console | `pty-console` | Operator console bridge for PTY grid UIs |
| tmux-manager | `tmux-manager` | Tmux-based session manager |
| adapter-types | `adapter-types` | Shared adapter interface/base class |
| coding-agent-adapters | `coding-agent-adapters` | CLI adapters (Claude Code, Gemini, Codex, Aider) |
| agent-adapter-monitor | `agent-adapter-monitor` | Automated CLI adapter monitoring |
| git-workspace-service | `git-workspace-service` | Git workspace provisioning with OAuth |
| parallax-agent-runtime | `parallax-agent-runtime` | MCP server for agent orchestration |

There is also `pty-manager-internal-tracing` (private, internal fork for research).

The Python SDK uses `@prism-coordination/python` scope (private).

## Key Packages

### Platform Core
- **control-plane** — Main coordination hub: gRPC server, pattern engine, agent registry, Prisma ORM, etcd, Redis
- **data-plane** — Runtime infrastructure for agent execution
- **runtime** — Core runtime with Prism language integration
- **runtime-interface** — Shared interfaces for all runtime implementations

### Runtime Implementations
- **runtime-local** — Local PTY-based runtime (uses pty-manager + coding-agent-adapters)
- **runtime-docker** — Docker container runtime with per-agent images
- **runtime-k8s** — Kubernetes-based runtime
- **runtime-mcp** — MCP server wrapping runtime-local

### SDKs
- **sdk-typescript** — Primary SDK: `ParallaxAgent` base class, gRPC clients, proto definitions
- **sdk-python** — Python SDK (Poetry-based, private)
- **sdk-go**, **sdk-rust** — Go and Rust SDKs

### Agent Tooling
- **pty-manager** — PTY lifecycle management with pluggable adapters
- **coding-agent-adapters** — CLI adapters for Claude Code, Gemini CLI, Codex, Aider, Hermes
- **tmux-manager** — Tmux-based session manager (uses adapter-types)
- **adapter-types** — Shared base class and interfaces for pty-manager and tmux-manager

## Code Conventions

### TypeScript
- **Strict mode** enabled globally (`tsconfig.json`)
- Target: ES2022, Module: CommonJS (most packages) or ESNext
- `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns` enforced
- Declaration files (.d.ts) generated for all packages

### Imports & Exports
- Prefer **named exports** (not default exports)
- Use **barrel exports** via `index.ts` files
- Relative imports within packages, workspace imports between packages

### Naming
- Files: `kebab-case.ts` for modules, `PascalCase.ts` sometimes for classes
- Classes: `PascalCase` — `PatternEngine`, `AgentProxy`, `DatabaseService`
- Interfaces: `PascalCase`, sometimes `I`-prefixed — `IPatternEngine`, `IAgentRegistry`
- Variables/methods: `camelCase`
- Constants: `UPPER_SNAKE_CASE` — `PROTO_DIR`, `TOOL_PERMISSIONS`

### Logging
- **Pino** exclusively — never use `console.log` in library/service code
- Structured logging: `logger.info({ agentId, status }, 'message')`
- Child loggers for components: `logger.child({ component: 'AuthService' })`

### Error Handling
- Try-catch with structured Pino logging
- gRPC errors map to status codes (`INTERNAL`, `INVALID_ARGUMENT`, `UNAUTHENTICATED`)
- Pattern: `error instanceof Error ? error.message : 'Unknown error'`

### Validation
- **Zod** for all API input validation
- Schemas use `.describe()` for documentation
- Types inferred from schemas: `type SpawnInput = z.infer<typeof SpawnInputSchema>`

### Testing
- **Vitest** exclusively (not Jest)
- Test files: `*.test.ts` colocated with source or in `__tests__/` directories
- Globals enabled, v8 coverage provider
- Mocking via `vi.fn()` and `vi.mock()`

### Formatting
- Prettier: single quotes, trailing commas (es5), 2-space indent, 80 char width, semicolons
- ESLint with `@typescript-eslint` (flat config)

## gRPC & Protobuf

- Proto source of truth: `/proto/*.proto` (7 files: confidence, registry, gateway, coordinator, patterns, executions)
- Uses `@grpc/proto-loader` for dynamic loading (not full code generation)
- Proto loader options: `keepCase: true, longs: String, enums: String, defaults: true, oneofs: true`
- `google.protobuf.Struct` requires manual conversion to/from plain JS objects (see `structToObject` in pattern-service.ts)
- SDK bundles protos in its `proto/` directory for standalone use

## Infrastructure

### GCP / Kubernetes
- GKE cluster managed via Terraform (`terraform/gcp/`)
- Helm chart: `k8s/helm/parallax/`
- gRPC LoadBalancer: `34.58.31.212:8081` (control plane)
- Namespaces: `parallax` (platform), `parallax-agents` (spawned agents)

### CI/CD (GitHub Actions)
- **ci.yml** — PR checks: lint, typecheck, test
- **build.yml** — Docker build & push to GCP Artifact Registry (on push to main)
- **deploy.yml** — GKE deployment via Helm + Terraform (after build)
- Images: `parallax-control-plane`, `parallax-web-dashboard`, `parallax-runtime-k8s`

### Docker
- Agent images in `packages/runtime-docker/images/` (base, Claude, Codex, Gemini, Aider)
- `docker-compose.yml` at root for local dev stack

## Agent Architecture

### ParallaxAgent Base Class (sdk-typescript)
All agents extend `ParallaxAgent` and implement `analyze(task, data)`:
```typescript
class MyAgent extends ParallaxAgent {
  constructor() {
    super('agent-id', 'Agent Name', ['capability1'], { key: 'value' });
  }
  async analyze(task: string, data?: any): Promise<AgentResponse> {
    // Return { value, confidence, reasoning }
  }
}
```

### Connection Modes
- **Direct (serve)**: Agent starts gRPC server, registers with control plane registry
- **Gateway (connectViaGateway)**: Agent connects outbound to control plane — works behind NAT (used by Raspberry Pi agents)

### AgentResponse
Every agent response includes a confidence score (0.0-1.0). The platform uses confidence for routing, aggregation, and pattern execution decisions.

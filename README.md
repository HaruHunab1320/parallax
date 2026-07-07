# Parallax

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/docs/static/img/parallax-DARK.png" />
    <img src="apps/docs/static/img/parallax-LIGHT.png" alt="Parallax Logo" width="320" />
  </picture>
</p>

<p align="center">
  <strong>Pattern-driven agent orchestration with runtimes, workspaces, and managed threads</strong>
</p>

<p align="center">
  <a href="https://parallaxai.dev">Website</a> ·
  <a href="https://docs.parallaxai.dev">Docs</a>
</p>

---

## What Parallax Is

Parallax is a control plane for orchestrating agents with explicit patterns, org charts, and runtime-backed execution.

At its core, Parallax gives you:

- **TypeScript patterns** with confidence-aware logic (`@parallaxai/confidence`), plus **org-chart YAML** for team topologies
- **A control plane** that loads patterns, manages executions, and streams events
- **Multiple runtimes** for local PTY sessions, Docker containers, and Kubernetes pods
- **Managed threads** for long-lived supervised work, especially coding tasks in mutable workspaces
- **Workspace and memory services** for repo provisioning, shared decisions, and episodic experience reuse

The architectural model is:

- `agent` = execution substrate
- `thread` = orchestration substrate

That keeps Parallax explicit and deterministic while still supporting long-running CLI-agent work with tools like Claude Code, Codex CLI, Gemini CLI, and Aider.

## Current Architecture

Parallax is organized into four main layers:

1. **Client layer**
   CLI, web dashboard, docs site, and external API consumers.
2. **Control plane**
   Pattern engine, execution management, thread persistence, memory, scheduling, and workspace preparation.
3. **Runtime layer**
   `runtime-local`, `runtime-docker`, and `runtime-k8s` implement agent and thread execution.
4. **Agent layer**
   SDK agents plus interactive coding CLIs and other runtime-backed workers.

Key architectural capabilities today:

- pattern-driven orchestration in TypeScript with confidence-aware aggregation
- explicit org-chart and workflow execution
- managed thread APIs for spawn, supervision, events, input, and stop
- workspace-aware coding execution with context file injection
- shared decisions and episodic experiences for future thread preparation
- runtime abstraction across local, Docker, and Kubernetes

For the deeper architecture docs, start here:

- [Architecture](docs/ARCHITECTURE.md)
- [Thread Runtime Proposal](docs/THREAD_RUNTIME_PROPOSAL.md)
- [Thread Runtime Implementation Plan](docs/THREAD_RUNTIME_IMPLEMENTATION_PLAN.md)

## Core Concepts

- **Patterns** define orchestration logic as TypeScript modules (`@parallaxai/patterns`) or org-chart YAML.
- **Primitives** are the reusable building blocks for execution, aggregation, control, confidence, and thread supervision.
- **Runtimes** are the execution backends that actually host agents or CLI workers.
- **Managed threads** are the long-lived units the control plane supervises over time.
- **Workspaces** provide repo-aware execution contexts for coding tasks.
- **Memory** captures compressed decisions and prior outcomes for future work.

## Quick Start

### Prerequisites

- Node.js `>= 18`
- `pnpm >= 10.11.0`
- Docker for local infrastructure

### Install

```bash
pnpm install
pnpm build
```

### Start the platform

Basic local startup:

```bash
pnpm start
```

This is the simplest way to bring up Parallax for development.

If you want the fuller local stack, including database-backed control-plane features:

```bash
pnpm run infra:all
pnpm run dev:control-plane
```

Useful next commands:

```bash
pnpm run dev:web
pnpm run demo:patterns
pnpm run test
pnpm run type-check
```

For more startup modes, see:

- [Startup Guide](docs/STARTUP_GUIDE.md)
- [Quick Reference](docs/QUICK_REFERENCE.md)
- [Testing Guide](docs/TESTING_GUIDE.md)

## Managed Threads

Managed threads are now a first-class part of Parallax.

Use them when you need:

- long-horizon coding tasks
- supervised CLI workers in real repositories
- normalized events like `thread_ready`, `thread_blocked`, and `thread_turn_complete`
- memory injection before spawn
- durable thread state and event history

The main REST surface lives under:

- `/api/managed-threads`

See:

- [Managed Threads API](apps/docs/docs/api/managed-threads.md)
- [Threads Concept Doc](apps/docs/docs/concepts/threads.md)

## Repository Structure

```text
parallax/
├── apps/
│   ├── docs/                   # Docusaurus docs site
│   ├── marketing/              # Marketing site
│   ├── web-dashboard/          # Web dashboard
│   └── demo-*/                 # Demo applications
├── packages/
│   ├── control-plane/          # Main orchestration service
│   ├── confidence/             # Confidence algebra (@parallaxai/confidence)
│   ├── patterns/               # Pattern contract + built-in library
│   ├── runtime-interface/      # Shared runtime and thread contracts
│   ├── runtime-local/          # Local PTY-based runtime
│   ├── runtime-docker/         # Docker runtime
│   ├── runtime-k8s/            # Kubernetes runtime
│   ├── runtime-mcp/            # MCP surface for runtime and thread operations
│   ├── sdk-typescript/         # TypeScript agent SDK
│   ├── sdk-python/             # Python agent SDK
│   └── ...                     # Auth, telemetry, CLI, and support packages
├── examples/                   # Agent examples (TS, Python, Go, Rust)
├── demos/                      # Runnable demos
├── monitoring/                 # Prometheus/Grafana/Jaeger configs
├── patterns/                   # Example patterns and compiled workflow artifacts
├── scripts/                    # Development, smoke, and maintenance scripts
├── k8s/                        # Kubernetes manifests and Helm charts
└── docs/                       # Internal architecture and implementation docs
```

## What To Read Next

- [Architecture](docs/ARCHITECTURE.md)
- [Documentation Index](docs/README.md)
- [Patterns README](packages/patterns/README.md)
- [Confidence README](packages/confidence/README.md)
- [Runtime MCP README](packages/runtime-mcp/README.md)
- [Agents in Any Language](docs/any-language.md)

## Links

- Website: https://parallaxai.dev
- Docs: https://docs.parallaxai.dev
- GitHub: https://github.com/HaruHunab1320/parallax
- Discord: https://discord.gg/jdjqvMa2
- X: https://x.com/Parallax__AI

## Licensing

Parallax is open source at the core under Apache 2.0, with enterprise features
available under a commercial license. See `LICENSE` and `LICENSE-ENTERPRISE`.

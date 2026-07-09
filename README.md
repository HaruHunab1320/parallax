# Parallax

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="apps/docs/static/img/parallax-DARK.png" />
    <img src="apps/docs/static/img/parallax-LIGHT.png" alt="Parallax Logo" width="320" />
  </picture>
</p>

<p align="center">
  <strong>Orchestrate teams of real CLI coding agents — across your laptop, containers, Kubernetes, or edge hardware — with verification-driven escalation built in.</strong>
</p>

<p align="center">
  <a href="https://parallaxai.dev">Website</a> ·
  <a href="https://docs.parallaxai.dev">Docs</a>
</p>

---

## What Parallax Is

Parallax is a control plane for orchestrating **teams of real CLI coding agents** — Claude Code, Codex CLI, Gemini CLI, Aider. You define the team as an org chart in YAML (roles, hierarchy, workflow); Parallax spawns the agents into that structure across whatever hardware you have — local PTYs, Docker, Kubernetes, or remote devices behind NAT — routes work through the hierarchy, and uses **verification** (do the tests pass? does a reviewer approve?) to decide when to accept a result, retry it, or escalate to a supervisor.

At its core, Parallax gives you:

- **Org-chart YAML** for team topologies, plus **TypeScript pattern modules** (`@parallaxai/patterns`) for custom-logic orchestration
- **A control plane** that loads patterns, manages executions, and streams events
- **Multiple runtimes** for local PTY sessions, Docker containers, Kubernetes pods, and a gateway for NAT-traversing edge agents
- **Managed threads** for long-lived supervised work, especially coding tasks in mutable workspaces
- **Verification-driven confidence** — per-role escalation policy (`accept` / `retryBelow` / `escalateBelow`) fed by test/review signals, not self-reported guesses ([positioning](docs/CONFIDENCE.md))
- **Workspace and memory services** for repo provisioning, shared decisions, and episodic experience reuse

The architectural model is:

- `agent` = execution substrate
- `thread` = orchestration substrate

That keeps Parallax explicit and deterministic while supporting long-running CLI-agent work. The flagship demo — [`demos/coding-swarm`](demos/coding-swarm) — runs an architect + engineer team across a laptop or a Raspberry Pi fleet from the same YAML.

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

- org-chart and workflow execution over managed CLI-agent threads
- TypeScript pattern modules for custom orchestration logic
- verification-driven confidence: per-role `accept` / `retryBelow` / `escalateBelow` escalation
- managed thread APIs for spawn, supervision, events, input, and stop
- workspace-aware coding execution with context file injection
- shared decisions and episodic experiences for future thread preparation
- runtime abstraction across local, Docker, Kubernetes, and a NAT-traversing gateway

For the deeper architecture docs, start here:

- [Architecture](docs/ARCHITECTURE.md)
- [Confidence as triage](docs/CONFIDENCE.md) — why confidence is verification, not calibration
- [The `verify` contract](docs/VERIFY.md) — how verification feeds the escalation policy

## Core Concepts

- **Patterns** define orchestration logic as org-chart YAML (team topology) or TypeScript modules (`@parallaxai/patterns`, an `execute(ctx)` contract deployed with the control plane).
- **Confidence** is a routing signal grounded in verification — tests, acceptance checks, reviewer verdicts — that drives the per-role escalation policy. It is *attention allocation*, not a claim of correctness ([details](docs/CONFIDENCE.md)).
- **Runtimes** are the execution backends that host agents or CLI workers (local PTY, Docker, Kubernetes, gateway).
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
- [Confidence as triage](docs/CONFIDENCE.md) and [the `verify` contract](docs/VERIFY.md)
- [Coding Swarm demo](demos/coding-swarm/README.md) — the flagship
- [Patterns README](packages/patterns/README.md)
- [Confidence README](packages/confidence/README.md)
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

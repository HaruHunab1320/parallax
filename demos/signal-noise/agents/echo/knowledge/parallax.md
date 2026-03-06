# Parallax — Architecture Review (Portfolio Notes)

## One‑line summary
Pattern‑driven, uncertainty‑aware multi‑agent orchestration platform that coordinates language‑agnostic agents through a control plane, multiple runtime backends, and a Prism DSL + Pattern SDK toolchain.

## Architecture at a glance (diagram)
```mermaid
flowchart TB
  subgraph Clients[Client Layer]
    CLI[CLI]
    Web[Web Dashboard]
    REST[REST API]
    GRPC[gRPC API]
  end

  subgraph Control[Control Plane]
    PE[Pattern Engine]
    PR[Prism Runtime]
    EM[Execution Manager]
    SR[Service Registry
(etcd)]
    WS[Workspace Service
(git + credentials)]
    SCH[Scheduler / Triggers
(Enterprise)]
    DB[(Postgres / Timescale)]
  end

  subgraph Runtimes[Agent Runtime Layer]
    RL[Local Runtime
(PTY)]
    RD[Docker Runtime]
    RK[Kubernetes Runtime]
  end

  subgraph Agents[Agent Layer]
    TS[TypeScript]
    PY[Python]
    GO[Go]
    RS[Rust]
    CLIAG[CLI Agents
(Claude/Codex/Gemini)]
  end

  Clients --> Control
  Control --> Runtimes
  Runtimes --> Agents
  Control <--> DB
```


## Core ideas and responsibilities
- **Pattern as Code:** Orchestration is expressed as version‑controlled `.prism` files; patterns compose 30+ primitives (parallel, consensus, retry, etc.) with confidence scoring.
- **Uncertainty‑aware execution:** Every decision carries confidence (0.0–1.0) with escalation paths (e.g., human review) when thresholds aren’t met.
- **Control plane orchestration:** Central service loads patterns, schedules executions, selects agents, and aggregates results. It also streams execution events over WebSockets.
- **Multi‑runtime agent execution:** Local (PTY) for dev/CLI agents, Docker for isolation, Kubernetes for scale/production.
- **Language‑agnostic agents:** Official SDKs for TypeScript/Python/Go/Rust; agents register and receive tasks over gRPC.
- **Git‑centric workspaces:** Optional workspace provisioning for coding tasks (short‑lived GitHub tokens, branches, auto‑PRs).

## Components worth calling out
- **Pattern Engine + Prism Runtime:** Parses `.prism`, validates semantics, executes primitives, and manages execution lifecycles.
- **Service Registry:** Uses etcd for agent discovery and availability.
- **Agent Runtime Service:** Spawns and manages CLI agents (Claude Code, Codex, Gemini) with terminal streaming and lifecycle events.
- **Pattern SDK:** Development‑time generator that produces `.prism` files (akin to Prisma migrations). Keeps runtime LLM‑free.

## Execution flow (simplified)
- Client calls REST/gRPC → Control Plane loads a `.prism` pattern → optional workspace provision → agents selected from registry → runtime spawns agent sessions → results aggregated with confidence → optional PR creation → execution finalized + streamed events.

## Deployment and ops posture
- **Local dev:** `control-plane` + `runtime-local` + etcd/Postgres.
- **Production:** Docker Compose or Kubernetes (Helm) with mTLS, JWT/API keys, Prometheus/Grafana, OpenTelemetry.
- **Enterprise‑only features:** scheduling/cron, triggers, RBAC, audit logging, HA/SSO.

## Current vs. future hosting model
- **Current model:** BYOA (Bring Your Own Agent); customer‑hosted agents connect via gRPC.
- **Future concept (document dated January 2025):** Hosted agent layer managed by Parallax for turnkey deployment and scaling. Not part of current product scope.

## Repo structure (high‑signal)
- `packages/control-plane` — orchestration service
- `packages/runtime-*` — local/docker/k8s agent runtimes
- `packages/sdk-*` — language SDKs
- `packages/pattern-sdk` — pattern generation/validation
- `apps/docs` — Docusaurus docs (used as primary architecture reference)
- `patterns/` — library of primitives and example patterns

## Portfolio framing (what to emphasize)
- **System design:** Clear separation of control plane, runtime layer, and agent layer.
- **Reliability:** Confidence‑aware primitives, aggregation, retries, and escalation built into the DSL.
- **Extensibility:** SDKs in multiple languages + runtime‑agnostic orchestration.
- **Operational maturity:** Observability stack, security (mTLS/JWT), and enterprise deployment paths.


# Parallax Architecture

Developer-facing architecture reference for the Parallax agent orchestration platform.

## System Overview

Parallax coordinates multiple AI agents via gRPC, with **confidence scores (0.0-1.0)** as a first-class citizen in every agent response. The platform executes orchestration patterns — either as Prism DSL scripts or org-chart YAML workflows — and provides runtime environments for agents across local, Docker, Kubernetes, and gateway-connected deployments.

```
                          ┌──────────────────────────────────┐
                          │         Control Plane             │
                          │                                   │
                          │  ┌─────────────┐ ┌────────────┐  │
  HTTP/REST ──────────────┼─>│  Express API │ │  gRPC Svcs │<─┼── Agent (serve)
                          │  └──────┬──────┘ └─────┬──────┘  │
                          │         │              │          │
                          │    ┌────▼──────────────▼────┐    │
                          │    │     PatternEngine       │    │
                          │    └────┬──────────────┬────┘    │
                          │         │              │          │
                          │  ┌──────▼──────┐ ┌────▼───────┐  │
                          │  │RuntimeManager│ │ Workflow   │  │
                          │  │ (Prism DSL) │ │ Executor   │  │
                          │  └──────┬──────┘ │ (Org-chart)│  │
                          │         │        └────┬───────┘  │
                          │    ┌────▼──────────────▼────┐    │
                          │    │  AgentRuntimeService    │    │
                          │    └────┬───┬───┬───────┬───┘    │
                          │         │   │   │       │         │
                          └─────────┼───┼───┼───────┼─────────┘
                                    │   │   │       │
                  ┌─────────────────┘   │   │       └──────────────────┐
                  │                     │   │                          │
           ┌──────▼──────┐  ┌──────────▼┐ ┌▼──────────┐  ┌───────────▼──────┐
           │ Local (PTY) │  │  Docker    │ │ Kubernetes │  │ Gateway Runtime  │
           │ pty-manager  │  │  Runtime   │ │ Runtime    │  │ (bidi streaming) │
           │ tmux-manager │  │            │ │            │  │                  │
           └──────────────┘  └───────────┘ └───────────┘  └────────┬─────────┘
                                                                    │
                                                          ┌─────────▼─────────┐
                                                          │ Remote Agents     │
                                                          │ (Pis, laptops,    │
                                                          │  cloud VMs)       │
                                                          └───────────────────┘
```

### Core Components

| Component | Package | Role |
|-----------|---------|------|
| Control Plane | `packages/control-plane` | gRPC server, pattern engine, agent registry, REST API, Prisma ORM |
| PatternEngine | `control-plane/src/pattern-engine/` | Loads and executes patterns via Prism DSL or org-chart workflows |
| AgentRuntimeService | `control-plane/src/agent-runtime/` | Multiplexes across runtime providers (local, docker, k8s, gateway) |
| WorkflowExecutor | `control-plane/src/org-patterns/` | Executes org-chart YAML workflows with thread spawning and message routing |
| RuntimeManager | `control-plane/src/runtime-manager/` | Manages Prism script execution and agent selection for the DSL path |
| SDK (TypeScript) | `packages/sdk-typescript` | `ParallaxAgent` base class, gRPC clients, proto definitions |
| Runtime Interface | `packages/runtime-interface` | Shared types: `RuntimeProvider`, `ThreadHandle`, `AgentHandle`, `SpawnThreadInput` |

## Dual Execution Paths

`PatternEngine.executePattern()` is the entry point for all pattern execution. It branches into two paths based on pattern metadata:

```
PatternEngine.executePattern(patternName, input, options)
  │
  ├─ if pattern.threads.enabled && pattern.metadata.orgChart
  │     └─> executeOrgChartWorkflow()  ──> WorkflowExecutor
  │
  └─ else
        └─> workspace provisioning ──> Prism DSL / agent spawn / AgentProxy RPC
```

The branch decision is at `_executePatternInner()` (pattern-engine.ts ~line 692).

### Path 1: Prism Runtime

Used for: traditional multi-agent patterns (consensus, debate, pipeline, etc.)

```
Pattern (YAML/DB)
  → PatternEngine._executePatternInner()
  → Workspace provisioning (if pattern.workspace.enabled)
  → spawnAgentsForPattern() / spawnThreadsForPattern()
  → RuntimeManager.executePrismScript()
  → AgentProxy RPC calls to individual agents
  → Confidence calibration + result aggregation
  → PatternExecution result
```

Key classes: `RuntimeManager`, `AgentProxy`, `ConfidenceCalibrationService`

### Path 2: Org-Chart Workflow

Used for: hierarchical team patterns with defined roles, steps, and message routing. Detected when `pattern.metadata.orgChart === true`.

```
Org-chart Pattern (YAML with structure + workflow)
  → PatternEngine.executeOrgChartWorkflow()
  → WorkflowExecutor.execute(orgPattern, input)
  → Boot phase: spawn ALL agents upfront (createReadyGate + initializeAgents)
  → Wait for all agents to report ready
  → MessageRouter wired for org hierarchy
  → Sequential step execution:
      for each step in workflow.steps:
        executeStep(step, context, router)
        context.variables[`step_N_result`] = result
  → WorkflowResult with per-step metrics
```

The org-chart workflow uses `AgentRuntimeService.spawnThread()` to create threads on runtime providers, then communicates via `sendToThread()`. Thread completion is detected by listening for `thread_turn_complete` or `thread_completed` events.

Key classes: `WorkflowExecutor`, `MessageRouter`, `ThreadPreparationService`

## Agent Connection Modes

Agents extend `ParallaxAgent` (sdk-typescript) and connect to the control plane in one of two modes:

### Direct Mode (`serve`)

```
agent.serve(port, { registryEndpoint })
```

- Agent starts its own gRPC server on a port
- Registers with the control plane's etcd-based registry
- Control plane calls the agent directly via gRPC unary RPCs (`analyze`, `streamAnalyze`)
- Requires the agent to be network-reachable from the control plane
- Lease-based registration with periodic renewal

**Use when:** Agent runs on the same network as the control plane (cloud, same LAN).

### Gateway Mode (`connectViaGateway`)

```
agent.connectViaGateway(endpoint, options)
```

- Agent opens an **outbound** bidirectional gRPC stream to the control plane
- Sends `AgentHello` with ID, name, capabilities, metadata
- Control plane sends tasks/thread operations back through the established stream
- Automatic heartbeats (default: 10s) and reconnection with exponential backoff
- Works behind NAT, firewalls, and on home networks

**Use when:** Agent runs on a Raspberry Pi, laptop, or any machine without a public endpoint.

### Connection Lifecycle (Gateway)

```
Agent                          Control Plane
  │                                  │
  │──── AgentHello ─────────────────>│  (register in GatewayService.connectedAgents)
  │<─── ServerAck ──────────────────│  (assigned_node_id)
  │                                  │
  │──── AgentHeartbeat ────────────>│  (periodic, every 10s)
  │                                  │
  │<─── ThreadSpawnRequest ─────────│  (thread_id, adapter_type, task)
  │──── ThreadSpawnResult ─────────>│  (success/failure)
  │                                  │
  │──── ThreadEventReport ─────────>│  (output, blocked, completed, etc.)
  │──── ThreadStatusUpdate ────────>│  (running, prompt_ready, completed)
  │                                  │
  │<─── ThreadInputRequest ─────────│  (follow-up prompt, approval)
  │<─── ThreadStopRequest ──────────│  (graceful or force)
```

## Thread Lifecycle

Threads are the unit of work in the org-chart execution path. A thread represents a single CLI agent session (e.g., one Claude Code instance working on a task).

### Spawn

1. `WorkflowExecutor.initializeAgents()` iterates over org-chart roles
2. Calls `AgentRuntimeService.spawnThread(SpawnThreadInput)` for each role
3. `AgentRuntimeService.selectRuntime()` picks the best healthy runtime by priority
4. The selected runtime's `spawnThread()` creates the session:
   - **Local**: PTY process via pty-manager or tmux-manager
   - **Gateway**: Dispatches `ThreadSpawnRequest` to a connected agent (matched by agentType + metadata)
   - **Docker/K8s**: Container or pod creation
5. Returns a `ThreadHandle` with id, status, agentType, role, etc.

### Communication

- `AgentRuntimeService.sendToThread(threadId, input)` sends text/approval to a running thread
- Thread events flow back via EventEmitter: `thread_event` with type (output, blocked, completed, etc.)
- `subscribeThread(threadId, callback)` allows step-level monitoring

### Completion

- Threads signal completion via `thread_turn_complete` or `thread_completed` events
- The `ThreadHandle.completion` field holds summary and output
- Org-chart workflows intentionally leave threads alive after workflow completion so engineers can continue working (e.g., pushing code, creating PRs)

### Cleanup

- `AgentRuntimeService.cleanupExecution(executionId)` stops all threads for an execution
- `GatewayRuntimeAdapter.cleanupExecution()` dispatches `ThreadStopRequest` to each gateway agent
- Cleanup is best-effort; failures are logged but don't block

## Gateway Protocol

Defined in `proto/gateway.proto`. The `AgentGateway` service exposes a single RPC:

```protobuf
service AgentGateway {
  rpc Connect(stream AgentToControlPlane) returns (stream ControlPlaneToAgent);
}
```

### Agent-to-Control-Plane Messages

| Message | Purpose |
|---------|---------|
| `AgentHello` | First message; registers agent with ID, capabilities, metadata |
| `AgentHeartbeat` | Periodic keepalive with load factor and status |
| `TaskResult` | Completed task with value, confidence, reasoning |
| `TaskError` | Failed task with error message and code |
| `ThreadSpawnResult` | Confirms thread spawn success/failure |
| `ThreadEventReport` | Streaming thread events (output, blocked, completed, tool_use) |
| `ThreadStatusUpdate` | Periodic thread state updates with progress |

### Control-Plane-to-Agent Messages

| Message | Purpose |
|---------|---------|
| `ServerAck` | Response to AgentHello (accepted/rejected, assigned node) |
| `TaskRequest` | Dispatch a task (task_id, description, data, timeout) |
| `CancelTask` | Cancel an in-flight task |
| `Ping` | Server-initiated keepalive |
| `ThreadSpawnRequest` | Spawn a CLI agent thread (adapter_type, task, preparation, policy) |
| `ThreadInputRequest` | Send text input to a running thread |
| `ThreadStopRequest` | Stop a thread (graceful or force) |

Request/response correlation uses `request_id` fields.

## Runtime Providers

`AgentRuntimeService` manages multiple runtime providers and selects the best one for each spawn request.

### Selection Logic (`selectRuntime`)

```
1. If preferredRuntime specified and healthy → use it
2. Otherwise: sort all healthy runtimes by priority (lower = higher priority)
3. Return highest priority runtime
```

### Provider Types

| Type | Package | How It Works |
|------|---------|--------------|
| **Local** | `runtime-local` | PTY processes via `pty-manager` or `tmux-manager` with `coding-agent-adapters` |
| **Docker** | `runtime-docker` | Per-agent Docker containers (images in `packages/runtime-docker/images/`) |
| **Kubernetes** | `runtime-k8s` | Pods in `parallax-agents` namespace on GKE |
| **Gateway** | `control-plane/src/agent-runtime/gateway-runtime-adapter.ts` | In-process adapter; delegates to `GatewayService` for connected remote agents |

The gateway runtime is special: it does **not** spawn agents (agents connect themselves). It only spawns threads on already-connected agents, matching by `agentType` and metadata labels.

### Gateway Agent Matching

`GatewayRuntimeAdapter.findGatewayAgent()` matches a `SpawnThreadInput` to a connected agent:

1. Match by `agentType` AND metadata constraints (e.g., `device: mac`)
2. Fall back to match by `agentType` only
3. Fall back to match by capabilities list
4. Skip agents that already have a thread for the same execution (1:1 thread-to-agent)

## Package Dependency Graph

High-level dependency flow (arrows = "depends on"):

```
sdk-typescript ──────────────────────────> proto/
      │
      ▼
runtime-interface <──────── runtime-local
      │                         │
      │                    pty-manager ──> adapter-types
      │                    tmux-manager ─> adapter-types
      │                    coding-agent-adapters ──> adapter-types
      │
      ▼
control-plane
      │
      ├──> runtime-interface
      ├──> data-plane (ExecutionEngine, ConfidenceTracker, AgentProxy)
      ├──> telemetry
      ├──> proto/ (dynamic loading via @grpc/proto-loader)
      ├──> etcd (registry)
      ├──> Prisma (database)
      └──> Redis (caching, pub/sub)
```

### Key Internal Modules (within control-plane)

```
server.ts (wiring)
  ├── pattern-engine/     PatternEngine, PatternLoader, LocalAgentManager
  ├── org-patterns/       WorkflowExecutor, MessageRouter, OrgPattern types
  ├── agent-runtime/      AgentRuntimeService, GatewayRuntimeAdapter, RuntimeClient
  ├── grpc/               GrpcServer, GatewayService, AgentProxy
  ├── runtime-manager/    RuntimeManager (Prism DSL execution)
  ├── registry/           EtcdRegistry (agent discovery)
  ├── threads/            ThreadPreparationService, ThreadPersistenceService
  ├── workspace/          WorkspaceService, GitHubProvider, CredentialService
  ├── db/                 DatabaseService (Prisma)
  ├── auth/               AuthService (Enterprise)
  ├── scheduler/          SchedulerService, TriggerService
  ├── resilience/         GracefulShutdownHandler, StartupRecoveryService
  └── ha/                 High Availability services
```

## Key Data Flow

### Org-Chart Execution (primary path for coding swarm demos)

```
1. API Request
   POST /api/patterns/:name/execute { input, credentials }
        │
2. PatternEngine.executePattern()
   - Loads pattern from filesystem or database
   - Detects orgChart: true in metadata
        │
3. executeOrgChartWorkflow()
   - Creates WorkflowExecutor with AgentRuntimeService
   - Passes credentials + workspace info into workflow input
        │
4. WorkflowExecutor.execute(orgPattern, input)
   a. Boot phase:
      - createReadyGate() — sets up event listeners BEFORE spawning
      - initializeAgents() — calls AgentRuntimeService.spawnThread() per role
      - Waits for all agents to report ready
   b. Execution phase:
      - Steps execute sequentially
      - Each step sends tasks to threads via sendToThread()
      - Waits for thread_turn_complete / thread_completed events
      - Step results stored in context.variables for later reference
   c. Output:
      - WorkflowResult with per-step results, timing, agent count
        │
5. AgentRuntimeService → selectRuntime() → GatewayRuntimeAdapter
   - findGatewayAgent() matches by type + metadata
   - dispatchThreadSpawn() sends ThreadSpawnRequest over bidi stream
        │
6. Remote Agent (e.g., Raspberry Pi)
   - Receives ThreadSpawnRequest
   - Spawns CLI session (Claude Code, Gemini CLI, etc.) via local adapter
   - Streams ThreadEventReport back through gateway
   - Sends ThreadStatusUpdate with progress
        │
7. Results flow back
   ThreadEventReport → GatewayService → AgentRuntimeService event bus
   → WorkflowExecutor step resolution → PatternExecution result
```

### Direct Agent Execution (Prism DSL path)

```
1. PatternEngine.executePattern()
   - pattern.threads.enabled is false or no orgChart metadata
        │
2. Workspace provisioning (if configured)
   - WorkspaceService.provision() → git clone + branch
        │
3. Agent spawning
   - spawnAgentsForPattern() via AgentRuntimeService
   - Or: use pre-registered agents from etcd registry
        │
4. Prism DSL execution
   - RuntimeManager.executePrismScript(script, agents, input)
   - Script defines agent selection, task distribution, aggregation
        │
5. AgentProxy RPC calls
   - Unary gRPC calls to agents: analyze(task, data)
   - Each response includes { value, confidence, reasoning }
        │
6. Confidence calibration + result aggregation
   - ConfidenceCalibrationService adjusts raw scores
   - Pattern-specific aggregation (consensus, weighted average, etc.)
        │
7. PatternExecution result with metrics
```

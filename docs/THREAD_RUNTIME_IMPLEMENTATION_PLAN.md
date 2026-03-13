# Thread Runtime Implementation Plan

## Purpose

This document turns the thread runtime proposal into an implementation sequence across the current Parallax codebase.

It is designed to preserve existing agent runtime APIs while introducing a first-class thread layer incrementally.

## Current State

### What already exists

- `@parallaxai/runtime-interface` defines agent lifecycle and runtime events.
- `pty-manager` already detects many thread-relevant states:
  - ready
  - blocking prompts
  - task complete
  - tool running
  - stall classification
- `parallax-agent-runtime` already exposes workspace provisioning, worktrees, hook telemetry, and multi-agent spawn flows.
- `control-plane` already has:
  - runtime registration
  - dynamic agent spawning
  - execution events
  - workspace service integration

### What is missing

- a durable `ThreadHandle`
- normalized thread events
- thread persistence in control plane
- thread-native APIs
- Prism primitives for thread supervision
- shared decision and episodic memory surfaces

## Guiding Constraint

Do not break existing apps that use Parallax only as a runtime package source.

This means:

1. add the thread layer above existing agent/runtime APIs
2. preserve current `spawn/get/list/send/stop` agent operations
3. migrate control-plane internals gradually to prefer threads

## Recommended Build Order

### Phase 1: Types and Events

Goal: introduce thread vocabulary without changing runtime behavior.

Status: completed

Tasks:
- [x] Add shared thread vocabulary in `runtime-interface`
- [x] Extend runtime events with `thread_event`

### Phase 2: Local thread adapter

Goal: map PTY session events into normalized thread events.

Status: completed

Tasks:
- [x] Add a local thread registry backed by existing PTY sessions
- [x] Emit normalized thread lifecycle events from local runtime signals
- [x] Expose thread CRUD and event streaming from `runtime-local`

### Phase 3: Control-plane persistence

Goal: make threads queryable and durable across execution lifecycles.

Status: completed

Tasks:
- [x] Add durable thread tables and repositories
- [x] Project runtime thread events into persistent thread state
- [x] Recover thread state across control-plane restart

### Phase 4: Control-plane APIs

Goal: expose threads over REST and MCP.

Status: completed

Tasks:
- [x] Add runtime-backed thread APIs in `runtime-local`
- [x] Add control-plane managed thread APIs for runtime-backed threads
- [x] Add control-plane native thread persistence APIs
- [x] Add MCP exposure for thread-native orchestration

### Phase 5: Workspace preparation

Goal: move memory/config/bootstrap concerns into Parallax itself.

Status: completed

Tasks:
- [x] Define `ThreadPreparationSpec`
- [x] Thread creation can pass prepared workspace/context/bootstrap inputs
- [x] Centralize approval/context/bootstrap file preparation
- [x] Thread creation should be able to request prepared workspaces

### Phase 6: Prism and org-chart integration

Goal: make patterns and org charts supervise threads natively.

Status: completed

Tasks:
- [x] Add thread primitives to `packages/primitives`
- [x] Allow org-chart workflows to spawn thread-backed roles
- [x] Teach pattern execution to spawn/supervise threads
- [x] Preserve org-chart thread execution intent in compiled metadata
- [x] Compile org-chart roles to fully explicit thread-oriented Prism nodes

### Phase 7: Memory and coordination

Goal: add shared decisions and episodic experience.

Status: completed

Tasks:
- [x] Add shared decision storage and APIs
- [x] Add thread summaries as orchestrator memory
- [x] Add episodic experience extraction from successful executions
- [x] Inject retrieved memory context into new thread spawns
- [x] Add decision and experience deduplication heuristics
- [x] Rank retrieved memory by repo, role, objective, and recency

## Package-by-Package Plan

## 1. `packages/runtime-interface`

### Why first

Everything else depends on a shared contract.

### Add

- `ThreadStatus`
- `ThreadHandle`
- `ThreadEvent`
- `ThreadWorkspaceRef`
- `ThreadCompletion`
- `ThreadPolicy`
- `SpawnThreadInput`
- `ThreadRuntimeProvider`

### Keep

- existing `AgentConfig`
- existing `AgentHandle`
- existing `RuntimeProvider`

### Strategy

Add thread types alongside current agent types.

Do not replace:

- `AgentHandle`
- `RuntimeEvent`

Instead, add:

```ts
export type ThreadEventType =
  | "thread_started"
  | "thread_ready"
  | "thread_blocked"
  | "thread_tool_running"
  | "thread_turn_complete"
  | "thread_idle"
  | "thread_completed"
  | "thread_failed"
  | "thread_stopped";
```

### Files

- [types.ts](/Users/jakobgrant/Workspaces/parallax/packages/runtime-interface/src/types.ts)
- `src/index.ts` if exports need updating
- README

### Deliverable

Compile-safe types only.

No runtime behavior change yet.

Progress:
- [x] Completed in `packages/runtime-interface`

## 2. `packages/pty-manager`

### Role

This is the raw signal source for CLI-backed threads.

### Add

- normalized session-to-thread event mapper utilities
- session summary extraction helpers
- optional session policy metadata

### Do not add yet

- full orchestration logic
- app-specific watchdog behavior

### Specific work

1. Add a utility that converts PTY session state into `ThreadEvent`.
2. Add explicit metadata support on session spawn:
   - `executionId`
   - `threadId`
   - `objective`
   - `workspaceRef`
3. Promote `task_complete`, `blocking_prompt`, and `tool_running` as stable thread signal inputs.
4. Add an optional `summarizeRecentOutput()` helper for bounded summaries.

### Files

- [types.ts](/Users/jakobgrant/Workspaces/parallax/packages/pty-manager/src/types.ts)
- `src/pty-manager.ts`
- `src/pty-session.ts`
- tests

### Deliverable

PTY-backed runtimes can emit thread-compatible events without control-plane changes yet.

Progress:
- [ ] Not started in `pty-manager`
- [x] Equivalent signal mapping shipped in `runtime-local` as the first adapter

## 3. `packages/parallax-agent-runtime`

### Role

This is the best place to expose thread-native tools early because it already wraps PTY sessions, workspaces, worktrees, and hooks.

### Add

- `spawn_thread`
- `get_thread`
- `list_threads`
- `send_to_thread`
- `stop_thread`
- `get_thread_logs`
- `get_thread_summary`

### Internal strategy

Initially, a thread can be backed 1:1 by an existing agent session plus thread metadata.

### Important

Do not remove current agent tools.

Agent tools become the low-level layer.
Thread tools become the orchestration layer.

### Files

- package tool schemas
- MCP tool registration
- agent manager metadata store
- README

### Deliverable

External systems can adopt thread APIs before control-plane Prism support exists.

Progress:
- [ ] Not started

## 4. `packages/runtime-local`

### Role

First concrete runtime implementation of `ThreadRuntimeProvider`.

### Add

- a thin thread registry in local runtime
- mapping from thread ID to underlying PTY session ID
- normalized thread event emission

### Implementation shape

```ts
thread -> session -> adapter events -> normalized thread events
```

### Deliverable

Local runtime is the reference implementation.

Docker and K8s can follow the same contract later.

Progress:
- [x] Local thread registry added
- [x] Thread CRUD added
- [x] Thread event projection added
- [x] REST and WebSocket thread exposure added

## 5. `packages/control-plane`

### Highest-value change

This is where Parallax stops being only runtime plumbing and becomes the actual orchestration platform for long-lived work.

### Add new domain objects

- `thread`
- `thread_event`
- `shared_decision`
- later: `episodic_experience`

### Add services

- `thread-runtime-service`
- `thread-store`
- `thread-event-projector`
- `thread-summary-service`
- `shared-decision-service`

### Extend execution lifecycle

Current pattern execution spawns agents directly in [pattern-engine.ts](/Users/jakobgrant/Workspaces/parallax/packages/control-plane/src/pattern-engine/pattern-engine.ts#L121).

Change target:

- patterns may spawn agents as before
- thread-enabled patterns spawn threads instead

### Add REST endpoints

- `POST /api/threads`
- `GET /api/threads/:id`
- `GET /api/executions/:id/threads`
- `POST /api/threads/:id/input`
- `POST /api/threads/:id/stop`
- `GET /api/threads/:id/events`
- `GET /api/executions/:id/shared-decisions`

### Add event forwarding

`AgentRuntimeService` currently forwards agent events from runtimes.

Extend it to also forward thread events.

### Files likely affected

- [agent-runtime-service.ts](/Users/jakobgrant/Workspaces/parallax/packages/control-plane/src/agent-runtime/agent-runtime-service.ts)
- `src/server.ts`
- `src/api/managed-agents.ts`
- new `src/api/threads.ts`
- `src/execution-events.ts`
- pattern engine
- DB schema and repos

### Deliverable

Threads become durable control-plane resources.

Progress:
- [x] Runtime client/service are thread-aware
- [x] Managed thread REST APIs added in control plane
- [x] Durable control-plane thread state added
- [x] Thread event history API added

## 6. `packages/control-plane` database

### Proposed tables

#### `threads`

- `id`
- `execution_id`
- `runtime_name`
- `agent_id`
- `agent_type`
- `role`
- `status`
- `objective`
- `workspace_id`
- `worktree_id`
- `summary`
- `completion_state`
- `completion_summary`
- `metadata`
- `created_at`
- `updated_at`
- `last_activity_at`

#### `thread_events`

- `id`
- `thread_id`
- `execution_id`
- `type`
- `payload`
- `created_at`

#### `shared_decisions`

- `id`
- `execution_id`
- `thread_id`
- `category`
- `summary`
- `created_at`

### Deliverable

Thread lifecycle survives process restarts and supports UI/API queries.

## 7. Workspace preparation path

### Problem

Raven and Milady each prepare workspaces themselves:

- write memory files
- write approval config
- write MCP bridge config
- inject env vars

Parallax should own this.

### Proposed home

Start in `parallax-agent-runtime`, then expose upward through control-plane thread creation.

### New concept

`ThreadPreparationSpec`

```ts
{
  workspace: { strategy, repo, branch, baseBranch },
  contextFiles: [],
  env: {},
  approvalPreset: "standard"
}
```

### Deliverable

Apps ask Parallax for prepared threads, not raw spawn + manual bootstrap.

## 8. `packages/primitives`

### Add thread primitives

- `spawn_thread`
- `await_thread`
- `send_thread_input`
- `summarize_thread`
- `share_decision`
- `collect_shared_decisions`
- `finalize_thread`

### Constraints

- primitives should remain explicit
- no hidden direct agent-to-agent messaging
- cross-thread sharing should go through the orchestrator

### Deliverable

Prism gains long-lived work orchestration without abandoning its deterministic posture.

## 9. Org-chart layer

### Current state

Org-chart support already points toward explicit role-based coordination.

### Add

Per-role runtime execution config:

- `agentType`
- `workspacePolicy`
- `memoryPolicy`
- `approvalPreset`
- `completionPolicy`

### Compile target

Org-chart roles compile to thread-spawn and thread-supervision nodes.

### Deliverable

Distributed coding teams and general org-chart teams share one substrate.

## 10. Memory layer

### First memory feature to ship

Shared decisions.

This is low-risk and immediately useful.

Status:
- [x] Completed

### Second memory feature

Thread summaries.

Status:
- [x] Initial summary capture from thread milestone events implemented

### Third memory feature

Episodic experience from successful executions.

Status:
- [x] Initial episodic experience capture and query APIs implemented

### Suggested extraction pipeline

1. thread completes
2. summarize important decisions and failure recoveries
3. store bounded experience entry
4. query by repo + task fingerprint + role

### Deliverable

Useful long-horizon memory without transcript bloat.

## Milestone Plan

## Milestone A: Thread Foundations

Scope:

- runtime-interface types
- local runtime thread backing
- MCP thread tools in parallax-agent-runtime

Success criteria:

- can spawn a thread locally
- can query thread state
- can stream normalized thread events

Status:
- [x] Completed

## Milestone B: Control Plane Adoption

Scope:

- DB tables
- thread REST API
- event persistence
- execution-to-thread association

Success criteria:

- threads survive control-plane restart
- execution UI/API can list threads and statuses

Status:
- [x] Completed
- [x] Runtime-backed thread listing/status APIs are available
- [x] Restart durability is implemented via runtime reconciliation on startup

## Milestone C: Prepared Coding Threads

Scope:

- workspace preparation spec
- approval presets
- context file injection
- worktree support

Success criteria:

- Raven-style prepared coding execution can be done through Parallax directly

Status:
- [ ] Not started

## Milestone D: Prism Integration

Scope:

- thread primitives
- pattern-engine support
- org-chart compile target updates

Success criteria:

- one Prism pattern can supervise multi-turn distributed CLI workers

Status:
- [x] Completed
- [x] Org-chart workflows can supervise thread-backed roles
- [x] Pattern execution can spawn and supervise runtime-backed threads
- [x] Prism primitives now expose explicit thread orchestration nodes
- [x] Generated Prism emits explicit thread-oriented workflow nodes for thread-backed roles

## Milestone E: Memory + Coordination

Scope:

- shared decisions
- thread summaries
- episodic experience

Success criteria:

- Milady-style compressed cross-thread coordination works natively

Status:
- [ ] In progress
- [x] Shared decisions can be persisted and queried
- [x] Thread summaries can be captured as orchestrator memory
- [x] Initial episodic experience capture is implemented
- [x] Relevant memory can be injected back into new thread spawns

## Recommended First PRs

### PR 1

`runtime-interface`: add thread types and exports.

Low risk.

Status:
- [x] Completed

### PR 2

`parallax-agent-runtime`: internal thread metadata store + MCP thread tools backed by existing sessions.

High leverage.

Status:
- [ ] Not started

### PR 3

`runtime-local`: emit normalized thread events from PTY session signals.

Makes the abstraction real.

Status:
- [x] Completed

### PR 4

`control-plane`: add thread persistence and read-only thread APIs.

Gives visibility before full orchestration changes.

Status:
- [x] Completed
- [x] Runtime-backed thread APIs are available
- [x] Persistence-backed thread listing and event APIs are available

### PR 5

`control-plane` + `primitives`: allow pattern execution to spawn and supervise threads.

This is the first full-stack milestone.

## Key Architectural Decision

Parallax should model:

```ts
agent = execution substrate
thread = orchestration substrate
```

An agent is what runs.
A thread is what the control plane reasons about.

That distinction is the missing piece in the current architecture.

## Risks

### Risk 1: duplicating agent and thread APIs

Mitigation:

- keep agent APIs low-level
- position thread APIs as orchestration-level

### Risk 2: overfitting to coding agents

Mitigation:

- keep `objective`, `workspace`, and `completion` generic
- do not require PTY-specific concepts in the core thread types

### Risk 3: making Prism too implicit

Mitigation:

- keep thread primitives explicit
- keep cross-thread sharing explicit

### Risk 4: memory bloat

Mitigation:

- summaries and decisions only
- transcripts remain log/debug artifacts, not orchestrator memory

## Recommendation

Start with:

1. `runtime-interface`
2. `runtime-local`
3. `control-plane`

Those three changes establish the abstraction with minimal migration risk.

Then add persistence before touching Prism compilation.

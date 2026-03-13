# Parallax Thread Runtime Proposal

## Summary

Parallax already provides:

- distributed runtimes
- CLI agent adapters
- git workspace and worktree support
- pattern and org-chart orchestration

What it does not yet provide is a first-class abstraction for **long-lived agent work**.

Today, downstream systems like Milady and Raven Docs use Parallax packages as infrastructure, but they each rebuild their own:

- session lifecycle model
- event-driven supervision loop
- compressed cross-agent context sharing
- workspace preparation flow
- local vs remote runtime bridging

This proposal adds a native Parallax **Thread Runtime** so those behaviors become part of the platform rather than app-specific glue.

## Why

If Parallax is the Kubernetes of agent orchestration, then:

- runtimes are the nodes
- agents are the pods
- patterns/org charts are the deployments and control logic
- **threads are the unit of long-lived work**

Without threads, Parallax can spawn agents, but it cannot natively model:

- blocked prompts
- multi-turn coding tasks
- idle recovery
- partial completion
- cross-thread decision propagation
- resumable long-horizon execution

Those are exactly the behaviors Milady and Raven had to implement themselves.

## Reference Implementations

### Milady plugin teaches us:

- A worker should be modeled as a durable task context, not just a spawned process.
- Coordination should happen on events like `blocked`, `turn_complete`, and `idle`, not by transcript polling alone.
- Cross-agent sharing should be compressed into high-signal summaries like "key decisions", not raw transcript sharing.

### Raven Docs teaches us:

- Workspace preparation is part of orchestration, not an app concern.
- Local PTY execution and remote execution should expose the same control contract.
- Agents need identity, permissions, and scoped environment injection.
- Queueing and recovery are part of the control plane.

## Design Goals

1. Make long-lived agent work a first-class Parallax primitive.
2. Preserve Parallax's explicit orchestration model.
3. Support any agent type, not only coding agents.
4. Work across local, Docker, Kubernetes, and remote runtimes.
5. Keep cross-thread context bounded and auditable.
6. Support org charts and Prism patterns with the same underlying runtime.

## Non-Goals

1. Replace Prism with an implicit hive-mind system.
2. Force direct agent-to-agent communication.
3. Hardcode the runtime to coding agents only.
4. Store or replay full transcripts as the main memory model.

## Core Concept

A **thread** is a long-lived execution stream bound to:

- an agent type or agent instance
- a workspace or worktree
- an execution objective
- a lifecycle state
- an event stream
- a compressed memory surface

A thread is not just a process handle.
It is the unit the orchestrator reasons about.

## Proposed Model

### ThreadHandle

```ts
export interface ThreadHandle {
  id: string;
  executionId: string;
  runtimeName: string;
  agentId?: string;
  agentType: string;
  role?: string;
  status: ThreadStatus;
  workspace?: ThreadWorkspaceRef;
  objective: string;
  createdAt: string;
  updatedAt: string;
  lastActivityAt?: string;
  summary?: string;
  completion?: ThreadCompletion;
  metadata?: Record<string, unknown>;
}
```

### ThreadStatus

```ts
export type ThreadStatus =
  | "pending"
  | "preparing"
  | "starting"
  | "ready"
  | "running"
  | "blocked"
  | "idle"
  | "waiting"
  | "completed"
  | "failed"
  | "stopped";
```

### ThreadWorkspaceRef

```ts
export interface ThreadWorkspaceRef {
  workspaceId?: string;
  path?: string;
  repo?: string;
  branch?: string;
  worktreeId?: string;
}
```

### ThreadCompletion

```ts
export interface ThreadCompletion {
  state: "partial" | "complete" | "failed";
  summary: string;
  artifacts?: Array<{
    type: "pr" | "commit" | "file" | "url" | "report";
    value: string;
  }>;
}
```

## Proposed Event Contract

Threads should emit normalized events independent of runtime:

```ts
export type ThreadEventType =
  | "thread_ready"
  | "thread_output"
  | "thread_blocked"
  | "thread_tool_running"
  | "thread_turn_complete"
  | "thread_idle"
  | "thread_summary_updated"
  | "thread_completed"
  | "thread_failed"
  | "thread_stopped";
```

```ts
export interface ThreadEvent {
  threadId: string;
  executionId: string;
  type: ThreadEventType;
  timestamp: string;
  data?: Record<string, unknown>;
}
```

### Important normalized payloads

- `thread_blocked`: prompt text, prompt type, approval context
- `thread_tool_running`: tool name, description, severity
- `thread_turn_complete`: recent output summary, suggested next state
- `thread_idle`: idle duration, watchdog count
- `thread_summary_updated`: compressed thread summary

## Proposed Runtime Interface

Extend the runtime layer with thread-native operations instead of exposing only raw agent lifecycle APIs.

```ts
export interface ThreadRuntimeProvider {
  spawnThread(input: SpawnThreadInput): Promise<ThreadHandle>;
  stopThread(threadId: string, opts?: StopThreadOptions): Promise<void>;
  sendToThread(threadId: string, input: ThreadInput): Promise<void>;
  getThread(threadId: string): Promise<ThreadHandle | null>;
  listThreads(filter?: ThreadFilter): Promise<ThreadHandle[]>;
  getThreadEvents(threadId: string, opts?: EventQuery): Promise<ThreadEvent[]>;
  summarizeThread(threadId: string): Promise<ThreadSummary>;
}
```

This should sit above existing runtime providers and may be backed by:

- PTY sessions for CLI agents
- containers
- pods
- MCP-connected remote agents
- future browser or tool-only agents

## Thread Memory Model

Parallax should not treat thread memory as transcript storage.

It should maintain three bounded surfaces:

### 1. Local thread summary

What this thread has done so far.

### 2. Shared decisions

Cross-thread summaries that matter to siblings.

```ts
export interface SharedDecision {
  id: string;
  executionId: string;
  sourceThreadId: string;
  category: "architecture" | "api" | "ui" | "scope" | "research" | "other";
  summary: string;
  createdAt: string;
}
```

### 3. Episodic experience

Reusable guidance extracted from prior successful executions.

```ts
export interface EpisodicExperience {
  id: string;
  source: "orchestrator" | "thread";
  kind: "failure_mode" | "recovery" | "decision" | "pattern";
  repo?: string;
  taskFingerprint?: string;
  summary: string;
  confidence?: number;
  createdAt: string;
}
```

This is the right place to absorb Milady's trajectory feedback pattern.

## Workspace Preparation as Platform Feature

Thread creation should support an optional workspace preparation phase handled by Parallax itself:

- provision clone or worktree
- inject memory file
- inject approval config
- inject MCP bridge config
- inject scoped environment variables
- register cleanup/finalization policy

```ts
export interface ThreadPreparationSpec {
  workspace?: {
    repo?: string;
    branch?: string;
    baseBranch?: string;
    strategy?: "clone" | "worktree" | "scratch";
  };
  contextFiles?: Array<{ path: string; content: string }>;
  env?: Record<string, string>;
  approvalPreset?: "readonly" | "standard" | "permissive" | "autonomous";
}
```

This removes the need for downstream apps to hand-roll workspace bootstrap logic.

## Prism Surface

Add thread-oriented primitives without changing Prism's core philosophy.

### New primitives

- `spawn_thread`
- `await_thread`
- `send_thread_input`
- `summarize_thread`
- `share_decision`
- `collect_shared_decisions`
- `stop_thread`
- `finalize_thread`

### Example

```prism
frontend = spawn_thread({
  role: "frontend",
  agentType: "claude",
  objective: "Implement the UI changes",
  workspace: { strategy: "worktree", branch: "feat/ui" }
})

backend = spawn_thread({
  role: "backend",
  agentType: "codex",
  objective: "Implement the API changes",
  workspace: { strategy: "worktree", branch: "feat/api" }
})

uiEvent = await_thread(frontend, { until: "blocked|turn_complete|completed" })
apiEvent = await_thread(backend, { until: "blocked|turn_complete|completed" })

if (uiEvent.type == "thread_turn_complete") {
  share_decision(frontend, "UI uses optimistic update pattern")
}

decisions = collect_shared_decisions()
send_thread_input(backend, {
  message: "Continue. Relevant decisions: " + decisions
})
```

## Org Chart Surface

Org-chart execution should compile down to the same thread runtime.

Each org-chart node should be able to declare:

- `agentType`
- `workspacePolicy`
- `memoryPolicy`
- `completionPolicy`
- `escalationPolicy`

This makes "company/team" orchestration and "coding swarm" orchestration use the same substrate.

## Control Plane Responsibilities

The Parallax control plane should own:

- thread scheduling
- thread state persistence
- event streaming
- event deduplication and buffering
- idle recovery policy
- completion synthesis
- shared decision store
- episodic memory extraction
- thread cleanup/finalization

## Runtime Responsibilities

Each runtime should own:

- actual process or pod lifecycle
- raw output capture
- adapter-specific detection
- normalized event emission
- filesystem/context injection
- health and liveness

## API Surface

### REST

- `POST /api/threads`
- `GET /api/threads/:id`
- `POST /api/threads/:id/input`
- `POST /api/threads/:id/stop`
- `GET /api/threads/:id/events`
- `GET /api/executions/:id/threads`
- `GET /api/executions/:id/decisions`

### MCP

- `spawn_thread`
- `list_threads`
- `get_thread`
- `send_to_thread`
- `stop_thread`
- `get_thread_logs`
- `get_thread_summary`
- `list_shared_decisions`

## Execution Policies

The thread model should support explicit policies instead of app-specific watchdog code:

```ts
export interface ThreadPolicy {
  idleTimeoutMs?: number;
  maxIdleChecks?: number;
  autoInterruptOnToolRunning?: boolean;
  maxAutoResponses?: number;
  requireWorkspaceBoundary?: boolean;
  summarizeAfterTurns?: number;
}
```

These policies directly absorb current Milady and Raven behavior.

## Security Model

Thread runtime must enforce:

- workspace path boundaries
- scoped credentials
- explicit approval presets
- isolated environment injection
- auditable event and decision logs

Out-of-scope file approvals should be treated as a platform concern, not a downstream app concern.

## Migration Plan

### Phase 1: Normalize runtime events

Add thread event schema on top of existing runtime and PTY events.

### Phase 2: Introduce ThreadHandle persistence

Persist thread lifecycle state in control plane storage.

### Phase 3: Add workspace preparation spec

Move memory-file and approval-config injection into Parallax runtime.

### Phase 4: Add REST and MCP thread APIs

Expose native thread management to apps and agents.

### Phase 5: Add Prism primitives

Let patterns and org charts create and supervise threads directly.

### Phase 6: Add episodic memory extraction

Extract high-signal experience from successful executions and make it queryable.

## Expected Outcome

After this change:

- Milady-style distributed coding swarms can run natively on Parallax.
- Raven-style coding swarm execution can target Parallax directly without rebuilding execution semantics.
- Org charts, patterns, and coding swarms all share one runtime abstraction.
- Parallax becomes the control plane for long-lived agent work, not just the package source for it.

## Decision

Parallax should add a first-class Thread Runtime.

This is the missing layer between:

- low-level runtime packages
- high-level orchestration semantics

Without it, downstream applications will keep re-implementing the same orchestration control logic.
With it, Parallax becomes the actual platform those applications are already trying to use.

# Coding Swarm Demo: Distributed CLI Agent Orchestration

## Overview

Demonstrate Parallax orchestrating 4 CLI coding agents across distributed hardware — 3 Raspberry Pis and 1 Mac — each running a different coding agent (Claude Code, Codex, Gemini CLI, Claude Code), coordinated by an org-chart pattern via the threads system. Each Pi displays live terminal output on a 5" LCD screen. All agents run in full interactive mode (not --print/non-interactive), operating as long-lived threads with no turn limit — they run as many turns as needed to build a complete project from an empty repo.

**Target repo:** https://github.com/HaruHunab1320/git-workspace-service-testbed (empty repo — agents build from scratch)

**What this proves:**
- Real distributed multi-agent orchestration (not simulated)
- Heterogeneous agent types coordinated by a single pattern
- Full interactive CLI agents running as managed threads (not one-shot tasks)
- Live PTY streaming across network boundaries (NAT-traversal via gateway)
- Thread lifecycle management with episodic memory and shared decisions
- Git workspace isolation with automatic PR creation
- Agents building a complete, substantial project from nothing

## Hardware

| Device | Agent | Screen | Connection |
|--------|-------|--------|------------|
| Pi 4 (Vero) `192.168.1.73` | Claude Code | 5" Waveshare capacitive touch (800x480) | Gateway → GKE |
| Pi 4 (Sable) `pi-sable.local` | OpenAI Codex | 5" Waveshare capacitive touch (800x480) | Gateway → GKE |
| Pi 4 (Silas) `pi-silas.local` | Gemini CLI | 5" Waveshare capacitive touch (800x480) | Gateway → GKE |
| Mac (Echo) localhost | Claude Code | Terminal / web dashboard | Gateway → GKE |

### 5" LCD Specs (Waveshare 5" DSI/HDMI)

- **Resolution:** 800x480
- **Interface:** DSI ribbon cable (preferred) or HDMI
- **Touch:** Capacitive, USB or I2C
- **Terminal capacity:** ~100 cols x 30 rows at 8px font, or ~80x24 standard terminal
- **Driver:** Linux framebuffer (`/dev/fb0`) or DRM — standard HDMI output, no custom SPI driver needed

This is a massive upgrade from the current 2" SPI screens (128x64 monochrome, 14 chars x 5 lines). The 5" screens can render actual terminal output from coding agents at readable resolution.

## Architecture

```
                     User
                       |
                       v
               Control Plane (GKE)
               +-----------------+
               |  Org-Chart      |
               |  Pattern        |  Receives task, decomposes into subtasks,
               |  (Prism)        |  spawns threads, monitors, finalizes
               +-----------------+
                       |
            ThreadSpawnRequest (gateway proto)
                       |
         +-------------+-------------+-------------+
         |             |             |             |
    Pi: Vero      Pi: Sable     Pi: Silas      Mac: Echo
    Claude Code   Codex         Gemini CLI     Claude Code
         |             |             |             |
    pty-manager   pty-manager   pty-manager   pty-manager
    + adapter     + adapter     + adapter     + adapter
         |             |             |             |
    5" LCD        5" LCD        5" LCD        Terminal
    (framebuffer) (framebuffer) (framebuffer) (xterm.js)
         |             |             |             |
    git worktree  git worktree  git worktree  git worktree
    feature/a     feature/b     feature/c     feature/d
```

### Data Flow

```
1. User triggers execution via REST API or dashboard
2. Control plane loads org-chart pattern
3. Pattern decomposes task into 4 subtasks based on roles
4. For each subtask:
   a. ThreadPreparationService resolves workspace + memory context
   b. Control plane sends ThreadSpawnRequest over gateway stream
   c. Pi agent receives request, provisions git worktree locally
   d. Pi agent spawns coding CLI via pty-manager + adapter
   e. Pi agent renders PTY output to 5" LCD via framebuffer
   f. Pi agent streams ThreadStreamEvents back through gateway
5. Control plane monitors thread events:
   - thread_started → pattern notes agent is active
   - thread_output → forwarded to dashboard/SSE clients
   - thread_blocked → orchestrator decides (auto-respond or escalate)
   - thread_turn_complete → collect summary, share decisions
   - thread_completed → finalize workspace (push, PR)
6. Pattern collects all results, merges if needed, reports completion
```

## Implementation Plan

### Phase 1: Gateway Thread Protocol
**Extends the gRPC gateway to support thread operations over existing bidirectional stream.**

#### 1.1 Proto Changes (`proto/gateway.proto`)

Add new message types to the existing oneof payloads:

```protobuf
// Control Plane → Agent
message ThreadSpawnRequest {
  string thread_id = 1;
  string execution_id = 2;
  string agent_type = 3;          // "claude", "codex", "gemini"
  string objective = 4;
  string role = 5;                // org-chart role
  ThreadWorkspaceConfig workspace = 6;
  map<string, string> env = 7;
  repeated ThreadContextFile context_files = 8;
  string approval_preset = 9;     // "autonomous", "permissive", etc.
  google.protobuf.Struct metadata = 10;
}

message ThreadWorkspaceConfig {
  string repo_url = 1;
  string base_branch = 2;
  string feature_branch = 3;
  string strategy = 4;           // "clone" or "worktree"
  string credentials_token = 5;  // PAT for git operations
}

message ThreadContextFile {
  string relative_path = 1;
  string content = 2;
}

message ThreadInputRequest {
  string thread_id = 1;
  string message = 2;            // formatted message to send
  bytes raw = 3;                 // raw bytes (for keypresses)
  repeated string keys = 4;     // named keys ["ctrl+c", "enter"]
}

message ThreadStopRequest {
  string thread_id = 1;
  bool force = 2;
  uint32 timeout_ms = 3;
}

// Agent → Control Plane
message ThreadEvent {
  string thread_id = 1;
  string execution_id = 2;
  string event_type = 3;         // "thread_started", "thread_output", "thread_blocked", etc.
  bytes data = 4;                // PTY output bytes (for thread_output)
  google.protobuf.Struct metadata = 5;  // structured event data
  google.protobuf.Timestamp timestamp = 6;
}
```

Add to existing oneof:
```protobuf
message ControlPlaneToAgent {
  oneof payload {
    // ... existing ...
    ThreadSpawnRequest spawn_thread = 10;
    ThreadInputRequest thread_input = 11;
    ThreadStopRequest stop_thread = 12;
  }
}

message AgentToControlPlane {
  oneof payload {
    // ... existing ...
    ThreadEvent thread_event = 10;
  }
}
```

**Files:**
- `proto/gateway.proto` — add message types
- `packages/sdk-typescript/proto/gateway.proto` — sync copy

#### 1.2 Gateway Service Updates (`packages/control-plane/src/grpc/services/gateway-service.ts`)

- Handle incoming `ThreadEvent` messages from agents
- Route events to `ExecutionEventBus` for pattern consumption
- Store thread PTY output in a ring buffer for late-joining SSE clients
- Track thread↔agent mapping: `Map<threadId, agentId>`
- New methods:
  - `spawnThread(agentId, request)` — send ThreadSpawnRequest
  - `sendThreadInput(agentId, threadId, input)` — send ThreadInputRequest
  - `stopThread(agentId, threadId)` — send ThreadStopRequest

**Files:**
- `packages/control-plane/src/grpc/services/gateway-service.ts`
- `packages/control-plane/src/grpc/agent-proxy.ts` — add thread dispatch methods

#### 1.3 SDK Agent Thread Handling (`packages/sdk-typescript/src/agent-base.ts`)

Add thread message handlers to `ParallaxAgent`:

```typescript
// New method: handle thread spawn requests
protected async handleThreadSpawn(request: ThreadSpawnRequest): Promise<void> {
  // Default: subclasses override
  throw new Error('Thread spawning not supported by this agent');
}

// New method: handle thread input
protected async handleThreadInput(request: ThreadInputRequest): Promise<void> {
  throw new Error('Thread input not supported by this agent');
}
```

Update gateway message handler to route new message types.

**Files:**
- `packages/sdk-typescript/src/agent-base.ts`
- `packages/sdk-typescript/src/types.ts` — add thread-related types

**Estimated effort:** 2-3 days

---

### Phase 2: Thread-Capable Pi Agent
**New agent type that can spawn local coding agents as threads and stream output back.**

#### 2.1 Coding Swarm Agent (`demos/coding-swarm/coding-swarm-agent/`)

New demo agent package that extends ParallaxAgent with thread support:

```
demos/coding-swarm/
  coding-swarm-agent/
    src/
      index.ts              — entry point (load config, connect gateway)
      swarm-agent.ts        — main agent class (extends ParallaxAgent)
      thread-executor.ts    — manages local thread lifecycle via pty-manager
      display/
        terminal-renderer.ts — renders PTY output to 5" LCD framebuffer
        status-bar.ts       — header/footer overlay with thread status
      config.ts             — agent configuration (agent type, display settings)
    package.json
    tsconfig.json
```

#### 2.2 SwarmAgent Class

```typescript
class SwarmAgent extends ParallaxAgent {
  private executor: ThreadExecutor;
  private display: TerminalRenderer;

  constructor(config: SwarmAgentConfig) {
    super(
      `swarm-${config.id}`,
      `Coding Swarm: ${config.name}`,
      ['coding', config.agentType],
      { type: 'coding-swarm-agent', agentType: config.agentType }
    );
    this.executor = new ThreadExecutor(config.agentType);
    this.display = new TerminalRenderer(config.display);
  }

  // Standard task handler (for non-thread tasks)
  async analyze(task: string, data?: any): Promise<AgentResponse> { ... }

  // Thread lifecycle handlers
  async handleThreadSpawn(request: ThreadSpawnRequest): Promise<void> {
    const thread = await this.executor.spawn(request);
    // Stream events back through gateway
    for await (const event of thread.events()) {
      this.sendThreadEvent(event);
      if (event.type === 'thread_output') {
        this.display.write(event.data);
      }
    }
  }

  async handleThreadInput(request: ThreadInputRequest): Promise<void> {
    await this.executor.sendInput(request.threadId, request);
  }
}
```

#### 2.3 ThreadExecutor

Wraps `pty-manager` + `coding-agent-adapters` + `git-workspace-service`:

```typescript
class ThreadExecutor {
  private manager: PTYManager;
  private workspaceService: WorkspaceService;

  async spawn(request: ThreadSpawnRequest): Promise<ManagedThread> {
    // 1. Provision git workspace
    const workspace = await this.workspaceService.provision({
      repo: request.workspace.repoUrl,
      baseBranch: request.workspace.baseBranch,
      branchStrategy: 'feature_branch',
      credentials: { type: 'pat', token: request.workspace.credentialsToken },
    });

    // 2. Write context files (memory, CLAUDE.md, etc.)
    for (const file of request.contextFiles) {
      writeFileSync(join(workspace.path, file.relativePath), file.content);
    }

    // 3. Spawn coding agent in PTY
    const session = await this.manager.spawn({
      name: request.threadId,
      type: request.agentType,  // "claude", "codex", "gemini"
      workdir: workspace.path,
      adapterConfig: {
        approvalPreset: request.approvalPreset || 'autonomous',
        ...this.getCredentialEnv(request),
      },
    });

    // 4. Send objective as first message once ready
    session.on('ready', () => {
      session.sendMessage(request.objective);
    });

    // 5. Return managed thread handle
    return new ManagedThread(session, workspace, request);
  }
}
```

#### 2.4 ManagedThread

Bridges PTY session events to ThreadEvent proto messages:

```typescript
class ManagedThread {
  async *events(): AsyncGenerator<ThreadEvent> {
    // Map pty-manager events → ThreadEvent proto messages
    // session_started → thread_started
    // session_ready → thread_ready
    // session_output → thread_output (with PTY bytes)
    // blocking_prompt → thread_blocked
    // task_complete → thread_turn_complete
    // session_stopped → thread_completed or thread_failed
  }
}
```

**Files:**
- `demos/coding-swarm/coding-swarm-agent/src/` — entire new package
- Depends on: `@parallaxai/sdk-typescript`, `pty-manager`, `coding-agent-adapters`, `git-workspace-service`

**Estimated effort:** 3-4 days

---

### Phase 3: 5" LCD Terminal Display
**Render live PTY output on the Waveshare 5" touchscreen.**

#### 3.1 Display Strategy

The 5" Waveshare screens connect via DSI or HDMI and appear as standard Linux displays. Two approaches:

**Option A: Framebuffer Console (Simplest)**
- Configure Pi to boot to console on the 5" screen (`/dev/fb1` or `/dev/fb0`)
- Run the coding agent directly in the Pi's TTY — the screen IS the terminal
- No custom rendering code needed
- Agent output naturally appears on the LCD
- Add `dtoverlay=vc4-kms-dsi-waveshare-5inch` to `/boot/config.txt`

**Option B: Dedicated Renderer (More Control)**
- Use the screen as a secondary display
- Render PTY output via a lightweight terminal emulator (e.g., `fbterm`, `yaft`)
- Custom status bar overlay showing thread metadata
- Touch input for manual intervention

**Recommendation: Option A for the demo, with a status bar overlay.**

The simplest path: the Pi boots to console on the 5" screen, we run a tmux session on that console, and our agent code launches the coding CLI inside that tmux session. The screen naturally shows the terminal output. We add a small status header via tmux status line.

#### 3.2 Pi Boot Configuration

```bash
# /boot/config.txt additions for 5" DSI display
dtoverlay=vc4-kms-v3d
# Waveshare 5" DSI: (exact overlay depends on model)
dtoverlay=vc4-kms-dsi-waveshare-5inch-v2

# Console font size for 800x480
# ~100 cols x 30 rows at default, or configure via consolefont
```

```bash
# /boot/cmdline.txt — direct console to LCD
console=tty1 fbcon=map:1
```

#### 3.3 Agent Display Integration

Instead of the tamagotchi frame buffer pipeline, we use tmux:

```typescript
// TerminalRenderer for 5" LCD
class TerminalRenderer {
  private tmuxSession: string;

  async init() {
    // Create tmux session on the LCD's TTY
    // Set status bar with agent info
    execSync(`tmux new-session -d -s agent -x 100 -y 28`);
    execSync(`tmux set -t agent status-left "[${this.agentType}]"`);
    execSync(`tmux set -t agent status-right "#{thread_status}"`);
  }

  // PTY output naturally flows to tmux pane
  // Status bar updated via tmux set commands
}
```

Alternatively, if we want the agent process to own the display directly:

```typescript
// Direct approach: agent process IS the terminal
// The pty-manager spawns the coding CLI as a child process
// whose stdout/stderr is the Pi's console TTY
// The 5" screen shows everything naturally
```

**Estimated effort:** 1-2 days (mostly Pi configuration, minimal code)

---

### Phase 4: Org-Chart Pattern
**Prism pattern that decomposes a coding task and coordinates the swarm.**

#### 4.1 Pattern Design

The org-chart compiler already exists at `packages/control-plane/src/org-patterns/org-chart-compiler.ts`. We define the org structure in YAML and the compiler generates Prism code.

```yaml
# demos/coding-swarm/patterns/coding-swarm.org.yaml
name: coding-swarm
description: Distributed coding team with architect + engineers

structure:
  roles:
    architect:
      singleton: true
      agentType: claude        # Claude Code — best at architecture
      capabilities: [architecture, code_review, task_decomposition]

    engineer_a:
      reportsTo: architect
      agentType: codex          # Codex — fast at implementation
      capabilities: [implementation, testing]

    engineer_b:
      reportsTo: architect
      agentType: gemini         # Gemini — good at research + implementation
      capabilities: [implementation, research]

    engineer_c:
      reportsTo: architect
      agentType: claude         # Claude Code — versatile
      capabilities: [implementation, testing, documentation]

  routing:
    - from: engineer_a
      to: architect
      topics: [design_question, review_request, blocked]
    - from: engineer_b
      to: architect
      topics: [design_question, review_request, blocked]
    - from: engineer_c
      to: architect
      topics: [design_question, review_request, blocked]

workflow:
  steps:
    # Step 1: Architect analyzes and decomposes
    - type: assign
      role: architect
      task: |
        Analyze this task and decompose it into 3 independent subtasks
        that can be worked on in parallel by different engineers.
        Return a JSON object with: { subtasks: [{ title, description, files }] }
        Task: ${input.task}

    # Step 2: Engineers work in parallel
    - type: parallel
      steps:
        - type: assign
          role: engineer_a
          task: "${step_0_result.subtasks[0].description}"
        - type: assign
          role: engineer_b
          task: "${step_0_result.subtasks[1].description}"
        - type: assign
          role: engineer_c
          task: "${step_0_result.subtasks[2].description}"

    # Step 3: Architect reviews all work
    - type: assign
      role: architect
      task: |
        Review the work from all engineers and provide a summary.
        Engineer A: ${step_1_0_result}
        Engineer B: ${step_1_1_result}
        Engineer C: ${step_1_2_result}
```

#### 4.2 Thread-Aware Execution

The pattern engine needs to map org-chart roles to thread spawns. The flow:

1. Pattern starts → `spawnThread` for architect role (Claude Code on Mac/Echo)
2. Architect returns subtask decomposition
3. Pattern spawns 3 engineer threads in parallel:
   - engineer_a → Codex on Pi:Sable
   - engineer_b → Gemini on Pi:Silas
   - engineer_c → Claude Code on Pi:Vero
4. Pattern `awaitThread('thread_turn_complete')` on each
5. `collectThreadSummaries()` gathers results
6. Pattern sends review task to architect thread
7. `finalizeThread()` on all threads → push branches, create PRs

#### 4.3 Prism Pattern (Hand-Written Alternative)

If the org-chart compiler output needs tuning, a hand-written Prism pattern.

Key design decisions:
- **No turn limit** — agents run in full interactive mode until they complete their objective
- **Empty repo** — agents build from scratch, so subtasks must include project scaffolding context
- **Default models** — each CLI agent uses its default model (no model override needed if agents are up to date)
- **Autonomous approval** — agents auto-approve all tool use (file writes, shell commands, etc.)

```prism
pattern CodingSwarm version 1.0.0

input {
  task: string
  repo: string = "https://github.com/HaruHunab1320/git-workspace-service-testbed"
  baseBranch: string = "main"
  credentials: { token: string }
}

execute {
  // Phase 1: Architect decomposes the task
  // The architect is a full interactive Claude Code thread — it can explore,
  // think, and produce a detailed plan with as many turns as it needs.
  let architect = spawnThread({
    agentType: "claude",
    role: "architect",
    workspace: { repo: input.repo, baseBranch: input.baseBranch },
    approvalPreset: "autonomous"
  })("You are the architect for a distributed coding team. " +
     "This is an EMPTY repo — you are building from scratch. " +
     "Analyze this task and create a detailed implementation plan. " +
     "Decompose it into exactly 3 independent subtasks that can be " +
     "worked on in parallel by different engineers (each in their own " +
     "git branch). Each subtask should specify: title, detailed description, " +
     "files to create, and any shared conventions (naming, structure). " +
     "Set up the initial project structure (package.json, tsconfig, etc.) " +
     "before the engineers start. " +
     "Task: " + input.task)

  // Wait for architect to finish its full analysis — no turn limit
  let plan = awaitThread("thread_completed")(architect)
  let subtasks = plan?.summary?.subtasks ?? []

  // Phase 2: Engineers work in parallel — each runs to completion
  // All agents are in full interactive mode, running as many turns as needed.
  let engineers = []
  let agentTypes = ["codex", "gemini", "claude"]
  let roles = ["engineer_a", "engineer_b", "engineer_c"]

  for (let i = 0; i < 3; i = i + 1) {
    let subtask = subtasks[i] ?? { description: "Implement part " + i }
    let eng = spawnThread({
      agentType: agentTypes[i],
      role: roles[i],
      workspace: {
        repo: input.repo,
        baseBranch: input.baseBranch,
        featureBranch: "swarm/" + roles[i]
      },
      approvalPreset: "autonomous"
    })(subtask.description)
    engineers = [...engineers, eng]
  }

  // Wait for ALL engineers to finish — no timeout, they run to completion
  for (let j = 0; j < 3; j = j + 1) {
    awaitThread("thread_completed")(engineers[j])
  }

  // Phase 3: Collect results and share across threads
  let summaries = collectThreadSummaries()(engineers)
  shareDecision({ type: "completion", summaries: summaries })([architect])

  // Phase 4: Architect reviews all work (full interactive review)
  sendThreadInput("All engineers have completed their work. Review their " +
    "branches, identify any integration issues, and create a summary. " +
    "Engineer summaries: " + summaries)(architect)
  let review = awaitThread("thread_completed")(architect)

  // Phase 5: Finalize — push branches, create PRs
  for (let k = 0; k < 3; k = k + 1) {
    finalizeThread({ push: true, createPr: true })(engineers[k])
  }
  finalizeThread({ push: false })(architect)

  review ~> 0.9
}
```

**Files:**
- `demos/coding-swarm/patterns/coding-swarm.org.yaml` — org chart definition
- `demos/coding-swarm/patterns/coding-swarm.prism` — hand-tuned pattern
- May need updates to pattern engine for thread-aware execution

**Estimated effort:** 2-3 days

---

### Phase 5: PTY Output Streaming & Dashboard
**Stream terminal output from all agents to a central viewer.**

#### 5.1 SSE Endpoint for Thread Output

Extend the existing SSE streaming endpoint to include PTY output:

```
GET /api/executions/:id/threads/stream
```

Streams events from all threads in an execution:
```
event: thread_output
data: {"threadId":"t1","agentType":"claude","data":"base64-encoded-pty-bytes"}

event: thread_status
data: {"threadId":"t2","status":"blocked","prompt":"Allow file write?"}
```

#### 5.2 Web Terminal Grid (Dashboard)

Add a terminal grid view to the web dashboard:

```
+----------------------------------+----------------------------------+
|  [Claude Code] architect         |  [Codex] engineer_a              |
|  Pi: Vero (192.168.1.73)        |  Pi: Sable                       |
|  Status: running                 |  Status: running                 |
|                                  |                                  |
|  $ claude                        |  $ codex                         |
|  > Analyzing task...             |  > Implementing auth module...   |
|  ...                             |  ...                             |
+----------------------------------+----------------------------------+
|  [Gemini] engineer_b             |  [Claude Code] engineer_c        |
|  Pi: Silas                       |  Mac: Echo                       |
|  Status: running                 |  Status: blocked                 |
|                                  |                                  |
|  $ gemini                        |  $ claude                        |
|  > Researching API docs...       |  > [Waiting: approve file edit]  |
|  ...                             |  ...                             |
+----------------------------------+----------------------------------+
```

Uses xterm.js for each pane, connected to the SSE stream.

#### 5.3 Local Terminal Grid (tmux Alternative)

For the demo, a simpler option: tmux grid on the Mac showing all 4 streams:

```bash
tmux new-session -d -s swarm
tmux split-window -h -t swarm
tmux split-window -v -t swarm:0.0
tmux split-window -v -t swarm:0.1
# Each pane connects to an SSE stream via curl + terminal rendering
```

**Files:**
- `packages/control-plane/src/api/executions.ts` — add thread stream endpoint
- `apps/web-dashboard/src/app/executions/[id]/threads/` — terminal grid page
- `demos/coding-swarm/scripts/tmux-grid.sh` — tmux-based local viewer

**Estimated effort:** 2-3 days

---

### Phase 6: Demo Runner & Polish
**End-to-end demo script and operational tooling.**

#### 6.1 Demo CLI (`demos/coding-swarm/demo.ts`)

```bash
# Upload pattern
npx tsx demo.ts upload

# Check all agents are connected
npx tsx demo.ts status

# Run the swarm — builds a complete project from empty repo
npx tsx demo.ts run \
  --repo https://github.com/HaruHunab1320/git-workspace-service-testbed \
  --task "Build a task management REST API with Express and TypeScript, \
          a CLI client for interacting with it, and comprehensive test coverage. \
          Include proper project structure, error handling, and documentation."

# Watch live output from all 4 agents
npx tsx demo.ts watch --execution-id <id>
```

#### 6.2 Pi Setup Script

```bash
#!/bin/bash
# demos/coding-swarm/scripts/setup-pi.sh
# Run on each Pi to configure 5" LCD + install dependencies

# 1. Configure 5" LCD display
sudo cp /boot/config.txt /boot/config.txt.bak
echo "dtoverlay=vc4-kms-dsi-waveshare-5inch-v2" | sudo tee -a /boot/config.txt

# 2. Set console font for 800x480
sudo dpkg-reconfigure console-setup  # Select Terminus 16x32

# 3. Install Node.js 20+
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
sudo apt-get install -y nodejs

# 4. Install coding agents
npm install -g @anthropic-ai/claude-code   # For Vero
npm install -g @openai/codex               # For Sable
npm install -g @google/gemini-cli          # For Silas

# 5. Clone demo agent code
cd ~ && git clone <repo> coding-swarm
cd coding-swarm && npm install

# 6. Configure environment
cat >> ~/.bashrc << 'EOF'
export PARALLAX_GATEWAY=34.58.31.212:8081
export GEMINI_API_KEY=<key>
export ANTHROPIC_API_KEY=<key>
export OPENAI_API_KEY=<key>
EOF
```

#### 6.3 Agent Startup Script (per Pi)

```bash
#!/bin/bash
# Start agent with display on 5" LCD
# Usage: ./start-agent.sh <agent-type> <agent-id>

AGENT_TYPE=${1:-claude}
AGENT_ID=${2:-vero}

cd ~/coding-swarm/coding-swarm-agent

AGENT_TYPE=$AGENT_TYPE \
AGENT_ID=$AGENT_ID \
PARALLAX_GATEWAY=$PARALLAX_GATEWAY \
npx tsx src/index.ts
```

**Estimated effort:** 1-2 days

---

## Phase Summary & Dependencies

```
Phase 1: Gateway Thread Protocol          [2-3 days]  ← foundation, do first
    |
    v
Phase 2: Thread-Capable Pi Agent          [3-4 days]  ← core agent logic
    |        \
    v         v
Phase 3: 5" LCD Display                   [1-2 days]  ← Pi hardware setup
    |
    v
Phase 4: Org-Chart Pattern                [2-3 days]  ← orchestration logic
    |
    v
Phase 5: PTY Streaming & Dashboard        [2-3 days]  ← visualization
    |
    v
Phase 6: Demo Runner & Polish             [1-2 days]  ← integration
```

**Total estimated effort: 12-17 days**

Phases 3 and 4 can be developed in parallel once Phase 2 has the basic agent structure.

## Test Repo

**Repo:** https://github.com/HaruHunab1320/git-workspace-service-testbed
**State:** Empty — agents build everything from scratch
**Auth:** Fine-grained GitHub PAT in `.env` (`GITHUB_PAT`)

The empty repo is intentional — it makes the demo more impressive since agents are building
a real project from nothing, not just modifying existing code.

### Demo Task (Substantial)

The task should be large enough that 4 agents working in parallel is genuinely useful.
Good candidates for building from scratch:

- **REST API + CLI + Tests:** "Build a task management API with Express, a CLI client,
  and comprehensive tests" → architect scaffolds, engineer_a builds API routes + DB,
  engineer_b builds CLI client, engineer_c writes tests + CI config
- **Full-stack app:** "Build a real-time chat application with WebSocket server,
  React frontend, and deployment config" → architect designs, each engineer owns a layer
- **Developer tool:** "Build a git-based note-taking tool with search, tagging,
  and markdown rendering" → architect designs, engineers own different subsystems

## Risk & Mitigation

| Risk | Impact | Mitigation |
|------|--------|------------|
| Pi memory constraints (4GB) with coding agent | Agent OOM | Enable swap (2GB); monitor with `htop`; Codex (Rust) uses less RAM than Node agents |
| Gateway reconnection during long tasks | Thread state lost | Thread persistence in DB; resume via ThreadPersistenceService; agents auto-reconnect |
| 5" LCD driver compatibility | No display | DSI screens are standard Linux displays; fall back to HDMI if DSI overlay fails |
| Coding agents stall/hang on prompts | Agent blocks forever | Auto-response rules handle known prompts; stall detector escalates unknown ones |
| Network latency for PTY streaming | Laggy dashboard view | Buffer locally on Pi, stream at reduced rate; Pi LCD shows output in real-time regardless |
| Git conflicts between agents | Merge failures | Each agent works on its own feature branch; architect defines file ownership boundaries |
| Empty repo cold start | Agents confused by blank slate | Architect scaffolds project first; engineers get context files describing shared conventions |
| Long-running sessions (30+ min) | Gateway timeout | Heartbeat keepalive every 30s; thread events keep connection active |

## Resolved Decisions

1. **Architect is a full thread** — Claude Code running interactively on Mac (Echo). Gets a real terminal, can explore, scaffold the project, and do multi-turn planning.

2. **No touch interaction** — Screens are display-only for the demo. Orchestrator handles all decisions autonomously.

3. **Test repo:** `HaruHunab1320/git-workspace-service-testbed` — empty, agents build from scratch.

4. **Default models** — Each CLI agent uses whatever model it defaults to when up-to-date. No model overrides.

5. **No run-length cap** — Agents run as many turns as needed. The demo should produce something substantial and real. Duration is however long it takes.

6. **All agents in interactive mode** — Full threads, not `--print` or non-interactive. This is the real deal — agents thinking, editing, running tests, iterating.

## Open Questions

1. **Shared project scaffolding** — Architect sets up initial structure on `main`, then engineers branch from there. Need to ensure the architect's initial commit is pushed before engineers clone. Alternatively, architect's plan is injected as context files into each engineer's workspace.

2. **Cross-branch dependencies** — If engineer_a builds the API and engineer_c writes tests for it, engineer_c needs to know the API shape. Shared decisions and context files handle this, but timing matters.

3. **Pi resource limits** — Claude Code and Codex are Node.js/Rust processes. Gemini CLI is also Node.js. All should fit in 4GB RAM, but need to verify with real workloads. May need swap enabled on Pis.

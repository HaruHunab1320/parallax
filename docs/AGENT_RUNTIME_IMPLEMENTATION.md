# Agent Runtime Implementation Plan

> **Status:** Phase 1-5 Complete, Phase 6-7 Pending
> **Priority:** High - Core v1 Feature
> **Last Updated:** January 2025

## Executive Summary

This document defines the implementation plan for Parallax Agent Runtimes - the compute layer that spawns and manages CLI-based AI agents (Claude Code, Aider, Codex, Gemini CLI). Parallax remains an orchestration layer; runtimes are pluggable providers that handle the actual agent lifecycle.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│  Parallax Control Plane (Orchestration)                         │
│  ├── Pattern Engine (executes Prism scripts)                    │
│  ├── Agent Registry (tracks available agents)                   │
│  ├── Message Router (handles agent communication)               │
│  └── Runtime Manager (talks to runtime providers)               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             │ RuntimeProvider interface
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
┌───────────────┐   ┌───────────────┐   ┌───────────────┐
│ Local Runtime │   │ Docker Runtime│   │ K8s Runtime   │
│ (PTY daemon)  │   │ (containers)  │   │ (operator)    │
└───────┬───────┘   └───────┬───────┘   └───────┬───────┘
        │                   │                   │
        ▼                   ▼                   ▼
   PTY Sessions        Containers            Pods
   (dev machine)       (docker host)      (k8s cluster)
```

## Goals

1. **Spawn CLI agents on demand** - Start claude, aider, codex, gemini sessions
2. **Handle interactive auth** - Surface login prompts when needed
3. **Register with Parallax** - Agents appear in registry automatically
4. **Support multiple runtimes** - Local dev, Docker, Kubernetes
5. **Enable org-chart orchestration** - Roles, hierarchy, communication routing

## Non-Goals

- Replace existing BYOA (Bring Your Own Agent) model
- Build a general-purpose container orchestrator
- Compete with Kubernetes (we use it)

---

## Part 1: Runtime Interface

### Package: `packages/runtime-interface`

A small, shared package defining the contract between control plane and runtimes.

```typescript
// packages/runtime-interface/src/types.ts

/**
 * Supported CLI agent types
 */
export type AgentType = 'claude' | 'aider' | 'codex' | 'gemini' | 'custom';

/**
 * Agent lifecycle states
 */
export type AgentStatus =
  | 'pending'        // Requested, not yet started
  | 'starting'       // Process/container starting
  | 'authenticating' // Waiting for login
  | 'ready'          // Registered and available
  | 'busy'           // Processing a request
  | 'stopping'       // Graceful shutdown
  | 'stopped'        // Terminated
  | 'error';         // Failed state

/**
 * Configuration for spawning an agent
 */
export interface AgentConfig {
  // Identity
  id?: string;                    // Auto-generated if not provided
  name: string;                   // Human-readable name
  type: AgentType;                // CLI agent type

  // Capabilities & Role (for org-chart patterns)
  capabilities: string[];         // What this agent can do
  role?: string;                  // Org role: architect, engineer, qa, etc.
  reportsTo?: string;             // Agent ID this one reports to

  // Environment
  workdir?: string;               // Working directory
  env?: Record<string, string>;   // Environment variables

  // Credentials (encrypted at rest)
  credentials?: {
    anthropicKey?: string;        // For Claude
    openaiKey?: string;           // For Codex/GPT
    googleKey?: string;           // For Gemini
    githubToken?: string;         // For repo access
    custom?: Record<string, string>;
  };

  // Resources (for containerized runtimes)
  resources?: {
    cpu?: string;                 // e.g., "1" or "500m"
    memory?: string;              // e.g., "2Gi"
    timeout?: number;             // Max lifetime in seconds
  };

  // Behavior
  autoRestart?: boolean;          // Restart on crash
  idleTimeout?: number;           // Stop after N seconds idle
}

/**
 * Handle to a running agent
 */
export interface AgentHandle {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;

  // Connection info
  endpoint?: string;              // gRPC/HTTP endpoint if applicable
  pid?: number;                   // Process ID (local runtime)
  containerId?: string;           // Container ID (docker runtime)
  podName?: string;               // Pod name (k8s runtime)

  // Metadata
  role?: string;
  capabilities: string[];
  startedAt?: Date;
  lastActivityAt?: Date;

  // Error info
  error?: string;
  exitCode?: number;
}

/**
 * Message to/from an agent
 */
export interface AgentMessage {
  id: string;
  agentId: string;
  direction: 'inbound' | 'outbound';
  type: 'task' | 'response' | 'question' | 'status' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
  timestamp: Date;
}

/**
 * Runtime events
 */
export type RuntimeEvent =
  | { type: 'agent_started'; agent: AgentHandle }
  | { type: 'agent_ready'; agent: AgentHandle }
  | { type: 'agent_stopped'; agent: AgentHandle; reason: string }
  | { type: 'agent_error'; agent: AgentHandle; error: string }
  | { type: 'login_required'; agent: AgentHandle; loginUrl?: string }
  | { type: 'message'; message: AgentMessage };
```

### Runtime Provider Interface

```typescript
// packages/runtime-interface/src/provider.ts

import { EventEmitter } from 'events';
import {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  RuntimeEvent
} from './types';

/**
 * Interface that all runtime providers must implement
 */
export interface RuntimeProvider extends EventEmitter {
  /** Runtime identifier */
  readonly name: string;

  /** Runtime type */
  readonly type: 'local' | 'docker' | 'kubernetes';

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────

  /**
   * Initialize the runtime (connect to Docker, K8s, etc.)
   */
  initialize(): Promise<void>;

  /**
   * Shutdown the runtime and all agents
   */
  shutdown(): Promise<void>;

  // ─────────────────────────────────────────────────────────────
  // Agent Management
  // ─────────────────────────────────────────────────────────────

  /**
   * Spawn a new agent
   */
  spawn(config: AgentConfig): Promise<AgentHandle>;

  /**
   * Stop an agent gracefully
   */
  stop(agentId: string, options?: { force?: boolean; timeout?: number }): Promise<void>;

  /**
   * Restart an agent
   */
  restart(agentId: string): Promise<AgentHandle>;

  /**
   * Get agent by ID
   */
  get(agentId: string): Promise<AgentHandle | null>;

  /**
   * List all agents managed by this runtime
   */
  list(filter?: { status?: AgentStatus; role?: string; type?: AgentType }): Promise<AgentHandle[]>;

  // ─────────────────────────────────────────────────────────────
  // Communication
  // ─────────────────────────────────────────────────────────────

  /**
   * Send a message/task to an agent
   */
  send(agentId: string, message: string, options?: {
    timeout?: number;
    expectResponse?: boolean;
  }): Promise<AgentMessage | void>;

  /**
   * Stream messages from an agent
   */
  subscribe(agentId: string): AsyncIterable<AgentMessage>;

  // ─────────────────────────────────────────────────────────────
  // Logs & Debugging
  // ─────────────────────────────────────────────────────────────

  /**
   * Get agent logs
   */
  logs(agentId: string, options?: {
    tail?: number;
    follow?: boolean;
    since?: Date;
  }): AsyncIterable<string>;

  /**
   * Get agent metrics (if available)
   */
  metrics(agentId: string): Promise<{
    cpu?: number;
    memory?: number;
    messageCount?: number;
    uptime?: number;
  } | null>;

  // ─────────────────────────────────────────────────────────────
  // Events (inherited from EventEmitter)
  // ─────────────────────────────────────────────────────────────

  on(event: 'agent_started', listener: (agent: AgentHandle) => void): this;
  on(event: 'agent_ready', listener: (agent: AgentHandle) => void): this;
  on(event: 'agent_stopped', listener: (agent: AgentHandle, reason: string) => void): this;
  on(event: 'agent_error', listener: (agent: AgentHandle, error: string) => void): this;
  on(event: 'login_required', listener: (agent: AgentHandle, loginUrl?: string) => void): this;
  on(event: 'message', listener: (message: AgentMessage) => void): this;
}
```

---

## Part 2: Local Runtime

### Package: `runtimes/local`

A daemon that runs on a developer's machine, spawning CLI agents as PTY sessions.

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Local Runtime Daemon                                           │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │  HTTP/gRPC Server (port 9876)                            │   │
│  │  POST /spawn, POST /stop, GET /agents, etc.              │   │
│  └─────────────────────────────────────────────────────────┘   │
│                              │                                  │
│  ┌───────────────────────────┼───────────────────────────────┐ │
│  │  PTY Manager              │                                │ │
│  │                           ▼                                │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │ │
│  │  │ Session │  │ Session │  │ Session │  │ Session │      │ │
│  │  │ claude  │  │ aider   │  │ codex   │  │ gemini  │      │ │
│  │  │ PTY     │  │ PTY     │  │ PTY     │  │ PTY     │      │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                              │                                  │
│  ┌───────────────────────────┼───────────────────────────────┐ │
│  │  Registry Client          │                                │ │
│  │  - Auto-registers agents with Parallax control plane       │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Directory Structure

```
runtimes/local/
├── src/
│   ├── index.ts                 # Entry point
│   ├── server.ts                # HTTP/gRPC server
│   ├── local-runtime.ts         # RuntimeProvider implementation
│   ├── pty/
│   │   ├── pty-manager.ts       # Manages PTY sessions
│   │   ├── pty-session.ts       # Single PTY session wrapper
│   │   └── output-parser.ts     # Parse CLI output for structure
│   ├── adapters/
│   │   ├── base-adapter.ts      # Base CLI adapter
│   │   ├── claude-adapter.ts    # Claude Code specifics
│   │   ├── aider-adapter.ts     # Aider specifics
│   │   ├── codex-adapter.ts     # Codex CLI specifics
│   │   └── gemini-adapter.ts    # Gemini CLI specifics
│   ├── auth/
│   │   ├── auth-detector.ts     # Detect login prompts
│   │   └── auth-handler.ts      # Handle auth flows
│   └── registry/
│       └── registry-client.ts   # Register agents with Parallax
├── package.json
├── tsconfig.json
└── README.md
```

### CLI Adapters

Each CLI agent has different commands, output formats, and auth flows:

```typescript
// runtimes/local/src/adapters/base-adapter.ts

export interface CLIAdapter {
  /** CLI command to start the agent */
  getCommand(): string;

  /** Arguments for the command */
  getArgs(config: AgentConfig): string[];

  /** Environment variables needed */
  getEnv(config: AgentConfig): Record<string, string>;

  /** Detect if output indicates login is required */
  detectLoginRequired(output: string): boolean;

  /** Detect if agent is ready to receive tasks */
  detectReady(output: string): boolean;

  /** Parse structured response from output */
  parseResponse(output: string): AgentMessage | null;

  /** Format a task/message for this CLI */
  formatInput(message: string): string;
}
```

```typescript
// runtimes/local/src/adapters/claude-adapter.ts

export class ClaudeAdapter implements CLIAdapter {
  getCommand(): string {
    return 'claude';  // Assumes claude CLI is in PATH
  }

  getArgs(config: AgentConfig): string[] {
    const args = ['--yes'];  // Auto-accept prompts where safe

    if (config.workdir) {
      args.push('--cwd', config.workdir);
    }

    return args;
  }

  getEnv(config: AgentConfig): Record<string, string> {
    const env: Record<string, string> = {};

    if (config.credentials?.anthropicKey) {
      env.ANTHROPIC_API_KEY = config.credentials.anthropicKey;
    }

    return env;
  }

  detectLoginRequired(output: string): boolean {
    return output.includes('Please sign in') ||
           output.includes('API key not found');
  }

  detectReady(output: string): boolean {
    return output.includes('Claude Code') ||
           output.includes('ready');
  }

  parseResponse(output: string): AgentMessage | null {
    // Parse Claude's output format
    // ...
  }

  formatInput(message: string): string {
    // Claude accepts plain text
    return message;
  }
}
```

### PTY Session Management

```typescript
// runtimes/local/src/pty/pty-session.ts

import { spawn, IPty } from 'node-pty';
import { EventEmitter } from 'events';

export class PTYSession extends EventEmitter {
  private pty: IPty | null = null;
  private outputBuffer: string = '';

  constructor(
    public readonly id: string,
    private adapter: CLIAdapter,
    private config: AgentConfig
  ) {
    super();
  }

  async start(): Promise<void> {
    const command = this.adapter.getCommand();
    const args = this.adapter.getArgs(this.config);
    const env = {
      ...process.env,
      ...this.adapter.getEnv(this.config),
      ...this.config.env,
    };

    this.pty = spawn(command, args, {
      name: 'xterm-256color',
      cols: 120,
      rows: 40,
      cwd: this.config.workdir || process.cwd(),
      env,
    });

    this.pty.onData((data) => {
      this.outputBuffer += data;
      this.emit('output', data);

      // Check for login required
      if (this.adapter.detectLoginRequired(this.outputBuffer)) {
        this.emit('login_required');
      }

      // Check for ready state
      if (this.adapter.detectReady(this.outputBuffer)) {
        this.emit('ready');
      }

      // Try to parse responses
      const response = this.adapter.parseResponse(this.outputBuffer);
      if (response) {
        this.emit('response', response);
        this.outputBuffer = '';  // Clear buffer after parsing
      }
    });

    this.pty.onExit(({ exitCode }) => {
      this.emit('exit', exitCode);
    });
  }

  write(data: string): void {
    if (this.pty) {
      const formatted = this.adapter.formatInput(data);
      this.pty.write(formatted + '\r');
    }
  }

  resize(cols: number, rows: number): void {
    this.pty?.resize(cols, rows);
  }

  kill(): void {
    this.pty?.kill();
  }

  get pid(): number | undefined {
    return this.pty?.pid;
  }
}
```

### Local Runtime HTTP API

```
POST   /agents              Spawn a new agent
GET    /agents              List all agents
GET    /agents/:id          Get agent details
DELETE /agents/:id          Stop an agent
POST   /agents/:id/send     Send message to agent
GET    /agents/:id/logs     Stream agent logs (SSE)
POST   /agents/:id/resize   Resize PTY terminal
```

---

## Part 3: Docker Runtime

### Package: `runtimes/docker`

Spawns agents as Docker containers with PTY wrappers.

### Agent Container Image

```dockerfile
# runtimes/docker/images/claude/Dockerfile

FROM node:20-alpine

# Install Claude CLI
RUN npm install -g @anthropic-ai/claude-code

# Install PTY wrapper
COPY pty-wrapper /usr/local/bin/

# Supervisor script
COPY entrypoint.sh /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
```

### Docker Runtime Implementation

```typescript
// runtimes/docker/src/docker-runtime.ts

import Docker from 'dockerode';
import { RuntimeProvider, AgentConfig, AgentHandle } from '@parallax/runtime-interface';

export class DockerRuntime implements RuntimeProvider {
  readonly name = 'docker';
  readonly type = 'docker' as const;

  private docker: Docker;
  private containers: Map<string, Docker.Container> = new Map();

  constructor(private options: { socketPath?: string } = {}) {
    this.docker = new Docker({
      socketPath: options.socketPath || '/var/run/docker.sock'
    });
  }

  async spawn(config: AgentConfig): Promise<AgentHandle> {
    const image = this.getImageForType(config.type);

    const container = await this.docker.createContainer({
      Image: image,
      name: `parallax-agent-${config.id}`,
      Env: this.buildEnv(config),
      HostConfig: {
        Memory: this.parseMemory(config.resources?.memory),
        CpuPeriod: 100000,
        CpuQuota: this.parseCpu(config.resources?.cpu),
        NetworkMode: 'parallax-agents',  // Custom network
      },
      Labels: {
        'parallax.agent.id': config.id!,
        'parallax.agent.type': config.type,
        'parallax.agent.role': config.role || '',
      },
    });

    await container.start();
    this.containers.set(config.id!, container);

    // Agent will self-register with control plane via network

    return this.containerToHandle(container, config);
  }

  // ... other methods
}
```

---

## Part 4: Kubernetes Runtime

### Package: `runtimes/k8s`

A Kubernetes operator that manages agent pods via Custom Resources.

### Custom Resource Definition

```yaml
# runtimes/k8s/crds/parallax-agent.yaml

apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: parallaxagents.parallax.ai
spec:
  group: parallax.ai
  versions:
    - name: v1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              required: [type, capabilities]
              properties:
                type:
                  type: string
                  enum: [claude, aider, codex, gemini, custom]
                name:
                  type: string
                role:
                  type: string
                capabilities:
                  type: array
                  items:
                    type: string
                reportsTo:
                  type: string
                resources:
                  type: object
                  properties:
                    cpu:
                      type: string
                    memory:
                      type: string
                scaling:
                  type: object
                  properties:
                    min:
                      type: integer
                    max:
                      type: integer
            status:
              type: object
              properties:
                phase:
                  type: string
                replicas:
                  type: integer
                readyReplicas:
                  type: integer
                conditions:
                  type: array
                  items:
                    type: object
  scope: Namespaced
  names:
    plural: parallaxagents
    singular: parallaxagent
    kind: ParallaxAgent
    shortNames: [pa]
```

### Example Agent Resource

```yaml
# Example: Deploy a Claude architect agent

apiVersion: parallax.ai/v1
kind: ParallaxAgent
metadata:
  name: claude-architect
  namespace: parallax-agents
spec:
  type: claude
  name: "Systems Architect"
  role: architect
  capabilities:
    - system_design
    - code_review
    - decision_making
  resources:
    cpu: "2"
    memory: "4Gi"
  scaling:
    min: 1
    max: 3
  credentials:
    secretRef: claude-api-key  # K8s secret reference
```

### Operator Controller

```typescript
// runtimes/k8s/src/controllers/agent-controller.ts

import { Controller, Watch } from '@kubernetes/client-node';

export class AgentController {
  @Watch('parallax.ai/v1', 'ParallaxAgent')
  async onAgentEvent(type: string, agent: ParallaxAgent) {
    switch (type) {
      case 'ADDED':
        await this.createAgentDeployment(agent);
        break;
      case 'MODIFIED':
        await this.updateAgentDeployment(agent);
        break;
      case 'DELETED':
        await this.deleteAgentDeployment(agent);
        break;
    }
  }

  private async createAgentDeployment(agent: ParallaxAgent) {
    // Create Deployment
    const deployment = this.buildDeployment(agent);
    await this.k8s.apps.createNamespacedDeployment(agent.metadata.namespace, deployment);

    // Create Service
    const service = this.buildService(agent);
    await this.k8s.core.createNamespacedService(agent.metadata.namespace, service);

    // Create HPA if scaling configured
    if (agent.spec.scaling) {
      const hpa = this.buildHPA(agent);
      await this.k8s.autoscaling.createNamespacedHorizontalPodAutoscaler(
        agent.metadata.namespace,
        hpa
      );
    }
  }
}
```

---

## Part 5: Control Plane Integration

### Runtime Manager

The control plane needs a component to manage runtime providers:

```typescript
// packages/control-plane/src/runtime/runtime-manager.ts

import { RuntimeProvider, AgentConfig, AgentHandle } from '@parallax/runtime-interface';

export class RuntimeManager {
  private providers: Map<string, RuntimeProvider> = new Map();
  private defaultProvider: string = 'local';

  constructor(private logger: Logger) {}

  /**
   * Register a runtime provider
   */
  registerProvider(provider: RuntimeProvider): void {
    this.providers.set(provider.name, provider);

    // Forward events to control plane
    provider.on('agent_ready', (agent) => {
      this.onAgentReady(agent);
    });

    provider.on('login_required', (agent, url) => {
      this.onLoginRequired(agent, url);
    });
  }

  /**
   * Ensure agents are available for a pattern execution
   */
  async ensureAgents(requirements: AgentRequirement[]): Promise<AgentHandle[]> {
    const agents: AgentHandle[] = [];

    for (const req of requirements) {
      // Check if matching agent already exists
      let agent = await this.findMatchingAgent(req);

      if (!agent) {
        // Spawn new agent via appropriate runtime
        const provider = this.selectProvider(req);
        agent = await provider.spawn(this.requirementToConfig(req));

        // Wait for agent to be ready
        await this.waitForReady(agent.id);
      }

      agents.push(agent);
    }

    return agents;
  }

  /**
   * Route a message to an agent (for org-chart patterns)
   */
  async routeMessage(
    fromAgentId: string,
    toAgentId: string,
    message: AgentMessage
  ): Promise<AgentMessage> {
    const provider = this.getProviderForAgent(toAgentId);
    return provider.send(toAgentId, message.content, { expectResponse: true });
  }
}
```

### Pattern Engine Updates

The pattern engine needs to support org-chart style orchestration:

```typescript
// packages/control-plane/src/pattern-engine/org-patterns.ts

/**
 * Execute a pattern with organizational structure
 */
async executeOrgPattern(
  pattern: OrgPattern,
  input: unknown,
  context: ExecutionContext
): Promise<ExecutionResult> {
  // 1. Ensure all required agents are running
  const agents = await this.runtimeManager.ensureAgents(pattern.agents);

  // 2. Build the org hierarchy
  const hierarchy = this.buildHierarchy(agents, pattern.structure);

  // 3. Set up message routing
  const router = new MessageRouter(hierarchy, pattern.routing);

  // 4. Execute the workflow
  const workflow = new WorkflowExecutor(router, this.logger);

  return workflow.execute(pattern.workflow, input);
}
```

---

## Part 6: Prism DSL Extensions

### Role & Hierarchy Support

```prism
// New Prism syntax for org patterns

pattern startup_team {
  // Define agent roles
  agents {
    architect: {
      type: claude
      model: opus
      capabilities: [system_design, final_approval]
      singleton: true  // Only one architect
    }

    tech_lead: {
      type: claude
      model: sonnet
      capabilities: [code_review, task_breakdown]
      reports_to: architect
    }

    engineer: {
      type: claude | aider  // Can be either
      model: sonnet | default
      capabilities: [implementation, testing]
      reports_to: tech_lead
      min: 2
      max: 5
    }

    qa: {
      type: claude
      capabilities: [testing, validation]
      reports_to: tech_lead
    }
  }

  // Communication rules
  routing {
    // Questions about architecture go up the chain
    engineer -> tech_lead -> architect: [architecture, design]

    // Requirements questions go to PM (if exists) or architect
    engineer -> architect: [requirements, scope]

    // Code review flows
    engineer -> tech_lead: [code_review]
    tech_lead -> architect: [approval]
  }

  // Workflow definition
  workflow {
    // Architect creates high-level plan
    let plan = architect.design(input.task)

    // Tech lead breaks down into tasks
    let tasks = tech_lead.breakdown(plan)

    // Engineers work in parallel
    let implementations = parallel for task in tasks {
      let engineer = select engineer with availability
      engineer.implement(task)
    }

    // Tech lead reviews
    let reviewed = tech_lead.review(implementations)

    // QA validates
    let validated = qa.test(reviewed)

    // Architect gives final approval
    let approved = architect.approve(validated)

    return approved
  }
}
```

### Question Handling

```prism
// Handle agent questions via org hierarchy

pattern with_escalation {
  agents { ... }

  routing { ... }

  // Define how questions are handled
  on_question {
    // Default: route to reports_to
    default: route to reports_to

    // Specific topics
    topic architecture: route to architect
    topic requirements: route to pm or architect
    topic testing: route to qa

    // Escalation if no answer in 30s
    timeout 30s: escalate

    // Max escalation depth
    max_escalations: 3

    // If still unresolved, ask human
    unresolved: surface_to_user
  }
}
```

---

## Implementation Milestones

### Phase 1: Foundation (Week 1-2) ✅ COMPLETE

- [x] **M1.1** Create `packages/runtime-interface` package
  - [x] Define TypeScript interfaces (`types.ts`, `provider.ts`, `adapter.ts`)
  - [x] Export types for consumers
  - [x] BaseRuntimeProvider abstract class

- [x] **M1.2** Create `runtimes/local` package structure
  - [x] Set up package.json, tsconfig
  - [x] Implement HTTP/WebSocket server (`server.ts`)
  - [x] LocalRuntime RuntimeProvider implementation (`local-runtime.ts`)

- [x] **M1.3** Implement PTY management
  - [x] PTYSession class with node-pty (`pty/pty-session.ts`)
  - [x] Output buffering and parsing
  - [x] PTYManager for session lifecycle (`pty/pty-manager.ts`)

### Phase 2: CLI Adapters (Week 2-3) ✅ COMPLETE

- [x] **M2.1** Claude Code adapter
  - [x] Command and args (`adapters/claude-adapter.ts`)
  - [x] Login detection
  - [x] Response parsing

- [x] **M2.2** Codex adapter
  - [x] Command and args (`adapters/codex-adapter.ts`)
  - [x] Response parsing

- [x] **M2.3** Gemini adapter
  - [x] Command and args (`adapters/gemini-adapter.ts`)
  - [x] Response parsing

- [x] **M2.4** Adapter Registry
  - [x] BaseCLIAdapter abstract class (`adapters/base-adapter.ts`)
  - [x] AdapterRegistry for CLI discovery (`adapters/index.ts`)

### Phase 3: Control Plane Integration (Week 3-4) ✅ COMPLETE

- [x] **M3.1** AgentRuntimeService in control plane
  - [x] RuntimeClient HTTP/WebSocket client (`agent-runtime/runtime-client.ts`)
  - [x] AgentRuntimeService multi-runtime manager (`agent-runtime/agent-runtime-service.ts`)
  - [x] Event forwarding to ExecutionEventBus

- [x] **M3.2** REST API integration
  - [x] `/api/managed-agents` router (`api/managed-agents.ts`)
  - [x] CRUD endpoints for agent management
  - [x] Runtime health endpoints

- [x] **M3.3** Server wiring
  - [x] Optional runtime via `PARALLAX_LOCAL_RUNTIME_URL` env var
  - [x] Graceful shutdown handling
  - [x] Dynamic endpoint listing

### Phase 4: Docker Runtime (Week 4-5) ✅ COMPLETE

- [x] **M4.1** Agent container images
  - [x] Base image with entrypoint (`images/base/Dockerfile`)
  - [x] Claude image (`images/claude/Dockerfile`)
  - [x] Codex image (`images/codex/Dockerfile`)
  - [x] Gemini image (`images/gemini/Dockerfile`)

- [x] **M4.2** Docker runtime provider
  - [x] DockerRuntime implementation (`docker-runtime.ts`)
  - [x] Container lifecycle (spawn, stop, restart)
  - [x] Network configuration (parallax-agents network)
  - [x] Log streaming and metrics

- [x] **M4.3** HTTP Server
  - [x] REST API server (`server.ts`)
  - [x] WebSocket events
  - [x] CLI entry point (`cli.ts`)

- [x] **M4.4** Control Plane integration
  - [x] `PARALLAX_DOCKER_RUNTIME_URL` env var support
  - [x] Runtime auto-registration

### Phase 5: Kubernetes Runtime (Week 5-7) ✅ COMPLETE

- [x] **M5.1** CRD definitions
  - [x] ParallaxAgent CRD (`crds/parallax-agent.yaml`)
  - [x] Full spec with resources, credentials, scaling

- [x] **M5.2** Operator implementation
  - [x] K8sRuntime provider (`k8s-runtime.ts`)
  - [x] AgentController for reconciliation (`controllers/agent-controller.ts`)
  - [x] Deployment and Service creation
  - [x] Status updates

- [x] **M5.3** HTTP Server
  - [x] REST API server (`server.ts`)
  - [x] WebSocket events
  - [x] CLI entry point (`cli.ts`)

- [x] **M5.4** Control Plane integration
  - [x] `PARALLAX_K8S_RUNTIME_URL` env var support
  - [x] Runtime auto-registration

### Phase 6: Org-Chart Patterns (Week 7-8)

- [ ] **M6.1** Prism DSL extensions
  - [ ] Role definitions
  - [ ] Routing rules syntax
  - [ ] Question handlers

- [ ] **M6.2** Message routing
  - [ ] Hierarchy-based routing
  - [ ] Escalation logic
  - [ ] Timeout handling

- [ ] **M6.3** Example org patterns
  - [ ] startup-team.prism
  - [ ] enterprise-review.prism
  - [ ] pair-programming.prism

### Phase 7: Polish & Documentation (Week 8-9)

- [ ] **M7.1** Error handling
  - [ ] Graceful degradation
  - [ ] Retry logic
  - [ ] User-friendly errors

- [ ] **M7.2** Monitoring
  - [ ] Runtime metrics
  - [ ] Agent health dashboard
  - [ ] Alerting integration

- [ ] **M7.3** Documentation
  - [ ] Runtime setup guides
  - [ ] Org pattern examples
  - [ ] Troubleshooting guide

---

## Testing Strategy

### Unit Tests
- Runtime interface type guards
- CLI adapter parsing
- PTY session management
- Message routing logic

### Integration Tests
- Local runtime spawn/stop lifecycle
- Control plane ↔ runtime communication
- Registry auto-registration
- Docker container lifecycle

### End-to-End Tests
- Full pattern execution with spawned agents
- Org-chart pattern with question routing
- Multi-runtime scenario (local + docker)

---

## Security Considerations

1. **Credential Management**
   - API keys stored encrypted
   - K8s secrets for production
   - Rotation support

2. **Agent Isolation**
   - Filesystem sandboxing (local)
   - Network policies (k8s)
   - Resource limits enforced

3. **Audit Trail**
   - All spawn/stop operations logged
   - Message routing audited
   - Integration with existing audit service

---

## Open Questions

1. **Agent Persistence** - Should agent sessions survive runtime restarts?
2. **Cost Attribution** - How to track compute costs per pattern/user?
3. **Multi-Tenant Isolation** - Namespace per tenant or shared with policies?
4. **Human-in-the-Loop** - Web terminal for interactive login? Device code flow?

---

## Related Documents

- `AGENT_HOSTING_STRATEGY.md` - Future cloud hosting (post-v1)
- `RAVEN_DOCS_INTEGRATION.md` - Webhook callbacks for external integration
- `LICENSING_STRATEGY.md` - Enterprise runtime features

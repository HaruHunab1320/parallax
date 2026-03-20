---
sidebar_position: 6
title: Wrapping External Agents
---

# Wrapping External Agents

Parallax agents are opaque — the control plane doesn't care what's inside. Any system that can receive a task and return a result can be wrapped as a `ParallaxAgent` in a few lines of code.

This guide shows how to wrap HTTP services, CLI tools, and autonomous runtimes so they can register with Parallax, receive orchestrated tasks, and participate in patterns alongside other agents.

## The Pattern

Every wrapper follows the same structure:

1. Extend `ParallaxAgent`
2. Declare capabilities
3. Implement `analyze()` to translate between Parallax's task format and your system's API
4. Connect via `serve()` (public endpoint) or `connectViaGateway()` (NAT/edge)

```typescript
import { ParallaxAgent } from '@parallaxai/sdk-typescript';

class MyWrapper extends ParallaxAgent {
  constructor() {
    super(
      'my-agent-id',       // Unique ID
      'My Agent',          // Display name
      ['capability-a'],    // What this agent can do
      { version: '1.0' }   // Optional metadata
    );
  }

  async analyze(task: string, data?: any) {
    const result = await callMySystem(task, data);
    return this.createResult(result, 0.85);
  }
}
```

## Wrapping an HTTP Service

Any service with an HTTP API — a Flask app, a Node server, an elizaOS agent, a SaaS endpoint:

```typescript
class HttpAgent extends ParallaxAgent {
  private baseUrl: string;

  constructor(id: string, name: string, baseUrl: string, capabilities: string[]) {
    super(id, name, capabilities);
    this.baseUrl = baseUrl;
  }

  async analyze(task: string, data?: any) {
    const res = await fetch(`${this.baseUrl}/api/process`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ task, ...data }),
    });

    if (!res.ok) {
      throw new Error(`Agent returned ${res.status}`);
    }

    const result = await res.json();
    return this.createResult(result, result.confidence ?? 0.8);
  }
}

const agent = new HttpAgent(
  'flask-analyzer',
  'Flask Analyzer',
  'http://localhost:5000',
  ['text-analysis', 'sentiment']
);

await agent.connectViaGateway('control-plane:8081');
```

## Wrapping a CLI Tool

Any command-line tool that accepts input and produces output:

```typescript
import { execSync } from 'child_process';

class CliAgent extends ParallaxAgent {
  private command: string;

  constructor(id: string, name: string, command: string, capabilities: string[]) {
    super(id, name, capabilities);
    this.command = command;
  }

  async analyze(task: string, data?: any) {
    const input = JSON.stringify({ task, ...data });
    const output = execSync(`${this.command} '${input}'`, {
      encoding: 'utf-8',
      timeout: 30000,
    });

    const result = JSON.parse(output);
    return this.createResult(result, 0.75);
  }
}

const agent = new CliAgent(
  'rust-solver',
  'Rust Solver',
  './target/release/solver',
  ['optimization', 'constraint-solving']
);

await agent.serve(0, { registryEndpoint: 'control-plane:8081' });
```

## Wrapping an Autonomous Agent (e.g. elizaOS / Milady)

Autonomous agents have their own decision loops. The wrapper translates Parallax tasks into the agent's native interaction model:

```typescript
class AutonomousAgentWrapper extends ParallaxAgent {
  private agentUrl: string;
  private token: string;

  constructor(
    id: string,
    name: string,
    agentUrl: string,
    token: string,
    capabilities: string[]
  ) {
    super(id, name, capabilities, { type: 'autonomous' });
    this.agentUrl = agentUrl;
    this.token = token;
  }

  async analyze(task: string, data?: any) {
    // Send task as a chat message to the autonomous agent
    const res = await fetch(`${this.agentUrl}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        message: task,
        context: data,
      }),
    });

    const result = await res.json();

    return this.createResult(
      {
        response: result.text,
        actions: result.actions_taken || [],
      },
      this.estimateConfidence(result)
    );
  }

  private estimateConfidence(result: any): number {
    // Heuristic confidence based on response characteristics
    if (result.error) return 0.1;
    if (result.actions_taken?.length > 0) return 0.9;
    if (result.text?.length > 100) return 0.8;
    return 0.6;
  }
}
```

## Adding Thread Support

If your wrapped agent can run long-lived sessions (coding, research, multi-step workflows), override the thread handlers:

```typescript
class ThreadCapableWrapper extends ParallaxAgent {
  private sessions = new Map<string, AbortController>();

  protected async handleGatewayThreadSpawn(stream, requestId, request) {
    const controller = new AbortController();
    this.registerThread(request.thread_id, () => controller.abort());
    this.sessions.set(request.thread_id, controller);

    // Start long-running work in background
    this.runSession(request).catch(() => {});

    stream.write({
      request_id: requestId,
      thread_spawn_result: {
        thread_id: request.thread_id,
        success: true,
      },
    });
  }

  private async runSession(request) {
    const controller = this.sessions.get(request.thread_id)!;
    let sequence = 0;

    // Stream progress back as thread events
    const emitOutput = (text: string) => {
      this.emitThreadEvent({
        thread_id: request.thread_id,
        event_type: 'output',
        data_json: JSON.stringify({ text }),
        timestamp_ms: Date.now(),
        sequence: sequence++,
      });
    };

    try {
      emitOutput(`Starting: ${request.task}`);
      // ... do work, emit progress ...
      emitOutput('Done.');

      this.emitThreadStatusUpdate({
        thread_id: request.thread_id,
        status: 'completed',
        summary: 'Task completed successfully',
        progress: 1.0,
        timestamp_ms: Date.now(),
      });
    } finally {
      this.unregisterThread(request.thread_id);
      this.sessions.delete(request.thread_id);
    }
  }

  protected async handleGatewayThreadInput(request) {
    // Route input to the running session
  }

  protected async handleGatewayThreadStop(stream, requestId, request) {
    const controller = this.sessions.get(request.thread_id);
    if (controller) controller.abort();
    this.unregisterThread(request.thread_id);
    this.sessions.delete(request.thread_id);

    stream.write({
      request_id: requestId,
      thread_status_update: {
        thread_id: request.thread_id,
        status: 'completed',
        summary: `Stopped: ${request.reason}`,
        progress: 1.0,
        timestamp_ms: Date.now(),
      },
    });
  }
}
```

## Confidence Scoring

Every `AgentResponse` includes a confidence score (0.0–1.0). If your wrapped system doesn't produce one natively, use heuristics:

| Strategy | When to use |
|----------|-------------|
| **Fixed** (`0.8`) | System is reliable, no quality signal available |
| **Response-based** | Longer/richer responses → higher confidence |
| **Error-aware** | Degrade on errors, timeouts, retries |
| **Model-reported** | If the underlying LLM reports confidence or uncertainty |
| **Latency-based** | Faster responses may indicate cached/certain answers |

The control plane uses confidence for routing decisions, consensus aggregation, and quality gates — so a reasonable estimate is better than always returning 1.0.

## Connecting

### Behind NAT / Edge Devices

```typescript
await agent.connectViaGateway('control-plane.example.com:8081', {
  autoReconnect: true,
  heartbeatIntervalMs: 10000,
});
```

### With Public Endpoint

```typescript
await agent.serve(50051, {
  registryEndpoint: 'control-plane.example.com:8081',
});
```

## What Parallax Sees

Once connected, your wrapped agent looks identical to any native agent:

- Appears in the agent registry with its declared capabilities
- Receives tasks from pattern execution
- Returns results that feed into confidence aggregation, consensus, and quality gates
- Can participate in any pattern: station, swarm, org-chart, custom Prism scripts

The control plane never reaches into the agent. It only knows the agent's ID, capabilities, and the results it returns.

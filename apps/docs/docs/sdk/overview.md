---
sidebar_position: 1
title: Overview
---

# SDK Overview

Parallax provides official SDKs for building agents and orchestrating patterns. The SDKs handle communication with the control plane, task management, and result aggregation.

## Available SDKs

| SDK | Package | Purpose |
|-----|---------|---------|
| **TypeScript** | `@parallaxai/sdk-typescript` | Build agents, execute patterns, client applications |
| **Python** | `parallax` (PyPI) | Build agents and clients in Python |

Any-language agents can also join by speaking the gRPC contract in [`/proto`](https://github.com/HaruHunab1320/parallax/tree/main/proto) — see the repo's `docs/any-language.md`. Go and Rust examples live under `examples/polyglot/`.

Patterns themselves are authored as **org-chart YAML** (`patterns/org-*.yaml`) or **TypeScript pattern modules** in [`@parallaxai/patterns`](https://github.com/HaruHunab1320/parallax/tree/main/packages/patterns), not through a separate builder SDK — see [Patterns](/docs/concepts/patterns).

## Quick Comparison

### TypeScript SDK

For building agents and client applications:

```typescript
import { ParallaxAgent, ParallaxClient } from '@parallaxai/sdk-typescript';

// Build an agent
const agent = new ParallaxAgent({
  name: 'my-agent',
  capabilities: ['analysis'],
});

agent.onTask(async (task) => {
  return { result: await process(task), confidence: 0.9 };
});

agent.start();

// Or execute patterns as a client
const client = new ParallaxClient({ url: 'http://localhost:8080' });
const result = await client.executePattern('sentiment-analysis', {
  text: 'Great product!'
});
```

### Authoring patterns

Patterns are not built with a fluent SDK. You author them as either:

- **Org-chart YAML** (`patterns/org-*.yaml`) — declare roles, hierarchy, and workflow.
- **TypeScript pattern modules** — a `PatternModule` with `execute(ctx)` in [`@parallaxai/patterns`](https://github.com/HaruHunab1320/parallax/tree/main/packages/patterns), deployed with the control plane.

See [Patterns](/docs/concepts/patterns) for both.

## Installation

### TypeScript SDK

```bash
npm install @parallaxai/sdk-typescript
# or
pnpm add @parallaxai/sdk-typescript
# or
yarn add @parallaxai/sdk-typescript
```

## Architecture Overview

```mermaid
flowchart TB
  subgraph App["Your Application"]
    TS["TypeScript SDK\n(Client/Agent)"]
  end

  subgraph Control["Control Plane"]
    AR["Agent\nRegistry"]
    PE["Pattern\nEngine"]
    TSched["Task\nScheduler"]
    RA["Result\nAggregator"]
  end

  TS -- "WebSocket/HTTP" --> Control
```

## Common SDK Operations

### Agent Operations

| Operation | SDK | Method |
|-----------|-----|--------|
| Register agent | TypeScript | `agent.start()` |
| Handle tasks | TypeScript | `agent.onTask(handler)` |
| Disconnect | TypeScript | `agent.stop()` |
| Send heartbeat | TypeScript | Automatic |

### Client Operations

| Operation | SDK | Method |
|-----------|-----|--------|
| Execute pattern | TypeScript | `client.executePattern()` |
| Stream results | TypeScript | `client.streamPattern()` |
| List patterns | TypeScript | `client.listPatterns()` |
| Get pattern status | TypeScript | `client.getExecution()` |

### Pattern Authoring

| Task | Where |
|------|-------|
| Define a team | Org-chart YAML (`patterns/org-*.yaml`) |
| Custom orchestration logic | TypeScript `PatternModule` in `@parallaxai/patterns` |
| Register a pattern | `client.registerPattern()` (TypeScript SDK) |

## Configuration

### Environment Variables

```bash
# Control plane connection
PARALLAX_CONTROL_PLANE_URL=http://localhost:8080

# Agent configuration
PARALLAX_AGENT_NAME=my-agent
PARALLAX_AGENT_CAPABILITIES=analysis,summarization

# Client configuration
PARALLAX_API_KEY=your-api-key

# Logging
PARALLAX_LOG_LEVEL=info
```

### Programmatic Configuration

```typescript
import { ParallaxClient } from '@parallaxai/sdk-typescript';

const client = new ParallaxClient({
  url: process.env.PARALLAX_URL || 'http://localhost:8080',
  apiKey: process.env.PARALLAX_API_KEY,
  timeout: 30000,
  retries: 3,
  logging: {
    level: 'info',
    format: 'json',
  },
});
```

## Error Handling

All SDKs use typed errors:

```typescript
import {
  ParallaxError,
  ConnectionError,
  TimeoutError,
  ValidationError,
  PatternNotFoundError,
} from '@parallaxai/sdk-typescript';

try {
  const result = await client.executePattern('my-pattern', input);
} catch (error) {
  if (error instanceof TimeoutError) {
    console.error('Pattern execution timed out');
  } else if (error instanceof PatternNotFoundError) {
    console.error('Pattern does not exist');
  } else if (error instanceof ValidationError) {
    console.error('Input validation failed:', error.details);
  } else if (error instanceof ConnectionError) {
    console.error('Cannot connect to control plane');
  }
}
```

## TypeScript Support

All SDKs are written in TypeScript and provide full type definitions:

```typescript
import {
  ParallaxAgent,
  TaskHandler,
  TaskResult,
  AgentConfig,
} from '@parallaxai/sdk-typescript';

// Typed task handler
const handler: TaskHandler<MyInput, MyOutput> = async (task) => {
  const input: MyInput = task.input;

  const result: TaskResult<MyOutput> = {
    result: processInput(input),
    confidence: 0.85,
  };

  return result;
};

// Typed configuration
const config: AgentConfig = {
  name: 'typed-agent',
  capabilities: ['analysis'],
  maxConcurrentTasks: 5,
};
```

## Next Steps

- [TypeScript SDK](/docs/sdk/typescript) - Full SDK documentation
- [Patterns](/docs/concepts/patterns) - Authoring org-chart YAML and TypeScript pattern modules
- [Agent Registration](/docs/sdk/agent-registration) - Deep dive into agent setup
- [Executing Patterns](/docs/sdk/executing-patterns) - Pattern execution guide

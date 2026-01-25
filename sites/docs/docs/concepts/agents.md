---
sidebar_position: 1
title: Agents
---

# Agents

Agents are the workers in Parallax that execute tasks and return results with confidence scores.

## What is an Agent?

An **agent** is a process that:
1. Connects to the Parallax control plane
2. Declares its **capabilities** (what types of tasks it can handle)
3. Receives **tasks** from the control plane
4. Returns **results** with **confidence scores**

Agents can wrap any AI model or service - OpenAI, Anthropic, Google, local models, or custom business logic.

## Agent Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│                      AGENT LIFECYCLE                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│   1. REGISTER          2. READY           3. EXECUTE        │
│   ┌─────────┐         ┌─────────┐        ┌─────────┐       │
│   │ Connect │────────▶│  Wait   │───────▶│  Task   │       │
│   │   to    │         │   for   │        │ Handler │       │
│   │   CP    │         │  Tasks  │        │         │       │
│   └─────────┘         └─────────┘        └────┬────┘       │
│        │                   ▲                   │            │
│        │                   │                   │            │
│        │                   └───────────────────┘            │
│        │                     (return to ready)              │
│        │                                                    │
│   4. DISCONNECT                                             │
│   ┌─────────┐                                               │
│   │ Graceful│                                               │
│   │Shutdown │                                               │
│   └─────────┘                                               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Creating an Agent

### Basic Agent

```typescript
import { ParallaxAgent } from '@parallax/sdk-typescript';

const agent = new ParallaxAgent({
  name: 'my-agent',
  capabilities: ['text-analysis', 'summarization'],
  controlPlaneUrl: 'http://localhost:8080',
});

agent.onTask(async (task) => {
  // Your logic here
  const result = await processTask(task.input);

  return {
    result,
    confidence: 0.85,
  };
});

agent.start();
```

### Agent with Multiple Handlers

```typescript
const agent = new ParallaxAgent({
  name: 'multi-capability-agent',
  capabilities: ['analysis', 'translation', 'summarization'],
});

// Handle different task types
agent.onTask('analysis', async (task) => {
  return { result: await analyze(task.input), confidence: 0.9 };
});

agent.onTask('translation', async (task) => {
  return { result: await translate(task.input), confidence: 0.85 };
});

agent.onTask('summarization', async (task) => {
  return { result: await summarize(task.input), confidence: 0.8 };
});

agent.start();
```

## Capabilities

Capabilities are string tags that describe what an agent can do. The control plane uses these to route tasks to appropriate agents.

### Defining Capabilities

```typescript
const agent = new ParallaxAgent({
  capabilities: [
    'sentiment-analysis',    // What the agent can do
    'english',               // Languages supported
    'gpt-4',                 // Model used (optional)
  ],
});
```

### Capability Matching

When a pattern requests agents with specific capabilities:

```yaml
agents:
  capabilities: [sentiment-analysis, english]
  min: 3
```

The control plane finds all agents that have **all** the required capabilities.

## Confidence Scores

Every agent response must include a confidence score between 0.0 and 1.0.

### What Confidence Means

| Score | Meaning | Example |
|-------|---------|---------|
| 0.9 - 1.0 | Very high confidence | Clear, unambiguous input |
| 0.7 - 0.9 | High confidence | Most typical responses |
| 0.5 - 0.7 | Moderate confidence | Some uncertainty |
| 0.3 - 0.5 | Low confidence | Significant uncertainty |
| 0.0 - 0.3 | Very low confidence | Mostly guessing |

### Calculating Confidence

```typescript
agent.onTask(async (task) => {
  const response = await llm.generate(task.input);

  // Calculate confidence based on model output
  let confidence = 0.8; // Base confidence

  // Adjust based on factors
  if (response.finishReason === 'length') {
    confidence -= 0.2; // Truncated response
  }
  if (response.tokens < 10) {
    confidence -= 0.1; // Very short response
  }

  return {
    result: response.text,
    confidence: Math.max(0.1, confidence),
  };
});
```

## Agent Configuration

### Full Configuration Options

```typescript
const agent = new ParallaxAgent({
  // Required
  name: 'my-agent',
  capabilities: ['analysis'],

  // Connection
  controlPlaneUrl: 'http://localhost:8080',
  reconnectInterval: 5000,     // ms between reconnect attempts
  heartbeatInterval: 30000,    // ms between heartbeats

  // Execution
  maxConcurrentTasks: 5,       // Parallel task limit
  taskTimeout: 60000,          // ms before task times out

  // Metadata
  metadata: {
    model: 'gpt-4',
    version: '1.0.0',
    region: 'us-east-1',
  },
});
```

### Environment Variables

```bash
PARALLAX_CONTROL_PLANE_URL=http://localhost:8080
PARALLAX_AGENT_NAME=my-agent
PARALLAX_AGENT_CAPABILITIES=analysis,summarization
```

## Agent Events

```typescript
agent.on('connected', () => {
  console.log('Connected to control plane');
});

agent.on('disconnected', () => {
  console.log('Disconnected from control plane');
});

agent.on('task:received', (task) => {
  console.log('Received task:', task.id);
});

agent.on('task:completed', (task, result) => {
  console.log('Completed task:', task.id);
});

agent.on('task:failed', (task, error) => {
  console.error('Task failed:', task.id, error);
});

agent.on('error', (error) => {
  console.error('Agent error:', error);
});
```

## Scaling Agents

### Horizontal Scaling

Run multiple instances of the same agent:

```bash
# Terminal 1
PARALLAX_AGENT_NAME=analyzer-1 npx tsx agent.ts

# Terminal 2
PARALLAX_AGENT_NAME=analyzer-2 npx tsx agent.ts

# Terminal 3
PARALLAX_AGENT_NAME=analyzer-3 npx tsx agent.ts
```

Each instance registers separately and receives tasks independently.

### Load Balancing

The control plane automatically distributes tasks across available agents with matching capabilities using round-robin or capability-weighted distribution.

## Best Practices

1. **Meaningful Capabilities** - Use descriptive, specific capability names
2. **Accurate Confidence** - Don't always return 1.0; reflect actual certainty
3. **Graceful Shutdown** - Handle SIGTERM/SIGINT for clean disconnection
4. **Error Handling** - Catch and report errors rather than crashing
5. **Idempotency** - Design handlers to be safely retryable
6. **Timeouts** - Set appropriate timeouts for external API calls

## Next Steps

- [Patterns](/concepts/patterns) - Learn how agents are orchestrated
- [Agent Registration](/sdk/agent-registration) - Detailed registration API
- [Confidence Scoring](/concepts/confidence-scoring) - Deep dive on confidence

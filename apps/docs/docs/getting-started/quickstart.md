---
sidebar_position: 2
title: Quickstart
---

# Quickstart

Get your first multi-agent pattern running in 5 minutes.

## 1. Create a Project

```bash
mkdir my-parallax-app
cd my-parallax-app
npm init -y
npm install @parallax/sdk-typescript
```

## 2. Create an Agent

Create a simple agent that analyzes sentiment:

```typescript title="agent.ts"
import { ParallaxAgent } from '@parallax/sdk-typescript';

const agent = new ParallaxAgent({
  name: 'sentiment-analyzer',
  capabilities: ['sentiment-analysis'],
  controlPlaneUrl: 'http://localhost:8080',
});

agent.onTask(async (task) => {
  const { text } = task.input;

  // Your AI logic here (call OpenAI, Anthropic, etc.)
  const sentiment = await analyzeSentiment(text);

  return {
    result: sentiment,
    confidence: 0.85,
  };
});

agent.start();
```

## 3. Define a Pattern

Create a voting pattern that uses multiple agents:

```yaml title="sentiment-voting.yaml"
name: sentiment-voting
version: 1.0.0
description: Multi-agent sentiment analysis with voting

input:
  text: string

agents:
  capabilities: [sentiment-analysis]
  min: 3

execution:
  strategy: parallel
  timeout: 30000

aggregation:
  strategy: voting
  method: majority

output:
  sentiment: $vote.result
  confidence: $vote.confidence
```

## 4. Execute the Pattern

```typescript title="run.ts"
import { ParallaxClient } from '@parallax/sdk-typescript';

const client = new ParallaxClient({
  controlPlaneUrl: 'http://localhost:8080',
});

// Load and execute the pattern
const result = await client.executePattern('sentiment-voting', {
  text: 'I absolutely love this product! Best purchase ever.',
});

console.log(result);
// {
//   sentiment: 'positive',
//   confidence: 0.92,
//   agentCount: 3,
//   consensusReached: true
// }
```

## 5. Start Multiple Agents

For voting to work, start multiple agent instances:

```bash
# Terminal 1
npx tsx agent.ts

# Terminal 2
npx tsx agent.ts

# Terminal 3
npx tsx agent.ts
```

Each agent registers with the control plane and receives tasks.

## What Just Happened?

1. Three sentiment analysis agents registered with the control plane
2. You executed a pattern that required 3 agents
3. Parallax distributed the task to all 3 agents in parallel
4. Each agent returned a sentiment with a confidence score
5. Parallax aggregated results using majority voting
6. You received a consensus result with combined confidence

## Next Steps

- [Your First Pattern](/docs/getting-started/your-first-pattern) - Build a custom pattern
- [Core Concepts](/docs/getting-started/concepts) - Understand how it all works
- [Pattern Library](/docs/patterns/overview) - Explore ready-to-use patterns

---
sidebar_position: 3
title: Core Concepts
---

# Core Concepts

Understanding the key concepts in Parallax.

## Agents

**Agents** are the workers in Parallax. Each agent is a process that:
- Registers with the control plane
- Declares its **capabilities** (what it can do)
- Receives **tasks** and returns **results with confidence scores**

```typescript
const agent = new ParallaxAgent({
  name: 'my-agent',
  capabilities: ['analysis', 'summarization'],
});
```

Agents can wrap any AI model or service - OpenAI, Anthropic, local models, or custom logic.

## Patterns

**Patterns** are declarative orchestration blueprints that define:
- What **input** to accept
- Which **agents** to use (by capabilities)
- How to **execute** (parallel, sequential, race)
- How to **aggregate** results (voting, consensus, merge)
- What **output** to produce

```yaml
name: my-pattern
input:
  query: string
agents:
  capabilities: [analysis]
  min: 3
execution:
  strategy: parallel
aggregation:
  strategy: consensus
  threshold: 0.8
output:
  result: $consensus.result
```

## Confidence Scores

Every agent response includes a **confidence score** (0.0 - 1.0) indicating how certain the agent is about its result. Parallax uses these scores for:

- **Weighted voting** - Higher confidence = more influence
- **Quality gates** - Filter out low-confidence responses
- **Consensus building** - Agreement thresholds

## Execution Strategies

How agents receive and process tasks:

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Parallel** | All agents work simultaneously | Speed, diverse perspectives |
| **Sequential** | Agents work in order, passing results | Pipelines, refinement |
| **Race** | First response wins | Latency-sensitive tasks |

## Aggregation Strategies

How results are combined:

| Strategy | Description | Use Case |
|----------|-------------|----------|
| **Voting** | Majority/unanimous vote | Classification, yes/no decisions |
| **Consensus** | Build agreement with threshold | Complex analysis |
| **Merge** | Combine all results | Data extraction |
| **First** | Use first valid response | Fast responses |

## Control Plane

The **control plane** is the orchestration server that:
- Maintains agent registry
- Routes tasks to capable agents
- Executes patterns
- Aggregates results
- Tracks metrics and confidence

## Primitives

Parallax provides 40+ **primitives** - building blocks for orchestration:

- **Execution**: `parallel`, `sequential`, `race`, `delegate`
- **Aggregation**: `consensus`, `voting`, `merge`, `reduce`
- **Control**: `threshold`, `retry`, `fallback`, `timeout`
- **Logic**: `condition`, `switch`, `loop`

These compose together to create sophisticated orchestration flows.

## Next Steps

- [Your First Pattern](/docs/getting-started/your-first-pattern) - Build something
- [Agents Deep Dive](/docs/concepts/agents) - Learn more about agents
- [Pattern Syntax](/docs/patterns/yaml-syntax) - Master the YAML format

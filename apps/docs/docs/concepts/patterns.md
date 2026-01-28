---
sidebar_position: 2
title: Patterns
---

# Patterns

Patterns are declarative blueprints that define how agents work together to accomplish tasks.

## What is a Pattern?

A **pattern** is a YAML or visual definition that specifies:
- **Input** - What data the pattern accepts
- **Agents** - Which agents to use (by capabilities)
- **Execution** - How agents work (parallel, sequential, race)
- **Aggregation** - How results are combined (voting, consensus, merge)
- **Validation** - Quality thresholds and error handling
- **Output** - What the pattern returns

## Pattern Structure

```yaml
# Metadata
name: my-pattern
version: 1.0.0
description: What this pattern does

# Input schema
input:
  query: string
  options:
    type: object
    required: false

# Agent selection
agents:
  capabilities: [analysis, reasoning]
  min: 3
  max: 5

# How agents execute
execution:
  strategy: parallel
  timeout: 30000

# How results combine
aggregation:
  strategy: consensus
  threshold: 0.8

# Quality requirements
validation:
  minConfidence: 0.7
  onFailure: retry
  maxRetries: 2

# Output mapping
output:
  result: $consensus.result
  confidence: $consensus.confidence
```

## Execution Strategies

### Parallel

All agents work on the task simultaneously.

```yaml
execution:
  strategy: parallel
  timeout: 30000       # Max time to wait
  waitForAll: true     # Wait for all or return when threshold met
```

**Use cases:**
- Getting diverse perspectives
- Cross-validation
- Speed (when any response works)

### Sequential

Agents work in order, each receiving the previous agent's output.

```yaml
execution:
  strategy: sequential
  steps:
    - capability: research
    - capability: analysis
    - capability: synthesis
```

**Use cases:**
- Multi-step pipelines
- Refinement workflows
- Dependent processing

### Race

First agent to respond with sufficient quality wins.

```yaml
execution:
  strategy: race
  minConfidence: 0.7   # Minimum quality to accept
  timeout: 10000       # Max time to wait
```

**Use cases:**
- Latency-sensitive applications
- Redundancy for reliability
- Cost optimization

## Aggregation Strategies

### Voting

Agents vote and majority/unanimous wins.

```yaml
aggregation:
  strategy: voting
  method: majority     # or 'unanimous', 'weighted'
  minVotes: 2          # Minimum votes required
```

**Best for:** Classification, yes/no decisions, categorical outputs

### Consensus

Build agreement with confidence threshold.

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8       # 80% agreement required
  minVotes: 2
  conflictResolution: weighted  # or 'first', 'highest-confidence'
```

**Best for:** Complex analysis, nuanced decisions, structured outputs

### Merge

Combine all results into one.

```yaml
aggregation:
  strategy: merge
  method: deep         # or 'shallow', 'concat', 'union'
  fields: [data, metadata]
```

**Best for:** Data extraction, collecting information, aggregating lists

### First

Use the first valid response.

```yaml
aggregation:
  strategy: first
  minConfidence: 0.7
```

**Best for:** Simple queries, when any good answer works

## Variables and References

Patterns use `$` prefixed variables to reference values:

| Variable | Description |
|----------|-------------|
| `$input` | Original input to the pattern |
| `$input.fieldName` | Specific input field |
| `$results` | All agent results |
| `$validResults` | Results meeting confidence threshold |
| `$consensus.result` | Consensus output |
| `$consensus.confidence` | Consensus confidence score |
| `$vote.result` | Voting winner |
| `$vote.confidence` | Voting confidence |
| `$merged` | Merged results |
| `$execution.agentCount` | Number of agents used |

## Validation and Error Handling

### Confidence Thresholds

```yaml
validation:
  minConfidence: 0.7
  onFailure: retry     # 'fail', 'retry', 'fallback'
  maxRetries: 3
  retryDelay: 1000     # ms between retries
```

### Fallbacks

```yaml
validation:
  minConfidence: 0.7
  onFailure: fallback
  fallback:
    type: default
    value:
      result: "Unable to process with sufficient confidence"
      confidence: 0
```

### Timeouts

```yaml
execution:
  timeout: 30000       # Overall timeout

agents:
  taskTimeout: 10000   # Per-agent timeout
```

## Pattern Composition

Patterns can reference other patterns:

```yaml
name: complex-analysis
version: 1.0.0

steps:
  - pattern: extract-entities
    input: $input.document
    output: entities

  - pattern: analyze-sentiment
    input: $input.document
    output: sentiment

  - pattern: generate-summary
    input:
      document: $input.document
      entities: $entities
      sentiment: $sentiment
    output: summary

output:
  entities: $entities
  sentiment: $sentiment
  summary: $summary
```

## Pattern Versioning

```yaml
name: my-pattern
version: 2.1.0        # Semantic versioning

# When executing, specify version
client.executePattern('my-pattern', input, { version: '2.x' });
```

## Creating Patterns

### YAML File

```yaml title="patterns/content-moderation.yaml"
name: content-moderation
version: 1.0.0
description: Multi-agent content moderation with voting

input:
  content: string

agents:
  capabilities: [content-moderation]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: majority

output:
  verdict: $vote.result
  confidence: $vote.confidence
```

### Visual Builder

Use the [Pattern Builder](/pattern-builder/overview) to create patterns visually by dragging and connecting nodes.

### Programmatic

```typescript
import { PatternBuilder } from '@parallax/pattern-sdk';

const pattern = new PatternBuilder('my-pattern')
  .input({ query: 'string' })
  .agents({ capabilities: ['analysis'], min: 3 })
  .parallel()
  .consensus({ threshold: 0.8 })
  .output({ result: '$consensus.result' })
  .build();
```

## Next Steps

- [Primitives](/concepts/primitives) - Building blocks for patterns
- [YAML Syntax](/patterns/yaml-syntax) - Complete reference
- [Pattern Builder](/pattern-builder/overview) - Visual editor

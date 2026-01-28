---
sidebar_position: 3
title: Primitives
---

# Primitives

Primitives are the building blocks used to construct patterns in Parallax. They handle execution flow, data transformation, aggregation, and error handling.

## What is a Primitive?

A **primitive** is a single operation or node in a pattern that performs a specific function:

- **Execution primitives** - Control how tasks run (parallel, sequential, race)
- **Aggregation primitives** - Combine results (vote, merge, consensus)
- **Flow control primitives** - Branch and route (switch, filter, gate)
- **Transform primitives** - Modify data (map, reduce, extract)
- **Validation primitives** - Check quality (threshold, validate, retry)

## Execution Primitives

### Parallel

Runs multiple agents or tasks simultaneously.

```yaml
type: parallel
config:
  tasks: $agents
  timeout: 30000
  waitForAll: true  # Wait for all or return when threshold met
output: $results
```

**Properties:**
- `timeout` - Maximum time to wait (ms)
- `waitForAll` - If false, returns when `minResults` are ready
- `minResults` - Minimum results needed (when `waitForAll: false`)

### Sequential

Runs tasks in order, passing output forward.

```yaml
type: sequential
steps:
  - agent: researcher
    output: research
  - agent: analyzer
    input: $research
    output: analysis
  - agent: writer
    input:
      research: $research
      analysis: $analysis
output: $analysis
```

**Properties:**
- `steps` - Ordered list of tasks
- `stopOnError` - Whether to halt on first error (default: true)

### Race

First task to complete successfully wins.

```yaml
type: race
config:
  tasks: $agents
  timeout: 10000
  minConfidence: 0.7
output: $winner
```

**Properties:**
- `minConfidence` - Minimum confidence to accept result
- `timeout` - Maximum time to wait for any result

### Batch

Processes items in configurable batches.

```yaml
type: batch
config:
  items: $input.documents
  batchSize: 10
  task:
    agent: processor
    input: $item
output: $batchResults
```

## Aggregation Primitives

### Vote

Collects votes and determines winner.

```yaml
type: vote
config:
  results: $results
  method: majority    # majority, unanimous, weighted, plurality
  minVotes: 3
  weights: $agentWeights  # For weighted voting
output:
  winner: $vote.result
  confidence: $vote.confidence
  distribution: $vote.distribution
```

**Methods:**
- `majority` - More than 50% agreement
- `unanimous` - 100% agreement required
- `plurality` - Highest vote count wins (no majority needed)
- `weighted` - Votes weighted by agent confidence or custom weights

### Consensus

Builds agreement with conflict resolution.

```yaml
type: consensus
config:
  results: $results
  threshold: 0.8           # 80% agreement needed
  conflictResolution: weighted  # weighted, first, highest-confidence
  fields: [category, sentiment, rating]
output:
  result: $consensus.result
  confidence: $consensus.confidence
  agreement: $consensus.agreementScore
```

**Properties:**
- `threshold` - Required agreement percentage
- `conflictResolution` - How to resolve disagreements
- `fields` - Specific fields to build consensus on

### Merge

Combines multiple results into one.

```yaml
type: merge
config:
  results: $results
  method: deep        # deep, shallow, concat, union
  fields: [data, metadata]
  deduplication: true
output: $merged
```

**Methods:**
- `deep` - Deep merge objects recursively
- `shallow` - Shallow merge (top-level only)
- `concat` - Concatenate arrays
- `union` - Combine unique values

### Reduce

Reduces multiple values to a single value.

```yaml
type: reduce
config:
  items: $results
  operation: sum    # sum, average, min, max, custom
  field: confidence
  initial: 0
output: $total
```

## Flow Control Primitives

### Switch

Routes based on conditions.

```yaml
type: switch
config:
  value: $input.type
  cases:
    document:
      agent: document-processor
    image:
      agent: image-analyzer
    audio:
      agent: audio-transcriber
  default:
    agent: generic-processor
output: $result
```

### Filter

Filters results based on criteria.

```yaml
type: filter
config:
  items: $results
  conditions:
    - field: confidence
      operator: gte
      value: 0.7
    - field: status
      operator: eq
      value: complete
output: $filtered
```

**Operators:** `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`, `matches`

### Gate

Blocks execution until conditions are met.

```yaml
type: gate
config:
  condition:
    - $results.length >= 3
    - $avgConfidence >= 0.8
  timeout: 30000
  onTimeout: proceed  # proceed, fail
output: $gateResult
```

### Loop

Repeats until condition is met.

```yaml
type: loop
config:
  maxIterations: 5
  condition: $confidence < 0.9
  task:
    agent: improver
    input: $previousResult
output: $finalResult
```

## Transform Primitives

### Map

Transforms each item in a collection.

```yaml
type: map
config:
  items: $input.documents
  transform:
    id: $item.id
    content: $item.text
    length: $item.text.length
output: $mapped
```

### Extract

Extracts specific fields from data.

```yaml
type: extract
config:
  source: $result
  fields:
    - path: data.entities
      as: entities
    - path: metadata.timestamp
      as: timestamp
    - path: confidence
      as: score
output: $extracted
```

### Template

Applies templates to generate output.

```yaml
type: template
config:
  template: |
    Analysis Results:
    - Sentiment: {{sentiment}}
    - Confidence: {{confidence}}%
    - Key Entities: {{entities | join(", ")}}
  data: $result
output: $formatted
```

## Validation Primitives

### Threshold

Checks if values meet thresholds.

```yaml
type: threshold
config:
  value: $confidence
  min: 0.7
  max: 1.0
  onFailure: retry    # retry, fail, fallback
  fallbackValue: null
output: $validated
```

### Validate

Validates against a schema.

```yaml
type: validate
config:
  data: $result
  schema:
    type: object
    required: [sentiment, confidence]
    properties:
      sentiment:
        type: string
        enum: [positive, negative, neutral]
      confidence:
        type: number
        minimum: 0
        maximum: 1
  onInvalid: fail
output: $validated
```

### Retry

Retries on failure with backoff.

```yaml
type: retry
config:
  task: $agentTask
  maxRetries: 3
  backoff: exponential  # fixed, linear, exponential
  initialDelay: 1000
  maxDelay: 30000
  retryOn:
    - timeout
    - lowConfidence
output: $result
```

## Utility Primitives

### Delay

Pauses execution.

```yaml
type: delay
config:
  duration: 1000  # ms
```

### Log

Logs data for debugging.

```yaml
type: log
config:
  level: info    # debug, info, warn, error
  message: "Processing result"
  data: $result
```

### Cache

Caches results for reuse.

```yaml
type: cache
config:
  key: $input.hash
  ttl: 3600      # seconds
  task: $expensiveTask
output: $cachedResult
```

### Timeout

Wraps a task with timeout.

```yaml
type: timeout
config:
  task: $agentTask
  duration: 10000
  onTimeout:
    type: fallback
    value: { error: "Task timed out" }
output: $result
```

## Combining Primitives

Primitives compose to build complex patterns:

```yaml
name: validated-multi-agent-analysis
version: 1.0.0

steps:
  # Step 1: Run agents in parallel
  - type: parallel
    id: gather
    config:
      tasks:
        - agent: analyst-1
          input: $input
        - agent: analyst-2
          input: $input
        - agent: analyst-3
          input: $input
      timeout: 30000

  # Step 2: Filter low-confidence results
  - type: filter
    id: quality-filter
    config:
      items: $gather.results
      conditions:
        - field: confidence
          operator: gte
          value: 0.7

  # Step 3: Build consensus from filtered results
  - type: consensus
    id: agree
    config:
      results: $quality-filter.output
      threshold: 0.8

  # Step 4: Validate the consensus result
  - type: validate
    id: final-check
    config:
      data: $agree.result
      schema:
        type: object
        required: [analysis, confidence]

output:
  result: $final-check.output
  confidence: $agree.confidence
```

## Custom Primitives

Create custom primitives for domain-specific logic:

```typescript
import { definePrimitive } from '@parallax/pattern-sdk';

const customScorer = definePrimitive({
  name: 'custom-scorer',

  input: {
    results: { type: 'array' },
    weights: { type: 'object' },
  },

  execute: async (input, context) => {
    const { results, weights } = input;

    const scored = results.map(r => ({
      ...r,
      weightedScore: r.confidence * (weights[r.agentId] || 1),
    }));

    return {
      scored,
      topResult: scored.sort((a, b) => b.weightedScore - a.weightedScore)[0],
    };
  },
});
```

## Next Steps

- [Patterns](/concepts/patterns) - How primitives combine into patterns
- [YAML Syntax](/patterns/yaml-syntax) - Complete primitive reference
- [Pattern Builder](/pattern-builder/overview) - Visual primitive editor

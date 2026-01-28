---
sidebar_position: 2
title: Nodes
---

# Node Types

The Pattern Builder provides several node types for constructing orchestration patterns.

## Core Nodes

### Input Node

Defines the pattern's input schema.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Fields | Array | Input field definitions |

**Field Options:**

| Property | Description |
|----------|-------------|
| Name | Field name (alphanumeric, underscores) |
| Type | `string`, `number`, `boolean`, `array`, `object` |
| Required | Whether field is required |
| Default | Default value if not provided |

**Example Configuration:**

```
Fields:
  - name: document
    type: string
    required: true

  - name: language
    type: string
    required: false
    default: "en"
```

**Generated YAML:**

```yaml
input:
  document:
    type: string
    required: true
  language:
    type: string
    required: false
    default: "en"
```

### Output Node

Maps results to the pattern's output.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Mappings | Array | Output variable mappings |

**Mapping Options:**

| Property | Description |
|----------|-------------|
| Name | Output field name |
| Value | Variable reference (e.g., `$vote.result`) |

**Example Configuration:**

```
Mappings:
  - name: result
    value: $consensus.result

  - name: confidence
    value: $consensus.confidence
```

**Generated YAML:**

```yaml
output:
  result: $consensus.result
  confidence: $consensus.confidence
```

### Agent Node

Configures agent selection and execution.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Capabilities | Array | Required agent capabilities |
| Min | Number | Minimum number of agents |
| Max | Number | Maximum number of agents (optional) |
| Timeout | Number | Per-agent timeout in ms |

**Example Configuration:**

```
Capabilities: [analysis, english]
Min: 3
Max: 5
Timeout: 30000
```

**Generated YAML:**

```yaml
agents:
  capabilities: [analysis, english]
  min: 3
  max: 5
  taskTimeout: 30000
```

## Aggregation Nodes

### Vote Node

Aggregates results using voting.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Method | Enum | `majority`, `unanimous`, `weighted`, `plurality` |
| Min Votes | Number | Minimum votes required |
| Tie Breaker | Enum | `first`, `random`, `highest-confidence` |

**Output Variables:**

- `$vote.result` - Winning option
- `$vote.confidence` - Vote confidence
- `$vote.distribution` - Vote distribution

**Example Configuration:**

```
Method: majority
Min Votes: 2
Tie Breaker: highest-confidence
```

**Generated YAML:**

```yaml
aggregation:
  strategy: voting
  method: majority
  minVotes: 2
  tieBreaker: highest-confidence
```

### Consensus Node

Builds agreement from multiple responses.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Threshold | Number | Agreement threshold (0.0 - 1.0) |
| Min Votes | Number | Minimum responses required |
| Conflict Resolution | Enum | `weighted`, `first`, `highest-confidence` |

**Output Variables:**

- `$consensus.result` - Consensus result
- `$consensus.confidence` - Consensus confidence
- `$consensus.agreement` - Agreement score

**Example Configuration:**

```
Threshold: 0.8
Min Votes: 3
Conflict Resolution: weighted
```

**Generated YAML:**

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8
  minVotes: 3
  conflictResolution: weighted
```

### Merge Node

Combines results from multiple agents.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Method | Enum | `deep`, `shallow`, `union`, `concat` |
| Fields | Array | Specific fields to merge (optional) |
| Deduplicate | Boolean | Remove duplicates |

**Output Variables:**

- `$merged` - Merged result object
- `$merged.{field}` - Specific merged field

**Example Configuration:**

```
Method: union
Fields: [entities, keywords]
Deduplicate: true
```

**Generated YAML:**

```yaml
aggregation:
  strategy: merge
  method: union
  fields: [entities, keywords]
  deduplication: true
```

### First Node

Returns the first valid result.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Min Confidence | Number | Minimum confidence to accept |

**Output Variables:**

- `$first.result` - First valid result
- `$first.confidence` - Result confidence

**Generated YAML:**

```yaml
aggregation:
  strategy: first
  minConfidence: 0.7
```

## Execution Nodes

### Parallel Node

Executes agents simultaneously.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Timeout | Number | Overall timeout in ms |
| Wait for All | Boolean | Wait for all agents |
| Min Results | Number | Minimum results (if not waiting for all) |

**Generated YAML:**

```yaml
execution:
  strategy: parallel
  timeout: 30000
  waitForAll: true
```

### Sequential Node

Executes steps in order.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Steps | Array | Ordered step definitions |
| Stop on Error | Boolean | Halt on first error |

**Generated YAML:**

```yaml
execution:
  strategy: sequential
  stopOnError: true
  steps:
    - capability: research
    - capability: analysis
```

### Race Node

First valid result wins.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Timeout | Number | Maximum wait time |
| Min Confidence | Number | Minimum acceptable confidence |

**Generated YAML:**

```yaml
execution:
  strategy: race
  timeout: 10000
  minConfidence: 0.7
```

## Validation Nodes

### Quality Gate Node

Validates results against thresholds.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Min Confidence | Number | Minimum confidence |
| On Failure | Enum | `fail`, `retry`, `fallback` |
| Max Retries | Number | Retry attempts (if retry) |
| Fallback Value | Object | Fallback result (if fallback) |

**Generated YAML:**

```yaml
validation:
  minConfidence: 0.7
  onFailure: retry
  maxRetries: 3
```

### Schema Validator Node

Validates output structure.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Schema | Object | JSON Schema definition |
| On Invalid | Enum | `fail`, `retry` |

**Generated YAML:**

```yaml
validation:
  schema:
    type: object
    required: [result]
```

## Flow Control Nodes

### Switch Node

Routes based on conditions.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Value | String | Variable to switch on |
| Cases | Object | Case → next node mapping |
| Default | String | Default case |

**Generated YAML:**

```yaml
type: switch
value: $input.type
cases:
  document: process-document
  image: process-image
default: generic-processor
```

### Gate Node

Blocks until condition is met.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Condition | String | Condition expression |
| Timeout | Number | Maximum wait time |
| On Timeout | Enum | `proceed`, `fail` |

**Generated YAML:**

```yaml
type: gate
condition: $results.length >= 3
timeout: 30000
onTimeout: proceed
```

### Loop Node

Repeats until condition.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Max Iterations | Number | Maximum loop count |
| Condition | String | Continue condition |

**Generated YAML:**

```yaml
type: loop
maxIterations: 5
condition: $confidence < 0.9
```

## Utility Nodes

### Comment Node

Adds documentation to the canvas (not exported).

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Text | String | Comment text |
| Color | String | Background color |

### Group Node

Groups related nodes visually.

**Configuration:**

| Property | Type | Description |
|----------|------|-------------|
| Label | String | Group label |
| Color | String | Border color |

## Node Handles

### Input Handles (Left)

Where connections enter the node:

- **Data Input**: Receives data from previous nodes
- **Trigger Input**: Receives execution trigger

### Output Handles (Right)

Where connections exit the node:

- **Data Output**: Sends data to next nodes
- **Trigger Output**: Triggers next node execution
- **Error Output**: Sends errors to error handlers

## Node States

| State | Indicator | Meaning |
|-------|-----------|---------|
| Default | Gray border | Normal state |
| Selected | Blue border | Currently selected |
| Error | Red border | Validation error |
| Warning | Yellow border | Potential issue |

## Next Steps

- [Connections](/pattern-builder/connections) - Connecting nodes
- [Exporting](/pattern-builder/exporting) - Export patterns
- [Overview](/pattern-builder/overview) - Pattern Builder guide

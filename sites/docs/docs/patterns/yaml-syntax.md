---
sidebar_position: 2
title: YAML Syntax
---

# Pattern YAML Syntax

Complete reference for the pattern YAML format.

## Basic Structure

```yaml
# Required metadata
name: pattern-name
version: 1.0.0

# Optional metadata
description: What this pattern does
author: your-name
tags: [category, production]

# Input definition
input:
  fieldName: type

# Agent configuration
agents:
  capabilities: [cap1]
  min: 3

# Execution strategy
execution:
  strategy: parallel

# Aggregation strategy
aggregation:
  strategy: voting

# Validation rules (optional)
validation:
  minConfidence: 0.7

# Output mapping
output:
  result: $variable
```

## Metadata

### Required Fields

```yaml
name: my-pattern          # Pattern identifier (alphanumeric, hyphens)
version: 1.0.0            # Semantic version
```

### Optional Fields

```yaml
description: |
  Detailed description of what this pattern does.
  Can be multi-line.

author: team-name
tags: [analysis, production, v2]

metadata:
  category: text-processing
  costTier: medium
  deprecated: false
```

## Input Schema

### Simple Types

```yaml
input:
  text: string            # String field
  count: number           # Number field
  enabled: boolean        # Boolean field
```

### Full Field Definition

```yaml
input:
  fieldName:
    type: string          # string, number, boolean, array, object
    required: true        # Default: true
    default: 'value'      # Default value if not provided
    description: Field description
```

### String Validation

```yaml
input:
  text:
    type: string
    required: true
    minLength: 1
    maxLength: 10000
    pattern: '^[a-z]+$'   # Regex pattern
    format: email         # email, uri, date, date-time, uuid
    enum: [a, b, c]       # Allowed values
```

### Number Validation

```yaml
input:
  score:
    type: number
    minimum: 0
    maximum: 100
    multipleOf: 0.5       # Must be multiple of

  count:
    type: integer         # Integer only
    minimum: 1
```

### Arrays

```yaml
input:
  # Simple array
  tags:
    type: array
    items: string

  # Array with validation
  documents:
    type: array
    items:
      type: string
      maxLength: 50000
    minItems: 1
    maxItems: 10
    uniqueItems: true
```

### Objects

```yaml
input:
  options:
    type: object
    properties:
      verbose:
        type: boolean
        default: false
      maxTokens:
        type: number
        default: 1000
    required: [verbose]   # Required properties within object
    additionalProperties: false
```

### Nested Structures

```yaml
input:
  document:
    type: object
    properties:
      title:
        type: string
      content:
        type: string
      metadata:
        type: object
        properties:
          author: string
          tags:
            type: array
            items: string
```

## Agent Configuration

### Basic Selection

```yaml
agents:
  capabilities: [analysis]
  min: 3                  # Minimum required agents
```

### Full Options

```yaml
agents:
  capabilities: [analysis, english]  # ALL required
  min: 3                  # Minimum agents
  max: 5                  # Maximum agents (optional)
  taskTimeout: 10000      # Per-agent timeout (ms)
  prefer: [expert-1]      # Preferred agents (optional)
```

### Multiple Agent Groups

```yaml
# For sequential patterns with different agent types
steps:
  - id: research
    agents:
      capabilities: [research]
      min: 2
    # ...

  - id: analysis
    agents:
      capabilities: [analysis]
      min: 3
    # ...
```

## Execution Strategies

### Parallel

Run all agents simultaneously:

```yaml
execution:
  strategy: parallel
  timeout: 30000          # Overall timeout (ms)
  waitForAll: true        # Wait for all agents (default: true)
```

With early return:

```yaml
execution:
  strategy: parallel
  timeout: 30000
  waitForAll: false
  minResults: 2           # Return after 2 results
```

### Sequential

Run agents in order:

```yaml
execution:
  strategy: sequential
  steps:
    - capability: research
      output: research
    - capability: analysis
      input: $research
      output: analysis
    - capability: synthesis
      input:
        research: $research
        analysis: $analysis
```

With error handling:

```yaml
execution:
  strategy: sequential
  stopOnError: true       # Stop on first error (default: true)
  steps:
    - capability: step1
    - capability: step2
```

### Race

First valid result wins:

```yaml
execution:
  strategy: race
  timeout: 10000
  minConfidence: 0.7      # Minimum confidence to accept
```

## Aggregation Strategies

### Voting

```yaml
aggregation:
  strategy: voting
  method: majority        # majority, unanimous, weighted, plurality
  minVotes: 2             # Minimum votes required
```

Weighted voting:

```yaml
aggregation:
  strategy: voting
  method: weighted
  weights:
    expert-agent: 2.0
    default: 1.0
```

### Consensus

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8          # 80% agreement required
  minVotes: 3
  conflictResolution: weighted  # weighted, first, highest-confidence
```

Field-level consensus:

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8
  fields:
    - name: sentiment
      threshold: 0.7
    - name: category
      threshold: 0.9
```

### Merge

```yaml
aggregation:
  strategy: merge
  method: deep            # deep, shallow, concat, union
```

With options:

```yaml
aggregation:
  strategy: merge
  method: union
  fields: [entities, keywords]  # Specific fields to merge
  deduplication: true           # Remove duplicates
```

### First

```yaml
aggregation:
  strategy: first
  minConfidence: 0.7      # Minimum confidence to accept
```

## Validation

### Confidence Threshold

```yaml
validation:
  minConfidence: 0.7
  onFailure: fail         # fail, retry, fallback
```

### Retry

```yaml
validation:
  minConfidence: 0.7
  onFailure: retry
  maxRetries: 3
  retryDelay: 1000        # ms between retries
```

### Fallback

```yaml
validation:
  minConfidence: 0.7
  onFailure: fallback
  fallback:
    type: default
    value:
      result: "Unable to process"
      confidence: 0
```

### Schema Validation

```yaml
validation:
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
```

## Output Mapping

### Direct Mapping

```yaml
output:
  result: $consensus.result
  confidence: $consensus.confidence
```

### Nested Output

```yaml
output:
  analysis:
    sentiment: $consensus.result.sentiment
    score: $consensus.result.score
  metadata:
    agentCount: $execution.agentCount
    duration: $execution.duration
```

### Template Strings

```yaml
output:
  summary:
    $template: |
      Sentiment: {{sentiment}}
      Confidence: {{confidence}}%
```

## Variables Reference

### Input Variables

| Variable | Description |
|----------|-------------|
| `$input` | Full input object |
| `$input.fieldName` | Specific input field |

### Execution Variables

| Variable | Description |
|----------|-------------|
| `$results` | Array of all agent results |
| `$validResults` | Results meeting confidence threshold |
| `$execution.agentCount` | Number of agents used |
| `$execution.duration` | Total execution time (ms) |

### Aggregation Variables

| Variable | Description |
|----------|-------------|
| `$vote.result` | Voting winner |
| `$vote.confidence` | Voting confidence |
| `$vote.distribution` | Vote distribution |
| `$consensus.result` | Consensus output |
| `$consensus.confidence` | Consensus confidence |
| `$consensus.agreement` | Agreement score |
| `$merged` | Merged results |
| `$first.result` | First valid result |

### Step Variables (Sequential)

```yaml
steps:
  - id: step1
    output: step1Result
  - id: step2
    input: $step1Result    # Reference previous step
```

## Multi-Step Patterns

### Sequential Steps

```yaml
name: pipeline
version: 1.0.0

input:
  document: string

steps:
  - id: extract
    agents:
      capabilities: [extraction]
      min: 3
    execution:
      strategy: parallel
    aggregation:
      strategy: merge
    output: entities

  - id: analyze
    agents:
      capabilities: [analysis]
      min: 3
    input:
      document: $input.document
      entities: $entities
    execution:
      strategy: parallel
    aggregation:
      strategy: consensus
    output: analysis

output:
  entities: $entities
  analysis: $analysis
```

### Conditional Steps

```yaml
steps:
  - id: classify
    agents:
      capabilities: [classification]
      min: 3
    aggregation:
      strategy: voting
    output: classification

  - id: route
    type: switch
    value: $classification.result
    cases:
      document:
        next: process-document
      image:
        next: process-image
      default:
        next: process-generic

  - id: process-document
    agents:
      capabilities: [document-processing]
      min: 2
    # ...

  - id: process-image
    agents:
      capabilities: [image-processing]
      min: 2
    # ...
```

### Parallel Branches

```yaml
steps:
  - id: parallel-analysis
    type: parallel
    branches:
      - id: sentiment
        agents:
          capabilities: [sentiment]
          min: 3
        output: sentiment

      - id: entities
        agents:
          capabilities: [extraction]
          min: 3
        output: entities

      - id: summary
        agents:
          capabilities: [summarization]
          min: 2
        output: summary

  - id: combine
    type: merge
    inputs:
      - $sentiment
      - $entities
      - $summary
    output: combined

output:
  sentiment: $sentiment
  entities: $entities
  summary: $summary
```

## Pattern Composition

### Reference Other Patterns

```yaml
name: comprehensive-analysis
version: 1.0.0

input:
  document: string

steps:
  - id: extract
    pattern: entity-extraction@1.x  # Pattern name and version
    input:
      document: $input.document
    output: entities

  - id: sentiment
    pattern: sentiment-analysis@1.x
    input:
      text: $input.document
    output: sentiment

output:
  entities: $entities
  sentiment: $sentiment
```

## Comments and Documentation

```yaml
# Top-level comment
name: documented-pattern
version: 1.0.0

# This pattern does X, Y, Z
description: |
  A comprehensive pattern that:
  - Extracts entities
  - Analyzes sentiment
  - Generates summary

input:
  # The document to process
  document:
    type: string
    description: The input document to analyze
    # Must be plain text, not HTML
```

## Complete Example

```yaml
name: comprehensive-document-analysis
version: 2.0.0
description: |
  Multi-step document analysis with entity extraction,
  sentiment analysis, and summarization.

author: parallax-team
tags: [analysis, production, document]

input:
  document:
    type: string
    required: true
    maxLength: 100000
    description: The document to analyze

  options:
    type: object
    required: false
    properties:
      language:
        type: string
        default: auto
      includeEntities:
        type: boolean
        default: true
      includeSummary:
        type: boolean
        default: true

steps:
  # Step 1: Extract entities
  - id: extract
    agents:
      capabilities: [entity-extraction]
      min: 3
      max: 5
    execution:
      strategy: parallel
      timeout: 30000
    aggregation:
      strategy: merge
      method: union
      deduplication: true
    validation:
      minConfidence: 0.6
    output: entities

  # Step 2: Analyze sentiment
  - id: sentiment
    agents:
      capabilities: [sentiment-analysis]
      min: 5
    execution:
      strategy: parallel
      timeout: 20000
    aggregation:
      strategy: consensus
      threshold: 0.8
    output: sentiment

  # Step 3: Generate summary
  - id: summarize
    agents:
      capabilities: [summarization]
      min: 3
    input:
      document: $input.document
      entities: $entities
      sentiment: $sentiment
    execution:
      strategy: parallel
    aggregation:
      strategy: consensus
      threshold: 0.7
    validation:
      minConfidence: 0.7
      onFailure: retry
      maxRetries: 2
    output: summary

output:
  entities: $entities.result
  sentiment: $sentiment.result
  summary: $summary.result
  confidence:
    entities: $entities.confidence
    sentiment: $sentiment.confidence
    summary: $summary.confidence
  metadata:
    agentCount: $execution.agentCount
    processingTime: $execution.duration
```

## Next Steps

- [Voting Patterns](/patterns/voting-patterns) - Voting pattern examples
- [Quality Gates](/patterns/quality-gates) - Validation patterns
- [Pattern SDK](/sdk/pattern-sdk) - Build patterns programmatically

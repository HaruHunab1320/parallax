---
sidebar_position: 4
title: Quality Gates
---

# Quality Gates

Quality gates ensure that pattern outputs meet minimum quality standards before being returned. They filter, retry, or handle low-confidence results.

## When to Use Quality Gates

- **Production systems** - Ensure consistent output quality
- **High-stakes decisions** - Critical processes that need reliability
- **User-facing outputs** - Avoid showing uncertain results
- **Cost optimization** - Retry before escalating to expensive fallbacks

## Basic Quality Gate

The simplest quality gate rejects results below a confidence threshold:

```yaml
name: basic-quality-gate
version: 1.0.0

input:
  text: string

agents:
  capabilities: [analysis]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: consensus
  threshold: 0.8

validation:
  minConfidence: 0.7
  onFailure: fail

output:
  result: $consensus.result
  confidence: $consensus.confidence
```

## Validation Options

### Fail on Low Confidence

Stop execution and return an error:

```yaml
validation:
  minConfidence: 0.7
  onFailure: fail
```

Result when confidence is too low:
```json
{
  "error": "ValidationFailed",
  "message": "Result confidence (0.55) below threshold (0.7)",
  "confidence": 0.55
}
```

### Retry on Low Confidence

Automatically retry with different agents:

```yaml
validation:
  minConfidence: 0.7
  onFailure: retry
  maxRetries: 3
  retryDelay: 1000        # ms between retries
```

Each retry:
- Selects different agents (when available)
- Counts toward the retry limit
- Returns the first result that passes threshold

### Fallback on Low Confidence

Use a fallback value or strategy:

```yaml
# Static fallback value
validation:
  minConfidence: 0.7
  onFailure: fallback
  fallback:
    type: default
    value:
      result: "Unable to determine with confidence"
      confidence: 0

# Escalate to human review
validation:
  minConfidence: 0.7
  onFailure: fallback
  fallback:
    type: escalate
    to: human-review
    includeContext: true

# Use previous result (for iterative patterns)
validation:
  minConfidence: 0.7
  onFailure: fallback
  fallback:
    type: previous
    maxAge: 3600000       # Max age in ms
```

## Quality Gate Patterns

### Tiered Quality Gates

Multiple thresholds with different actions:

```yaml
name: tiered-quality-gate
version: 1.0.0

input:
  query: string

agents:
  capabilities: [analysis]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: consensus
  threshold: 0.8

steps:
  - id: initial-analysis
    # ...initial processing
    output: result

  - id: quality-check
    type: switch
    value: $result.confidence
    cases:
      high:
        condition: gte 0.8
        output: $result
        action: accept
      medium:
        condition: gte 0.5
        action: retry
        maxRetries: 2
      low:
        condition: lt 0.5
        action: escalate
        to: expert-review

output:
  result: $final.result
  confidence: $final.confidence
  tier: $quality-check.tier
```

### Progressive Enhancement

Start fast, enhance if needed:

```yaml
name: progressive-quality
version: 1.0.0

input:
  document: string

steps:
  # Fast pass with fewer agents
  - id: fast-analysis
    agents:
      capabilities: [analysis, fast]
      min: 3
    execution:
      strategy: parallel
      timeout: 10000
    aggregation:
      strategy: consensus
      threshold: 0.9
    output: fastResult

  # Check if fast pass succeeded
  - id: quality-gate-1
    type: gate
    condition: $fastResult.confidence >= 0.85
    onPass: output
    onFail: thorough-analysis

  # Thorough pass with more agents
  - id: thorough-analysis
    agents:
      capabilities: [analysis, expert]
      min: 5
    execution:
      strategy: parallel
      timeout: 60000
    aggregation:
      strategy: consensus
      threshold: 0.8
    output: thoroughResult

  # Final quality check
  - id: quality-gate-2
    type: gate
    condition: $thoroughResult.confidence >= 0.7
    onPass: output
    onFail: fallback

  - id: fallback
    type: default
    value:
      result: "Requires manual review"
      confidence: 0
      manualReview: true

output:
  result: $final.result
  confidence: $final.confidence
  tier: $final.tier  # 'fast', 'thorough', or 'fallback'
```

### Schema Validation Gate

Validate output structure:

```yaml
name: schema-validated
version: 1.0.0

input:
  text: string

agents:
  capabilities: [extraction]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: consensus

validation:
  minConfidence: 0.7
  schema:
    type: object
    required: [entities, sentiment]
    properties:
      entities:
        type: array
        items:
          type: object
          required: [name, type]
          properties:
            name:
              type: string
              minLength: 1
            type:
              type: string
              enum: [person, organization, location, date]
      sentiment:
        type: string
        enum: [positive, negative, neutral]
  onInvalid: retry
  maxRetries: 2

output:
  entities: $consensus.result.entities
  sentiment: $consensus.result.sentiment
```

### Consistency Gate

Ensure consistency across multiple checks:

```yaml
name: consistency-gate
version: 1.0.0
description: Run analysis twice and ensure consistency

input:
  document: string

steps:
  - id: analysis-1
    agents:
      capabilities: [analysis]
      min: 3
    aggregation:
      strategy: consensus
    output: result1

  - id: analysis-2
    agents:
      capabilities: [analysis]
      min: 3
    aggregation:
      strategy: consensus
    output: result2

  - id: consistency-check
    type: compare
    inputs:
      - $result1.result
      - $result2.result
    similarity: 0.9        # 90% similarity required
    onInconsistent: retry
    maxRetries: 1

output:
  result: $result1.result
  confidence:
    $min: [$result1.confidence, $result2.confidence]
  consistent: $consistency-check.passed
```

### Time-Based Quality Gate

Reject stale or slow results:

```yaml
name: time-gated
version: 1.0.0

input:
  query: string

agents:
  capabilities: [realtime-data]
  min: 3

execution:
  strategy: parallel
  timeout: 5000           # Hard timeout

aggregation:
  strategy: first
  minConfidence: 0.7

validation:
  # Also validate freshness
  maxLatency: 3000        # Results must arrive within 3s
  onTimeout: fallback
  fallback:
    type: cached
    maxAge: 60000         # Use cache up to 1 minute old

output:
  result: $first.result
  confidence: $first.confidence
  latency: $execution.duration
  source: $validation.source  # 'live' or 'cached'
```

### Combined Quality Gates

Multiple validation rules:

```yaml
validation:
  # Confidence check
  minConfidence: 0.7

  # Schema check
  schema:
    type: object
    required: [result]

  # Custom checks
  checks:
    - name: not-empty
      condition: $result.length > 0
    - name: valid-format
      condition: $result matches '^[A-Z]'

  # Behavior
  onFailure: retry
  maxRetries: 3
  fallback:
    type: escalate
    to: manual-review
```

## Quality Metrics

### Track Quality Over Time

```yaml
output:
  result: $consensus.result
  confidence: $consensus.confidence

  # Quality metrics for monitoring
  $metrics:
    - name: confidence
      value: $consensus.confidence
    - name: agreement
      value: $consensus.agreement
    - name: retryCount
      value: $validation.retryCount
    - name: passed
      value: $validation.passed
```

### Quality Scoring

```yaml
name: quality-scored
version: 1.0.0

# ...pattern definition...

output:
  result: $consensus.result

  quality:
    confidence: $consensus.confidence
    agreement: $consensus.agreement
    agentCount: $execution.agentCount

    # Composite quality score
    score:
      $formula: |
        (confidence * 0.4) +
        (agreement * 0.3) +
        (min(agentCount, 5) / 5 * 0.2) +
        (retryCount == 0 ? 0.1 : 0)
```

## Best Practices

1. **Set realistic thresholds** - Too high = frequent failures; too low = poor quality

2. **Use appropriate fallbacks** - Match fallback strategy to use case criticality

3. **Limit retries** - Infinite retries can cause infinite loops; usually 2-3 is enough

4. **Monitor gate metrics** - Track pass/fail rates to tune thresholds

5. **Combine with voting** - Quality gates work well with voting patterns

6. **Test edge cases** - Verify behavior at threshold boundaries

7. **Consider user experience** - Fast failures may be better than slow retries

## Threshold Guidelines

| Use Case | Suggested Threshold | Fallback Strategy |
|----------|---------------------|-------------------|
| User-facing content | 0.8 | Retry then escalate |
| Internal analysis | 0.6 | Accept with warning |
| Critical decisions | 0.9 | Retry then fail |
| Real-time responses | 0.5 | Fast fallback |
| Batch processing | 0.7 | Queue for review |

## Next Steps

- [Voting Patterns](/patterns/voting-patterns) - Add voting before gates
- [Verification Patterns](/patterns/verification-patterns) - Multi-step validation
- [Confidence Scoring](/concepts/confidence-scoring) - Understanding confidence

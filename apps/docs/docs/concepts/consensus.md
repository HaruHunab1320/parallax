---
sidebar_position: 5
title: Consensus
---

# Consensus

Consensus is a core aggregation strategy in Parallax that builds agreement from multiple agent responses to produce reliable, validated results.

## What is Consensus?

**Consensus building** takes multiple independent agent responses and determines what they agree on, producing:

- A **result** that reflects the agreement
- A **confidence score** based on agreement strength
- **Metadata** about the consensus process

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8       # 80% agreement required
  minVotes: 3          # At least 3 agents must respond
```

## Why Consensus?

### Reliability Through Redundancy

Single AI responses can be wrong. Multiple independent responses that agree are far more likely to be correct.

```
Single Agent:  Error rate ~15%
3-Agent Consensus: Error rate ~1-3%
5-Agent Consensus: Error rate ~0.5%
```

### Detecting Uncertainty

When agents disagree, consensus detects it:

```yaml
# Low agreement = low confidence
Agent A: "The capital is Paris"      (0.9)
Agent B: "The capital is Lyon"       (0.7)
Agent C: "The capital is Marseille"  (0.6)

# Result: Low consensus confidence (0.33)
# System can retry or escalate
```

### Structured Agreement

Consensus can build agreement on structured data:

```yaml
Agent A: { sentiment: "positive", score: 8.5 }
Agent B: { sentiment: "positive", score: 8.2 }
Agent C: { sentiment: "positive", score: 9.0 }

# Consensus: { sentiment: "positive", score: 8.57 }
# Confidence: 0.95 (strong agreement)
```

## How Consensus Works

### Basic Algorithm

```
1. Collect responses from N agents
2. Group similar responses
3. Calculate agreement percentage
4. If agreement >= threshold:
   - Return the agreed response
   - Confidence = agreement * avg(individual confidences)
5. If agreement < threshold:
   - Apply conflict resolution
   - Return result with lower confidence
```

### Agreement Calculation

For categorical responses (strings, classifications):

```typescript
function calculateAgreement(responses: string[]): {
  agreement: number;
  winner: string;
  distribution: Record<string, number>;
} {
  const counts: Record<string, number> = {};

  for (const response of responses) {
    counts[response] = (counts[response] || 0) + 1;
  }

  const total = responses.length;
  const [winner, winnerCount] = Object.entries(counts)
    .sort((a, b) => b[1] - a[1])[0];

  return {
    winner,
    agreement: winnerCount / total,
    distribution: Object.fromEntries(
      Object.entries(counts).map(([k, v]) => [k, v / total])
    ),
  };
}
```

For numeric responses:

```typescript
function numericConsensus(values: number[]): {
  consensus: number;
  spread: number;
  agreement: number;
} {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) / values.length;
  const stdDev = Math.sqrt(variance);

  // Calculate coefficient of variation
  const cv = stdDev / Math.abs(mean);

  // Low variance = high agreement
  const agreement = Math.max(0, 1 - cv);

  return {
    consensus: mean,
    spread: stdDev,
    agreement,
  };
}
```

For structured data:

```typescript
function structuredConsensus(objects: Record<string, any>[]): {
  consensus: Record<string, any>;
  fieldAgreement: Record<string, number>;
} {
  const fields = new Set(objects.flatMap(o => Object.keys(o)));
  const consensus: Record<string, any> = {};
  const fieldAgreement: Record<string, number> = {};

  for (const field of fields) {
    const values = objects
      .map(o => o[field])
      .filter(v => v !== undefined);

    if (typeof values[0] === 'number') {
      const result = numericConsensus(values as number[]);
      consensus[field] = result.consensus;
      fieldAgreement[field] = result.agreement;
    } else {
      const result = calculateAgreement(values.map(String));
      consensus[field] = result.winner;
      fieldAgreement[field] = result.agreement;
    }
  }

  return { consensus, fieldAgreement };
}
```

## Configuration Options

### Threshold

Minimum agreement required:

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8  # 80% must agree
```

| Threshold | Use Case |
|-----------|----------|
| 0.5 | Simple majority, fast decisions |
| 0.67 | Standard consensus, balanced |
| 0.8 | High confidence required |
| 0.9 | Critical decisions |
| 1.0 | Unanimous agreement (rare) |

### Minimum Votes

Require a minimum number of responses:

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8
  minVotes: 3      # Need at least 3 responses
```

### Conflict Resolution

When consensus can't be reached:

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8
  conflictResolution: weighted  # Use confidence as tiebreaker
```

**Options:**

- `weighted` - Higher confidence responses win
- `first` - First response wins (for determinism)
- `highest-confidence` - Single highest confidence wins
- `fail` - Return an error when consensus fails

```yaml
# Weighted example
Agent A: "positive" (confidence: 0.9)
Agent B: "negative" (confidence: 0.6)
Agent C: "negative" (confidence: 0.7)

# By count: negative wins (2 vs 1)
# By weight: positive wins (0.9 vs 0.65 average)
```

### Field-Level Consensus

Build consensus on specific fields:

```yaml
aggregation:
  strategy: consensus
  fields:
    - name: sentiment
      threshold: 0.7
    - name: topics
      threshold: 0.6
      method: union     # Combine unique values
    - name: score
      threshold: 0.8
      method: average
```

## Consensus Patterns

### Standard Consensus

Basic multi-agent consensus:

```yaml
name: standard-consensus
version: 1.0.0

input:
  query: string

agents:
  capabilities: [analysis]
  min: 3
  max: 5

execution:
  strategy: parallel
  timeout: 30000

aggregation:
  strategy: consensus
  threshold: 0.8
  minVotes: 3

output:
  result: $consensus.result
  confidence: $consensus.confidence
```

### Tiered Consensus

Escalate when consensus fails:

```yaml
name: tiered-consensus
version: 1.0.0

steps:
  # Tier 1: Fast agents
  - id: fast-consensus
    agents:
      capabilities: [analysis, fast]
      min: 3
    aggregation:
      strategy: consensus
      threshold: 0.9

  # Check if consensus reached
  - id: check-tier-1
    type: switch
    value: $fast-consensus.confidence
    cases:
      high:
        condition: gte 0.8
        output: $fast-consensus
      low:
        next: expert-consensus

  # Tier 2: Expert agents (if needed)
  - id: expert-consensus
    agents:
      capabilities: [analysis, expert]
      min: 5
    aggregation:
      strategy: consensus
      threshold: 0.8

output:
  result: $final.result
  confidence: $final.confidence
  tier: $final.tier
```

### Consensus with Verification

Add verification step after consensus:

```yaml
name: verified-consensus
version: 1.0.0

steps:
  # Build initial consensus
  - id: initial
    agents:
      capabilities: [analysis]
      min: 3
    aggregation:
      strategy: consensus
      threshold: 0.8

  # Verify the consensus result
  - id: verify
    agents:
      capabilities: [verification]
      min: 2
    input:
      original: $input
      consensus: $initial.result
    aggregation:
      strategy: voting
      method: unanimous

  # Gate on verification
  - id: gate
    type: switch
    value: $verify.result
    cases:
      verified:
        output: $initial
      rejected:
        retry: initial
        maxRetries: 2

output:
  result: $initial.result
  confidence: $initial.confidence
  verified: $verify.result
```

### Domain-Specific Consensus

Different consensus for different fields:

```yaml
name: document-analysis-consensus
version: 1.0.0

steps:
  - id: analyze
    agents:
      capabilities: [document-analysis]
      min: 5
    execution:
      strategy: parallel

aggregation:
  fields:
    - name: documentType
      strategy: voting
      method: majority

    - name: entities
      strategy: merge
      method: union
      deduplication: true

    - name: sentiment
      strategy: consensus
      threshold: 0.7

    - name: confidence
      strategy: average

    - name: keyPhrases
      strategy: merge
      method: intersection  # Only phrases all agents found

output:
  documentType: $aggregated.documentType
  entities: $aggregated.entities
  sentiment: $aggregated.sentiment
  confidence: $aggregated.confidence
  keyPhrases: $aggregated.keyPhrases
```

## Measuring Consensus Quality

### Key Metrics

```typescript
interface ConsensusMetrics {
  agreementScore: number;    // How strongly agents agreed
  participationRate: number; // Agents that responded vs. requested
  confidenceSpread: number;  // Variance in individual confidences
  processingTime: number;    // Time to reach consensus
  retryCount: number;        // Number of retry attempts
}
```

### Consensus Quality Score

```typescript
function consensusQuality(metrics: ConsensusMetrics): number {
  const weights = {
    agreement: 0.4,
    participation: 0.2,
    confidenceConsistency: 0.2,
    efficiency: 0.2,
  };

  return (
    metrics.agreementScore * weights.agreement +
    metrics.participationRate * weights.participation +
    (1 - metrics.confidenceSpread) * weights.confidenceConsistency +
    Math.max(0, 1 - metrics.retryCount * 0.2) * weights.efficiency
  );
}
```

### When Consensus Fails

Indicators of problematic consensus:

- **Low agreement** - Agents fundamentally disagree
- **High confidence spread** - Some agents very sure, others not
- **Frequent retries** - System struggling to converge
- **Timeout** - Agents too slow to respond

Responses to failure:

```yaml
validation:
  minConfidence: 0.7
  onFailure: fallback
  fallback:
    type: escalate
    to: human-review
    includeContext:
      - agentResponses
      - agreementMetrics
```

## Best Practices

1. **Choose appropriate thresholds** - Higher isn't always better; balance reliability with completion rate

2. **Ensure agent diversity** - Consensus from 3 identical agents is less valuable than 3 diverse agents

3. **Weight by confidence** - Let more confident agents have more influence

4. **Handle edge cases** - Define behavior when consensus can't be reached

5. **Monitor over time** - Track consensus metrics to identify issues early

6. **Test with disagreement** - Verify your patterns handle disagreement gracefully

## Next Steps

- [Confidence Scoring](/docs/concepts/confidence-scoring) - How confidence affects consensus
- [Voting Patterns](/docs/patterns/voting-patterns) - Alternative aggregation
- [Quality Gates](/docs/patterns/quality-gates) - Using consensus for validation

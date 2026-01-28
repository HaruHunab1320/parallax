---
sidebar_position: 3
title: Voting Patterns
---

# Voting Patterns

Voting patterns use multiple agents to make classification decisions. They're ideal when you need reliable categorical outputs.

## When to Use Voting

- **Classification** - Categorizing content, sentiment, intent
- **Binary decisions** - Yes/no, approve/reject, spam/not-spam
- **Content moderation** - Safe/unsafe, appropriate/inappropriate
- **Categorical outputs** - When output is one of several fixed options

## Voting Methods

### Majority Voting

The most common method - the option with more than 50% of votes wins.

```yaml
name: majority-voting
version: 1.0.0

input:
  content: string

agents:
  capabilities: [classification]
  min: 3

execution:
  strategy: parallel
  timeout: 30000

aggregation:
  strategy: voting
  method: majority
  minVotes: 2

output:
  category: $vote.result
  confidence: $vote.confidence
  distribution: $vote.distribution
```

**Example:**
```
Agent 1: "spam"
Agent 2: "spam"
Agent 3: "not-spam"

Result: "spam" (2/3 = 67% > 50%)
Confidence: 0.67
```

### Unanimous Voting

Requires all agents to agree. Use for high-stakes decisions.

```yaml
name: unanimous-voting
version: 1.0.0

input:
  content: string

agents:
  capabilities: [content-moderation]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: unanimous

validation:
  onFailure: retry
  maxRetries: 2

output:
  verdict: $vote.result
  unanimous: $vote.unanimous
  confidence: $vote.confidence
```

**Example:**
```
Agent 1: "safe"
Agent 2: "safe"
Agent 3: "safe"

Result: "safe" (3/3 = 100%)
Confidence: 1.0

---

Agent 1: "safe"
Agent 2: "safe"
Agent 3: "unsafe"

Result: null (no unanimous agreement)
Confidence: 0.0
```

### Plurality Voting

Highest vote count wins, even without majority. Use when there are many categories.

```yaml
name: multi-class-classification
version: 1.0.0

input:
  text: string

agents:
  capabilities: [classification]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: plurality
  minVotes: 2

output:
  category: $vote.result
  confidence: $vote.confidence
  distribution: $vote.distribution
```

**Example:**
```
Agent 1: "news"
Agent 2: "opinion"
Agent 3: "news"
Agent 4: "editorial"
Agent 5: "news"

Result: "news" (3/5 = 60%, highest)
Distribution: { news: 0.6, opinion: 0.2, editorial: 0.2 }
```

### Weighted Voting

Agents have different voting power based on confidence or assigned weights.

```yaml
name: weighted-voting
version: 1.0.0

input:
  content: string

agents:
  capabilities: [sentiment-analysis]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: weighted

output:
  sentiment: $vote.result
  confidence: $vote.confidence
```

**Example:**
```
Agent 1: "positive" (confidence: 0.9)  → weight: 0.9
Agent 2: "negative" (confidence: 0.6)  → weight: 0.6
Agent 3: "positive" (confidence: 0.8)  → weight: 0.8

Weighted sum:
  positive: 0.9 + 0.8 = 1.7
  negative: 0.6

Result: "positive"
Confidence: 1.7 / 2.3 = 0.74
```

Custom weights:

```yaml
aggregation:
  strategy: voting
  method: weighted
  weights:
    expert-agent-1: 2.0    # Expert votes count double
    expert-agent-2: 2.0
    default: 1.0           # Default weight for others
```

## Pattern Examples

### Content Moderation

```yaml
name: content-moderation
version: 1.0.0
description: Multi-agent content moderation with voting

input:
  content: string
  contentType:
    type: string
    enum: [text, image, video]
    default: text

agents:
  capabilities: [content-moderation]
  min: 5

execution:
  strategy: parallel
  timeout: 30000

aggregation:
  strategy: voting
  method: majority
  minVotes: 3

validation:
  minConfidence: 0.6
  onFailure: fallback
  fallback:
    type: escalate
    to: human-review

output:
  verdict: $vote.result
  confidence: $vote.confidence
  flagged:
    $template: "{{$vote.result == 'unsafe'}}"
  reasons: $vote.metadata.reasons
```

### Sentiment Analysis

```yaml
name: sentiment-analysis
version: 1.0.0
description: Classify sentiment with weighted voting

input:
  text: string
  language:
    type: string
    default: auto

agents:
  capabilities: [sentiment-analysis]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: weighted

output:
  sentiment: $vote.result
  confidence: $vote.confidence
  scores:
    positive: $vote.distribution.positive
    negative: $vote.distribution.negative
    neutral: $vote.distribution.neutral
```

### Intent Classification

```yaml
name: intent-classification
version: 1.0.0
description: Classify user intent from chat messages

input:
  message: string
  conversationHistory:
    type: array
    items: string
    required: false

agents:
  capabilities: [intent-classification, chat]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: plurality
  minVotes: 2

output:
  intent: $vote.result
  confidence: $vote.confidence
  alternatives:
    $filter:
      items: $vote.distribution
      condition: value > 0.1
```

### Binary Decision with Threshold

```yaml
name: spam-detection
version: 1.0.0
description: Binary spam classification with configurable threshold

input:
  email:
    type: object
    properties:
      subject: string
      body: string
      sender: string

agents:
  capabilities: [spam-detection]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: majority

validation:
  # Only flag as spam if very confident
  $custom:
    condition: $vote.result == 'spam' && $vote.confidence < 0.8
    action: override
    value:
      result: 'review'
      reason: 'Low confidence spam detection'

output:
  isSpam:
    $template: "{{$vote.result == 'spam'}}"
  confidence: $vote.confidence
  action:
    $switch:
      value: $vote.result
      cases:
        spam: block
        not-spam: allow
        review: quarantine
```

### Multi-Stage Voting

```yaml
name: multi-stage-classification
version: 1.0.0
description: Two-stage classification - category then subcategory

input:
  content: string

steps:
  # Stage 1: Primary category
  - id: primary-classification
    agents:
      capabilities: [classification]
      min: 3
    execution:
      strategy: parallel
    aggregation:
      strategy: voting
      method: majority
    output: primaryCategory

  # Stage 2: Subcategory based on primary
  - id: sub-classification
    agents:
      capabilities: [classification, $primaryCategory.result]
      min: 3
    input:
      content: $input.content
      category: $primaryCategory.result
    execution:
      strategy: parallel
    aggregation:
      strategy: voting
      method: plurality
    output: subCategory

output:
  category: $primaryCategory.result
  subCategory: $subCategory.result
  confidence:
    primary: $primaryCategory.confidence
    sub: $subCategory.confidence
```

### Voting with Quality Gate

```yaml
name: gated-voting
version: 1.0.0
description: Voting with minimum confidence requirement

input:
  content: string

agents:
  capabilities: [classification]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: voting
  method: majority

validation:
  minConfidence: 0.7
  onFailure: retry
  maxRetries: 2
  fallback:
    type: default
    value:
      result: 'uncertain'
      confidence: 0

output:
  category: $vote.result
  confidence: $vote.confidence
  certain:
    $template: "{{$vote.confidence >= 0.7}}"
```

## Handling Edge Cases

### Ties

When votes are tied:

```yaml
aggregation:
  strategy: voting
  method: majority
  tieBreaker: first           # first, random, highest-confidence
```

### No Majority

When no option gets majority:

```yaml
aggregation:
  strategy: voting
  method: majority
  noMajorityBehavior: plurality  # plurality, fail, retry
```

### Insufficient Votes

When too few agents respond:

```yaml
aggregation:
  strategy: voting
  method: majority
  minVotes: 3
  onInsufficientVotes: fail    # fail, proceed
```

## Best Practices

1. **Use odd numbers of agents** - Avoid ties with 3, 5, 7 agents

2. **Set appropriate thresholds** - Higher stakes = higher thresholds

3. **Consider weighted voting** - When agent quality varies

4. **Add quality gates** - Retry or escalate low-confidence results

5. **Monitor distribution** - Track disagreement patterns over time

6. **Test edge cases** - Verify behavior with ties and low confidence

## Metrics to Track

- **Agreement rate** - How often agents agree
- **Confidence distribution** - Spread of confidence scores
- **Category distribution** - Balance across categories
- **Tie frequency** - How often ties occur
- **Retry rate** - How often validation triggers retry

## Next Steps

- [Quality Gates](/docs/patterns/quality-gates) - Add validation to voting
- [Consensus](/docs/concepts/consensus) - For structured outputs
- [Advanced Composition](/docs/patterns/advanced-composition) - Complex voting workflows

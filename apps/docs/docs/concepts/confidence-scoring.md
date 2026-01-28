---
sidebar_position: 4
title: Confidence Scoring
---

# Confidence Scoring

Every agent response in Parallax includes a confidence score. These scores are fundamental to how Parallax builds reliable AI systems through multi-agent validation.

## What is Confidence?

A **confidence score** is a number between 0.0 and 1.0 that represents how certain an agent is about its response.

```typescript
agent.onTask(async (task) => {
  const result = await processTask(task.input);

  return {
    result,
    confidence: 0.85,  // 85% confident
  };
});
```

## Why Confidence Matters

### Quality Gating

Low-confidence results can be filtered, retried, or escalated:

```yaml
validation:
  minConfidence: 0.7
  onFailure: retry
  maxRetries: 3
```

### Weighted Aggregation

Higher-confidence responses have more influence on final results:

```yaml
aggregation:
  strategy: consensus
  conflictResolution: weighted  # Uses confidence as weight
```

### Reliability Metrics

Track system reliability over time by monitoring confidence distributions.

## Confidence Scale

| Score | Meaning | Typical Scenarios |
|-------|---------|-------------------|
| **0.95 - 1.0** | Near certain | Clear input, exact match, verified data |
| **0.80 - 0.95** | High confidence | Standard cases, good context |
| **0.65 - 0.80** | Moderate confidence | Some ambiguity, reasonable inference |
| **0.50 - 0.65** | Low confidence | Significant uncertainty, limited context |
| **0.30 - 0.50** | Very low | Mostly guessing, unclear input |
| **0.0 - 0.30** | Minimal | Essentially random, invalid input |

## Calculating Confidence

### Model-Based Signals

Use signals from your underlying model:

```typescript
agent.onTask(async (task) => {
  const response = await llm.generate({
    prompt: task.input.prompt,
    temperature: 0.3,
  });

  let confidence = 0.8;  // Base confidence

  // Model finish reason
  if (response.finishReason === 'length') {
    confidence -= 0.15;  // Truncated output
  }

  // Token probability (if available)
  if (response.avgLogProb) {
    const probAdjustment = Math.min(0.2, response.avgLogProb + 1);
    confidence += probAdjustment;
  }

  // Response coherence
  if (response.text.length < 20) {
    confidence -= 0.1;  // Very short response
  }

  return {
    result: response.text,
    confidence: clamp(confidence, 0.1, 0.99),
  };
});
```

### Input Quality Signals

Adjust confidence based on input quality:

```typescript
function assessInputQuality(input: TaskInput): number {
  let quality = 1.0;

  // Input length
  if (input.text.length < 10) {
    quality -= 0.2;  // Very short input
  }

  // Language detection confidence
  if (input.detectedLanguage?.confidence < 0.9) {
    quality -= 0.1;
  }

  // Missing required context
  if (!input.context || input.context.length === 0) {
    quality -= 0.15;
  }

  return Math.max(0.3, quality);
}

agent.onTask(async (task) => {
  const inputQuality = assessInputQuality(task.input);
  const response = await process(task.input);

  return {
    result: response,
    confidence: response.modelConfidence * inputQuality,
  };
});
```

### Task-Specific Confidence

Different task types have different confidence characteristics:

```typescript
// Classification task
function classificationConfidence(probabilities: number[]): number {
  const sorted = probabilities.sort((a, b) => b - a);
  const top = sorted[0];
  const margin = top - (sorted[1] || 0);

  // High margin = high confidence
  return 0.5 + (margin * 0.5);
}

// Extraction task
function extractionConfidence(
  extracted: string[],
  expected: number
): number {
  const found = extracted.length;

  if (found === 0) return 0.2;
  if (found === expected) return 0.9;
  if (found > expected) return 0.6;  // Over-extraction
  return 0.5 + (found / expected) * 0.4;  // Partial extraction
}

// Translation task
function translationConfidence(
  source: string,
  result: string,
  detectedLanguage: { confidence: number }
): number {
  let confidence = 0.8;

  // Length ratio check
  const ratio = result.length / source.length;
  if (ratio < 0.3 || ratio > 3) {
    confidence -= 0.2;
  }

  // Language detection confidence
  confidence *= detectedLanguage.confidence;

  return Math.max(0.3, confidence);
}
```

## Confidence in Aggregation

### Voting with Confidence

Confidence affects vote weight:

```yaml
aggregation:
  strategy: voting
  method: weighted
  # Agents with higher confidence have more voting power
```

How weighted voting works:

```
Agent A: "positive" (confidence: 0.9)  → weight: 0.9
Agent B: "negative" (confidence: 0.6)  → weight: 0.6
Agent C: "positive" (confidence: 0.8)  → weight: 0.8

Positive: 0.9 + 0.8 = 1.7
Negative: 0.6

Winner: "positive" (weighted confidence: 1.7 / 2.3 = 0.74)
```

### Consensus Confidence

Consensus produces an aggregate confidence score:

```yaml
aggregation:
  strategy: consensus
  threshold: 0.8
```

Consensus confidence calculation:

```typescript
function consensusConfidence(
  results: AgentResult[],
  agreement: number
): number {
  // Base confidence from agreement level
  const agreementConfidence = agreement;

  // Weight by individual confidences
  const avgConfidence = results.reduce(
    (sum, r) => sum + r.confidence, 0
  ) / results.length;

  // Combined score
  return agreementConfidence * avgConfidence;
}
```

### Confidence Thresholds

Set minimum confidence requirements:

```yaml
validation:
  minConfidence: 0.7    # Reject results below this
  onFailure: retry      # What to do on rejection
  maxRetries: 3

aggregation:
  minConfidence: 0.8    # Minimum confidence for consensus
```

## Confidence Calibration

### What is Calibration?

A well-calibrated system's confidence scores match actual accuracy. If an agent reports 80% confidence, it should be correct ~80% of the time.

### Measuring Calibration

```typescript
interface CalibrationBucket {
  range: [number, number];
  predictions: number;
  correct: number;
  accuracy: number;
}

function measureCalibration(
  predictions: { confidence: number; correct: boolean }[]
): CalibrationBucket[] {
  const buckets: CalibrationBucket[] = [
    { range: [0.0, 0.2], predictions: 0, correct: 0, accuracy: 0 },
    { range: [0.2, 0.4], predictions: 0, correct: 0, accuracy: 0 },
    { range: [0.4, 0.6], predictions: 0, correct: 0, accuracy: 0 },
    { range: [0.6, 0.8], predictions: 0, correct: 0, accuracy: 0 },
    { range: [0.8, 1.0], predictions: 0, correct: 0, accuracy: 0 },
  ];

  for (const pred of predictions) {
    const bucket = buckets.find(
      b => pred.confidence >= b.range[0] && pred.confidence < b.range[1]
    );
    if (bucket) {
      bucket.predictions++;
      if (pred.correct) bucket.correct++;
    }
  }

  for (const bucket of buckets) {
    bucket.accuracy = bucket.predictions > 0
      ? bucket.correct / bucket.predictions
      : 0;
  }

  return buckets;
}
```

### Improving Calibration

**Temperature scaling:**

```typescript
function calibratedConfidence(
  rawConfidence: number,
  temperature: number = 1.5
): number {
  // Apply temperature scaling
  const logit = Math.log(rawConfidence / (1 - rawConfidence));
  const scaledLogit = logit / temperature;
  return 1 / (1 + Math.exp(-scaledLogit));
}
```

**Historical adjustment:**

```typescript
class ConfidenceCalibrator {
  private history: { predicted: number; actual: boolean }[] = [];

  record(confidence: number, wasCorrect: boolean) {
    this.history.push({ predicted: confidence, actual: wasCorrect });
    if (this.history.length > 1000) {
      this.history.shift();
    }
  }

  calibrate(confidence: number): number {
    // Find similar historical predictions
    const similar = this.history.filter(
      h => Math.abs(h.predicted - confidence) < 0.1
    );

    if (similar.length < 10) {
      return confidence;  // Not enough data
    }

    // Actual accuracy for this confidence level
    const actualAccuracy = similar.filter(h => h.actual).length / similar.length;

    // Blend predicted and historical
    return confidence * 0.3 + actualAccuracy * 0.7;
  }
}
```

## Best Practices

### Do

- **Be conservative** - It's better to underestimate confidence than overestimate
- **Use multiple signals** - Combine model, input, and task-specific signals
- **Calibrate over time** - Track and improve calibration with real data
- **Differentiate tasks** - Different task types need different confidence logic

### Don't

- **Return 1.0** - Always leave room for uncertainty
- **Return constant values** - Confidence should vary with actual certainty
- **Ignore input quality** - Bad input → lower confidence
- **Skip validation** - Test that your confidence logic makes sense

### Example: Well-Designed Confidence

```typescript
agent.onTask(async (task) => {
  // Start with moderate confidence
  let confidence = 0.75;
  const signals: string[] = [];

  // Assess input quality
  const inputLength = task.input.text.length;
  if (inputLength < 20) {
    confidence -= 0.15;
    signals.push('short-input');
  } else if (inputLength > 1000) {
    confidence += 0.05;
    signals.push('detailed-input');
  }

  // Process with model
  const response = await model.generate(task.input);

  // Model signals
  if (response.finishReason === 'stop') {
    confidence += 0.05;
    signals.push('complete-response');
  }
  if (response.finishReason === 'length') {
    confidence -= 0.2;
    signals.push('truncated');
  }

  // Task-specific validation
  const validation = validateOutput(response.result, task.input.expectedFormat);
  if (validation.valid) {
    confidence += 0.1;
    signals.push('valid-format');
  } else {
    confidence -= 0.2;
    signals.push('invalid-format');
  }

  // Clamp to valid range
  confidence = Math.max(0.1, Math.min(0.95, confidence));

  return {
    result: response.result,
    confidence,
    metadata: {
      signals,
      rawConfidence: response.confidence,
    },
  };
});
```

## Monitoring Confidence

### Metrics to Track

- **Confidence distribution** - Are scores well-distributed or clustered?
- **Confidence vs accuracy** - Are high-confidence responses more accurate?
- **Confidence trends** - Is confidence stable over time?
- **Low-confidence rate** - How often do responses fall below threshold?

### Alerting

Set up alerts for confidence anomalies:

```yaml
# Example monitoring config
alerts:
  - name: low-confidence-spike
    condition: avg(confidence) < 0.6 over 5m
    severity: warning

  - name: confidence-collapse
    condition: p95(confidence) < 0.5 over 1m
    severity: critical
```

## Next Steps

- [Consensus](/docs/concepts/consensus) - How confidence affects consensus building
- [Agents](/docs/concepts/agents) - Implementing confidence in agents
- [Quality Gates](/docs/patterns/quality-gates) - Using confidence for validation

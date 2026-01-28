---
sidebar_position: 7
title: Advanced Composition
---

# Advanced Composition

Advanced composition techniques for building complex multi-step orchestration workflows.

## Composition Patterns

### Pipeline Pattern

Sequential processing where each step's output feeds the next:

```yaml
name: document-pipeline
version: 1.0.0

input:
  document: string

steps:
  - id: preprocess
    agents:
      capabilities: [preprocessing]
      min: 1
    execution:
      strategy: first
    output: cleaned

  - id: extract
    agents:
      capabilities: [extraction]
      min: 3
    input:
      document: $cleaned
    aggregation:
      strategy: merge
    output: entities

  - id: analyze
    agents:
      capabilities: [analysis]
      min: 5
    input:
      document: $cleaned
      entities: $entities
    aggregation:
      strategy: consensus
    output: analysis

  - id: summarize
    agents:
      capabilities: [summarization]
      min: 3
    input:
      document: $cleaned
      analysis: $analysis
    aggregation:
      strategy: consensus
    output: summary

output:
  entities: $entities
  analysis: $analysis
  summary: $summary
```

### Fan-Out/Fan-In Pattern

Parallel processing with result aggregation:

```yaml
name: fan-out-fan-in
version: 1.0.0

input:
  query: string

steps:
  # Fan out: Run multiple analyses in parallel
  - id: fan-out
    type: parallel
    branches:
      - id: sentiment
        agents:
          capabilities: [sentiment-analysis]
          min: 3
        aggregation:
          strategy: voting
        output: sentiment

      - id: entities
        agents:
          capabilities: [entity-extraction]
          min: 3
        aggregation:
          strategy: merge
        output: entities

      - id: topics
        agents:
          capabilities: [topic-modeling]
          min: 3
        aggregation:
          strategy: consensus
        output: topics

      - id: keywords
        agents:
          capabilities: [keyword-extraction]
          min: 3
        aggregation:
          strategy: merge
        output: keywords

  # Fan in: Combine all results
  - id: fan-in
    agents:
      capabilities: [synthesis]
      min: 3
    input:
      sentiment: $sentiment
      entities: $entities
      topics: $topics
      keywords: $keywords
    aggregation:
      strategy: consensus
    output: synthesis

output:
  sentiment: $sentiment
  entities: $entities
  topics: $topics
  keywords: $keywords
  synthesis: $synthesis
```

### Conditional Routing Pattern

Route to different processors based on content:

```yaml
name: conditional-router
version: 1.0.0

input:
  content: string
  contentType: string

steps:
  # Classify content if type not provided
  - id: classify
    condition: $input.contentType == null
    agents:
      capabilities: [classification]
      min: 3
    aggregation:
      strategy: voting
    output: contentType

  # Route based on type
  - id: route
    type: switch
    value: $contentType || $input.contentType
    cases:
      document:
        pattern: document-processor
        input:
          content: $input.content
        output: result

      image:
        pattern: image-analyzer
        input:
          content: $input.content
        output: result

      code:
        pattern: code-analyzer
        input:
          content: $input.content
        output: result

      default:
        pattern: generic-processor
        input:
          content: $input.content
        output: result

output:
  result: $result
  contentType: $contentType
```

### Iterative Refinement Pattern

Repeatedly improve results until quality threshold:

```yaml
name: iterative-refinement
version: 1.0.0

input:
  draft: string
  qualityThreshold:
    type: number
    default: 0.9

steps:
  - id: refine-loop
    type: loop
    maxIterations: 5
    condition: $quality.score < $input.qualityThreshold

    steps:
      - id: improve
        agents:
          capabilities: [editing, improvement]
          min: 3
        input:
          current: $currentDraft || $input.draft
          feedback: $feedback || null
        aggregation:
          strategy: consensus
        output: improved

      - id: evaluate
        agents:
          capabilities: [quality-assessment]
          min: 3
        input:
          text: $improved
        aggregation:
          strategy: consensus
        output: quality

      - id: get-feedback
        condition: $quality.score < $input.qualityThreshold
        agents:
          capabilities: [critique]
          min: 3
        input:
          text: $improved
          score: $quality.score
        aggregation:
          strategy: merge
        output: feedback

      # Update for next iteration
      - id: update
        type: assign
        values:
          currentDraft: $improved

output:
  result: $improved
  iterations: $refine-loop.iterations
  finalQuality: $quality.score
```

### Hierarchical Aggregation Pattern

Build results hierarchically from parts:

```yaml
name: hierarchical-aggregation
version: 1.0.0

input:
  documents:
    type: array
    items: string

steps:
  # Level 1: Process each document
  - id: document-level
    type: batch
    items: $input.documents
    concurrency: 5
    task:
      agents:
        capabilities: [analysis]
        min: 3
      aggregation:
        strategy: consensus
    output: documentResults

  # Level 2: Group by clusters
  - id: cluster
    agents:
      capabilities: [clustering]
      min: 2
    input:
      items: $documentResults
    output: clusters

  # Level 3: Aggregate each cluster
  - id: cluster-summaries
    type: batch
    items: $clusters
    task:
      agents:
        capabilities: [summarization]
        min: 3
      input:
        documents: $item.documents
      aggregation:
        strategy: consensus
    output: clusterSummaries

  # Level 4: Final aggregation
  - id: final-summary
    agents:
      capabilities: [synthesis]
      min: 3
    input:
      clusterSummaries: $clusterSummaries
    aggregation:
      strategy: consensus
    output: finalSummary

output:
  documentResults: $documentResults
  clusters: $clusters
  clusterSummaries: $clusterSummaries
  finalSummary: $finalSummary
```

### Error Recovery Pattern

Robust error handling with fallbacks:

```yaml
name: error-recovery
version: 1.0.0

input:
  query: string

steps:
  - id: primary
    agents:
      capabilities: [primary-processor]
      min: 3
    execution:
      strategy: parallel
      timeout: 10000
    aggregation:
      strategy: consensus
    onError:
      type: continue
    output: primaryResult

  - id: check-primary
    type: gate
    condition: $primaryResult.success
    onPass:
      output: $primaryResult
    onFail:
      next: fallback-1

  - id: fallback-1
    agents:
      capabilities: [fallback-processor]
      min: 3
    execution:
      strategy: parallel
      timeout: 20000
    aggregation:
      strategy: consensus
    onError:
      type: continue
    output: fallbackResult1

  - id: check-fallback-1
    type: gate
    condition: $fallbackResult1.success
    onPass:
      output: $fallbackResult1
    onFail:
      next: fallback-2

  - id: fallback-2
    agents:
      capabilities: [simple-processor]
      min: 1
    execution:
      strategy: first
    onError:
      type: default
      value:
        result: "Unable to process"
        error: true
    output: fallbackResult2

output:
  result: $final.result
  source: $final.source  # 'primary', 'fallback-1', or 'fallback-2'
  success: $final.success
```

### Map-Reduce Pattern

Process large datasets efficiently:

```yaml
name: map-reduce
version: 1.0.0

input:
  items:
    type: array
    items: object
  chunkSize:
    type: number
    default: 10

steps:
  # Chunk the input
  - id: chunk
    type: split
    items: $input.items
    chunkSize: $input.chunkSize
    output: chunks

  # Map: Process each chunk in parallel
  - id: map
    type: batch
    items: $chunks
    concurrency: 10
    task:
      agents:
        capabilities: [processing]
        min: 3
      aggregation:
        strategy: consensus
    output: mappedChunks

  # Reduce: Combine chunk results
  - id: reduce
    type: reduce
    items: $mappedChunks
    operation: merge
    method: deep
    output: combined

  # Final aggregation
  - id: aggregate
    agents:
      capabilities: [aggregation]
      min: 3
    input:
      data: $combined
    aggregation:
      strategy: consensus
    output: finalResult

output:
  result: $finalResult
  processedCount: $input.items.length
  chunkCount: $chunks.length
```

### Ensemble Pattern

Combine multiple approaches for better results:

```yaml
name: ensemble
version: 1.0.0

input:
  query: string

steps:
  # Run multiple approaches in parallel
  - id: approaches
    type: parallel
    branches:
      - id: approach-1
        agents:
          capabilities: [analysis, approach-a]
          min: 3
        aggregation:
          strategy: consensus
        output: result1

      - id: approach-2
        agents:
          capabilities: [analysis, approach-b]
          min: 3
        aggregation:
          strategy: consensus
        output: result2

      - id: approach-3
        agents:
          capabilities: [analysis, approach-c]
          min: 3
        aggregation:
          strategy: consensus
        output: result3

  # Meta-learner combines results
  - id: meta-learner
    agents:
      capabilities: [meta-analysis]
      min: 5
    input:
      approach1: $result1
      approach2: $result2
      approach3: $result3
    aggregation:
      strategy: voting
      method: weighted
      weights:
        approach1: $result1.confidence
        approach2: $result2.confidence
        approach3: $result3.confidence
    output: ensemble

output:
  result: $ensemble.result
  confidence: $ensemble.confidence
  approaches:
    approach1: $result1
    approach2: $result2
    approach3: $result3
```

### Self-Healing Pattern

Automatically detect and recover from issues:

```yaml
name: self-healing
version: 1.0.0

input:
  task: object

steps:
  - id: execute
    agents:
      capabilities: [execution]
      min: 3
    aggregation:
      strategy: consensus
    output: result

  - id: validate
    agents:
      capabilities: [validation]
      min: 3
    input:
      result: $result
      task: $input.task
    aggregation:
      strategy: voting
    output: validation

  - id: check
    type: switch
    value: $validation.status
    cases:
      valid:
        output: $result

      repairable:
        next: repair

      invalid:
        next: escalate

  - id: repair
    agents:
      capabilities: [repair, correction]
      min: 3
    input:
      result: $result
      issues: $validation.issues
    aggregation:
      strategy: consensus
    output: repaired
    then:
      next: validate  # Re-validate after repair

  - id: escalate
    type: escalate
    to: human-review
    context:
      task: $input.task
      result: $result
      validation: $validation

output:
  result: $final.result
  repaired: $final.repaired || false
  validationHistory: $validation.history
```

## Composition Tips

### Naming Conventions

Use clear, consistent naming:

```yaml
steps:
  - id: extract-entities      # verb-noun
  - id: validate-extraction   # verb-noun
  - id: merge-results         # verb-noun
```

### Managing State

Pass state between steps explicitly:

```yaml
steps:
  - id: step1
    output: result1

  - id: step2
    input:
      previousResult: $result1
    output: result2

  - id: step3
    input:
      allResults:
        step1: $result1
        step2: $result2
```

### Timeouts and Limits

Set appropriate limits:

```yaml
steps:
  - id: expensive-step
    execution:
      timeout: 60000        # Step-level timeout
    output: result

execution:
  timeout: 300000           # Pattern-level timeout
  maxSteps: 20              # Prevent infinite loops
```

### Debugging

Add debug outputs:

```yaml
output:
  result: $final.result

  # Debug information (can be stripped in production)
  debug:
    stepTimings:
      extract: $extract.duration
      analyze: $analyze.duration
    intermediateResults:
      extracted: $extracted
      analyzed: $analyzed
    agentDetails:
      extract: $extract.agents
      analyze: $analyze.agents
```

## Best Practices

1. **Start simple** - Build incrementally, test each step

2. **Use appropriate granularity** - Not too many tiny steps, not too few large ones

3. **Handle errors at each level** - Don't let one failure cascade

4. **Monitor bottlenecks** - Track step timings to find slow points

5. **Document complex flows** - Use descriptions and comments

6. **Test edge cases** - What happens when steps fail or timeout?

## Next Steps

- [Pattern SDK](/docs/sdk/pattern-sdk) - Build complex patterns programmatically
- [Pattern Builder](/docs/pattern-builder/overview) - Visual composition editor
- [Quality Gates](/docs/patterns/quality-gates) - Add validation to compositions

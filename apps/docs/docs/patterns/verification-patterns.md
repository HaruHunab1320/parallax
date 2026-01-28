---
sidebar_position: 6
title: Verification Patterns
---

# Verification Patterns

Verification patterns validate outputs through multiple independent checks. They're essential for ensuring accuracy in translations, data transformations, and factual claims.

## When to Use Verification

- **Translation** - Verify translations are accurate
- **Data transformation** - Confirm transformations preserve meaning
- **Fact-checking** - Validate factual claims
- **Quality assurance** - Multi-step validation workflows

## Back-Translation Verification

The most common verification pattern - translate back and compare:

```yaml
name: verified-translation
version: 1.0.0
description: Verify translation quality with back-translation

input:
  text: string
  sourceLang: string
  targetLang: string

steps:
  # Step 1: Forward translation
  - id: forward
    agents:
      capabilities: [translation, $input.targetLang]
      min: 3
    input:
      text: $input.text
      from: $input.sourceLang
      to: $input.targetLang
    execution:
      strategy: parallel
    aggregation:
      strategy: consensus
      threshold: 0.8
    output: forwardResult

  # Step 2: Back translation
  - id: back
    agents:
      capabilities: [translation, $input.sourceLang]
      min: 3
    input:
      text: $forwardResult.translation
      from: $input.targetLang
      to: $input.sourceLang
    execution:
      strategy: parallel
    aggregation:
      strategy: consensus
      threshold: 0.8
    output: backResult

  # Step 3: Compare original and back-translation
  - id: verify
    agents:
      capabilities: [text-similarity, semantic]
      min: 3
    input:
      text1: $input.text
      text2: $backResult.translation
    execution:
      strategy: parallel
    aggregation:
      strategy: consensus
    output: similarity

  # Step 4: Quality gate
  - id: quality-gate
    type: gate
    condition: $similarity.score >= 0.85
    onFail:
      type: retry
      maxRetries: 2
      target: forward

output:
  translation: $forwardResult.translation
  verified: $similarity.score >= 0.85
  similarity: $similarity.score
  confidence:
    $min: [$forwardResult.confidence, $backResult.confidence, $similarity.confidence]
```

## Multi-Source Verification

Verify facts against multiple independent sources:

```yaml
name: multi-source-verification
version: 1.0.0
description: Verify claims against multiple sources

input:
  claim: string
  context: string

steps:
  # Step 1: Extract verifiable facts
  - id: extract
    agents:
      capabilities: [fact-extraction]
      min: 3
    input:
      claim: $input.claim
    aggregation:
      strategy: consensus
    output: facts

  # Step 2: Check each fact against multiple sources
  - id: verify-facts
    type: batch
    items: $facts
    task:
      steps:
        - id: check-sources
          agents:
            capabilities: [fact-checking]
            min: 5
          input:
            fact: $item
            context: $input.context
          execution:
            strategy: parallel
          aggregation:
            strategy: voting
            method: majority
          output: verification
    output: verifications

  # Step 3: Aggregate verifications
  - id: aggregate
    type: reduce
    items: $verifications
    operation:
      verified:
        $filter:
          items: $item
          condition: verified == true
      disputed:
        $filter:
          items: $item
          condition: verified == false
    output: summary

output:
  overall:
    $template: "{{$summary.verified.length == $facts.length ? 'verified' : 'disputed'}}"
  verifiedFacts: $summary.verified
  disputedFacts: $summary.disputed
  confidence:
    $average: $verifications.*.confidence
```

## Cross-Agent Verification

Have different agents verify each other's work:

```yaml
name: cross-verification
version: 1.0.0
description: Agents verify each other's outputs

input:
  task: string
  input: object

steps:
  # Step 1: Primary processing
  - id: primary
    agents:
      capabilities: [processing]
      min: 3
    execution:
      strategy: parallel
    aggregation:
      strategy: consensus
    output: primaryResult

  # Step 2: Independent verification by different agents
  - id: verify
    agents:
      capabilities: [verification]
      min: 3
      exclude: $primary.agents  # Don't use same agents
    input:
      originalInput: $input.input
      result: $primaryResult.result
    execution:
      strategy: parallel
    aggregation:
      strategy: voting
      method: unanimous

output:
  result: $primaryResult.result
  verified: $verify.result.verified
  verificationDetails: $verify.result.details
```

## Transformation Verification

Verify data transformations preserve meaning:

```yaml
name: transformation-verification
version: 1.0.0
description: Verify data transformation accuracy

input:
  data: object
  transformation: string  # e.g., "summarize", "reformat", "simplify"

steps:
  # Step 1: Apply transformation
  - id: transform
    agents:
      capabilities: [$input.transformation]
      min: 3
    input:
      data: $input.data
    aggregation:
      strategy: consensus
    output: transformed

  # Step 2: Extract key information from original
  - id: extract-original
    agents:
      capabilities: [information-extraction]
      min: 3
    input:
      data: $input.data
    aggregation:
      strategy: merge
      method: union
    output: originalInfo

  # Step 3: Extract key information from transformed
  - id: extract-transformed
    agents:
      capabilities: [information-extraction]
      min: 3
    input:
      data: $transformed.result
    aggregation:
      strategy: merge
      method: union
    output: transformedInfo

  # Step 4: Compare information preservation
  - id: compare
    agents:
      capabilities: [comparison]
      min: 3
    input:
      original: $originalInfo
      transformed: $transformedInfo
    aggregation:
      strategy: consensus
    output: comparison

output:
  result: $transformed.result
  preserved: $comparison.preservedItems
  lost: $comparison.lostItems
  preservationRate:
    $formula: preserved.length / (preserved.length + lost.length)
  verified: $comparison.preservationRate >= 0.95
```

## Semantic Verification

Verify semantic meaning is preserved:

```yaml
name: semantic-verification
version: 1.0.0

input:
  original: string
  transformed: string
  expectedMeaning: string  # Optional - what should be preserved

steps:
  # Step 1: Embed both texts
  - id: embed
    agents:
      capabilities: [embedding]
      min: 1
    input:
      texts:
        - $input.original
        - $input.transformed
    output: embeddings

  # Step 2: Calculate similarity
  - id: similarity
    type: compute
    operation: cosine_similarity
    inputs:
      - $embeddings[0]
      - $embeddings[1]
    output: similarityScore

  # Step 3: Semantic comparison by agents
  - id: semantic-check
    agents:
      capabilities: [semantic-analysis]
      min: 5
    input:
      original: $input.original
      transformed: $input.transformed
    execution:
      strategy: parallel
    aggregation:
      strategy: voting
      method: weighted
    output: semanticVerification

output:
  similarityScore: $similarityScore
  semanticallyEquivalent: $semanticVerification.result
  confidence:
    $average: [$similarityScore, $semanticVerification.confidence]
```

## Consistency Verification

Verify consistency across multiple outputs:

```yaml
name: consistency-verification
version: 1.0.0
description: Ensure consistent outputs across multiple runs

input:
  query: string
  runs:
    type: number
    default: 3

steps:
  # Run the same query multiple times
  - id: multiple-runs
    type: repeat
    count: $input.runs
    task:
      agents:
        capabilities: [analysis]
        min: 3
      input:
        query: $input.query
      aggregation:
        strategy: consensus
    output: results

  # Compare all results for consistency
  - id: consistency-check
    agents:
      capabilities: [comparison]
      min: 3
    input:
      results: $results
    aggregation:
      strategy: consensus
    output: consistency

output:
  result: $results[0].result  # Use first result
  consistent: $consistency.isConsistent
  consistencyScore: $consistency.score
  variations:
    $filter:
      items: $results
      condition: differs == true
```

## Adversarial Verification

Use adversarial agents to find flaws:

```yaml
name: adversarial-verification
version: 1.0.0
description: Use adversarial agents to challenge results

input:
  claim: string

steps:
  # Step 1: Generate initial analysis
  - id: analysis
    agents:
      capabilities: [analysis]
      min: 3
    aggregation:
      strategy: consensus
    output: initialAnalysis

  # Step 2: Adversarial challenge
  - id: challenge
    agents:
      capabilities: [adversarial, critical-analysis]
      min: 3
    input:
      claim: $input.claim
      analysis: $initialAnalysis.result
    instructions: |
      Try to find flaws, errors, or counterexamples
      in the given analysis. Be critical.
    aggregation:
      strategy: merge
      method: union
    output: challenges

  # Step 3: Respond to challenges
  - id: respond
    agents:
      capabilities: [analysis, defense]
      min: 3
    input:
      original: $initialAnalysis.result
      challenges: $challenges
    aggregation:
      strategy: consensus
    output: responses

  # Step 4: Final verdict
  - id: verdict
    agents:
      capabilities: [judgment]
      min: 5
    input:
      analysis: $initialAnalysis.result
      challenges: $challenges
      responses: $responses
    aggregation:
      strategy: voting
      method: majority
    output: finalVerdict

output:
  analysis: $initialAnalysis.result
  challenges: $challenges
  responses: $responses
  verdict: $finalVerdict.result
  confidence: $finalVerdict.confidence
```

## Chained Verification

Multiple verification steps in sequence:

```yaml
name: chained-verification
version: 1.0.0

input:
  document: string

steps:
  - id: extract
    agents:
      capabilities: [extraction]
      min: 3
    output: extracted

  # Verification 1: Format check
  - id: format-verify
    agents:
      capabilities: [format-validation]
      min: 2
    input:
      data: $extracted
    output: formatValid

  # Verification 2: Completeness check
  - id: completeness-verify
    agents:
      capabilities: [completeness-check]
      min: 2
    input:
      data: $extracted
      original: $input.document
    output: completeValid

  # Verification 3: Accuracy check
  - id: accuracy-verify
    agents:
      capabilities: [accuracy-check]
      min: 3
    input:
      data: $extracted
      original: $input.document
    aggregation:
      strategy: voting
    output: accuracyValid

  # All checks must pass
  - id: final-gate
    type: gate
    condition:
      $all:
        - $formatValid.passed
        - $completeValid.passed
        - $accuracyValid.result

output:
  data: $extracted
  verified: $final-gate.passed
  verifications:
    format: $formatValid.passed
    completeness: $completeValid.passed
    accuracy: $accuracyValid.result
```

## Best Practices

1. **Use independent verification** - Don't use the same agents for creation and verification

2. **Multiple verification types** - Combine different verification approaches

3. **Set appropriate thresholds** - Balance false positives vs false negatives

4. **Handle failures gracefully** - Have fallback strategies for verification failures

5. **Log verification details** - Track why verifications pass or fail

6. **Consider verification cost** - Verification adds latency and cost

## Next Steps

- [Quality Gates](/docs/patterns/quality-gates) - Use verification with quality gates
- [Advanced Composition](/docs/patterns/advanced-composition) - Complex verification workflows
- [Extraction Patterns](/docs/patterns/extraction-patterns) - Verify extracted data

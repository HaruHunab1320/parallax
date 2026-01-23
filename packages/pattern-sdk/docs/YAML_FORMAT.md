# YAML Pattern Format

Write orchestration patterns in YAML, compile to Prism. No DSL to learn.

## Quick Start

```yaml
name: MyPattern
version: 1.0.0
description: What this pattern does

input:
  query: string

agents:
  capabilities: [analysis]
  min: 2

groups:
  results:
    match: result.type == "analysis"

output:
  answer: $results.result.answer
  confidence: $avgConfidence

confidence: average
```

Compile to Prism:
```bash
parallax-generate compile pattern.yaml
```

## Schema Reference

### Metadata

```yaml
name: PatternName          # Required: Pattern identifier
version: 1.0.0             # Optional: Semver version
description: Description   # Required: What this pattern does
```

### Input

Define what data the pattern receives:

```yaml
# Shorthand - just specify types
input:
  query: string
  count: number
  enabled: boolean

# Full definition with descriptions
input:
  query:
    type: string
    description: The question to analyze
    required: true
  options:
    type: array
    description: Available choices
    default: []
```

### Agent Selection

Specify which agents to use:

```yaml
agents:
  capabilities: [security, analysis]  # Required capabilities
  min: 2                              # Minimum agents needed
  max: 5                              # Maximum agents to use
```

### Result Groups

Filter agent results by type/criteria:

```yaml
groups:
  summary:
    match: result.analysisType == "summary"
    take: first  # first (default), last, or all

  votes:
    match: result.type == "vote"
    take: all
```

The `match` expression is a JavaScript-like filter that has access to:
- `result` - The agent's result object
- `confidence` - The agent's confidence score

### Output Mapping

Define the output structure using `$references`:

```yaml
output:
  # Reference group results
  title: $summary.result.title
  points: $keypoints.result.items

  # Nested objects
  metadata:
    count: $totalCount
    confidence: $avgConfidence

  # Literal values
  version: "1.0.0"

  # Reference input
  originalQuery: $input.query
```

#### Available References

| Reference | Description |
|-----------|-------------|
| `$groupName` | First result from group |
| `$groupName.result.field` | Field from group's result |
| `$groupName.confidence` | Confidence of group's result |
| `$input` | Original input object |
| `$input.fieldName` | Field from input |
| `$totalCount` | Number of valid results |
| `$avgConfidence` | Average confidence |
| `$validResults` | All valid agent results |

### Confidence Calculation

How to calculate the final pattern confidence:

```yaml
# Simple - use a built-in method
confidence: average   # Mean of all confidences
confidence: min       # Lowest confidence (conservative)
confidence: max       # Highest confidence (optimistic)

# Weighted by group
confidence:
  method: weighted
  weights:
    summary: 0.3
    analysis: 0.7

# Custom expression
confidence:
  method: custom
  expression: validResults.length >= 3 ? avgConfidence : avgConfidence * 0.8
```

### Aggregation Strategies

For patterns that need to combine results:

```yaml
# Consensus - check for agreement
aggregation:
  strategy: consensus
  threshold: 0.7        # Min confidence to count
  minVotes: 2           # Min votes needed

# Voting - majority wins
aggregation:
  strategy: voting
  method: majority      # majority, unanimous, weighted

# Merge - combine all results
aggregation:
  strategy: merge
  fields: [items, tags]  # Which fields to merge

# Best - pick highest confidence
aggregation:
  strategy: best
  by: confidence        # confidence or custom
```

### Fallback Behavior

What to do when confidence is low:

```yaml
fallback:
  condition: confidence < 0.5
  action: escalate       # escalate, retry, default
  target: human-review   # For escalate: who to escalate to
  maxRetries: 3          # For retry: how many times
  value:                 # For default: fallback value
    status: uncertain
    message: Unable to determine with confidence
```

## Complete Examples

### Document Analysis

```yaml
name: DocumentAnalysis
version: 1.0.0
description: Analyze documents from multiple perspectives

input:
  document: string
  title: string

agents:
  capabilities: [document, analysis]
  min: 4

groups:
  summary:
    match: result.analysisType == "summary"
  keypoints:
    match: result.analysisType == "keypoints"
  actions:
    match: result.analysisType == "actions"
  sentiment:
    match: result.analysisType == "sentiment"

output:
  document:
    title: $summary.result.title
    type: $summary.result.documentType
  summary:
    topic: $summary.result.mainTopic
    overview: $summary.result.summary
  keyPoints:
    critical: $keypoints.result.criticalPoints
    supporting: $keypoints.result.supportingPoints
  actionItems:
    items: $actions.result.actionItems
    urgent: $actions.result.hasUrgentItems
  sentiment:
    overall: $sentiment.result.overallSentiment
    score: $sentiment.result.sentimentScore
  metadata:
    analysesCompleted: $totalCount
    confidence: $avgConfidence

confidence: average
```

### Multi-Model Voting

```yaml
name: ContentModeration
version: 1.0.0
description: Multiple models vote on content appropriateness

input:
  content: string

agents:
  capabilities: [moderation, voting]
  min: 3

aggregation:
  strategy: voting
  method: majority

output:
  decision: $aggregation.winner
  consensus: $aggregation.consensusType
  needsReview: $aggregation.isSplit
  votes: $validResults
  confidence: $avgConfidence

confidence: average

fallback:
  condition: confidence < 0.6
  action: escalate
  target: human-moderator
```

### Quality Gate

```yaml
name: RAGQualityGate
version: 1.0.0
description: Validate RAG responses before returning to users

input:
  question: string
  answer: string
  sources: array

agents:
  capabilities: [validation]
  min: 3

groups:
  groundedness:
    match: result.checkType == "groundedness"
  relevance:
    match: result.checkType == "relevance"
  completeness:
    match: result.checkType == "completeness"

output:
  passed: $aggregation.allPassed
  checks:
    groundedness: $groundedness.result
    relevance: $relevance.result
    completeness: $completeness.result
  recommendation: $aggregation.recommendation

confidence: min

fallback:
  condition: confidence < 0.5
  action: default
  value:
    passed: false
    recommendation: Regenerate with better retrieval
```

## CLI Usage

```bash
# Compile single file
parallax-generate compile patterns/analysis.yaml

# Compile to specific output
parallax-generate compile analysis.yaml -o dist/analysis.prism

# Compile directory
parallax-generate compile patterns/ -o dist/

# Print to stdout
parallax-generate compile analysis.yaml --stdout

# Watch mode
parallax-generate compile patterns/ --watch

# Without comments
parallax-generate compile analysis.yaml --no-comments
```

## Programmatic Usage

```typescript
import { compileYamlToPrism, compileYamlFile } from '@parallax/pattern-sdk';

// From string
const yaml = `
name: MyPattern
...
`;
const result = compileYamlToPrism(yaml);
console.log(result.prism);

// From file
const result = await compileYamlFile('./pattern.yaml');
console.log(result.prism);
console.log(result.metadata);
console.log(result.warnings);
```

---
sidebar_position: 1
title: Overview
---

# Pattern Library

The Pattern Library provides ready-to-use orchestration patterns for common multi-agent tasks. Each pattern is battle-tested and can be used directly or customized for your needs.

## Pattern Categories

| Category | Description | Use Cases |
|----------|-------------|-----------|
| [Voting Patterns](/docs/patterns/voting-patterns) | Classification and decision-making | Content moderation, sentiment analysis, categorization |
| [Quality Gates](/docs/patterns/quality-gates) | Confidence-based filtering | Ensuring output quality, retry logic |
| [Extraction Patterns](/docs/patterns/extraction-patterns) | Data extraction and merging | Entity extraction, document analysis |
| [Verification Patterns](/docs/patterns/verification-patterns) | Fact-checking and validation | Translation verification, data validation |
| [Advanced Composition](/docs/patterns/advanced-composition) | Complex multi-step workflows | Research pipelines, document processing |

## Quick Start Patterns

### Multi-Agent Voting

The simplest pattern - multiple agents vote on a classification:

```yaml
name: content-classifier
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

output:
  category: $vote.result
  confidence: $vote.confidence
```

### Quality-Gated Analysis

Add confidence thresholds and retry logic:

```yaml
name: quality-gated-analysis
version: 1.0.0

input:
  document: string

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
  onFailure: retry
  maxRetries: 2

output:
  analysis: $consensus.result
  confidence: $consensus.confidence
```

### Data Extraction

Extract and merge data from multiple agents:

```yaml
name: entity-extraction
version: 1.0.0

input:
  document: string

agents:
  capabilities: [entity-extraction]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: merge
  method: union
  deduplication: true

output:
  entities: $merged.entities
  confidence: $merged.confidence
```

### Translation Verification

Verify translations with back-translation:

```yaml
name: verified-translation
version: 1.0.0

input:
  text: string
  sourceLang: string
  targetLang: string

steps:
  - id: translate
    agents:
      capabilities: [translation]
      min: 3
    aggregation:
      strategy: consensus

  - id: back-translate
    agents:
      capabilities: [translation]
      min: 2
    input:
      text: $translate.result
      sourceLang: $input.targetLang
      targetLang: $input.sourceLang

  - id: verify
    agents:
      capabilities: [text-similarity]
      min: 2
    input:
      original: $input.text
      backtranslated: $back-translate.result

output:
  translation: $translate.result
  verified: $verify.result.similar
  confidence: $verify.result.similarity
```

## Choosing a Pattern

### Decision Flow

```
What do you need?
│
├── Classification/Decision → Voting Patterns
│   ├── Binary decision → voting (majority/unanimous)
│   ├── Multi-class → voting (plurality)
│   └── Weighted decision → voting (weighted)
│
├── Data Extraction → Extraction Patterns
│   ├── Combine unique items → merge (union)
│   ├── Find common items → merge (intersection)
│   └── Structured data → merge (deep)
│
├── Quality Assurance → Quality Gates
│   ├── Minimum confidence → validation (threshold)
│   ├── Retry on failure → validation (retry)
│   └── Fallback on failure → validation (fallback)
│
├── Verification → Verification Patterns
│   ├── Translation → back-translation
│   ├── Fact-checking → multi-source
│   └── Data validation → cross-reference
│
└── Multi-step Processing → Advanced Composition
    ├── Pipeline → sequential
    ├── Parallel subtasks → parallel + merge
    └── Conditional → switch
```

## Pattern Configuration

### Common Options

All patterns support these configuration sections:

```yaml
# Metadata
name: pattern-name
version: 1.0.0
description: What this pattern does

# Input schema
input:
  fieldName: type

# Agent selection
agents:
  capabilities: [cap1, cap2]
  min: 3
  max: 5

# How agents execute
execution:
  strategy: parallel | sequential | race
  timeout: 30000

# How results combine
aggregation:
  strategy: voting | consensus | merge | first

# Quality requirements
validation:
  minConfidence: 0.7
  onFailure: retry | fail | fallback

# Output mapping
output:
  result: $variable
```

### Input Types

```yaml
input:
  # Simple types
  text: string
  count: number
  enabled: boolean

  # With validation
  email:
    type: string
    format: email
    required: true

  # Optional with default
  language:
    type: string
    default: 'en'

  # Enum
  mode:
    type: string
    enum: [fast, standard, thorough]

  # Array
  items:
    type: array
    items: string

  # Object
  options:
    type: object
    properties:
      verbose: boolean
      maxTokens: number
```

### Output Variables

| Variable | Description |
|----------|-------------|
| `$input` | Original input |
| `$input.field` | Specific input field |
| `$results` | All agent results |
| `$vote.result` | Voting winner |
| `$vote.confidence` | Voting confidence |
| `$consensus.result` | Consensus output |
| `$consensus.confidence` | Consensus confidence |
| `$merged` | Merged results |
| `$execution.agentCount` | Number of agents used |
| `$execution.duration` | Execution time (ms) |

## Using Patterns

### Execute via SDK

```typescript
import { ParallaxClient } from '@parallax/sdk-typescript';

const client = new ParallaxClient({ url: 'http://localhost:8080' });

const result = await client.executePattern('content-classifier', {
  content: 'Check out this amazing deal!'
});

console.log(result);
// { category: 'promotional', confidence: 0.92 }
```

### Register Custom Patterns

```typescript
// Register from YAML file
await client.registerPattern(fs.readFileSync('my-pattern.yaml', 'utf-8'));

// Register programmatically
import { PatternBuilder } from '@parallax/pattern-sdk';

const pattern = new PatternBuilder('my-pattern')
  .input({ text: 'string' })
  .agents({ capabilities: ['analysis'], min: 3 })
  .parallel()
  .voting({ method: 'majority' })
  .build();

await client.registerPattern(pattern);
```

### List Available Patterns

```typescript
const patterns = await client.listPatterns();

for (const p of patterns) {
  console.log(`${p.name}@${p.version}: ${p.description}`);
}
```

## Best Practices

1. **Start Simple** - Begin with basic voting/consensus, add complexity as needed

2. **Right-size Agent Count** - 3-5 agents for most tasks; more for critical decisions

3. **Set Appropriate Thresholds** - Balance reliability vs completion rate

4. **Add Quality Gates** - Use validation to catch low-confidence results

5. **Version Your Patterns** - Use semantic versioning for production patterns

6. **Test with Edge Cases** - Verify patterns handle disagreement gracefully

## Next Steps

- [YAML Syntax](/docs/patterns/yaml-syntax) - Complete syntax reference
- [Voting Patterns](/docs/patterns/voting-patterns) - Classification patterns
- [Pattern Builder](/docs/pattern-builder/overview) - Visual pattern editor

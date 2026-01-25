---
sidebar_position: 5
title: Extraction Patterns
---

# Extraction Patterns

Extraction patterns collect data from multiple agents and combine the results. They're ideal for entity extraction, data mining, and information aggregation.

## When to Use Extraction

- **Entity extraction** - Names, places, dates, organizations
- **Data mining** - Finding patterns in unstructured text
- **Information aggregation** - Combining multiple sources
- **Comprehensive coverage** - When missing data is costly

## Merge Strategies

### Union Merge

Combine all unique items from all agents:

```yaml
name: union-extraction
version: 1.0.0

input:
  document: string

agents:
  capabilities: [entity-extraction]
  min: 5

execution:
  strategy: parallel
  timeout: 30000

aggregation:
  strategy: merge
  method: union
  deduplication: true

output:
  entities: $merged.entities
  count: $merged.entities.length
```

**Example:**
```
Agent 1: ["Apple", "Microsoft"]
Agent 2: ["Apple", "Google"]
Agent 3: ["Microsoft", "Amazon"]

Result: ["Apple", "Microsoft", "Google", "Amazon"]
```

### Intersection Merge

Keep only items found by all agents:

```yaml
name: intersection-extraction
version: 1.0.0

input:
  document: string

agents:
  capabilities: [entity-extraction]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: merge
  method: intersection

output:
  entities: $merged.entities
  confidence: $merged.confidence
```

**Example:**
```
Agent 1: ["Apple", "Microsoft", "Google"]
Agent 2: ["Apple", "Google", "Amazon"]
Agent 3: ["Apple", "Google", "Meta"]

Result: ["Apple", "Google"]  # Only items in ALL results
```

### Deep Merge

Recursively merge nested objects:

```yaml
name: deep-extraction
version: 1.0.0

input:
  document: string

agents:
  capabilities: [structured-extraction]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: merge
  method: deep
  arrayStrategy: union    # How to merge arrays within objects

output:
  data: $merged
```

**Example:**
```
Agent 1: {
  people: ["John"],
  metadata: { language: "en" }
}
Agent 2: {
  people: ["Jane"],
  metadata: { confidence: 0.9 }
}

Result: {
  people: ["John", "Jane"],
  metadata: { language: "en", confidence: 0.9 }
}
```

### Concat Merge

Concatenate arrays without deduplication:

```yaml
aggregation:
  strategy: merge
  method: concat
  limit: 100              # Max items to keep
```

## Extraction Patterns

### Entity Extraction

```yaml
name: entity-extraction
version: 1.0.0
description: Extract named entities with voting on categories

input:
  document: string
  entityTypes:
    type: array
    items: string
    default: [person, organization, location, date]

agents:
  capabilities: [entity-extraction]
  min: 5

execution:
  strategy: parallel
  timeout: 30000

aggregation:
  strategy: merge
  method: union
  deduplication: true
  deduplicationKey: name  # Dedupe by entity name

output:
  entities: $merged.entities
  byType:
    people:
      $filter:
        items: $merged.entities
        condition: type == 'person'
    organizations:
      $filter:
        items: $merged.entities
        condition: type == 'organization'
    locations:
      $filter:
        items: $merged.entities
        condition: type == 'location'
```

### Multi-Type Extraction

Extract different types with specialized agents:

```yaml
name: comprehensive-extraction
version: 1.0.0

input:
  document: string

steps:
  # Extract people
  - id: people
    agents:
      capabilities: [entity-extraction, person]
      min: 3
    aggregation:
      strategy: merge
      method: union
    output: people

  # Extract organizations
  - id: orgs
    agents:
      capabilities: [entity-extraction, organization]
      min: 3
    aggregation:
      strategy: merge
      method: union
    output: organizations

  # Extract dates
  - id: dates
    agents:
      capabilities: [entity-extraction, temporal]
      min: 3
    aggregation:
      strategy: merge
      method: union
    output: dates

  # Extract relationships
  - id: relationships
    agents:
      capabilities: [relationship-extraction]
      min: 3
    input:
      document: $input.document
      entities:
        people: $people
        organizations: $organizations
    aggregation:
      strategy: merge
      method: union
    output: relationships

output:
  entities:
    people: $people
    organizations: $organizations
    dates: $dates
  relationships: $relationships
```

### Extraction with Confidence Scoring

Track confidence for each extracted item:

```yaml
name: confidence-scored-extraction
version: 1.0.0

input:
  text: string

agents:
  capabilities: [entity-extraction]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: merge
  method: union
  scoring:
    # Items found by more agents get higher confidence
    formula: foundByCount / totalAgents
    minScore: 0.4         # Filter out low-confidence items

output:
  entities: $merged.entities
  highConfidence:
    $filter:
      items: $merged.entities
      condition: confidence >= 0.8
```

### Key-Value Extraction

Extract structured key-value pairs:

```yaml
name: form-extraction
version: 1.0.0
description: Extract form fields from documents

input:
  document: string
  expectedFields:
    type: array
    items: string
    default: [name, email, phone, address]

agents:
  capabilities: [form-extraction]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: merge
  method: deep
  conflictResolution: majority  # Vote on conflicting values

output:
  fields: $merged
  completeness:
    $formula: foundFields.length / expectedFields.length
  missingFields:
    $filter:
      items: $input.expectedFields
      condition: $merged[item] == null
```

### Table Extraction

Extract tabular data:

```yaml
name: table-extraction
version: 1.0.0

input:
  document: string

agents:
  capabilities: [table-extraction]
  min: 3

execution:
  strategy: parallel

aggregation:
  strategy: merge
  method: deep
  arrayStrategy: vote     # Vote on row values

validation:
  schema:
    type: object
    properties:
      headers:
        type: array
        items: string
      rows:
        type: array
        items:
          type: array

output:
  headers: $merged.headers
  rows: $merged.rows
  rowCount: $merged.rows.length
```

### Quote Extraction

Extract and attribute quotes:

```yaml
name: quote-extraction
version: 1.0.0

input:
  article: string

agents:
  capabilities: [quote-extraction]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: merge
  method: union
  deduplicationKey: text
  mergeFields:            # Merge metadata for duplicate quotes
    - speakers            # Combine speaker attributions
    - contexts

output:
  quotes:
    $map:
      items: $merged
      transform:
        text: item.text
        speaker: item.speakers[0]  # Most confident attribution
        confidence: item.confidence
```

### Fact Extraction

Extract factual claims:

```yaml
name: fact-extraction
version: 1.0.0

input:
  document: string

agents:
  capabilities: [fact-extraction]
  min: 5

execution:
  strategy: parallel

aggregation:
  strategy: merge
  method: union
  scoring:
    formula: foundByCount / totalAgents

steps:
  - id: extract
    # ...extraction as above
    output: rawFacts

  - id: categorize
    agents:
      capabilities: [fact-classification]
      min: 3
    input:
      facts: $rawFacts
    aggregation:
      strategy: voting
      method: majority
    output: categorizedFacts

output:
  facts: $categorizedFacts
  byCategory:
    verifiable:
      $filter:
        items: $categorizedFacts
        condition: category == 'verifiable'
    opinion:
      $filter:
        items: $categorizedFacts
        condition: category == 'opinion'
```

## Advanced Extraction

### Extraction with Validation

Validate extracted items against external data:

```yaml
name: validated-extraction
version: 1.0.0

input:
  document: string

steps:
  - id: extract
    agents:
      capabilities: [entity-extraction]
      min: 5
    aggregation:
      strategy: merge
      method: union
    output: rawEntities

  - id: validate
    agents:
      capabilities: [entity-validation]
      min: 3
    input:
      entities: $rawEntities
    aggregation:
      strategy: voting
      method: majority
    output: validatedEntities

output:
  entities: $validatedEntities.valid
  invalid: $validatedEntities.invalid
  validationRate:
    $formula: valid.length / (valid.length + invalid.length)
```

### Extraction Pipeline

Multi-stage extraction with enrichment:

```yaml
name: extraction-pipeline
version: 1.0.0

input:
  documents:
    type: array
    items: string

steps:
  # Stage 1: Extract from all documents in parallel
  - id: batch-extract
    type: batch
    items: $input.documents
    task:
      agents:
        capabilities: [entity-extraction]
        min: 3
      aggregation:
        strategy: merge
    output: documentEntities

  # Stage 2: Merge across documents
  - id: global-merge
    type: merge
    inputs: $documentEntities
    method: union
    deduplication: true
    output: allEntities

  # Stage 3: Enrich entities
  - id: enrich
    agents:
      capabilities: [entity-enrichment]
      min: 2
    input:
      entities: $allEntities
    aggregation:
      strategy: merge
      method: deep
    output: enrichedEntities

output:
  entities: $enrichedEntities
  sources:
    $map:
      items: $enrichedEntities
      transform:
        entity: item.name
        foundIn: item.documentIndices
```

## Best Practices

1. **Use appropriate agent count** - More agents = better coverage but higher cost

2. **Choose right merge strategy** - Union for coverage, intersection for precision

3. **Deduplicate carefully** - Choose the right key for deduplication

4. **Score by frequency** - Items found by multiple agents are more reliable

5. **Validate extracted data** - Add validation step for critical extractions

6. **Consider field-level merging** - Different strategies for different fields

## Extraction Metrics

Track extraction quality:

```yaml
output:
  entities: $merged.entities

  metrics:
    totalExtracted: $merged.entities.length
    avgConfidence:
      $average: $merged.entities.*.confidence
    highConfidenceCount:
      $filter:
        items: $merged.entities
        condition: confidence >= 0.8
      then: length
    coverageByAgent:
      $map:
        items: $results
        transform: item.entities.length
```

## Next Steps

- [Verification Patterns](/patterns/verification-patterns) - Verify extracted data
- [Quality Gates](/patterns/quality-gates) - Filter low-quality extractions
- [Advanced Composition](/patterns/advanced-composition) - Complex extraction pipelines

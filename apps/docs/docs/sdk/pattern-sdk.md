---
sidebar_position: 3
title: Pattern SDK
---

# Pattern SDK

The Pattern SDK allows you to build, validate, and compile patterns programmatically. Use it to generate patterns dynamically, create pattern templates, or build custom pattern tooling.

## Installation

```bash
npm install @parallax/pattern-sdk
```

## PatternBuilder

The `PatternBuilder` class provides a fluent API for constructing patterns.

### Basic Usage

```typescript
import { PatternBuilder } from '@parallax/pattern-sdk';

const pattern = new PatternBuilder('sentiment-analysis')
  .version('1.0.0')
  .description('Analyze sentiment using multiple agents')
  .input({
    text: { type: 'string', required: true },
    language: { type: 'string', required: false, default: 'en' },
  })
  .agents({
    capabilities: ['sentiment-analysis'],
    min: 3,
    max: 5,
  })
  .parallel({ timeout: 30000 })
  .voting({ method: 'majority' })
  .output({
    sentiment: '$vote.result',
    confidence: '$vote.confidence',
  })
  .build();
```

### Metadata

```typescript
const pattern = new PatternBuilder('my-pattern')
  .version('2.1.0')
  .description('Detailed description of what this pattern does')
  .author('your-name')
  .tags(['analysis', 'production'])
  .metadata({
    category: 'text-processing',
    costTier: 'medium',
  })
  .build();
```

### Input Schema

Define the input schema:

```typescript
const pattern = new PatternBuilder('document-processor')
  .input({
    // Simple field
    title: 'string',

    // With options
    content: {
      type: 'string',
      required: true,
      minLength: 10,
      maxLength: 50000,
    },

    // Optional with default
    language: {
      type: 'string',
      required: false,
      default: 'en',
      enum: ['en', 'es', 'fr', 'de'],
    },

    // Array
    tags: {
      type: 'array',
      items: 'string',
      required: false,
    },

    // Nested object
    options: {
      type: 'object',
      properties: {
        extractEntities: { type: 'boolean', default: true },
        summarize: { type: 'boolean', default: false },
      },
    },
  })
  .build();
```

### Agent Selection

Configure agent selection:

```typescript
// Basic capability matching
.agents({
  capabilities: ['analysis'],
  min: 3,
})

// Multiple capabilities (agents must have ALL)
.agents({
  capabilities: ['analysis', 'english', 'gpt-4'],
  min: 3,
  max: 5,
})

// With timeout per agent
.agents({
  capabilities: ['analysis'],
  min: 3,
  taskTimeout: 10000,  // 10s per agent
})

// Prefer specific agents
.agents({
  capabilities: ['analysis'],
  min: 3,
  prefer: ['expert-agent-1', 'expert-agent-2'],
})
```

### Execution Strategies

#### Parallel

```typescript
.parallel({
  timeout: 30000,      // Overall timeout
  waitForAll: true,    // Wait for all agents
  minResults: 2,       // Minimum results to proceed (if waitForAll: false)
})
```

#### Sequential

```typescript
.sequential({
  steps: [
    { capability: 'research', output: 'research' },
    { capability: 'analysis', input: '$research', output: 'analysis' },
    { capability: 'synthesis', input: '$analysis' },
  ],
  stopOnError: true,
})
```

#### Race

```typescript
.race({
  timeout: 10000,
  minConfidence: 0.7,
})
```

### Aggregation Strategies

#### Voting

```typescript
.voting({
  method: 'majority',     // majority, unanimous, weighted, plurality
  minVotes: 2,
  weights: {              // For weighted voting
    'expert-agent': 2.0,
    'default': 1.0,
  },
})
```

#### Consensus

```typescript
.consensus({
  threshold: 0.8,
  minVotes: 3,
  conflictResolution: 'weighted',  // weighted, first, highest-confidence
  fields: ['sentiment', 'category'],  // Optional: specific fields
})
```

#### Merge

```typescript
.merge({
  method: 'deep',          // deep, shallow, concat, union
  fields: ['data', 'entities'],
  deduplication: true,
})
```

#### First

```typescript
.first({
  minConfidence: 0.7,
})
```

### Validation

Add validation rules:

```typescript
.validation({
  minConfidence: 0.7,
  onFailure: 'retry',      // retry, fail, fallback
  maxRetries: 3,
  retryDelay: 1000,
})

// With fallback
.validation({
  minConfidence: 0.7,
  onFailure: 'fallback',
  fallback: {
    type: 'default',
    value: {
      result: 'Unable to process with sufficient confidence',
      confidence: 0,
    },
  },
})
```

### Output Mapping

Map results to output:

```typescript
.output({
  // Direct mapping
  result: '$consensus.result',
  confidence: '$consensus.confidence',

  // Nested output
  metadata: {
    agentCount: '$execution.agentCount',
    processingTime: '$execution.duration',
  },

  // Computed fields
  summary: {
    $template: 'Sentiment: {{sentiment}} ({{confidence}}% confident)',
  },
})
```

## Pattern Composition

Build patterns that use other patterns:

```typescript
const pattern = new PatternBuilder('comprehensive-analysis')
  .steps([
    {
      id: 'extract',
      pattern: 'entity-extraction',
      input: { document: '$input.document' },
      output: 'entities',
    },
    {
      id: 'analyze',
      pattern: 'sentiment-analysis',
      input: { text: '$input.document' },
      output: 'sentiment',
    },
    {
      id: 'summarize',
      pattern: 'summarization',
      input: {
        document: '$input.document',
        entities: '$entities',
        sentiment: '$sentiment',
      },
      output: 'summary',
    },
  ])
  .output({
    entities: '$entities',
    sentiment: '$sentiment',
    summary: '$summary',
  })
  .build();
```

## Conditional Logic

Add conditional execution:

```typescript
const pattern = new PatternBuilder('smart-processor')
  .input({ content: 'string', type: 'string' })
  .switch({
    value: '$input.type',
    cases: {
      document: {
        pattern: 'document-processor',
        input: { content: '$input.content' },
      },
      image: {
        pattern: 'image-analyzer',
        input: { image: '$input.content' },
      },
      default: {
        pattern: 'generic-processor',
        input: '$input',
      },
    },
  })
  .build();
```

## Validation

### Validate Patterns

```typescript
import { validatePattern } from '@parallax/pattern-sdk';

const pattern = builder.build();
const validation = validatePattern(pattern);

if (!validation.valid) {
  console.error('Validation errors:');
  for (const error of validation.errors) {
    console.error(`- ${error.path}: ${error.message}`);
  }
}
```

### Validation Errors

```typescript
interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  path: string;          // e.g., "agents.min"
  message: string;       // Human-readable error
  code: string;          // Error code for programmatic handling
}
```

### Common Validations

- Required fields present
- Type correctness
- Valid capability names
- Aggregation strategy compatibility
- Output variable references exist
- No circular dependencies

## Compilation

### Compile to YAML

```typescript
import { compileToYaml } from '@parallax/pattern-sdk';

const pattern = builder.build();
const yaml = compileToYaml(pattern);

console.log(yaml);
// name: sentiment-analysis
// version: 1.0.0
// ...
```

### Compile to JSON

```typescript
import { compileToJson } from '@parallax/pattern-sdk';

const json = compileToJson(pattern);
```

### Compile Options

```typescript
const yaml = compileToYaml(pattern, {
  includeComments: true,     // Add documentation comments
  minify: false,             // Minify output
  sortKeys: true,            // Sort YAML keys alphabetically
});
```

## Parsing

### Parse YAML

```typescript
import { parsePattern } from '@parallax/pattern-sdk';

const yaml = `
name: my-pattern
version: 1.0.0
input:
  text: string
agents:
  capabilities: [analysis]
  min: 3
`;

const pattern = parsePattern(yaml);
```

### Parse with Validation

```typescript
const { pattern, validation } = parsePattern(yaml, { validate: true });

if (!validation.valid) {
  throw new Error(`Invalid pattern: ${validation.errors[0].message}`);
}
```

## Pattern Templates

Create reusable templates:

```typescript
import { PatternTemplate } from '@parallax/pattern-sdk';

// Define a template
const votingTemplate = new PatternTemplate({
  name: 'voting-pattern',
  parameters: {
    capability: { type: 'string', required: true },
    agentCount: { type: 'number', default: 3 },
    votingMethod: { type: 'string', default: 'majority' },
  },
  build: (params) => new PatternBuilder(`${params.capability}-voting`)
    .agents({
      capabilities: [params.capability],
      min: params.agentCount,
    })
    .parallel()
    .voting({ method: params.votingMethod })
    .build(),
});

// Use the template
const sentimentPattern = votingTemplate.create({
  capability: 'sentiment-analysis',
  agentCount: 5,
  votingMethod: 'weighted',
});

const moderationPattern = votingTemplate.create({
  capability: 'content-moderation',
});
```

## Type Definitions

### Pattern Type

```typescript
interface Pattern {
  name: string;
  version: string;
  description?: string;
  input: InputSchema;
  agents: AgentConfig;
  execution: ExecutionConfig;
  aggregation: AggregationConfig;
  validation?: ValidationConfig;
  output: OutputConfig;
  metadata?: Record<string, any>;
}
```

### Full Type Definitions

```typescript
import type {
  Pattern,
  InputSchema,
  InputField,
  AgentConfig,
  ExecutionConfig,
  AggregationConfig,
  ValidationConfig,
  OutputConfig,
  VotingConfig,
  ConsensusConfig,
  MergeConfig,
} from '@parallax/pattern-sdk';
```

## Examples

### Multi-Step Analysis Pattern

```typescript
const analysisPattern = new PatternBuilder('comprehensive-document-analysis')
  .version('1.0.0')
  .description('Multi-step document analysis with quality gates')
  .input({
    document: { type: 'string', required: true, maxLength: 100000 },
    options: {
      type: 'object',
      properties: {
        language: { type: 'string', default: 'auto' },
        depth: { type: 'string', enum: ['quick', 'standard', 'thorough'] },
      },
    },
  })
  .steps([
    {
      id: 'preprocess',
      agents: { capabilities: ['preprocessing'], min: 1 },
      execution: { strategy: 'first' },
      output: 'preprocessed',
    },
    {
      id: 'analyze',
      agents: { capabilities: ['analysis'], min: 5 },
      execution: { strategy: 'parallel', timeout: 60000 },
      aggregation: { strategy: 'consensus', threshold: 0.8 },
      input: '$preprocessed',
      output: 'analysis',
    },
    {
      id: 'validate',
      agents: { capabilities: ['validation'], min: 2 },
      execution: { strategy: 'parallel' },
      aggregation: { strategy: 'voting', method: 'unanimous' },
      input: { original: '$input.document', analysis: '$analysis' },
      output: 'validated',
    },
  ])
  .validation({
    minConfidence: 0.75,
    onFailure: 'retry',
    maxRetries: 2,
  })
  .output({
    analysis: '$analysis',
    validated: '$validated',
    confidence: '$analysis.confidence',
  })
  .build();
```

### Dynamic Pattern Generation

```typescript
function createExtractionPattern(entityTypes: string[]): Pattern {
  return new PatternBuilder(`extract-${entityTypes.join('-')}`)
    .version('1.0.0')
    .input({
      text: { type: 'string', required: true },
    })
    .agents({
      capabilities: ['entity-extraction', ...entityTypes],
      min: 3,
    })
    .parallel({ timeout: 30000 })
    .merge({
      method: 'union',
      fields: entityTypes,
      deduplication: true,
    })
    .output(
      Object.fromEntries(entityTypes.map(type => [type, `$merged.${type}`]))
    )
    .build();
}

const personOrgPattern = createExtractionPattern(['person', 'organization']);
const locationDatePattern = createExtractionPattern(['location', 'date']);
```

## Next Steps

- [YAML Syntax](/docs/patterns/yaml-syntax) - Complete YAML reference
- [Pattern Builder](/docs/pattern-builder/overview) - Visual pattern editor
- [Advanced Composition](/docs/patterns/advanced-composition) - Complex pattern techniques

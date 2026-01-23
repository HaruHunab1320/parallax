# Parallax Pattern SDK

Generate orchestration patterns for Parallax using YAML or AI-assisted generation.

## Overview

The Pattern SDK provides two ways to create Parallax orchestration patterns:

1. **YAML to Prism** - Write patterns in familiar YAML, compile to Prism DSL
2. **AI Generation** - Generate patterns from natural language requirements

Both approaches produce `.prism` files that run on the Parallax control plane.

## YAML to Prism (Recommended)

Write orchestration logic in YAML without learning Prism DSL:

```yaml
name: DocumentAnalysis
description: Analyze documents from multiple perspectives

input:
  document: string

agents:
  capabilities: [analysis]
  min: 4

groups:
  summary:
    match: result.type == "summary"
  sentiment:
    match: result.type == "sentiment"

output:
  summary: $summary.result.text
  sentiment: $sentiment.result.score

confidence: average
```

Compile to Prism:
```bash
npx parallax-generate compile pattern.yaml
```

See [docs/YAML_FORMAT.md](./docs/YAML_FORMAT.md) for the full YAML schema reference.

## AI-Assisted Generation

## Installation

```bash
npm install -D @parallax/pattern-sdk
# or
pnpm add -D @parallax/pattern-sdk
```

## Quick Start

### CLI Usage

```bash
# Generate pattern interactively
npx parallax-generate pattern --interactive

# Generate from description
npx parallax-generate pattern "Multi-stage security review with consensus"

# Generate from requirements file
npx parallax-generate pattern -f requirements.yaml
```

### Programmatic Usage

```typescript
import { PatternGenerator } from '@parallax/pattern-sdk';
import { openai } from '@ai-sdk/openai';

const generator = new PatternGenerator({
  llm: openai('gpt-4'),
  outputDir: './patterns'
});

// Generate from requirements
const pattern = await generator.generate({
  goal: "Security review with escalation",
  strategy: "consensus",
  minConfidence: 0.9,
  fallback: "security-architect"
});

// Save to file
await generator.save(pattern);
```

## Requirements Format

Create a `requirements.yaml` file:

```yaml
name: security-review
description: Multi-stage security review pattern

requirements:
  goal: "Comprehensive security analysis"
  strategy: consensus
  minConfidence: 0.95
  
  stages:
    - name: initial-scan
      parallel: true
      agents:
        - capability: security
          count: 3
    
    - name: deep-analysis
      condition: "confidence < 0.9"
      agents:
        - capability: security-expert
          count: 2
  
  fallback:
    condition: "confidence < 0.85"
    target: security-architect
```

## Configuration

Create `parallax.config.yml` in your project root:

```yaml
version: 1.0

generation:
  provider: openai       # or anthropic, custom
  model: gpt-4
  temperature: 0.7

patterns:
  outputDir: ./patterns
  naming: kebab-case
  
templates:
  consensus:
    primitives: [parallel, consensus, threshold]
    minAgents: 3
```

## Pattern Templates

Use pre-defined templates as starting points:

```bash
# List available templates
npx parallax-generate template list

# Use a template
npx parallax-generate pattern --template consensus \
  --name "pr-review" \
  --customize
```

## Testing Generated Patterns

```typescript
import { PatternTester } from '@parallax/pattern-sdk/testing';

const tester = new PatternTester('./patterns/security-review.prism');

// Test with mock agents
const result = await tester.test({
  mockAgents: [
    { id: 'sec-1', response: { risk: 'low' }, confidence: 0.9 },
    { id: 'sec-2', response: { risk: 'medium' }, confidence: 0.85 }
  ],
  input: { code: 'function test() { ... }' }
});

expect(result.confidence).toBeGreaterThan(0.85);
```

## Advanced Features

### Custom Primitives

Register custom primitives:

```typescript
generator.registerPrimitive({
  name: 'custom-validator',
  type: 'validation',
  description: 'Custom validation logic',
  generateCode: (config) => `
    result = customValidate(input, ${JSON.stringify(config)})
    result ~> confidence
  `
});
```

### Pattern Composition

Compose patterns from existing patterns:

```typescript
const composed = await generator.compose({
  base: './patterns/security-review.prism',
  add: ['./patterns/performance-check.prism'],
  strategy: 'parallel'
});
```

### LLM Providers

Use any LLM provider that follows the AI SDK interface:

```typescript
// OpenAI
import { openai } from '@ai-sdk/openai';
const generator = new PatternGenerator({ llm: openai('gpt-4') });

// Anthropic
import { anthropic } from '@ai-sdk/anthropic';
const generator = new PatternGenerator({ llm: anthropic('claude-3') });

// Custom
const customLLM = {
  async generateObject({ schema, prompt }) {
    // Your implementation
  }
};
const generator = new PatternGenerator({ llm: customLLM });
```

## Best Practices

1. **Review Generated Patterns**: Always review AI-generated patterns before committing
2. **Test Thoroughly**: Use the testing framework to validate patterns
3. **Version Control**: Commit patterns to git for tracking and reviews
4. **Document Requirements**: Keep requirements files with patterns
5. **Use Templates**: Start with templates for common patterns

## Examples

See the `/examples` directory for complete examples:
- `basic-consensus/` - Simple consensus pattern
- `security-pipeline/` - Multi-stage security review
- `data-processing/` - ETL pipeline with validation
- `ml-workflow/` - ML model evaluation pattern

## API Reference

### PatternGenerator

```typescript
class PatternGenerator {
  constructor(options: GeneratorOptions);
  
  generate(requirements: OrchestrationRequirements): Promise<Pattern>;
  save(pattern: Pattern, path?: string): Promise<void>;
  validate(pattern: Pattern): Promise<ValidationResult>;
  compose(options: ComposeOptions): Promise<Pattern>;
}
```

### Types

```typescript
interface OrchestrationRequirements {
  goal: string;
  strategy?: string;
  minConfidence?: number;
  fallback?: string;
  stages?: StageDefinition[];
  constraints?: Record<string, any>;
}

interface Pattern {
  name: string;
  code: string;
  metadata: PatternMetadata;
  requirements: OrchestrationRequirements;
}
```

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for guidelines on:
- Adding new templates
- Improving generation logic
- Adding primitive definitions

## License

Apache-2.0
# Parallax Pattern SDK Architecture

## Overview

This document outlines the revolutionary approach to pattern generation in Parallax - treating patterns as development-time artifacts (like database migrations) rather than runtime-generated code.

## Core Insight

Just like Prisma generates migration files that developers commit to their repos, Parallax Pattern SDK generates .prism files that become part of the application codebase. This solves the architectural gap while keeping Parallax truly open source with no hidden LLM costs.

## Developer Workflow

### 1. Pattern Generation (Development Time)

```bash
# Initialize a Parallax project
parallax init

# Generate a pattern using YOUR LLM
parallax generate pattern "Multi-stage PR review with security focus" \
  --provider openai \
  --api-key $OPENAI_KEY \
  --output ./patterns/pr-review.prism

# Or from requirements file
parallax generate pattern -f requirements.yaml

# Interactive mode
parallax generate pattern --interactive
```

### 2. Pattern Development Lifecycle

```bash
# Test locally with mock agents
parallax test ./patterns/pr-review.prism --mock-agents

# Validate pattern syntax and semantics
parallax validate ./patterns/pr-review.prism

# Run locally
parallax run pr-review --input data.json

# Commit to version control
git add ./patterns/pr-review.prism
git commit -m "Add PR review pattern"
```

### 3. Production Usage

```bash
# Patterns are deployed as files
# No LLM needed at runtime
parallax run pr-review --input '{"pr": 123}'
```

## Project Structure

```
my-project/
├── src/
│   └── agents/
├── patterns/                    # Generated patterns (like prisma/migrations)
│   ├── pr-review.prism
│   ├── consensus-with-escalation.prism
│   ├── data-validation-pipeline.prism
│   └── generated/              # Keep generated patterns separate
├── tests/
│   └── patterns/               # Pattern tests
├── parallax.config.yml         # Configuration
├── package.json
└── .gitignore
```

## Configuration

```yaml
# parallax.config.yml
version: 1.0

project:
  name: my-ai-system
  
defaults:
  minConfidence: 0.8
  timeout: 30s
  fallback: escalate-to-human

generation:
  provider: openai        # or anthropic, custom, etc.
  model: gpt-4
  primitivesPath: ./node_modules/@parallax/primitives

templates:
  consensus:
    description: "Standard consensus pattern"
    primitives: [parallel, consensus, threshold]
    minAgents: 3
    
  pipeline:
    description: "Sequential processing pipeline"
    primitives: [sequential, validate, transform]
    
patterns:
  directory: ./patterns
  naming: kebab-case
```

## Pattern Generation SDK API

### CLI Commands

```bash
# Generate from natural language
parallax generate pattern "description" [options]

# Generate from requirements file
parallax generate pattern -f requirements.yaml

# Interactive generation
parallax generate pattern --interactive

# Generate from template
parallax generate pattern --template consensus \
  --name "security-consensus"

# List available primitives
parallax primitives list

# Show primitive details
parallax primitives show parallel
```

### Programmatic API

```typescript
import { PatternGenerator } from '@parallax/pattern-sdk';

// Initialize with your LLM
const generator = new PatternGenerator({
  llm: myLLMProvider,
  primitivesPath: './primitives'
});

// Generate from requirements
const pattern = await generator.generate({
  goal: "Multi-perspective code review",
  strategy: "parallel-consensus",
  minConfidence: 0.9,
  perspectives: ["security", "quality", "performance"]
});

// Save to file
await generator.save(pattern, './patterns/code-review.prism');

// Validate
const validation = await generator.validate(pattern);
```

## Requirements Format

```yaml
# requirements.yaml
name: security-consensus
description: Security review with consensus

requirements:
  goal: "Analyze code for security vulnerabilities"
  strategy: consensus
  minConfidence: 0.95
  fallback: security-expert
  
  agents:
    - capability: security
      minCount: 3
    - capability: code-analysis
      minCount: 2
      
  flow:
    - parallel: true
    - consensus: 
        threshold: 0.9
    - escalate:
        condition: "confidence < 0.9"
        
  constraints:
    timeout: 5m
    maxRetries: 2
```

## Pattern Testing

```typescript
// patterns/__tests__/pr-review.test.ts
import { PatternTester } from '@parallax/pattern-sdk/testing';

describe('PR Review Pattern', () => {
  const tester = new PatternTester('./patterns/pr-review.prism');
  
  it('should achieve consensus with high confidence', async () => {
    const result = await tester.run({
      mockAgents: [
        { id: 'security-1', confidence: 0.9 },
        { id: 'quality-1', confidence: 0.85 },
        { id: 'perf-1', confidence: 0.95 }
      ],
      input: { pr: 123 }
    });
    
    expect(result.confidence).toBeGreaterThan(0.85);
    expect(result.consensus).toBe(true);
  });
});
```

## Community Patterns

### Publishing Patterns

```bash
# Publish to Parallax Registry
parallax publish ./patterns/security-consensus.prism \
  --tag security \
  --description "Enterprise security consensus pattern"

# Publish as npm package
npm publish @myorg/parallax-patterns
```

### Using Community Patterns

```bash
# Install from registry
parallax add @parallax/patterns-security

# Install from npm
npm install @company/parallax-patterns

# Copy pattern to project
parallax init --template security-review

# Browse available patterns
parallax search "consensus"
```

## Benefits of This Approach

### 1. **True Open Source**
- No LLM required at runtime
- Users provide their own LLM for generation
- Parallax remains pure orchestration

### 2. **Developer Friendly**
- Familiar workflow (like Prisma, Knex migrations)
- Version controlled patterns
- Code review process for patterns
- IDE support for .prism files

### 3. **Production Ready**
- Patterns are tested before deployment
- No runtime generation surprises
- Deterministic execution
- Performance optimized

### 4. **Enterprise Compatible**
- Patterns can be audited
- Compliance-friendly (no runtime AI calls)
- Standardization possible
- Clear deployment artifacts

### 5. **Community Driven**
- Easy to share patterns
- Pattern marketplace possible
- Learn from others' patterns
- Build pattern libraries

## Migration Path

### From Static Patterns
```bash
# Existing patterns still work
parallax run /patterns/consensus-builder.prism

# Can be enhanced with SDK
parallax enhance /patterns/consensus-builder.prism \
  --add-confidence-threshold 0.9
```

### From Dynamic Requirements
```bash
# Convert requirements to pattern
parallax generate pattern -f old-requirements.json \
  --output ./patterns/migrated-pattern.prism
```

## Future Enhancements

### 1. **Pattern Composition**
```bash
# Compose patterns from other patterns
parallax compose \
  --base security-review \
  --add performance-check \
  --output comprehensive-review.prism
```

### 2. **Pattern Optimization**
```bash
# Analyze and optimize patterns
parallax optimize ./patterns/slow-pattern.prism \
  --target latency
```

### 3. **Pattern Versioning**
```yaml
# In pattern file
@version 2.0
@breaking-change Added mandatory security check
```

### 4. **Visual Pattern Designer**
- GUI for designing patterns
- Drag-drop primitives
- Visual debugging

## Conclusion

The Pattern SDK approach transforms Parallax from requiring runtime AI to being a pure orchestration platform where patterns are first-class development artifacts. This is revolutionary because it:

1. Eliminates runtime LLM costs
2. Makes patterns reviewable and testable
3. Enables true community sharing
4. Keeps Parallax focused on orchestration
5. Follows proven development patterns

This architecture makes Parallax truly open source while enabling unlimited flexibility through development-time pattern generation.
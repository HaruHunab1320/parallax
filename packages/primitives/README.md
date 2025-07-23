# Parallax Primitives Library

Core primitive building blocks for composing Parallax orchestration patterns.

## Overview

This library provides 20+ atomic primitives that can be composed to create complex orchestration patterns. Each primitive is designed to:

- Handle confidence propagation correctly
- Be composable with other primitives
- Provide clear, predictable behavior
- Support parameterization where appropriate

## Categories

### Execution Primitives
Control how operations are executed:

- `parallel(maxConcurrency)` - Execute operations concurrently
- `sequential(tasks)` - Execute operations in order
- `pipeline(...functions)` - Functional pipeline composition

### Aggregation Primitives
Combine results from multiple sources:

- `consensus(results)` - Build weighted consensus
- `voting(strategy)` - Various voting strategies (majority, weighted, unanimous)

### Confidence Primitives
Manipulate and filter based on confidence:

- `threshold(minConfidence)` - Filter by confidence level
- `boost(factor)` - Increase confidence
- `decay(rate)` - Decrease confidence
- `clamp(min, max)` - Bound confidence to range
- `normalize(context)` - Normalize confidence values
- `combineConfidence(strategy)` - Combine multiple confidence values

### Control Flow Primitives
Advanced execution control:

- `retry(maxAttempts, options)` - Retry on failure or low confidence
- `fallback(...alternatives)` - Try alternatives in order
- `escalate(escalationPath)` - Escalate based on confidence
- `circuitBreaker(operation, options)` - Prevent cascading failures

## Usage

```prism
import { parallel, consensus, threshold } from "@parallax/primitives"

// Compose primitives into patterns
const pattern = (input) => {
  return input
    ~|> parallel(5)      // Execute 5 at a time
    ~|> consensus        // Build consensus
    ~|> threshold(0.8)   // Require high confidence
}
```

## Validation

Run the validation script to ensure all primitives are valid:

```bash
npm run validate
```

This will:
- Check syntax validity
- Verify exports
- Analyze confidence propagation
- Report any issues

## Primitive Design Principles

1. **Single Responsibility**: Each primitive does one thing well
2. **Confidence Aware**: All primitives handle confidence propagation
3. **Composable**: Primitives can be chained with `~|>`
4. **Parameterizable**: Configuration through parameters, not modification
5. **Pure Functions**: No side effects, predictable behavior

## Examples

See the `examples/` directory for composition patterns.

## Contributing

When adding new primitives:

1. Choose the appropriate category
2. Follow the existing patterns for confidence handling
3. Add comprehensive documentation
4. Ensure validation passes
5. Add usage examples

## License

Apache-2.0
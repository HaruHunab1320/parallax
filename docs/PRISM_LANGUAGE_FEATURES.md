# Prism Language Features for Parallax

> **A reference guide for Prism language capabilities relevant to Parallax pattern generation**

## Overview

This document captures our understanding of Prism language features that enable our primitive-based pattern composition approach. It serves as a quick reference to avoid re-researching documented features.

## Core Language Features

### 1. Confidence Operators

#### Basic Operators
- `~>` - Assign confidence to a value: `value = "data" ~> 0.95`
- `~` - Extract confidence from a value: `conf = ~value`

#### Advanced Operators (Perfect for Primitive Composition)
- `~|>` - **Confidence Pipeline**: Maintains confidence through function chains
  ```prism
  result = input 
    ~|> primitive1 
    ~|> primitive2 
    ~|> primitive3  // Confidence propagates automatically
  ```

- `~||>` - **Parallel Confidence**: Selects highest confidence option
  ```prism
  result = strategy1 ~||> strategy2 ~||> strategy3
  ```

- `~@>` - **Threshold Gate**: Filters by confidence threshold
  ```prism
  filtered = uncertain ~@> 0.8  // Only passes if confidence >= 0.8
  ```

- `~??` - **Confidence Coalesce**: First non-null with confidence
  ```prism
  result = primary ~?? secondary ~?? fallback
  ```

- `~&&`, `~||` - **Logical operators with confidence propagation**

### 2. Control Flow

#### Uncertain If
```prism
uncertain if (~value) {
  high {
    // confidence >= 0.7
  }
  medium {
    // 0.5 <= confidence < 0.7
  }
  low {
    // confidence < 0.5
  }
  default {
    // optional fallback
  }
}
```

### 3. Functions

#### Arrow Functions
```prism
add = (a, b) => a + b
process = (data) => {
  // Multi-line function
  result = transform(data)
  return result
}
```

#### Pipeline Operator
```prism
// Standard pipeline
result = input |> filter |> map |> reduce

// With confidence
result = input ~|> filter ~|> map ~|> reduce
```

### 4. Confidence Propagation Rules

- **Arithmetic**: 
  - Addition/Subtraction: Minimum confidence
  - Multiplication/Division: Product of confidences
- **Logical**:
  - AND: Minimum confidence
  - OR: Maximum confidence
- **Data Structures**: Individual element confidence preserved

## What Prism Provides for Primitive Composition

### 1. Perfect Primitive Chaining
```prism
// Our primitives can be chained with automatic confidence flow
pattern = input 
  ~|> parallel(5)      // Primitive 1
  ~|> aggregate        // Primitive 2  
  ~|> consensus        // Primitive 3
  ~|> threshold(0.8)   // Primitive 4
```

### 2. Alternative Strategies
```prism
// Try different primitive combinations
result = fastPath ~||> accuratePath ~||> safePath
```

### 3. Conditional Primitive Application
```prism
result = uncertain if (~input) {
  high { input ~|> simpleProcess }
  medium { input ~|> validateFirst ~|> process }
  low { input ~|> extensive_validation ~|> careful_process }
}
```

### 4. Function Factories for Primitives
```prism
// Create parameterized primitives
makeParallel = (n) => (input) => {
  // Implementation using n
}

parallel5 = makeParallel(5)
parallel10 = makeParallel(10)
```

## New Language Features (Just Added!)

### Module System ✅
```prism
// Import primitives
import { parallel, sequential } from "./primitives/execution.prism"
import { consensus, voting } from "./primitives/aggregation.prism"

// Export composed patterns
export const myPattern = input ~|> parallel ~|> consensus
```

### Variable Declarations ✅
```prism
// Const for immutable primitives
const parallel = (n) => (input) => { /* parallel implementation */ }

// Let for mutable state
let executionCount = 0

// Regular assignment still works
result = computation()
```

### Named Functions ✅
```prism
// Standard function syntax
function createPrimitive(config) {
  return (input) => {
    // Implementation
  }
}

// Parameterized primitives
function makeParallel(concurrency) {
  return (tasks) => {
    // Execute with specified concurrency
  }
}
```

### Validation Library ✅
```javascript
import { createValidator } from '@prism-lang/validator';

const validator = createValidator();
const validation = validator.validateAll(primitiveCode);

if (!validation.valid) {
  console.log("Primitive validation failed:", validation.formattedErrors);
}
```

## Remaining Questions

### 1. Dynamic Pipeline Construction
```prism
// Can we build pipelines from arrays dynamically?
const primitives = [filter, aggregate, threshold]

// Option 1: reduce with pipeline operator?
result = primitives.reduce((acc, fn) => acc ~|> fn, input)

// Option 2: Built-in compose function?
pipeline = compose(...primitives)
result = input ~|> pipeline
```

### 2. Primitive Type Annotations
```prism
// Are there type annotations for documenting primitives?
function parallel(concurrency: number): (tasks: Array) => Array {
  // Implementation
}

// Or at least structured comments for validation?
/**
 * @param {number} concurrency - Max parallel executions
 * @returns {Function} - Returns executor function
 */
```

### 3. Runtime Primitive Discovery
```prism
// Can we discover available primitives at runtime?
import * as allPrimitives from "./primitives/index.prism"

// Iterate over exported primitives?
for (const [name, primitive] of Object.entries(allPrimitives)) {
  registry.register(name, primitive)
}
```

## Key Insights for Parallax

1. **Confidence Pipeline (`~|>`) is Perfect**: It's exactly what we need for chaining primitives
2. **No Code Generation Needed**: We can use function factories and composition
3. **Uncertainty Handling Built-in**: The `uncertain if` construct handles confidence-based branching
4. **Parallel Strategies**: The `~||>` operator enables trying multiple primitive combinations

## Conclusion

Prism already provides 90% of what we need for primitive-based pattern composition. The main missing piece is a module system for organizing our primitive library. Until that's available, we can work within a single namespace using careful organization.
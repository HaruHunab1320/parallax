# Primitive Design Guide

## Core Principle: Primitives Define Patterns, Not Execute Them

Primitives should ONLY describe orchestration patterns. The orchestrator interprets these patterns and coordinates agents to do the actual work.

## ❌ What Primitives Should NOT Do

1. **No Async Operations**
   ```prism
   // WRONG - Primitives don't execute
   const result = await someOperation()
   ```

2. **No Side Effects**
   ```prism
   // WRONG - Primitives don't perform I/O
   const data = readFile("data.json")
   ```

3. **No Complex State Management**
   ```prism
   // WRONG - Primitives don't manage state
   cache.set(key, value)
   ```

4. **No Direct Agent Calls**
   ```prism
   // WRONG - Primitives don't call agents
   const result = agent.process(task)
   ```

## ✅ What Primitives SHOULD Do

1. **Return Pattern Descriptions**
   ```prism
   export const parallel = (limit) => {
     return (tasks) => {
       return {
         type: "parallel",
         tasks: tasks,
         config: { limit: limit }
       } ~> 1.0
     }
   }
   ```

2. **Handle Confidence Propagation**
   ```prism
   export const threshold = (minConfidence) => {
     return (input) => {
       // Just describe the filtering pattern
       return {
         type: "threshold",
         input: input,
         threshold: minConfidence
       } ~> 1.0
     }
   }
   ```

3. **Compose Other Patterns**
   ```prism
   export const reliableConsensus = (agents) => {
     return agents
       |> parallel(5)
       |> threshold(0.7)
       |> consensus
   }
   ```

## Pattern Structure

Each primitive should return an object that describes:

```prism
{
  type: "primitive_name",     // Identifies the pattern
  input: input_data,          // What to process
  config: {                   // How to process it
    // Pattern-specific configuration
  }
} ~> confidence_value
```

## Examples of Correct Primitives

### Execution Pattern
```prism
export const sequential = () => {
  return (tasks) => {
    return {
      type: "sequential",
      tasks: tasks
    } ~> 1.0
  }
}
```

### Aggregation Pattern
```prism
export const voting = (strategy) => {
  return (results) => {
    return {
      type: "voting",
      results: results,
      strategy: strategy || "majority"
    } ~> 0.9
  }
}
```

### Control Pattern
```prism
export const retry = (attempts, backoff) => {
  return (operation) => {
    return {
      type: "retry",
      operation: operation,
      config: {
        maxAttempts: attempts || 3,
        backoff: backoff || "exponential"
      }
    } ~> 0.8
  }
}
```

## Testing Primitives

Since primitives just return pattern objects, testing is simple:

```prism
// Test that primitive returns correct pattern
const pattern = parallel(5)(tasks)
assert(pattern.type == "parallel")
assert(pattern.config.limit == 5)
assert(~pattern == 1.0)
```

## Migration Checklist

When fixing existing primitives:

- [ ] Remove all async/await keywords
- [ ] Remove all Promise-based code
- [ ] Remove any execution logic
- [ ] Remove side effects (file I/O, network calls, etc.)
- [ ] Replace with pattern description object
- [ ] Ensure confidence is propagated correctly
- [ ] Keep parameter validation minimal
- [ ] Test that output is a valid pattern object
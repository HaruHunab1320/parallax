# Parallax Coordination Patterns

This directory contains all 10 coordination patterns for the Parallax platform, written in the Prism uncertainty-aware programming language.

## Pattern Catalog

### 1. **Consensus Builder** (`consensus-builder.prism`)
- Builds weighted consensus from multiple agent analyses
- Returns consensus quality and recommendations
- Use when: Need agreement from multiple perspectives

### 2. **Epistemic Orchestrator** (`epistemic-orchestrator.prism`)
- Identifies valuable disagreements between expert agents
- Highlights trade-offs when experts disagree with high confidence
- Use when: Complex decisions with potential trade-offs

### 3. **Uncertainty Router** (`uncertainty-router.prism`)
- Routes tasks based on uncertainty levels using Prism's `uncertain if`
- Escalates to specialists or humans based on confidence
- Use when: Task complexity is unknown

### 4. **Confidence Cascade** (`confidence-cascade.prism`)
- Cascades through agents until reaching target confidence
- Efficient resource usage with early termination
- Use when: Have confidence threshold requirements

### 5. **Load Balancer** (`load-balancer.prism`)
- Routes requests to best available agent
- Strategies: confidence, latency, availability, weighted
- Use when: Need optimal agent selection

### 6. **Cascading Refinement** (`cascading-refinement.prism`)
- Progressively refines results with increasing quality/cost
- Three tiers: fast, balanced, thorough
- Use when: Want to balance speed vs quality

### 7. **Parallel Exploration** (`parallel-exploration.prism`)
- Explores multiple approaches when consensus is low
- Triggers on high-confidence disagreements
- Use when: Multiple valid solutions may exist

### 8. **Multi-Validator** (`multi-validator.prism`)
- Validates data across multiple validators
- Fast path optimization with fallback to consensus
- Use when: Need high-confidence validation

### 9. **Uncertainty MapReduce** (`uncertainty-mapreduce.prism`)
- Distributed processing with confidence tracking
- Fallback strategies for low-confidence chunks
- Use when: Processing large datasets with uncertainty

### 10. **Robust Analysis** (`robust-analysis.prism`)
- Composite pattern using other patterns
- Adapts strategy based on initial assessment
- Use when: Need maximum robustness and adaptability

## Pattern Features

All patterns support:
- ✅ Confidence tracking and propagation
- ✅ Uncertainty-aware decision making
- ✅ Agent capability filtering
- ✅ Parallel execution where beneficial
- ✅ Detailed execution metadata
- ✅ Fallback strategies

## Pattern Composition

Patterns can compose other patterns. For example:
- `robust-analysis` uses `load-balancer`, `consensus-builder`, `parallel-exploration`, etc.
- Patterns can call `executePattern()` to invoke other patterns

## Usage

Patterns are automatically loaded by the `PatternEngine` and can be executed via:

```typescript
const result = await patternEngine.executePattern(
  'pattern-name',
  {
    // Input data
    task: 'Analyze this',
    data: { /* ... */ }
  }
);
```

## Pattern Metadata

Each pattern includes metadata in comments:
- `@name` - Pattern identifier
- `@version` - Semantic version
- `@description` - What the pattern does
- `@input` - Expected input schema
- `@agents` - Agent requirements
- `@minAgents` - Minimum agents needed

## Extending Patterns

To add a new pattern:
1. Create a `.prism` file in this directory
2. Add metadata comments
3. Implement coordination logic
4. Always return result with confidence using `~>`
5. Handle edge cases and low confidence scenarios

## Key Concepts

1. **Confidence Operators**:
   - `~` - Extract confidence from a value
   - `~>` - Assign confidence to a value

2. **Uncertain If**:
   - Unique Prism construct for confidence-based branching
   - `high`, `medium`, `low` blocks based on confidence level

3. **Parallel Execution**:
   - `parallel()` function for concurrent operations
   - Maintains confidence tracking across parallel tasks

4. **Pattern Context**:
   - `parallax.agents` - Access to registered agents
   - `input` - Pattern input data
   - `executePattern()` - Invoke other patterns
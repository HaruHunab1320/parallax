# Parallax Coordination Patterns

## Overview

Coordination patterns in Parallax define how multiple AI agents work together to solve complex tasks. Unlike traditional orchestration, Parallax patterns embrace uncertainty and use confidence levels to make intelligent routing decisions.

Following the [Orchestra Philosophy](../concepts/orchestra-philosophy.md), patterns act as "sheet music" that tells Parallax (the conductor) how to coordinate agents (the musicians) without requiring agents to communicate with each other directly.

## Core Patterns

### 1. Consensus Builder

Builds weighted consensus from multiple agent analyses.

**When to use:**
- Need agreement from multiple perspectives
- Want to identify outliers
- Confidence in individual agents varies

**Example:**
```prism
// Get all agents with analysis capability
agents = parallax.agents.filter(a => a.capabilities.includes("analysis"))

// Parallel analysis
results = parallel(agents.map(agent => {
  response = agent.analyze(input.task, input.data)
  return {
    value: response,
    confidence: ~response,
    agentId: agent.id
  }
}))

// Calculate weighted consensus
consensusQuality = totalWeight / results.length

// Return with appropriate confidence
consensus ~> consensusQuality
```

### 2. Epistemic Orchestrator

Identifies and values high-confidence disagreements between expert agents.

**When to use:**
- Complex decisions with trade-offs
- Multiple valid approaches exist
- Expert opinions may conflict

**Key insight:** When experts disagree with high confidence, it reveals important trade-offs rather than errors.

**Example:**
```prism
// Get expert agents
experts = ["security", "performance", "architecture"].map(type =>
  parallax.agents.find(a => a.capabilities.includes(type))
)

// Check for high-confidence disagreements
if (expert1.confidence > 0.8 && expert2.confidence > 0.8 &&
    expert1.recommendation != expert2.recommendation) {
  // Valuable disagreement detected!
  result = {
    type: "parallel_exploration",
    paths: [expert1, expert2],
    message: "Multiple valid approaches detected"
  }
}
```

### 3. Uncertainty Router

Routes tasks based on uncertainty levels using Prism's unique `uncertain if` construct.

**When to use:**
- Task complexity is unknown
- Need adaptive routing
- Want to escalate when uncertain

**Example:**
```prism
assessment = quickAssess(input.task)

uncertain if (~assessment < 0.6) {
  high {
    // High uncertainty - use specialists
    result = parallel(specialists.map(s => s.deepAnalyze(task)))
  }
  medium {
    // Medium uncertainty - standard approach
    result = generalist.analyze(task)
  }
  low {
    // Very uncertain - escalate
    result = escalateToHuman(task)
  }
}
```

### 4. Confidence Cascade

Cascades through agents until reaching target confidence.

**When to use:**
- Have confidence threshold requirements
- Want to minimize resource usage
- Agents have different costs/speeds

**Example:**
```prism
targetConfidence = input.minConfidence || 0.8

for agent in agents {
  if result && ~result >= targetConfidence {
    break
  }
  
  agentResult = agent.process(input.query)
  if ~agentResult > ~result {
    result = agentResult
  }
}
```

## Creating Custom Patterns

### Pattern Structure

```prism
/**
 * @name YourPatternName
 * @version 1.0.0
 * @description What this pattern does
 * @input {"type": "object", "properties": {...}}
 * @agents {"capabilities": ["required"], "minAgents": 2}
 */

// 1. Select agents
agents = parallax.agents.filter(/* your criteria */)

// 2. Execute coordination logic
results = /* your coordination logic */

// 3. Process results with confidence awareness
finalResult = processResults(results)

// 4. Return with confidence
finalResult ~> calculateConfidence(results)
```

### Best Practices

1. **Always return confidence**: Use the `~>` operator
2. **Handle low confidence**: Have fallback strategies
3. **Use parallel execution**: When tasks are independent
4. **Document uncertainties**: List them in results
5. **Leverage disagreements**: They reveal trade-offs

## Pattern Composition

Patterns can call other patterns:

```prism
// First, build consensus
consensusResult = executePattern("consensus-builder", {
  task: input.task,
  agents: technicalAgents
})

// If low consensus, try epistemic approach
if ~consensusResult < 0.6 {
  epistemicResult = executePattern("epistemic-orchestrator", {
    task: input.task,
    agents: expertAgents
  })
  
  return epistemicResult
}

return consensusResult
```

## Testing Patterns

### Local Testing

```bash
# Validate pattern syntax
parallax pattern validate ./my-pattern.prism

# Test with mock data
parallax run ./my-pattern.prism --input '{"test": "data"}'

# Watch for changes during development
parallax run ./my-pattern.prism --watch
```

### Unit Testing

```typescript
import { testPattern } from '@parallax/testing';

describe('MyPattern', () => {
  it('should handle high confidence consensus', async () => {
    const result = await testPattern('./my-pattern.prism', {
      input: { task: 'test' },
      mockAgents: [
        { id: 'agent1', confidence: 0.9, result: 'A' },
        { id: 'agent2', confidence: 0.85, result: 'A' }
      ]
    });
    
    expect(result.confidence).toBeGreaterThan(0.8);
  });
});
```

## Performance Considerations

1. **Parallel Execution**: Use `parallel()` for independent tasks
2. **Early Termination**: Stop when confidence threshold met
3. **Agent Selection**: Filter agents before execution
4. **Caching**: High-confidence results can be cached

## Common Pitfalls

1. **Forcing Consensus**: Sometimes disagreement is the answer
2. **Ignoring Confidence**: Treating all results equally
3. **Over-Orchestration**: Simple tasks don't need complex patterns
4. **Confidence Inflation**: Artificially high confidence values

## Examples

See the `/patterns` directory for complete examples:
- `consensus-builder.prism`
- `epistemic-orchestrator.prism`
- `uncertainty-router.prism`
- `confidence-cascade.prism`
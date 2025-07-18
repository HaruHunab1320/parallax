# Leveraging @prism-lang/confidence and @prism-lang/llm in Parallax

## Overview

The new `@prism-lang/confidence` and `@prism-lang/llm` packages provide powerful capabilities for extracting and managing confidence values in AI-driven orchestration. This guide shows how Parallax can leverage these features.

## Key Concepts

### 1. Automatic Confidence Extraction

Previously, confidence values had to be manually assigned:
```prism
// Old way
result = agent.analyze(task) ~> 0.8  // Manual confidence
```

Now, confidence can be automatically extracted from agent responses:
```prism
// New way with LLM integration
result = agent.analyze(task)  // Confidence automatically extracted
actualConfidence = <~ result  // Extract the confidence value
```

### 2. Confidence Extraction Methods

The `@prism-lang/confidence` package provides multiple methods:

#### Consistency-Based Extraction
```prism
// Sample multiple agent responses and measure agreement
samples = [
  agent1.analyze(task),
  agent1.analyze(task),  // Same agent, multiple runs
  agent1.analyze(task)
]
consensusConfidence = confidence.from_consistency(samples)
```

#### Response Analysis
```prism
// Analyze linguistic features for confidence
agentResponse = agent.analyze(task)
linguisticConfidence = confidence.analyze_response(agentResponse, {
  check_hedging: true,
  check_certainty: true,
  domain: "security"
})
```

#### Ensemble Methods
```prism
// Combine multiple confidence signals
finalConfidence = confidence.ensemble({
  agent_stated: 0.85,
  consistency: 0.72,
  linguistic: 0.90
}, weights: [0.4, 0.3, 0.3])
```

### 3. LLM Integration in Patterns

When agents disagree or need additional analysis:

```prism
pattern SmartOrchestrator {
  // Get agent results
  agentResults = parallel(agents.map(a => a.analyze(task)))
  
  // Check consensus
  consensus = confidence.from_consistency(agentResults.map(r => r.value))
  
  // If low consensus, consult LLM
  if (consensus < 0.6) {
    llmAnalysis = llm("Analyze these expert opinions and synthesize: " + 
                      formatResults(agentResults), {
      model: "claude",
      temperature: 0.2,
      structured_output: true  // Ensures confidence is included
    })
    
    // LLM response automatically includes confidence
    llmConfidence = <~ llmAnalysis
    
    // Use LLM insight if high confidence
    if (llmConfidence > 0.8) {
      return llmAnalysis
    }
  }
  
  return agentResults
}
```

### 4. Confidence Budgets

Ensure minimum confidence requirements are met:

```prism
pattern ConfidenceBudgetPattern {
  // Create budget requiring total confidence of 3.0
  budget = confidence.create_budget(min_total: 3.0)
  
  // Try fast agents first
  quickResults = parallel(fastAgents.map(a => a.analyze(task)))
  budget.add(quickResults)
  
  // Check if budget is met
  if (!budget.met()) {
    // Need more confidence - engage expert agents
    expertResults = parallel(expertAgents.map(a => a.analyze(task)))
    budget.add(expertResults)
  }
  
  // Still not enough? Use LLM
  if (!budget.met()) {
    llmResult = llm("Provide expert analysis: " + task)
    budget.add(llmResult)
  }
  
  return budget.results()
}
```

### 5. Domain Calibration

Calibrate confidence for specific domains:

```prism
pattern CalibratedSecurityReview {
  // Get raw security analysis
  rawResults = securityAgents.map(a => a.analyze(code))
  
  // Apply security-specific calibration
  calibratedResults = rawResults.map(r => {
    calibratedConf = confidence.calibrate(<~ r, {
      domain: "security",
      agent: r.agent,
      severity: r.severity
    })
    return r ~> calibratedConf
  })
  
  return calibratedResults
}
```

### 6. Advanced Confidence Patterns

#### Differential Confidence
Track confidence across multiple aspects:

```prism
pattern MultiAspectAnalysis {
  result = agent.analyze(task)
  
  // Extract confidence for different aspects
  aspects = confidence.differential(result, {
    aspects: ["correctness", "completeness", "safety"]
  })
  
  // Require high confidence on safety
  if (aspects.safety < 0.9) {
    return failSafe("Safety confidence too low")
  }
  
  return result
}
```

#### Temporal Confidence
Confidence that decays over time:

```prism
pattern TimeAwareDecision {
  // Cache with temporal confidence
  cachedResult = cache.get(task)
  
  if (cachedResult) {
    // Apply time decay
    age = now() - cachedResult.timestamp
    decayedConfidence = confidence.temporal_decay(
      <~ cachedResult,
      age,
      half_life: 3600  // Confidence halves every hour
    )
    
    // Use cache if still confident enough
    if (decayedConfidence > 0.7) {
      return cachedResult ~> decayedConfidence
    }
  }
  
  // Get fresh result
  return agent.analyze(task)
}
```

## Implementation in Parallax

### 1. Enhanced Runtime Manager

The runtime manager can provide confidence utilities:

```typescript
// In runtime-manager.ts
private async runPrismCode(script: string, instance: RuntimeInstance): Promise<any> {
  const { parse, createRuntime } = require('@prism-lang/core');
  const { confidence } = require('@prism-lang/confidence');
  const { defaultLLMRegistry } = require('@prism-lang/llm');
  
  // Create runtime with confidence and LLM support
  const runtime = createRuntime({
    globals: {
      confidence,  // Make confidence utilities available
      llm: (prompt: string, options?: any) => {
        return defaultLLMRegistry.complete(new LLMRequest(prompt, options));
      }
    }
  });
  
  const ast = parse(script);
  const result = await runtime.execute(ast);
  
  return result;
}
```

### 2. Agent Result Enhancement

Agents can return structured results with automatic confidence:

```typescript
// In agent implementation
class SecurityAgent extends ParallaxAgent {
  async analyze(code: string) {
    // If using LLM internally
    const llmResponse = await this.llm.complete({
      prompt: `Analyze this code for vulnerabilities: ${code}`,
      structured_output: true
    });
    
    return {
      value: llmResponse.content,
      confidence: llmResponse.confidence,  // Automatically extracted
      agent: this.id
    };
  }
}
```

### 3. Pattern Templates

Create templates that leverage confidence features:

```prism
pattern template HighConfidenceConsensus {
  // Require agreement from multiple agents with high confidence
  results = parallel(agents.map(a => a.analyze(task)))
  
  // Extract confidence values
  confidences = results.map(r => <~ r)
  
  // Check both consensus and individual confidence
  consensus = confidence.from_consistency(results)
  minIndividual = confidences.reduce((min, c) => c < min ? c : min, 1.0)
  
  if (consensus > 0.8 && minIndividual > 0.7) {
    // High confidence consensus achieved
    return synthesize(results) ~> consensus
  } else {
    // Need additional analysis
    return escalate(results)
  }
}
```

## Benefits for Parallax Users

1. **Automatic Confidence**: No need to manually assign confidence values
2. **Sophisticated Analysis**: Multiple methods to extract and validate confidence
3. **LLM Integration**: Seamlessly incorporate LLMs as meta-agents
4. **Domain Adaptation**: Calibrate confidence for specific domains
5. **Confidence Requirements**: Ensure decisions meet minimum confidence thresholds
6. **Temporal Awareness**: Handle confidence decay over time
7. **Multi-Aspect Tracking**: Track confidence across different dimensions

## Migration Path

For existing patterns:

1. **Keep manual confidence** where it makes sense
2. **Add automatic extraction** for agent results
3. **Enhance with ensemble methods** for critical decisions
4. **Integrate LLMs** for dispute resolution
5. **Add calibration** for domain-specific patterns

This creates a powerful system where confidence is not just a number, but a rich, multi-dimensional signal that can be extracted, analyzed, combined, and calibrated to make better orchestration decisions.
# Creating Parallax Agents

## Overview

Agents in Parallax are specialized AI components that analyze tasks and return results with confidence levels. Every agent must communicate its uncertainty, enabling intelligent coordination.

## Agent Anatomy

### Basic Structure

```typescript
import { ParallaxAgent, withConfidence } from '@parallax/typescript';

export class MyAgent extends ParallaxAgent {
  constructor() {
    super(
      'unique-agent-id',           // Unique identifier
      'Human Readable Name',       // Display name
      ['capability1', 'capability2'] // Capabilities this agent provides
    );
  }

  @withConfidence()
  async analyze(task: string, data?: any): Promise<[any, number]> {
    // Your analysis logic here
    const result = await this.performAnalysis(data);
    const confidence = this.calculateConfidence(result);
    
    // Return tuple: [result, confidence]
    return [result, confidence];
  }
}
```

### Key Concepts

1. **Capabilities**: Tags that describe what the agent can do
2. **Confidence**: Every result must include a confidence score (0.0-1.0)
3. **Reasoning**: Agents should explain their confidence levels

## TypeScript Agent Examples

### Security Analysis Agent

```typescript
import { ParallaxAgent, withConfidence } from '@parallax/typescript';
import { SecurityScanner } from './security-scanner';

export class SecurityAgent extends ParallaxAgent {
  private scanner: SecurityScanner;

  constructor() {
    super('security-agent-1', 'Security Analyzer', [
      'security',
      'code-analysis',
      'vulnerability-detection'
    ]);
    this.scanner = new SecurityScanner();
  }

  @withConfidence()
  async analyze(task: string, data?: any): Promise<[any, number]> {
    if (!data?.code) {
      return [{
        error: 'No code provided',
        recommendation: 'Provide code to analyze'
      }, 0.1]; // Very low confidence
    }

    const vulnerabilities = await this.scanner.scan(data.code);
    
    if (vulnerabilities.critical.length > 0) {
      return [{
        severity: 'critical',
        issues: vulnerabilities.critical,
        recommendation: 'Fix critical vulnerabilities immediately',
        reasoning: 'Direct security risks detected'
      }, 0.95]; // Very high confidence
    }
    
    if (vulnerabilities.warnings.length > 0) {
      return [{
        severity: 'warning',
        issues: vulnerabilities.warnings,
        recommendation: 'Review and address warnings',
        reasoning: 'Potential security concerns'
      }, 0.75]; // Moderate confidence
    }
    
    return [{
      severity: 'none',
      issues: [],
      recommendation: 'Code appears secure',
      reasoning: 'No obvious vulnerabilities detected'
    }, 0.6]; // Lower confidence for absence of issues
  }

  // Agents can have multiple methods
  async assessRisk(code: string): Promise<{ risk: string; confidence: number }> {
    const result = await this.analyze('assess risk', { code });
    return {
      risk: result[0].severity || 'unknown',
      confidence: result[1]
    };
  }
}
```

### ML-Based Agent

```typescript
export class MLAnalysisAgent extends ParallaxAgent {
  private model: TensorFlowModel;

  constructor() {
    super('ml-agent-1', 'ML Code Analyzer', [
      'machine-learning',
      'pattern-recognition',
      'code-analysis'
    ]);
    this.model = new TensorFlowModel('./models/code-quality');
  }

  @withConfidence({ 
    extractConfidence: (result) => result.modelConfidence 
  })
  async analyze(task: string, data?: any) {
    const features = this.extractFeatures(data.code);
    const prediction = await this.model.predict(features);
    
    return {
      quality: prediction.label,
      score: prediction.score,
      modelConfidence: prediction.confidence,
      suggestions: this.generateSuggestions(prediction),
      uncertainties: [
        'Model trained on limited dataset',
        'May not generalize to all code patterns'
      ]
    };
  }
}
```

## Python Agent Example

```python
from parallax import ParallaxAgent, confidence
from typing import Tuple, Any

class DataQualityAgent(ParallaxAgent):
    def __init__(self):
        super().__init__(
            agent_id='data-quality-1',
            name='Data Quality Analyzer',
            capabilities=['data-analysis', 'quality-assessment']
        )
    
    @confidence
    async def analyze(self, task: str, data: Any) -> Tuple[dict, float]:
        """Analyze data quality and return results with confidence."""
        
        if not data:
            return {
                'error': 'No data provided',
                'quality': 'unknown'
            }, 0.0
        
        # Perform quality checks
        quality_score = self.calculate_quality_score(data)
        issues = self.find_quality_issues(data)
        
        # Confidence based on data completeness
        confidence = min(0.95, quality_score / 100 + 0.2)
        
        result = {
            'quality_score': quality_score,
            'issues': issues,
            'recommendation': self.get_recommendation(quality_score),
            'metadata': {
                'rows_analyzed': len(data),
                'columns_analyzed': len(data.columns) if hasattr(data, 'columns') else 0
            }
        }
        
        return result, confidence
```

## Advanced Patterns

### Adaptive Confidence

Agents can adjust confidence based on context:

```typescript
@withConfidence()
async analyze(task: string, data?: any): Promise<[any, number]> {
  const result = await this.performAnalysis(data);
  
  // Base confidence
  let confidence = 0.7;
  
  // Adjust based on data quality
  if (data.source === 'verified') {
    confidence += 0.1;
  }
  
  // Adjust based on analysis completeness
  if (result.coveragePercent > 90) {
    confidence += 0.1;
  }
  
  // Cap at maximum
  confidence = Math.min(confidence, 0.95);
  
  return [result, confidence];
}
```

### Uncertainty Communication

Always communicate sources of uncertainty:

```typescript
return [{
  recommendation: 'Refactor this function',
  reasoning: 'High cyclomatic complexity detected',
  uncertainties: [
    'Complexity threshold is domain-dependent',
    'Refactoring impact on performance unknown',
    'Test coverage not considered'
  ],
  alternativeApproaches: [
    'Add comprehensive tests first',
    'Document complex logic instead'
  ]
}, 0.72];
```

### Multi-Modal Analysis

Agents can combine multiple analysis types:

```typescript
async analyze(task: string, data?: any): Promise<[any, number]> {
  // Run multiple analyses in parallel
  const [static, dynamic, historical] = await Promise.all([
    this.staticAnalysis(data.code),
    this.dynamicAnalysis(data.code, data.testInputs),
    this.historicalAnalysis(data.codeHistory)
  ]);
  
  // Combine results with confidence weighting
  const combined = this.combineAnalyses(static, dynamic, historical);
  const confidence = this.calculateCombinedConfidence([
    static.confidence,
    dynamic.confidence,
    historical.confidence
  ]);
  
  return [combined, confidence];
}
```

## Best Practices

### 1. Confidence Guidelines

- **0.9-1.0**: Near certainty, extensive evidence
- **0.7-0.9**: High confidence, good evidence
- **0.5-0.7**: Moderate confidence, some uncertainty
- **0.3-0.5**: Low confidence, significant uncertainty
- **0.0-0.3**: Very uncertain, little evidence

### 2. Always Explain Confidence

```typescript
return [{
  result: 'Code needs refactoring',
  confidence_reasoning: {
    positive: [
      'Clear violation of SOLID principles (+0.3)',
      'Matches known anti-patterns (+0.2)',
      'Similar to previously problematic code (+0.1)'
    ],
    negative: [
      'Limited context about requirements (-0.1)',
      'Performance impact unclear (-0.05)'
    ],
    final: 0.65
  }
}, 0.65];
```

### 3. Handle Edge Cases

```typescript
async analyze(task: string, data?: any): Promise<[any, number]> {
  // Validate inputs
  if (!data || !data.code) {
    return [{
      error: 'Invalid input',
      recommendation: 'Provide code to analyze'
    }, 0.05]; // Very low confidence for error cases
  }
  
  // Handle timeouts
  try {
    const result = await this.performAnalysisWithTimeout(data, 5000);
    return [result, result.confidence];
  } catch (error) {
    return [{
      error: 'Analysis timeout',
      partial_result: this.getPartialResult(),
      recommendation: 'Retry with smaller input'
    }, 0.3]; // Low confidence for partial results
  }
}
```

## Testing Your Agent

### Unit Tests

```typescript
describe('SecurityAgent', () => {
  let agent: SecurityAgent;
  
  beforeEach(() => {
    agent = new SecurityAgent();
  });
  
  it('should detect SQL injection with high confidence', async () => {
    const [result, confidence] = await agent.analyze('security check', {
      code: 'query = "SELECT * FROM users WHERE id = " + userId'
    });
    
    expect(result.severity).toBe('critical');
    expect(confidence).toBeGreaterThan(0.9);
  });
  
  it('should have low confidence for unknown patterns', async () => {
    const [result, confidence] = await agent.analyze('security check', {
      code: 'obscureFramework.doSomething()'
    });
    
    expect(confidence).toBeLessThan(0.5);
    expect(result.uncertainties).toContain('Unknown framework');
  });
});
```

### Integration Tests

```typescript
it('should work with coordinator', async () => {
  const coordinator = new ParallaxCoordinator();
  coordinator.registerAgent(agent);
  
  const results = await coordinator.analyzeWithAllAgents(
    'test task',
    { code: 'test code' }
  );
  
  expect(results).toHaveLength(1);
  expect(results[0].confidence).toBeDefined();
});
```

## Deployment

### Local Development

```bash
# Register your agent
parallax agent register ./my-agent.ts --name "My Agent"

# Test interactively
parallax agent test my-agent-id
```

### Production Deployment

1. **Containerize your agent**
2. **Implement gRPC service**
3. **Register with service discovery**
4. **Monitor confidence metrics**

## Common Pitfalls

1. **Overconfidence**: Don't return 1.0 unless absolutely certain
2. **Underconfidence**: Don't be too conservative
3. **Missing Uncertainties**: Always list what could affect results
4. **Ignoring Context**: Consider the task and data quality
5. **Binary Thinking**: Embrace the confidence spectrum
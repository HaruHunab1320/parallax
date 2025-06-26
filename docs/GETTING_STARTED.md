# Getting Started with Parallax

This guide will help you get up and running with Parallax in 5 minutes.

## Installation

### Prerequisites
- Node.js 18+ 
- pnpm 10.11.0+

### Clone and Install

```bash
git clone <repo-url> parallax
cd parallax
pnpm install
pnpm build
```

## Your First Agent

Let's create a simple weather analysis agent:

```typescript
// weather-agent.ts
import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';

class WeatherAgent extends ParallaxAgent {
  constructor() {
    super(
      'weather-1',
      'Weather Analyzer',
      ['analysis', 'weather', 'forecast']
    );
  }

  async analyze(task: string, data?: any): Promise<[any, number]> {
    // Simple weather analysis
    const temp = data?.temperature || 20;
    let conditions = 'mild';
    let confidence = 0.8;
    
    if (temp > 30) {
      conditions = 'hot';
      confidence = 0.95;
    } else if (temp < 10) {
      conditions = 'cold';
      confidence = 0.95;
    } else if (temp < 0) {
      conditions = 'freezing';
      confidence = 1.0;
    }
    
    return [{
      temperature: temp,
      conditions,
      recommendation: `It's ${conditions} outside!`
    }, confidence];
  }
}

// Start the agent
serveAgent(new WeatherAgent()).then(port => {
  console.log(`Weather agent running on port ${port}`);
});
```

## Running Your Agent

```bash
# Terminal 1: Run your agent
tsx weather-agent.ts

# Terminal 2: Start Parallax with your agent
PARALLAX_LOCAL_AGENTS="weather-1:Weather Analyzer:localhost:50051:analysis,weather,forecast" \
pnpm --filter @parallax/control-plane dev
```

## Using a Pattern

Patterns coordinate multiple agents. Let's use the consensus builder:

```javascript
// In the control plane REPL or API
const result = await patternEngine.executePattern('consensus-builder', {
  task: 'Analyze weather conditions',
  data: { temperature: 25 }
});

console.log(result);
// Output includes consensus from all weather agents
```

## Understanding Confidence

Every agent returns a confidence score (0.0 to 1.0):
- **1.0**: Absolute certainty (rare!)
- **0.8-0.9**: High confidence
- **0.5-0.7**: Moderate confidence
- **< 0.5**: Low confidence (triggers special handling)

Patterns use these scores to make decisions:

```prism
// From uncertainty-router.prism
uncertain if (analysisConfidence < 0.5) {
  high {
    // Very uncertain - escalate to human
    result = { action: "escalate_to_human" }
  }
  medium {
    // Somewhat uncertain - try specialists
    result = routeToSpecialist(task)
  }
  low {
    // Confident enough - proceed
    result = continueWithAnalysis()
  }
}
```

## Next Steps

### 1. Explore Example Agents
Check out `/examples/standalone-agent/` for:
- Sentiment analysis agent
- Math computation agent

### 2. Try Different Patterns
Each pattern has different coordination strategies:
- **consensus-builder**: Get agreement from multiple agents
- **confidence-cascade**: Keep trying until confident
- **parallel-exploration**: Explore multiple approaches

### 3. Build Complex Agents
Agents can:
- Call external APIs
- Use ML models
- Access databases
- Implement any business logic

### 4. Create Custom Patterns
Write your own coordination patterns in Prism:
```prism
// my-pattern.prism
agents = parallax.agents.filter(/* your criteria */)
results = parallel(/* your logic */)
// Always return with confidence
finalResult ~> confidence
```

## Common Patterns

### High-Confidence Decision
```typescript
async analyze(task: string, data?: any): Promise<[any, number]> {
  if (data.source === 'trusted') {
    return [{ decision: 'approved' }, 0.95];
  }
  return [{ decision: 'needs_review' }, 0.6];
}
```

### Uncertainty Propagation
```typescript
async analyze(task: string, data?: any): Promise<[any, number]> {
  const [mlResult, mlConfidence] = await this.mlModel.predict(data);
  const [rulesResult, rulesConfidence] = await this.checkRules(data);
  
  // Combine with lower confidence
  const combined = mergResults(mlResult, rulesResult);
  const confidence = Math.min(mlConfidence, rulesConfidence) * 0.9;
  
  return [combined, confidence];
}
```

### Expressing Uncertainty
```typescript
return [{
  result: prediction,
  reasoning: 'Based on historical data',
  uncertainties: [
    'Limited training data for this scenario',
    'External factors not considered'
  ]
}, 0.7];
```

## Troubleshooting

### Agent Not Found
Ensure your agent is in `PARALLAX_LOCAL_AGENTS`:
```bash
PARALLAX_LOCAL_AGENTS="id:name:host:port:cap1,cap2"
```

### Low Confidence Results
- Check agent logs for errors
- Verify input data format
- Ensure agents have required capabilities

### Pattern Execution Fails
- Verify pattern has enough agents (check minAgents)
- Check agent health with health endpoint
- Review pattern requirements

## Learn More

- [System Architecture](SYSTEM_ARCHITECTURE.md)
- [Pattern Guide](../patterns/README.md)
- [API Reference](API_REFERENCE.md) (coming soon)
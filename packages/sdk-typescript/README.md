# @parallax/sdk-typescript

TypeScript SDK for building agents that integrate with the Parallax AI orchestration platform.

## Overview

The TypeScript SDK provides:
- Base classes for creating agents
- Built-in confidence tracking
- gRPC server implementation
- Type-safe interfaces for Parallax communication
- Utilities for testing agents

## Installation

```bash
npm install @parallax/sdk-typescript
# or
yarn add @parallax/sdk-typescript
# or
pnpm add @parallax/sdk-typescript
```

## Quick Start

### Basic Agent

```typescript
import { ParallaxAgent } from '@parallax/sdk-typescript';

class WeatherAgent extends ParallaxAgent {
  name = 'weather-agent';
  capabilities = ['weather', 'forecast'];

  async analyze(task: string, data: any) {
    // Your agent logic here
    const forecast = await this.getForecast(data.location);
    
    return {
      value: forecast,
      confidence: this.calculateConfidence(forecast),
      reasoning: 'Based on current conditions and models'
    };
  }

  private calculateConfidence(forecast: any): number {
    // Confidence calculation logic
    return forecast.accuracy * 0.9;
  }
}

// Start the agent
const agent = new WeatherAgent();
agent.start(8001);
```

### Advanced Agent with Metadata

```typescript
import { ParallaxAgent } from '@parallax/sdk-typescript';

class AnalyticsAgent extends ParallaxAgent {
  name = 'analytics-agent';
  capabilities = ['data-analysis', 'statistics', 'ml-prediction'];
  
  async analyze(task: string, data: any) {
    const startTime = Date.now();
    
    // Complex analysis
    const analysis = await this.performAnalysis(data);
    const confidence = this.assessConfidence(analysis);
    
    return {
      value: analysis,
      confidence,
      reasoning: this.explainAnalysis(analysis),
      metadata: {
        processingTime: Date.now() - startTime,
        dataPoints: analysis.dataPoints,
        algorithm: 'random-forest'
      }
    };
  }
}
```

### Secure Agent (Enterprise)

```typescript
import { SecureParallaxAgent } from '@parallax/sdk-typescript';

class SecureDataAgent extends SecureParallaxAgent {
  name = 'secure-data-agent';
  capabilities = ['sensitive-data', 'compliance'];
  
  constructor() {
    super({
      tlsCert: process.env.TLS_CERT_PATH,
      tlsKey: process.env.TLS_KEY_PATH,
      tlsCa: process.env.TLS_CA_PATH
    });
  }
  
  async analyze(task: string, data: any) {
    // Handles mTLS automatically
    return this.processSecureData(data);
  }
}
```

## API Reference

### ParallaxAgent

Base class for all agents.

```typescript
abstract class ParallaxAgent {
  abstract name: string;
  abstract capabilities: string[];
  abstract analyze(task: string, data: any): Promise<ConfidenceResult>;
  
  start(port: number): Promise<void>;
  stop(): Promise<void>;
  health(): HealthStatus;
}
```

### Agent Response Format

Agents should return responses in this format:

```typescript
interface AgentResponse {
  value: any;           // The actual result
  confidence: number;   // 0.0 to 1.0
  reasoning?: string;   // Explanation of the result
  uncertainties?: string[];  // Any uncertainties
  metadata?: Record<string, any>;  // Additional metadata
}
```

```typescript
async analyze(task: string, data: any) {
  return {
    value: result,
    metadata: { customField: 'value' }
  };
}
```

### Types

```typescript
interface ConfidenceResult {
  value: any;
  confidence: number;
  reasoning?: string;
  metadata?: Record<string, any>;
  timestamp?: number;
  confidence_factors?: Record<string, number>;
}

interface AgentCapabilities {
  name: string;
  version: string;
  capabilities: string[];
  supportedTasks?: string[];
  metadata?: Record<string, any>;
}

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  uptime: number;
  lastCheck: Date;
  details?: Record<string, any>;
}
```

## Testing

```typescript
import { TestHarness } from '@parallax/sdk-typescript/testing';

describe('WeatherAgent', () => {
  const harness = new TestHarness();
  
  beforeEach(() => {
    harness.reset();
  });
  
  it('should return weather with high confidence', async () => {
    const agent = new WeatherAgent();
    const result = await harness.test(agent, {
      task: 'forecast',
      data: { location: 'San Francisco' }
    });
    
    expect(result.confidence).toBeGreaterThan(0.7);
    expect(result.value).toHaveProperty('temperature');
  });
});
```

## Configuration

### Environment Variables

```bash
# Agent configuration
PARALLAX_AGENT_PORT=8001
PARALLAX_AGENT_NAME=my-agent
PARALLAX_LOG_LEVEL=info

# Control plane connection
PARALLAX_CONTROL_PLANE_URL=localhost:50051
PARALLAX_REGISTRY_URL=localhost:2379

# Security (Enterprise)
PARALLAX_TLS_CERT=/path/to/cert.pem
PARALLAX_TLS_KEY=/path/to/key.pem
PARALLAX_TLS_CA=/path/to/ca.pem
```

### Programmatic Configuration

```typescript
const agent = new MyAgent({
  port: 8001,
  controlPlane: 'control-plane:50051',
  logger: customLogger,
  metrics: prometheusRegistry
});
```

## Best Practices

1. **Confidence Calculation**: Base confidence on measurable factors
2. **Error Handling**: Always return low confidence instead of throwing
3. **Health Checks**: Implement meaningful health checks
4. **Resource Management**: Clean up resources in agent lifecycle
5. **Logging**: Use structured logging for debugging

## Examples

See `/examples` directory for:
- Basic agents in different domains
- Confidence calculation strategies
- Integration with external services
- Testing patterns
- Performance optimization

## Troubleshooting

### Agent not registering
- Check control plane connectivity
- Verify agent name is unique
- Check logs for gRPC errors

### Low confidence scores
- Review confidence calculation logic
- Check data quality indicators
- Monitor confidence factors

### Performance issues
- Implement result caching if needed
- Review async operation efficiency
- Check resource utilization
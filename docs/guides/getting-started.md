# Getting Started with Parallax

Welcome to Parallax, the AI orchestration platform that treats uncertainty as a first-class citizen.

## Installation

### Prerequisites

- Node.js >= 18
- pnpm >= 10.11.0
- Docker (optional, for running etcd and InfluxDB)

### Clone and Install

```bash
git clone https://github.com/your-org/parallax.git
cd parallax
pnpm install
```

### Build All Packages

```bash
pnpm build
```

## Quick Start

### 1. Start the Platform

```bash
# Start all services locally
pnpm --filter @parallax/cli dev start

# Or if you've installed the CLI globally
parallax start
```

### 2. Create Your First Agent

Create a file `security-agent.ts`:

```typescript
import { ParallaxAgent, withConfidence } from '@parallax/typescript';

export class SecurityAgent extends ParallaxAgent {
  constructor() {
    super('security-1', 'Security Scanner', ['security', 'code-analysis']);
  }

  @withConfidence()
  async analyze(task: string, data?: any) {
    // Analyze code for security issues
    const hasIssues = data?.code?.includes('eval(');
    
    if (hasIssues) {
      return ['Security vulnerability detected', 0.95];
    }
    
    return ['Code appears secure', 0.7];
  }
}
```

### 3. Register Your Agent

```bash
parallax agent register ./security-agent.ts --name "Security Scanner"
```

### 4. Run a Pattern

```bash
# Run consensus pattern with your agent
parallax run consensus-builder --input '{"task": "Analyze this code", "code": "eval(userInput)"}'
```

## Core Concepts

### Agents Publish Confidence

Every agent result includes a confidence score (0.0-1.0):

```typescript
return {
  recommendation: 'Fix SQL injection',
  confidence: 0.95,  // High confidence
  reasoning: 'Direct string concatenation in query'
};
```

### High-Confidence Disagreements

When experts disagree with high confidence, Parallax identifies this as valuable:

```
Security Agent: "This code is vulnerable" (confidence: 0.92)
Performance Agent: "This code is optimal" (confidence: 0.88)

Result: Explore both security hardening AND performance optimization paths
```

### Uncertainty-Aware Patterns

Patterns use Prism's `uncertain if` to handle different confidence levels:

```prism
uncertain if (assessmentConfidence < 0.6) {
  high { 
    // Very uncertain - use specialist agents
    specialists = agents.filter(a => a.expertise > 0.9)
  }
  medium {
    // Moderately uncertain - standard approach
    result = bestGeneralist.analyze(task)
  }
  low {
    // Cannot assess - escalate to human
    escalateToHuman(task)
  }
}
```

## Next Steps

- [Create Custom Agents](./creating-agents.md)
- [Write Coordination Patterns](./writing-patterns.md)
- [Deploy to Production](./production-deployment.md)
- [Monitor with Confidence Tracking](./monitoring.md)
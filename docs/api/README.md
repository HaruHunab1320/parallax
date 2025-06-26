# Parallax API Reference

## Overview

Parallax provides multiple APIs for different interaction patterns:

1. **gRPC APIs** - For high-performance agent communication
2. **TypeScript/JavaScript SDK** - For building agents and applications
3. **REST API** - For web applications and monitoring
4. **CLI** - For development and operations

## gRPC APIs

### ConfidenceAgent Service

The core service that all agents must implement:

```protobuf
service ConfidenceAgent {
  rpc Analyze(AgentRequest) returns (ConfidenceResult);
  rpc GetCapabilities(Empty) returns (Capabilities);
  rpc HealthCheck(Empty) returns (Health);
  rpc StreamAnalyze(AgentRequest) returns (stream ConfidenceResult);
}
```

#### AgentRequest

| Field | Type | Description |
|-------|------|-------------|
| task_id | string | Unique identifier for the task |
| task_description | string | Human-readable description |
| data | google.protobuf.Struct | Input data as JSON |
| context | map<string, string> | Additional context |
| timeout_ms | int32 | Timeout in milliseconds |

#### ConfidenceResult

| Field | Type | Description |
|-------|------|-------------|
| value_json | string | JSON-encoded result |
| confidence | double | Confidence level (0.0-1.0) |
| agent_id | string | ID of the agent |
| timestamp | Timestamp | When produced |
| uncertainties | repeated string | List of caveats |
| reasoning | string | Explanation |

### Registry Service

For agent registration and discovery:

```protobuf
service Registry {
  rpc Register(RegisterRequest) returns (RegisterResponse);
  rpc Unregister(AgentRegistration) returns (RegisterResponse);
  rpc ListAgents(ListAgentsRequest) returns (ListAgentsResponse);
  rpc Watch(WatchRequest) returns (stream WatchEvent);
}
```

## TypeScript SDK

### Creating an Agent

```typescript
import { ParallaxAgent, withConfidence } from '@parallax/typescript';

class MyAgent extends ParallaxAgent {
  constructor() {
    super('agent-id', 'Agent Name', ['capability1', 'capability2']);
  }

  @withConfidence()
  async analyze(task: string, data?: any): Promise<[any, number]> {
    const result = await this.doAnalysis(data);
    const confidence = this.calculateConfidence(result);
    return [result, confidence];
  }
}
```

### Using the Coordinator

```typescript
import { ParallaxCoordinator } from '@parallax/runtime';

const coordinator = new ParallaxCoordinator();

// Register agents
coordinator.registerAgent(myAgent);

// Execute pattern
const result = await coordinator.coordinate(
  'consensus-builder',
  'Analyze this task',
  { data: 'input' }
);
```

### Confidence Utilities

```typescript
import { 
  combineConfidence,
  isHighConfidence,
  getConfidenceLevel 
} from '@parallax/runtime';

// Combine multiple confidences
const combined = combineConfidence([0.8, 0.9, 0.85]); // 0.85

// Check confidence levels
if (isHighConfidence(result.confidence)) {
  // confidence >= 0.8
}

// Get confidence category
const level = getConfidenceLevel(0.6); // 'medium'
```

## REST API

### Endpoints

#### GET /api/agents
List all registered agents

```json
{
  "agents": [
    {
      "id": "security-1",
      "name": "Security Scanner",
      "capabilities": ["security", "code-analysis"],
      "status": "online",
      "endpoint": "grpc://security-agent:50051"
    }
  ]
}
```

#### POST /api/execute
Execute a coordination pattern

Request:
```json
{
  "pattern": "consensus-builder",
  "input": {
    "task": "Analyze code",
    "data": "..."
  },
  "options": {
    "minConfidence": 0.7,
    "timeout": 30000
  }
}
```

Response:
```json
{
  "executionId": "exec-123",
  "status": "success",
  "result": {
    "consensus": 0.85,
    "recommendation": "...",
    "agentResults": [...]
  },
  "metrics": {
    "duration": 2340,
    "agentsUsed": 3
  }
}
```

#### GET /api/confidence/:agentId
Get confidence metrics for an agent

```json
{
  "agentId": "security-1",
  "metrics": {
    "averageConfidence": 0.87,
    "trend": "stable",
    "dataPoints": 1000,
    "timeRange": {
      "start": "2024-01-20T00:00:00Z",
      "end": "2024-01-26T23:59:59Z"
    }
  }
}
```

## Pattern Execution

### Prism Pattern Structure

```prism
/**
 * @name PatternName
 * @version 1.0.0
 * @description Pattern description
 * @input {"type": "object", "properties": {...}}
 * @agents {"capabilities": ["required"], "minAgents": 3}
 */

// Pattern implementation
agents = parallax.agents.filter(...)
results = parallel(agents.map(...))
// Return with confidence
result ~> confidence
```

### Pattern Context

Patterns have access to:
- `parallax.agents` - Available agents
- `input` - Input data from request
- `parallel()` - Parallel execution
- `~` operator - Confidence extraction
- `~>` operator - Return with confidence

## Error Handling

All APIs use standard error codes:

| Code | Description |
|------|-------------|
| INVALID_ARGUMENT | Invalid input |
| NOT_FOUND | Agent/pattern not found |
| DEADLINE_EXCEEDED | Timeout |
| UNAVAILABLE | Service unavailable |
| INTERNAL | Internal error |

Example error response:
```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "Agent security-1 not found",
    "details": {...}
  }
}
```
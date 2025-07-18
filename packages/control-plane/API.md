# Parallax Control Plane HTTP API

The Control Plane provides a RESTful HTTP API for managing patterns, agents, and executions.

## Base URL

- Development: `http://localhost:3000`
- Production: Configure via `PARALLAX_API_URL` environment variable

## Authentication

Currently no authentication is required for development. Enterprise deployments will use API key authentication via the `X-API-Key` header.

## Endpoints

### Health & Monitoring

#### GET /health
Health check endpoint for the control plane.

**Response:**
```json
{
  "status": "healthy",
  "checks": {
    "patterns": "healthy",
    "runtime": "healthy",
    "registry": "healthy"
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### GET /metrics
Prometheus-compatible metrics endpoint.

**Response:** Prometheus text format

### Pattern Management

#### GET /api/patterns
List all available patterns.

**Response:**
```json
{
  "patterns": [
    {
      "name": "consensus-builder",
      "version": "1.0.0",
      "description": "Build weighted consensus from multiple agents",
      "minAgents": 3,
      "maxAgents": 10,
      "metadata": {}
    }
  ]
}
```

#### GET /api/patterns/:name
Get detailed information about a specific pattern.

**Parameters:**
- `name` - Pattern name

**Response:**
```json
{
  "name": "consensus-builder",
  "version": "1.0.0",
  "description": "Build weighted consensus from multiple agents",
  "minAgents": 3,
  "maxAgents": 10,
  "input": {
    "type": "object",
    "required": true
  },
  "agents": {
    "capabilities": ["analysis"],
    "minConfidence": 0.5
  },
  "metadata": {},
  "script": "// Prism pattern code..."
}
```

#### POST /api/patterns/:name/validate
Validate input against pattern requirements.

**Parameters:**
- `name` - Pattern name

**Request Body:**
```json
{
  "task": "Analyze this data",
  "data": {}
}
```

**Response:**
```json
{
  "valid": true,
  "errors": []
}
```

#### POST /api/patterns/:name/execute
Execute a pattern with the provided input.

**Parameters:**
- `name` - Pattern name
- `timeout` (query) - Execution timeout in milliseconds

**Request Body:**
```json
{
  "task": "Analyze market trends",
  "data": {
    "market": "crypto",
    "timeframe": "1d"
  }
}
```

**Response:**
```json
{
  "execution": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "patternName": "consensus-builder",
    "status": "completed",
    "startTime": "2024-01-15T10:30:00Z",
    "endTime": "2024-01-15T10:30:05Z",
    "confidence": 0.85,
    "result": {
      "value": "Market shows bullish trend",
      "consensus": true
    },
    "metrics": {
      "agentsUsed": 5,
      "executionTime": 5000
    }
  }
}
```

### Agent Management

#### GET /api/agents
List all registered agents.

**Response:**
```json
{
  "agents": [
    {
      "id": "agent-1",
      "name": "market-analyzer",
      "endpoint": "localhost:8001",
      "status": "healthy",
      "capabilities": ["market-analysis", "prediction"],
      "lastSeen": "2024-01-15T10:30:00Z"
    }
  ],
  "count": 1,
  "byCapability": {
    "market-analysis": [/* agents */],
    "prediction": [/* agents */]
  },
  "timestamp": "2024-01-15T10:30:00Z"
}
```

#### GET /api/agents/:id
Get detailed information about a specific agent.

**Response:**
```json
{
  "id": "agent-1",
  "name": "market-analyzer",
  "endpoint": "localhost:8001",
  "capabilities": ["market-analysis", "prediction"],
  "expertise": {
    "crypto": 0.9,
    "stocks": 0.7
  },
  "status": "healthy",
  "lastSeen": "2024-01-15T10:30:00Z",
  "metadata": {}
}
```

#### GET /api/agents/:id/health
Check agent health status.

**Response:**
```json
{
  "agentId": "agent-1",
  "status": "healthy",
  "uptime": 3600000,
  "lastCheck": "2024-01-15T10:30:00Z",
  "details": {}
}
```

#### POST /api/agents/:id/test
Test an agent with sample input.

**Request Body:**
```json
{
  "task": "test",
  "data": {
    "sample": "data"
  }
}
```

**Response:**
```json
{
  "agentId": "agent-1",
  "task": "test",
  "result": {
    "value": "Test successful",
    "confidence": 0.95,
    "reasoning": "Agent responded correctly"
  },
  "duration": 150,
  "success": true
}
```

### Execution Management

#### GET /api/executions
List pattern executions.

**Query Parameters:**
- `limit` - Number of results (default: 100)
- `offset` - Pagination offset (default: 0)
- `status` - Filter by status (pending, running, completed, failed, cancelled)

**Response:**
```json
{
  "executions": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "patternName": "consensus-builder",
      "status": "completed",
      "startTime": "2024-01-15T10:30:00Z",
      "endTime": "2024-01-15T10:30:05Z",
      "confidence": 0.85
    }
  ],
  "total": 150,
  "limit": 100,
  "offset": 0,
  "hasMore": true
}
```

#### POST /api/executions
Create a new pattern execution.

**Request Body:**
```json
{
  "patternName": "consensus-builder",
  "input": {
    "task": "Analyze data",
    "data": {}
  },
  "options": {
    "timeout": 30000,
    "stream": true
  }
}
```

**Response (202 Accepted):**
```json
{
  "executionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Execution started",
  "links": {
    "self": "/api/executions/550e8400-e29b-41d4-a716-446655440000",
    "stream": "/api/executions/550e8400-e29b-41d4-a716-446655440000/stream"
  }
}
```

#### GET /api/executions/:id
Get execution details.

**Response:**
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "patternName": "consensus-builder",
  "status": "completed",
  "startTime": "2024-01-15T10:30:00Z",
  "endTime": "2024-01-15T10:30:05Z",
  "result": {},
  "error": null,
  "confidence": 0.85,
  "metrics": {},
  "warnings": []
}
```

#### POST /api/executions/:id/cancel
Cancel a running execution.

**Response:**
```json
{
  "message": "Execution cancelled",
  "executionId": "550e8400-e29b-41d4-a716-446655440000"
}
```

#### POST /api/executions/:id/retry
Retry a failed execution.

**Response:**
```json
{
  "executionId": "new-execution-id",
  "originalExecutionId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending",
  "message": "Retry started"
}
```

## WebSocket Support

### Execution Streaming

Connect to `ws://localhost:3000/api/executions/stream?executionId={id}` to receive real-time updates for an execution.

**Message Types:**

Initial state:
```json
{
  "type": "initial",
  "execution": { /* full execution object */ }
}
```

Status update:
```json
{
  "type": "status",
  "status": "running",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

Completion:
```json
{
  "type": "complete",
  "execution": { /* final execution object */ }
}
```

Error:
```json
{
  "type": "error",
  "error": "Execution failed",
  "timestamp": "2024-01-15T10:30:00Z"
}
```

## Error Responses

All endpoints return standard error responses:

```json
{
  "error": "Error message",
  "details": { /* optional additional context */ }
}
```

Common HTTP status codes:
- `200` - Success
- `202` - Accepted (async operation started)
- `400` - Bad request
- `404` - Resource not found
- `500` - Internal server error
- `503` - Service unavailable
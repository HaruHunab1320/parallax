---
sidebar_position: 1
title: Control Plane API
---

# Control Plane API

REST API reference for the Parallax control plane.

## Base URL

```
https://your-control-plane.example.com/api
```

Local development:
```
http://localhost:8080/api
```

## Authentication

### API Key

Include in the `Authorization` header:

```bash
curl -H "Authorization: Bearer pk_live_abc123" \
  https://parallax.example.com/api/patterns
```

### JWT Token

```bash
curl -H "Authorization: Bearer eyJhbGciOiJSUzI1NiIs..." \
  https://parallax.example.com/api/patterns
```

## Patterns

### List Patterns

```http
GET /api/patterns
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | number | Max results (default: 20, max: 100) |
| `offset` | number | Pagination offset |
| `search` | string | Search by name or description |

**Response:**

```json
{
  "patterns": [
    {
      "name": "content-classifier",
      "version": "1.0.0",
      "description": "Classify content using multi-agent voting",
      "createdAt": "2024-01-15T10:30:00Z",
      "updatedAt": "2024-01-15T10:30:00Z"
    }
  ],
  "total": 42,
  "limit": 20,
  "offset": 0
}
```

### Get Pattern

```http
GET /api/patterns/{name}
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `version` | string | Specific version (default: latest) |

**Response:**

```json
{
  "name": "content-classifier",
  "version": "1.0.0",
  "description": "Classify content using multi-agent voting",
  "definition": {
    "input": {
      "content": {
        "type": "string",
        "required": true
      }
    },
    "agents": {
      "capabilities": ["classification"],
      "min": 3
    },
    "aggregation": {
      "strategy": "voting",
      "method": "majority"
    },
    "output": {
      "category": "$vote.result",
      "confidence": "$vote.confidence"
    }
  },
  "createdAt": "2024-01-15T10:30:00Z",
  "createdBy": "alice@example.com"
}
```

### Create Pattern

```http
POST /api/patterns
```

**Request Body:**

```json
{
  "name": "content-classifier",
  "version": "1.0.0",
  "description": "Classify content using multi-agent voting",
  "definition": "name: content-classifier\nversion: 1.0.0\n..."
}
```

Or with YAML directly:

```http
POST /api/patterns
Content-Type: application/x-yaml

name: content-classifier
version: 1.0.0
...
```

**Response:**

```json
{
  "name": "content-classifier",
  "version": "1.0.0",
  "created": true
}
```

### Update Pattern

```http
PUT /api/patterns/{name}
```

Creates a new version if version is different.

**Request Body:**

```json
{
  "version": "1.1.0",
  "description": "Updated classifier",
  "definition": "..."
}
```

### Delete Pattern

```http
DELETE /api/patterns/{name}
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `version` | string | Delete specific version (default: all) |

**Response:**

```json
{
  "deleted": true,
  "versionsRemoved": 3
}
```

### List Pattern Versions

```http
GET /api/patterns/{name}/versions
```

**Response:**

```json
{
  "versions": [
    {
      "version": "1.0.0",
      "createdAt": "2024-01-10T10:00:00Z"
    },
    {
      "version": "1.1.0",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

## Executions

### Execute Pattern

```http
POST /api/patterns/{name}/execute
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `version` | string | Pattern version (default: latest) |
| `async` | boolean | Return immediately with execution ID |

**Request Body:**

```json
{
  "input": {
    "content": "Document to classify"
  },
  "options": {
    "timeout": 30000,
    "priority": "high",
    "metadata": {
      "requestId": "req_123"
    }
  }
}
```

**Synchronous Response:**

```json
{
  "executionId": "exec_abc123",
  "status": "completed",
  "result": {
    "category": "technology",
    "confidence": 0.92
  },
  "duration": 2340,
  "agents": [
    {
      "id": "agent_1",
      "result": {"category": "technology", "confidence": 0.95}
    },
    {
      "id": "agent_2",
      "result": {"category": "technology", "confidence": 0.88}
    },
    {
      "id": "agent_3",
      "result": {"category": "technology", "confidence": 0.93}
    }
  ]
}
```

**Async Response:**

```json
{
  "executionId": "exec_abc123",
  "status": "pending",
  "statusUrl": "/api/executions/exec_abc123"
}
```

### Execute with Streaming

```http
POST /api/patterns/{name}/execute/stream
```

Returns Server-Sent Events:

```
event: started
data: {"executionId": "exec_abc123", "status": "running"}

event: agent_result
data: {"agentId": "agent_1", "result": {"category": "technology"}}

event: agent_result
data: {"agentId": "agent_2", "result": {"category": "technology"}}

event: completed
data: {"status": "completed", "result": {"category": "technology", "confidence": 0.92}}
```

### Get Execution

```http
GET /api/executions/{executionId}
```

**Response:**

```json
{
  "executionId": "exec_abc123",
  "pattern": {
    "name": "content-classifier",
    "version": "1.0.0"
  },
  "status": "completed",
  "input": {
    "content": "Document to classify"
  },
  "result": {
    "category": "technology",
    "confidence": 0.92
  },
  "startedAt": "2024-01-15T10:30:00Z",
  "completedAt": "2024-01-15T10:30:02Z",
  "duration": 2340,
  "agents": [...]
}
```

### List Executions

```http
GET /api/executions
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `pattern` | string | Filter by pattern name |
| `status` | string | Filter by status |
| `since` | string | ISO timestamp |
| `until` | string | ISO timestamp |
| `limit` | number | Max results |
| `offset` | number | Pagination offset |

**Response:**

```json
{
  "executions": [
    {
      "executionId": "exec_abc123",
      "pattern": "content-classifier",
      "status": "completed",
      "startedAt": "2024-01-15T10:30:00Z",
      "duration": 2340
    }
  ],
  "total": 1234,
  "limit": 20,
  "offset": 0
}
```

### Cancel Execution

```http
POST /api/executions/{executionId}/cancel
```

**Response:**

```json
{
  "executionId": "exec_abc123",
  "status": "cancelled",
  "cancelledAt": "2024-01-15T10:30:05Z"
}
```

### Retry Execution

```http
POST /api/executions/{executionId}/retry
```

Creates a new execution with the same input.

**Response:**

```json
{
  "originalExecutionId": "exec_abc123",
  "newExecutionId": "exec_xyz789",
  "status": "pending"
}
```

## Agents

### List Agents

```http
GET /api/agents
```

**Query Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `status` | string | Filter: connected, disconnected |
| `capabilities` | string | Comma-separated capabilities |
| `region` | string | Filter by region |

**Response:**

```json
{
  "agents": [
    {
      "id": "agent_abc123",
      "name": "classification-agent-1",
      "status": "connected",
      "capabilities": ["classification", "analysis"],
      "region": "us-east-1",
      "connectedAt": "2024-01-15T08:00:00Z",
      "lastHeartbeat": "2024-01-15T10:30:00Z",
      "tasksCompleted": 1234,
      "metadata": {
        "model": "gpt-4",
        "version": "1.0.0"
      }
    }
  ],
  "total": 10,
  "connected": 9,
  "disconnected": 1
}
```

### Get Agent

```http
GET /api/agents/{agentId}
```

**Response:**

```json
{
  "id": "agent_abc123",
  "name": "classification-agent-1",
  "status": "connected",
  "capabilities": ["classification", "analysis"],
  "region": "us-east-1",
  "connectedAt": "2024-01-15T08:00:00Z",
  "lastHeartbeat": "2024-01-15T10:30:00Z",
  "statistics": {
    "tasksCompleted": 1234,
    "tasksSucceeded": 1200,
    "tasksFailed": 34,
    "averageLatency": 1500,
    "uptime": 86400
  },
  "metadata": {
    "model": "gpt-4",
    "version": "1.0.0"
  }
}
```

### Disconnect Agent

```http
POST /api/agents/{agentId}/disconnect
```

Gracefully disconnect an agent.

**Response:**

```json
{
  "id": "agent_abc123",
  "disconnected": true,
  "disconnectedAt": "2024-01-15T10:30:00Z"
}
```

## Health

### Health Check

```http
GET /api/health
```

**Response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400
}
```

### Detailed Health

```http
GET /api/health?detailed=true
```

**Response:**

```json
{
  "status": "healthy",
  "version": "1.0.0",
  "uptime": 86400,
  "components": {
    "database": "healthy",
    "redis": "healthy",
    "agents": {
      "connected": 10,
      "healthy": 10
    }
  },
  "metrics": {
    "executionsTotal": 12345,
    "executionsActive": 5,
    "avgExecutionTime": 2340
  }
}
```

### Readiness

```http
GET /api/health/ready
```

Returns 200 if ready to accept traffic, 503 if not.

### Liveness

```http
GET /api/health/live
```

Returns 200 if process is running, 503 if not.

## Metrics

### Prometheus Metrics

```http
GET /api/metrics
```

Returns Prometheus-formatted metrics:

```prometheus
# HELP parallax_executions_total Total executions
# TYPE parallax_executions_total counter
parallax_executions_total{pattern="content-classifier",status="completed"} 1234

# HELP parallax_execution_duration_seconds Execution duration
# TYPE parallax_execution_duration_seconds histogram
parallax_execution_duration_seconds_bucket{pattern="content-classifier",le="1"} 100
parallax_execution_duration_seconds_bucket{pattern="content-classifier",le="5"} 900
parallax_execution_duration_seconds_bucket{pattern="content-classifier",le="10"} 1200

# HELP parallax_agents_connected Connected agents
# TYPE parallax_agents_connected gauge
parallax_agents_connected{region="us-east-1"} 10
```

## Batch Operations

### Batch Execute

```http
POST /api/batch/execute
```

**Request Body:**

```json
{
  "pattern": "content-classifier",
  "inputs": [
    {"content": "Document 1"},
    {"content": "Document 2"},
    {"content": "Document 3"}
  ],
  "options": {
    "concurrency": 5,
    "stopOnError": false
  }
}
```

**Response:**

```json
{
  "batchId": "batch_abc123",
  "status": "running",
  "total": 3,
  "completed": 0,
  "failed": 0,
  "statusUrl": "/api/batch/batch_abc123"
}
```

### Get Batch Status

```http
GET /api/batch/{batchId}
```

**Response:**

```json
{
  "batchId": "batch_abc123",
  "status": "completed",
  "total": 3,
  "completed": 3,
  "failed": 0,
  "results": [
    {
      "index": 0,
      "executionId": "exec_1",
      "status": "completed",
      "result": {"category": "tech"}
    },
    {
      "index": 1,
      "executionId": "exec_2",
      "status": "completed",
      "result": {"category": "sports"}
    },
    {
      "index": 2,
      "executionId": "exec_3",
      "status": "completed",
      "result": {"category": "politics"}
    }
  ]
}
```

## Error Responses

### Error Format

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input: content is required",
    "details": {
      "field": "content",
      "reason": "required"
    }
  },
  "requestId": "req_abc123"
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `UNAUTHORIZED` | 401 | Missing or invalid authentication |
| `FORBIDDEN` | 403 | Insufficient permissions |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `TIMEOUT` | 408 | Request timeout |
| `RATE_LIMITED` | 429 | Too many requests |
| `NO_AGENTS` | 503 | No agents available |
| `INTERNAL_ERROR` | 500 | Server error |

## Rate Limits

Default limits:

| Endpoint | Limit |
|----------|-------|
| `POST /patterns/*/execute` | 100/minute |
| `GET /*` | 1000/minute |
| `POST /*` | 200/minute |

Rate limit headers:

```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705316400
```

## Pagination

List endpoints support pagination:

```http
GET /api/executions?limit=20&offset=40
```

Response includes pagination info:

```json
{
  "executions": [...],
  "total": 1234,
  "limit": 20,
  "offset": 40,
  "hasMore": true
}
```

## Webhooks

See [Webhooks](/api/webhooks) for event notifications.

## SDKs

- [TypeScript SDK](/sdk/typescript) - Official TypeScript client
- [Pattern SDK](/sdk/pattern-sdk) - Pattern building

## Next Steps

- [Agent Protocol](/api/agent-protocol) - WebSocket protocol
- [Webhooks](/api/webhooks) - Event notifications
- [TypeScript SDK](/sdk/typescript) - SDK reference

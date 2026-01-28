---
sidebar_position: 5
title: Executing Patterns
---

# Executing Patterns

This guide covers how to execute patterns using the Parallax client SDK.

## Basic Execution

```typescript
import { ParallaxClient } from '@parallax/sdk-typescript';

const client = new ParallaxClient({
  url: 'http://localhost:8080',
});

const result = await client.executePattern('sentiment-analysis', {
  text: 'This product exceeded my expectations!',
});

console.log(result);
// { sentiment: 'positive', confidence: 0.92 }
```

## Execution Options

### Timeout

```typescript
const result = await client.executePattern('analysis', input, {
  timeout: 60000,  // 60 second timeout
});
```

### Version Selection

```typescript
// Exact version
const result = await client.executePattern('analysis', input, {
  version: '2.1.0',
});

// Version range
const result = await client.executePattern('analysis', input, {
  version: '2.x',    // Any 2.x version
});

// Latest
const result = await client.executePattern('analysis', input, {
  version: 'latest',
});
```

### Priority

```typescript
const result = await client.executePattern('analysis', input, {
  priority: 'high',  // 'low', 'normal', 'high', 'critical'
});
```

### Metadata

```typescript
const result = await client.executePattern('analysis', input, {
  metadata: {
    userId: 'user-123',
    requestId: 'req-456',
    source: 'api',
  },
});
```

## Streaming Execution

For long-running patterns, stream results as they become available:

```typescript
const stream = client.streamPattern('research-pipeline', {
  query: 'quantum computing applications',
});

// Progress updates
stream.on('progress', (progress) => {
  console.log(`Step ${progress.step}: ${progress.message}`);
  console.log(`Progress: ${progress.percent}%`);
});

// Partial results
stream.on('partial', (data) => {
  console.log('Intermediate result:', data);
});

// Final result
stream.on('complete', (result) => {
  console.log('Final result:', result);
});

// Errors
stream.on('error', (error) => {
  console.error('Execution failed:', error);
});
```

### Stream Control

```typescript
const stream = client.streamPattern('analysis', input);

// Cancel execution
stream.cancel();

// Check status
console.log(stream.status);  // 'running', 'completed', 'cancelled', 'error'

// Wait for completion
const result = await stream.wait();
```

## Batch Execution

Execute a pattern with multiple inputs:

```typescript
const inputs = [
  { text: 'Great product!' },
  { text: 'Terrible experience.' },
  { text: 'It was okay.' },
];

const results = await client.executeBatch('sentiment-analysis', inputs, {
  concurrency: 5,      // Max concurrent executions
  stopOnError: false,  // Continue even if some fail
});

for (const result of results) {
  if (result.success) {
    console.log(result.output);
  } else {
    console.error(result.error);
  }
}
```

### Batch with Progress

```typescript
const batch = client.executeBatch('analysis', inputs);

batch.on('progress', (progress) => {
  console.log(`Completed ${progress.completed}/${progress.total}`);
});

batch.on('result', (index, result) => {
  console.log(`Input ${index}:`, result);
});

const results = await batch.wait();
```

## Async Execution

For patterns that take a long time, execute asynchronously:

```typescript
// Start execution without waiting
const execution = await client.executePatternAsync('long-analysis', input);

console.log('Execution started:', execution.id);

// Poll for status
const status = await client.getExecution(execution.id);
console.log('Status:', status.status);  // 'pending', 'running', 'completed', 'failed'

// Wait for completion later
const result = await client.waitForExecution(execution.id, {
  timeout: 300000,      // 5 minute timeout
  pollInterval: 5000,   // Check every 5 seconds
});
```

### Webhooks

Receive results via webhook:

```typescript
const execution = await client.executePatternAsync('analysis', input, {
  webhook: {
    url: 'https://your-server.com/webhook',
    headers: {
      'Authorization': 'Bearer your-token',
    },
    events: ['completed', 'failed'],  // Which events to send
  },
});
```

## Execution Management

### Get Execution Details

```typescript
const execution = await client.getExecution(executionId);

console.log({
  id: execution.id,
  pattern: execution.pattern,
  status: execution.status,
  progress: execution.progress,
  startedAt: execution.startedAt,
  completedAt: execution.completedAt,
  result: execution.result,
  error: execution.error,
});
```

### List Executions

```typescript
const executions = await client.listExecutions({
  pattern: 'sentiment-analysis',
  status: 'completed',
  from: new Date('2024-01-01'),
  to: new Date(),
  limit: 100,
  offset: 0,
});

for (const exec of executions.items) {
  console.log(`${exec.id}: ${exec.status}`);
}
```

### Cancel Execution

```typescript
await client.cancelExecution(executionId);
```

### Retry Failed Execution

```typescript
const newExecution = await client.retryExecution(executionId);
```

## Input Validation

The client validates inputs before sending:

```typescript
try {
  const result = await client.executePattern('sentiment-analysis', {
    // Missing required 'text' field
  });
} catch (error) {
  if (error instanceof ValidationError) {
    console.error('Invalid input:', error.errors);
    // [{ field: 'text', message: 'Required field missing' }]
  }
}
```

### Pre-validate Input

```typescript
const validation = await client.validateInput('sentiment-analysis', input);

if (!validation.valid) {
  console.error('Validation errors:', validation.errors);
} else {
  const result = await client.executePattern('sentiment-analysis', input);
}
```

## Error Handling

### Error Types

```typescript
import {
  ParallaxError,
  ValidationError,
  TimeoutError,
  PatternNotFoundError,
  ExecutionError,
  InsufficientAgentsError,
} from '@parallax/sdk-typescript';

try {
  const result = await client.executePattern('analysis', input);
} catch (error) {
  if (error instanceof ValidationError) {
    // Input validation failed
    console.error('Invalid input:', error.errors);
  } else if (error instanceof TimeoutError) {
    // Execution timed out
    console.error('Timed out after', error.timeout, 'ms');
  } else if (error instanceof PatternNotFoundError) {
    // Pattern doesn't exist
    console.error('Pattern not found:', error.patternName);
  } else if (error instanceof InsufficientAgentsError) {
    // Not enough agents available
    console.error('Need', error.required, 'agents, only', error.available, 'available');
  } else if (error instanceof ExecutionError) {
    // Execution failed
    console.error('Execution failed:', error.reason);
    console.error('Partial results:', error.partialResults);
  }
}
```

### Retry Logic

```typescript
const result = await client.executePattern('analysis', input, {
  retries: 3,                    // Number of retries
  retryDelay: 1000,              // Initial delay (ms)
  retryBackoff: 'exponential',   // 'fixed', 'linear', 'exponential'
  retryOn: ['timeout', 'connection'],  // Which errors to retry
});
```

### Custom Retry Logic

```typescript
import { retry } from '@parallax/sdk-typescript';

const result = await retry(
  () => client.executePattern('analysis', input),
  {
    maxAttempts: 3,
    shouldRetry: (error, attempt) => {
      // Custom retry logic
      if (error instanceof ValidationError) return false;
      if (attempt >= 3) return false;
      return true;
    },
    onRetry: (error, attempt) => {
      console.log(`Retry ${attempt} after error:`, error.message);
    },
  }
);
```

## Type Safety

### Typed Patterns

```typescript
interface SentimentInput {
  text: string;
  language?: string;
}

interface SentimentOutput {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
}

const result = await client.executePattern<SentimentInput, SentimentOutput>(
  'sentiment-analysis',
  { text: 'Great product!' }
);

// result is typed as SentimentOutput
console.log(result.sentiment);
```

### Generate Types from Pattern

```typescript
import { generateTypes } from '@parallax/pattern-sdk';

// Generate TypeScript types from pattern YAML
const types = generateTypes(patternYaml);
// export interface SentimentAnalysisInput { text: string; language?: string; }
// export interface SentimentAnalysisOutput { sentiment: string; confidence: number; }
```

## Execution Context

### Request Tracing

```typescript
const result = await client.executePattern('analysis', input, {
  traceId: 'trace-123',           // For distributed tracing
  spanId: 'span-456',
  baggage: {
    userId: 'user-789',
  },
});
```

### Request Context

```typescript
// Set default context for all requests
client.setContext({
  tenantId: 'tenant-abc',
  environment: 'production',
});

// Context is included in all executions
const result = await client.executePattern('analysis', input);
```

## Performance

### Connection Pooling

```typescript
const client = new ParallaxClient({
  url: 'http://localhost:8080',
  pool: {
    maxConnections: 10,
    minConnections: 2,
    idleTimeout: 30000,
  },
});
```

### Caching

```typescript
const result = await client.executePattern('analysis', input, {
  cache: {
    enabled: true,
    ttl: 3600,            // Cache for 1 hour
    key: 'custom-key',    // Optional custom cache key
  },
});
```

### Local Execution

For patterns that can run locally:

```typescript
import { LocalExecutor } from '@parallax/sdk-typescript';

const executor = new LocalExecutor({
  patterns: ['./patterns'],
  agents: [localAgent1, localAgent2],
});

// Execute without network round-trip
const result = await executor.execute('simple-pattern', input);
```

## Monitoring

### Execution Metrics

```typescript
const result = await client.executePattern('analysis', input);

// Access execution metrics
console.log(result.$metadata);
// {
//   executionId: 'exec-123',
//   duration: 1500,
//   agentCount: 3,
//   retries: 0,
//   confidence: 0.92,
// }
```

### Client Metrics

```typescript
const metrics = client.getMetrics();
// {
//   totalExecutions: 1000,
//   successRate: 0.98,
//   avgLatency: 250,
//   p95Latency: 500,
// }
```

## Next Steps

- [Patterns Concept](/docs/concepts/patterns) - Understanding patterns
- [Streaming](/docs/patterns/advanced-composition) - Advanced streaming patterns
- [TypeScript SDK](/docs/sdk/typescript) - Full SDK reference

---
sidebar_position: 2
title: TypeScript SDK
---

# TypeScript SDK

The TypeScript SDK provides everything you need to build agents and interact with the Parallax control plane.

## Installation

```bash
npm install @parallax/sdk-typescript
```

## ParallaxAgent

The `ParallaxAgent` class is used to build agents that connect to the control plane and handle tasks.

### Basic Usage

```typescript
import { ParallaxAgent } from '@parallax/sdk-typescript';

const agent = new ParallaxAgent({
  name: 'my-agent',
  capabilities: ['text-analysis', 'summarization'],
  controlPlaneUrl: 'http://localhost:8080',
});

agent.onTask(async (task) => {
  const result = await processTask(task.input);
  return {
    result,
    confidence: 0.85,
  };
});

await agent.start();
```

### Configuration Options

```typescript
interface AgentConfig {
  // Required
  name: string;                      // Unique agent identifier
  capabilities: string[];            // What this agent can do

  // Connection
  controlPlaneUrl?: string;          // Control plane URL (default: env var)
  reconnectInterval?: number;        // MS between reconnect attempts (default: 5000)
  heartbeatInterval?: number;        // MS between heartbeats (default: 30000)
  connectionTimeout?: number;        // MS to wait for connection (default: 10000)

  // Execution
  maxConcurrentTasks?: number;       // Parallel task limit (default: 1)
  taskTimeout?: number;              // MS before task times out (default: 60000)

  // Metadata
  metadata?: Record<string, any>;    // Custom metadata
  tags?: string[];                   // Agent tags for filtering
}
```

### Task Handlers

Register handlers for specific capabilities:

```typescript
// Single handler for all tasks
agent.onTask(async (task) => {
  return { result: 'done', confidence: 0.9 };
});

// Capability-specific handlers
agent.onTask('analysis', async (task) => {
  return { result: analyze(task.input), confidence: 0.9 };
});

agent.onTask('summarization', async (task) => {
  return { result: summarize(task.input), confidence: 0.85 };
});

// Default handler for unmatched capabilities
agent.onTask('*', async (task) => {
  return { result: 'unhandled', confidence: 0.5 };
});
```

### Task Object

```typescript
interface Task<T = any> {
  id: string;                        // Unique task ID
  patternId: string;                 // Pattern that created this task
  executionId: string;               // Execution instance ID
  capability: string;                // Requested capability
  input: T;                          // Task input data
  timeout: number;                   // Task timeout in MS
  metadata: Record<string, any>;     // Additional metadata
  createdAt: Date;                   // When task was created
}
```

### Task Result

```typescript
interface TaskResult<T = any> {
  result: T;                         // The result data
  confidence: number;                // 0.0 to 1.0
  metadata?: Record<string, any>;    // Optional metadata
}
```

### Events

```typescript
agent.on('connected', () => {
  console.log('Connected to control plane');
});

agent.on('disconnected', (reason) => {
  console.log('Disconnected:', reason);
});

agent.on('reconnecting', (attempt) => {
  console.log('Reconnecting, attempt:', attempt);
});

agent.on('task:received', (task) => {
  console.log('Received task:', task.id);
});

agent.on('task:completed', (task, result) => {
  console.log('Completed task:', task.id);
});

agent.on('task:failed', (task, error) => {
  console.error('Task failed:', task.id, error);
});

agent.on('task:timeout', (task) => {
  console.warn('Task timed out:', task.id);
});

agent.on('error', (error) => {
  console.error('Agent error:', error);
});
```

### Lifecycle Methods

```typescript
// Start the agent
await agent.start();

// Check connection status
const isConnected = agent.isConnected();

// Get agent stats
const stats = agent.getStats();
// { tasksCompleted: 42, tasksFailed: 2, avgResponseTime: 150 }

// Graceful shutdown
await agent.stop();

// Force shutdown (doesn't wait for tasks)
await agent.stop({ force: true });
```

## ParallaxClient

The `ParallaxClient` class is used to execute patterns and manage the control plane.

### Basic Usage

```typescript
import { ParallaxClient } from '@parallax/sdk-typescript';

const client = new ParallaxClient({
  url: 'http://localhost:8080',
});

const result = await client.executePattern('sentiment-analysis', {
  text: 'This product is amazing!',
});

console.log(result);
// { sentiment: 'positive', confidence: 0.92 }
```

### Configuration

```typescript
interface ClientConfig {
  url: string;                       // Control plane URL
  apiKey?: string;                   // API key for authentication
  timeout?: number;                  // Default timeout in MS
  retries?: number;                  // Number of retries on failure
  retryDelay?: number;               // MS between retries
  logging?: {
    level: 'debug' | 'info' | 'warn' | 'error';
    format?: 'json' | 'text';
  };
}
```

### Execute Pattern

```typescript
// Basic execution
const result = await client.executePattern('my-pattern', input);

// With options
const result = await client.executePattern('my-pattern', input, {
  timeout: 60000,                    // Override timeout
  version: '2.x',                    // Pattern version constraint
  priority: 'high',                  // Execution priority
  metadata: { userId: '123' },       // Custom metadata
});
```

### Stream Pattern

For long-running patterns, stream partial results:

```typescript
const stream = client.streamPattern('research-pipeline', {
  query: 'quantum computing',
});

stream.on('progress', (progress) => {
  console.log(`Step ${progress.step}/${progress.total}: ${progress.status}`);
});

stream.on('partial', (data) => {
  console.log('Partial result:', data);
});

stream.on('complete', (result) => {
  console.log('Final result:', result);
});

stream.on('error', (error) => {
  console.error('Stream error:', error);
});

// Cancel if needed
stream.cancel();
```

### Pattern Management

```typescript
// List available patterns
const patterns = await client.listPatterns();
// [{ name: 'sentiment', version: '1.0.0', ... }, ...]

// Get pattern details
const pattern = await client.getPattern('sentiment-analysis');

// Get pattern by version
const pattern = await client.getPattern('sentiment-analysis', '2.0.0');

// Register a new pattern
await client.registerPattern(patternYaml);

// Update pattern
await client.updatePattern('my-pattern', updatedYaml);

// Delete pattern
await client.deletePattern('my-pattern');
```

### Execution Management

```typescript
// Get execution status
const execution = await client.getExecution(executionId);
// { id, status: 'running', progress: 0.6, ... }

// List executions
const executions = await client.listExecutions({
  pattern: 'sentiment-analysis',
  status: 'completed',
  limit: 10,
});

// Cancel execution
await client.cancelExecution(executionId);
```

### Agent Management (Admin)

```typescript
// List connected agents
const agents = await client.listAgents();
// [{ name: 'agent-1', capabilities: [...], status: 'ready' }, ...]

// Get agent details
const agent = await client.getAgent('agent-1');

// Filter by capability
const analysts = await client.listAgents({
  capability: 'analysis',
  status: 'ready',
});
```

## Type Definitions

### Input/Output Types

Define types for your patterns:

```typescript
interface SentimentInput {
  text: string;
  language?: string;
}

interface SentimentOutput {
  sentiment: 'positive' | 'negative' | 'neutral';
  confidence: number;
  scores: {
    positive: number;
    negative: number;
    neutral: number;
  };
}

// Typed execution
const result = await client.executePattern<SentimentInput, SentimentOutput>(
  'sentiment-analysis',
  { text: 'Great product!' }
);

// result is fully typed
console.log(result.sentiment);  // TypeScript knows this is string
```

### Generic Task Handler

```typescript
interface AnalysisInput {
  document: string;
  options: {
    extractEntities: boolean;
    detectLanguage: boolean;
  };
}

interface AnalysisOutput {
  entities: string[];
  language: string;
  summary: string;
}

const handler: TaskHandler<AnalysisInput, AnalysisOutput> = async (task) => {
  const { document, options } = task.input;

  const entities = options.extractEntities
    ? await extractEntities(document)
    : [];

  const language = options.detectLanguage
    ? await detectLanguage(document)
    : 'en';

  return {
    result: {
      entities,
      language,
      summary: await summarize(document),
    },
    confidence: 0.88,
  };
};

agent.onTask<AnalysisInput, AnalysisOutput>('analysis', handler);
```

## Error Handling

```typescript
import {
  ParallaxError,
  ConnectionError,
  TimeoutError,
  ValidationError,
  PatternNotFoundError,
  AgentNotFoundError,
  ExecutionError,
} from '@parallax/sdk-typescript';

try {
  const result = await client.executePattern('my-pattern', input);
} catch (error) {
  if (error instanceof TimeoutError) {
    // Pattern took too long
    console.error(`Timeout after ${error.timeout}ms`);
  } else if (error instanceof ValidationError) {
    // Invalid input
    console.error('Validation errors:', error.errors);
  } else if (error instanceof PatternNotFoundError) {
    // Pattern doesn't exist
    console.error(`Pattern ${error.patternName} not found`);
  } else if (error instanceof ExecutionError) {
    // Execution failed
    console.error('Execution failed:', error.reason);
    console.error('Partial results:', error.partialResults);
  } else if (error instanceof ConnectionError) {
    // Network issues
    console.error('Connection failed:', error.message);
  } else {
    // Unknown error
    throw error;
  }
}
```

## Middleware

Add middleware to agents:

```typescript
// Logging middleware
agent.use(async (task, next) => {
  console.log('Starting task:', task.id);
  const start = Date.now();

  const result = await next(task);

  console.log(`Task ${task.id} completed in ${Date.now() - start}ms`);
  return result;
});

// Validation middleware
agent.use(async (task, next) => {
  if (!task.input || typeof task.input !== 'object') {
    throw new Error('Invalid task input');
  }
  return next(task);
});

// Retry middleware
agent.use(async (task, next) => {
  let lastError;
  for (let i = 0; i < 3; i++) {
    try {
      return await next(task);
    } catch (error) {
      lastError = error;
      await sleep(1000 * (i + 1));
    }
  }
  throw lastError;
});
```

## Testing

### Mock Agent

```typescript
import { MockAgent } from '@parallax/sdk-typescript/testing';

const mockAgent = new MockAgent({
  name: 'test-agent',
  capabilities: ['analysis'],
});

// Set up mock responses
mockAgent.mockResponse('analysis', {
  result: { sentiment: 'positive' },
  confidence: 0.9,
});

// Or use a function
mockAgent.mockResponse('analysis', (task) => ({
  result: processTestInput(task.input),
  confidence: 0.85,
}));
```

### Mock Client

```typescript
import { MockClient } from '@parallax/sdk-typescript/testing';

const mockClient = new MockClient();

mockClient.mockPattern('sentiment-analysis', (input) => ({
  sentiment: 'positive',
  confidence: 0.88,
}));

// Use in tests
const result = await mockClient.executePattern('sentiment-analysis', {
  text: 'test',
});
```

## Next Steps

- [Agent Registration](/sdk/agent-registration) - Detailed registration guide
- [Executing Patterns](/sdk/executing-patterns) - Advanced execution options
- [Pattern SDK](/sdk/pattern-sdk) - Build patterns programmatically

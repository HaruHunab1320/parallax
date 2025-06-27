# Parallax Testing Guide

## Overview

This guide provides instructions for setting up and running tests for the Parallax platform.

## Test Setup

### 1. Install Dependencies

```bash
# Install all dependencies
pnpm install

# Install test-specific tools globally (optional)
npm install -g jest ts-jest
```

### 2. Set Up Test Environment

Create a `.env.test` file in the root directory:

```bash
# Test Database Configuration
INFLUXDB_URL=http://localhost:8086
INFLUXDB_TOKEN=test-token
INFLUXDB_ORG=test-org
INFLUXDB_BUCKET=test-bucket

# Test etcd Configuration
ETCD_ENDPOINTS=http://localhost:2379

# Test Security
JWT_SECRET=test-secret-key-min-32-characters
CERTIFICATE_PATH=/tmp/test-certs

# Test Services
CONTROL_PLANE_URL=http://localhost:8080
AGENT_PORT_START=50100
```

### 3. Start Test Services

```bash
# Start test infrastructure
docker-compose -f docker-compose.test.yml up -d

# Verify services are running
docker-compose -f docker-compose.test.yml ps
```

## Running Tests

### Run All Tests

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run in watch mode
pnpm test:watch
```

### Run Package-Specific Tests

```bash
# Test specific package
pnpm --filter @parallax/runtime test
pnpm --filter @parallax/control-plane test
pnpm --filter @parallax/data-plane test

# Test multiple packages
pnpm --filter "@parallax/*" test
```

### Run Test Categories

```bash
# Unit tests only
pnpm test:unit

# Integration tests only
pnpm test:integration

# E2E tests only
pnpm test:e2e

# Performance tests
pnpm test:performance
```

## Writing Tests

### Test Structure

```typescript
// packages/runtime/src/__tests__/coordinator.test.ts
import { ParallaxCoordinator } from '../coordinator';
import { createTestAgent, createTestPattern } from '@parallax/test-utils';

describe('ParallaxCoordinator', () => {
  let coordinator: ParallaxCoordinator;

  beforeEach(() => {
    coordinator = new ParallaxCoordinator();
  });

  afterEach(() => {
    // Cleanup
  });

  describe('agent registration', () => {
    it('should register an agent successfully', () => {
      const agent = createTestAgent('test-1', ['capability1']);
      coordinator.registerAgent(agent);
      
      expect(coordinator.getAgents()).toHaveLength(1);
      expect(coordinator.getAgent('test-1')).toBe(agent);
    });

    it('should handle duplicate registration', () => {
      const agent = createTestAgent('test-1', ['capability1']);
      coordinator.registerAgent(agent);
      
      expect(() => coordinator.registerAgent(agent))
        .toThrow('Agent already registered');
    });
  });
});
```

### Testing Async Operations

```typescript
describe('async operations', () => {
  it('should analyze with all agents', async () => {
    const agent1 = createTestAgent('agent-1', ['analysis']);
    const agent2 = createTestAgent('agent-2', ['analysis']);
    
    coordinator.registerAgent(agent1);
    coordinator.registerAgent(agent2);
    
    const results = await coordinator.analyzeWithAllAgents(
      'test task',
      { data: 'test' }
    );
    
    expect(results).toHaveLength(2);
    expect(results[0].agent).toBe('agent-1');
    expect(results[1].agent).toBe('agent-2');
  });
});
```

### Testing with Mocks

```typescript
import { AgentProxy } from '../agent-proxy';
import { createMockGrpcClient } from '@parallax/test-utils';

jest.mock('@grpc/grpc-js');

describe('AgentProxy', () => {
  let proxy: AgentProxy;
  let mockClient: any;

  beforeEach(() => {
    mockClient = createMockGrpcClient();
    proxy = new AgentProxy('localhost:50051', {
      retryAttempts: 2,
      retryDelay: 100,
    });
    proxy['client'] = mockClient;
  });

  it('should execute analyze request', async () => {
    mockClient.analyze.mockImplementation((request, callback) => {
      callback(null, {
        result: JSON.stringify({ value: 'test result' }),
        confidence: 0.9,
      });
    });

    const result = await proxy.analyze('test task', {});
    
    expect(result.value).toEqual({ value: 'test result' });
    expect(result.confidence).toBe(0.9);
  });
});
```

### Testing with Tenant Context

```typescript
import { runWithTenantContext } from '@parallax/tenant';
import { createTestTenant } from '@parallax/test-utils';

describe('tenant isolation', () => {
  it('should isolate resources by tenant', async () => {
    const tenant1 = createTestTenant('tenant-1');
    const tenant2 = createTestTenant('tenant-2');
    
    let tenant1Resources: any[];
    let tenant2Resources: any[];
    
    await runWithTenantContext(tenant1, async () => {
      tenant1Resources = await repository.findAll();
    });
    
    await runWithTenantContext(tenant2, async () => {
      tenant2Resources = await repository.findAll();
    });
    
    expect(tenant1Resources).not.toEqual(tenant2Resources);
  });
});
```

## Test Utilities

### Creating Test Fixtures

```typescript
// test-utils/fixtures/agents.ts
export function createTestAgent(
  id: string,
  capabilities: string[] = ['test'],
  options: Partial<Agent> = {}
): Agent {
  return {
    id,
    name: `Test Agent ${id}`,
    capabilities,
    status: 'active',
    endpoint: `localhost:${50000 + parseInt(id)}`,
    confidence: 0.8,
    lastSeen: new Date(),
    ...options,
  };
}
```

### Test Helpers

```typescript
// test-utils/helpers/async.ts
export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const start = Date.now();
  
  while (Date.now() - start < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error('Timeout waiting for condition');
}
```

### Mock Services

```typescript
// test-utils/mocks/services.ts
export class MockControlPlane {
  private agents = new Map<string, Agent>();
  private patterns = new Map<string, Pattern>();
  
  async registerAgent(agent: Agent): Promise<void> {
    this.agents.set(agent.id, agent);
  }
  
  async getAgents(): Promise<Agent[]> {
    return Array.from(this.agents.values());
  }
  
  async executePattern(
    name: string,
    input: any
  ): Promise<PatternExecution> {
    const pattern = this.patterns.get(name);
    if (!pattern) {
      throw new Error(`Pattern not found: ${name}`);
    }
    
    return {
      id: 'exec-123',
      pattern: name,
      status: 'completed',
      input,
      output: { mocked: true },
      confidence: 0.85,
    };
  }
}
```

## Integration Testing

### Setting Up Integration Tests

```typescript
// integration/setup.ts
import { startTestServices, stopTestServices } from './services';

beforeAll(async () => {
  await startTestServices();
});

afterAll(async () => {
  await stopTestServices();
});
```

### Testing Service Communication

```typescript
describe('agent to control plane communication', () => {
  let controlPlane: ControlPlane;
  let agent: TestAgent;
  
  beforeEach(async () => {
    controlPlane = await startControlPlane({ port: 8080 });
    agent = await startTestAgent({
      id: 'test-agent-1',
      controlPlaneUrl: 'localhost:8080',
    });
  });
  
  it('should register agent with control plane', async () => {
    await agent.register();
    
    const agents = await controlPlane.getAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0].id).toBe('test-agent-1');
  });
});
```

## E2E Testing

### Complete Workflow Tests

```typescript
describe('pattern execution workflow', () => {
  it('should execute consensus pattern end-to-end', async () => {
    // 1. Start services
    const services = await startAllServices();
    
    // 2. Register agents
    const agents = await Promise.all([
      createAndRegisterAgent('agent-1', ['analysis']),
      createAndRegisterAgent('agent-2', ['analysis']),
      createAndRegisterAgent('agent-3', ['analysis']),
    ]);
    
    // 3. Execute pattern
    const execution = await services.controlPlane.executePattern(
      'consensus-builder',
      { task: 'Analyze data', data: 'test input' }
    );
    
    // 4. Wait for completion
    await waitFor(
      async () => {
        const status = await services.controlPlane.getExecution(execution.id);
        return status.status === 'completed';
      },
      10000
    );
    
    // 5. Verify results
    const result = await services.controlPlane.getExecution(execution.id);
    expect(result.status).toBe('completed');
    expect(result.output).toBeDefined();
    expect(result.confidence).toBeGreaterThan(0.7);
  });
});
```

## Performance Testing

### Load Test Example

```typescript
import { loadTest } from '@parallax/test-utils';

describe('performance', () => {
  it('should handle 100 concurrent executions', async () => {
    const results = await loadTest({
      concurrent: 100,
      duration: 60000, // 1 minute
      scenario: async () => {
        await controlPlane.executePattern('simple-task', {
          data: generateTestData(),
        });
      },
    });
    
    expect(results.successRate).toBeGreaterThan(0.99);
    expect(results.p95Latency).toBeLessThan(500);
    expect(results.throughput).toBeGreaterThan(50);
  });
});
```

## Debugging Tests

### Enable Debug Logging

```bash
# Set debug environment variable
DEBUG=parallax:* pnpm test

# Or for specific module
DEBUG=parallax:agent-proxy pnpm test
```

### Using VS Code Debugger

```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Jest Tests",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": [
        "--runInBand",
        "--testPathPattern=${file}"
      ],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen"
    }
  ]
}
```

### Common Issues

#### Port Conflicts
```bash
# Check if ports are in use
lsof -i :8080
lsof -i :50051

# Kill processes using ports
kill -9 $(lsof -t -i:8080)
```

#### Test Timeouts
```typescript
// Increase timeout for slow tests
jest.setTimeout(30000); // 30 seconds

// Or per test
it('slow test', async () => {
  // test code
}, 30000);
```

#### Flaky Tests
```typescript
// Use retry for flaky tests
it.retry(3)('flaky test', async () => {
  // test code that might fail intermittently
});
```

## CI/CD Integration

### GitHub Actions

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    
    services:
      influxdb:
        image: influxdb:2.7-alpine
        ports:
          - 8086:8086
      
      etcd:
        image: quay.io/coreos/etcd:v3.5.11
        ports:
          - 2379:2379
    
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      
      - uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run tests
        run: pnpm test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

## Best Practices

1. **Test Isolation**: Each test should be independent
2. **Clear Names**: Use descriptive test names
3. **Arrange-Act-Assert**: Follow AAA pattern
4. **Mock External Services**: Don't rely on external services
5. **Test Edge Cases**: Include error scenarios
6. **Performance Awareness**: Keep tests fast
7. **Cleanup**: Always cleanup resources
8. **Deterministic**: Avoid time-dependent tests

## Next Steps

1. Run the test suite: `pnpm test`
2. Check coverage: `pnpm test:coverage`
3. Fix any failing tests
4. Add tests for new features
5. Set up CI/CD pipeline
# Immediate Implementation Tasks for Parallax

## Priority 1: Core Functionality Gaps (Next 2 Weeks)

### 1. Complete CLI Implementation
The CLI structure exists but commands are not implemented.

**File: `packages/cli/src/commands/*.ts`**

```typescript
// agent.ts - Implement these methods
export async function listAgents(options: AgentListOptions): Promise<void> {
  // TODO: Connect to control plane API
  // TODO: Fetch agent list from registry
  // TODO: Format and display results
}

export async function registerAgent(options: AgentRegisterOptions): Promise<void> {
  // TODO: Validate agent endpoint
  // TODO: Test agent connectivity
  // TODO: Register with etcd/registry
}

// pattern.ts - Implement these methods
export async function runPattern(name: string, options: PatternRunOptions): Promise<void> {
  // TODO: Load pattern from control plane
  // TODO: Validate input data
  // TODO: Execute pattern
  // TODO: Stream results
}

export async function listPatterns(options: PatternListOptions): Promise<void> {
  // TODO: Connect to pattern engine
  // TODO: Fetch available patterns
  // TODO: Show pattern metadata
}
```

### 2. Add HTTP API to Control Plane
Currently only internal. Need REST API for CLI/Dashboard.

**New file: `packages/control-plane/src/api/server.ts`**

```typescript
import express from 'express';
import { PatternEngine } from '../pattern-engine';

export class APIServer {
  constructor(
    private patternEngine: PatternEngine,
    private port: number = 8080
  ) {}

  start() {
    const app = express();
    
    // Pattern endpoints
    app.get('/api/patterns', this.listPatterns);
    app.post('/api/patterns/:name/execute', this.executePattern);
    app.get('/api/patterns/:name', this.getPattern);
    
    // Agent endpoints
    app.get('/api/agents', this.listAgents);
    app.post('/api/agents', this.registerAgent);
    app.get('/api/agents/:id/health', this.agentHealth);
    
    // Execution endpoints
    app.get('/api/executions', this.listExecutions);
    app.get('/api/executions/:id', this.getExecution);
    
    app.listen(this.port);
  }
}
```

### 3. Pattern Execution API
Make patterns executable via API.

**Add to: `packages/control-plane/src/pattern-engine/pattern-engine.ts`**

```typescript
// Add these methods
async executePatternWithCallback(
  patternName: string,
  input: any,
  callback: (event: ExecutionEvent) => void
): Promise<PatternExecution> {
  // Stream execution events for real-time updates
}

async getExecutionHistory(
  filters?: ExecutionFilters
): Promise<PatternExecution[]> {
  // Return past executions with filtering
}
```

## Priority 2: Python SDK (Next 2 Weeks)

### 1. Create Base Structure

**File: `packages/sdk-python/src/parallax/__init__.py`**

```python
from .agent import ParallaxAgent
from .server import serve_agent
from .types import AgentResponse, AgentCapability
from .decorators import capability, with_confidence

__all__ = [
    'ParallaxAgent',
    'serve_agent', 
    'AgentResponse',
    'AgentCapability',
    'capability',
    'with_confidence'
]
```

### 2. Implement Agent Base Class

**File: `packages/sdk-python/src/parallax/agent.py`**

```python
import grpc
from abc import ABC, abstractmethod
from typing import Tuple, Any, List, Optional
from concurrent import futures

from .proto import agent_pb2, agent_pb2_grpc
from .types import AgentResponse

class ParallaxAgent(ABC):
    def __init__(
        self,
        agent_id: str,
        name: str,
        capabilities: List[str],
        metadata: Optional[dict] = None
    ):
        self.id = agent_id
        self.name = name
        self.capabilities = capabilities
        self.metadata = metadata or {}
    
    @abstractmethod
    async def analyze(
        self, 
        task: str, 
        data: Optional[Any] = None
    ) -> AgentResponse:
        """Implement analysis logic"""
        pass
    
    def create_result(
        self,
        value: Any,
        confidence: float,
        reasoning: Optional[str] = None,
        uncertainties: Optional[List[str]] = None
    ) -> AgentResponse:
        return AgentResponse(
            value=value,
            confidence=confidence,
            agent=self.id,
            reasoning=reasoning,
            uncertainties=uncertainties
        )
```

### 3. Add gRPC Server

**File: `packages/sdk-python/src/parallax/server.py`**

```python
def serve_agent(agent: ParallaxAgent, port: int = 50051):
    server = grpc.server(futures.ThreadPoolExecutor(max_workers=10))
    agent_pb2_grpc.add_ConfidenceAgentServicer_to_server(
        AgentServicer(agent), server
    )
    server.add_insecure_port(f'[::]:{port}')
    server.start()
    print(f"Agent {agent.name} listening on port {port}")
    server.wait_for_termination()
```

## Priority 3: State Persistence (Next Week)

### 1. Add Database Schema

**New file: `packages/control-plane/src/db/schema.sql`**

```sql
-- Pattern definitions
CREATE TABLE patterns (
    id UUID PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    version VARCHAR(50) NOT NULL,
    script TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Execution history
CREATE TABLE executions (
    id UUID PRIMARY KEY,
    pattern_id UUID REFERENCES patterns(id),
    input JSONB,
    result JSONB,
    confidence FLOAT,
    status VARCHAR(50),
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    error TEXT
);

-- Agent registry
CREATE TABLE agents (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    endpoint VARCHAR(255) NOT NULL,
    capabilities TEXT[],
    metadata JSONB,
    health_status VARCHAR(50),
    last_health_check TIMESTAMP,
    registered_at TIMESTAMP DEFAULT NOW()
);

-- Confidence calibration data
CREATE TABLE agent_performance (
    agent_id VARCHAR(255),
    domain VARCHAR(100),
    total_predictions INTEGER,
    correct_predictions INTEGER,
    average_confidence FLOAT,
    actual_accuracy FLOAT,
    updated_at TIMESTAMP DEFAULT NOW(),
    PRIMARY KEY (agent_id, domain)
);
```

### 2. Add Repository Layer

**New file: `packages/control-plane/src/repositories/pattern-repository.ts`**

```typescript
export class PatternRepository {
  constructor(private db: Database) {}
  
  async save(pattern: Pattern): Promise<void> {
    // Save pattern to database
  }
  
  async findByName(name: string): Promise<Pattern | null> {
    // Load pattern from database
  }
  
  async list(filters?: PatternFilters): Promise<Pattern[]> {
    // List patterns with filtering
  }
  
  async updateVersion(name: string, version: string, script: string): Promise<void> {
    // Version control for patterns
  }
}
```

## Priority 4: Production Security (Next Week)

### 1. Add Authentication Middleware

**New file: `packages/control-plane/src/auth/middleware.ts`**

```typescript
export function authenticateAPIKey(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || !isValidAPIKey(apiKey)) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  
  req.user = getUserFromAPIKey(apiKey);
  next();
}

export function authorizePattern(pattern: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!canExecutePattern(req.user, pattern)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}
```

### 2. Implement mTLS for Agents

**Update: `packages/sdk-typescript/src/server.ts`**

```typescript
export async function serveSecureAgent(
  agent: ParallaxAgent,
  port: number,
  certPath: string,
  keyPath: string,
  caPath: string
): Promise<grpc.Server> {
  const server = new grpc.Server();
  
  // Load certificates
  const cert = fs.readFileSync(certPath);
  const key = fs.readFileSync(keyPath);
  const ca = fs.readFileSync(caPath);
  
  const credentials = grpc.ServerCredentials.createSsl(
    ca,
    [{ cert_chain: cert, private_key: key }],
    true // Require client certificate
  );
  
  server.bindAsync(
    `0.0.0.0:${port}`,
    credentials,
    (err, port) => {
      if (err) throw err;
      server.start();
    }
  );
  
  return server;
}
```

## Priority 5: Basic Web Dashboard (Next 2 Weeks)

### 1. Create React App Structure

```bash
cd apps
pnpm create vite web-dashboard --template react-ts
cd web-dashboard
pnpm add @tanstack/react-query axios react-router-dom recharts
```

### 2. Core Components

**File: `apps/web-dashboard/src/pages/Overview.tsx`**

```typescript
export function Overview() {
  const { data: stats } = useSystemStats();
  
  return (
    <div>
      <h1>System Overview</h1>
      <StatsGrid>
        <StatCard title="Active Agents" value={stats?.agents.active} />
        <StatCard title="Patterns" value={stats?.patterns.count} />
        <StatCard title="Executions (24h)" value={stats?.executions.daily} />
        <StatCard title="Avg Confidence" value={stats?.confidence.average} />
      </StatsGrid>
      
      <ConfidenceTrendChart data={stats?.confidence.trend} />
      <RecentExecutions executions={stats?.executions.recent} />
    </div>
  );
}
```

## Testing Requirements

### 1. Integration Tests

**New file: `packages/control-plane/tests/integration/pattern-execution.test.ts`**

```typescript
describe('Pattern Execution', () => {
  it('should execute consensus pattern with mock agents', async () => {
    // Setup mock agents
    const agents = createMockAgents(3);
    
    // Execute pattern
    const result = await patternEngine.executePattern('consensus-builder', {
      task: 'test analysis'
    });
    
    // Verify result
    expect(result.status).toBe('completed');
    expect(result.result.confidence).toBeGreaterThan(0.5);
  });
});
```

### 2. End-to-End Tests

**New file: `tests/e2e/full-flow.test.ts`**

```typescript
describe('Full System Flow', () => {
  it('should handle pattern execution from CLI to agents', async () => {
    // Start test agents
    // Execute pattern via CLI
    // Verify results
  });
});
```

## Documentation Requirements

### 1. API Documentation

**New file: `docs/api/rest-api.md`**

Document all REST endpoints with examples.

### 2. Deployment Guide

**New file: `docs/deployment/production.md`**

Step-by-step production deployment.

### 3. Pattern Development Guide

**Update: `docs/patterns/development-guide.md`**

Complete guide for writing custom patterns.

## Immediate Action Items (This Week)

1. **Day 1-2**: Implement basic HTTP API in control plane
2. **Day 3-4**: Complete CLI command implementations  
3. **Day 5**: Start Python SDK base structure
4. **Day 6-7**: Add database schema and basic persistence

## Next Week

1. **Day 8-9**: Complete Python SDK with gRPC
2. **Day 10-11**: Add authentication/security layer
3. **Day 12-14**: Start web dashboard with overview page

This plan focuses on filling the critical gaps needed to move from prototype to production-ready system.
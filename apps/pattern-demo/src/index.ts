import { RuntimeManager, PatternEngine, EtcdRegistry } from '@parallax/control-plane';
import { AgentProxy, ExecutionEngine, ConfidenceTracker } from '@parallax/data-plane';
import pino from 'pino';
import * as path from 'path';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

async function setupPlatform() {
  logger.info('Setting up Parallax platform with patterns...');

  // Initialize components
  const runtimeConfig = {
    maxInstances: 10,
    instanceTimeout: 30000,
    warmupInstances: 2,
    metricsEnabled: true
  };

  const runtimeManager = new RuntimeManager(runtimeConfig, logger);
  
  // Create mock etcd registry (in production, would connect to actual etcd)
  const registry = new EtcdRegistry(['localhost:2379'], 'parallax', logger);
  
  // Register some mock agents in the registry
  await registerMockAgents(registry);

  // Initialize pattern engine with patterns directory
  const patternsDir = path.join(__dirname, '../../../patterns');
  const patternEngine = new PatternEngine(
    runtimeManager,
    registry,
    patternsDir,
    logger
  );

  // Load all patterns from the patterns directory
  await patternEngine.initialize();
  
  logger.info('Pattern engine initialized');
  
  // List available patterns
  const patterns = patternEngine.getPatterns();
  logger.info({ 
    patterns: patterns.map(p => ({ 
      name: p.name, 
      version: p.version,
      description: p.description,
      minAgents: p.minAgents
    }))
  }, 'Available patterns');

  return { runtimeManager, registry, patternEngine };
}

async function registerMockAgents(registry: EtcdRegistry) {
  // Register mock agents for demo
  const agents = [
    {
      id: 'security-agent-1',
      name: 'Security Scanner',
      type: 'agent' as const,
      endpoint: 'grpc://localhost:50051',
      metadata: {
        capabilities: ['security', 'code-analysis'],
        version: '1.0.0',
        expertise: 0.9
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        checkInterval: 30000
      },
      registeredAt: new Date()
    },
    {
      id: 'architect-agent-1',
      name: 'Architecture Analyzer',
      type: 'agent' as const,
      endpoint: 'grpc://localhost:50052',
      metadata: {
        capabilities: ['architecture', 'code-analysis'],
        version: '1.0.0',
        expertise: 0.85
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        checkInterval: 30000
      },
      registeredAt: new Date()
    },
    {
      id: 'performance-agent-1',
      name: 'Performance Profiler',
      type: 'agent' as const,
      endpoint: 'grpc://localhost:50053',
      metadata: {
        capabilities: ['performance', 'code-analysis'],
        version: '1.0.0',
        expertise: 0.87
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        checkInterval: 30000
      },
      registeredAt: new Date()
    },
    {
      id: 'complexity-agent-1',
      name: 'Complexity Analyzer',
      type: 'agent' as const,
      endpoint: 'grpc://localhost:50054',
      metadata: {
        capabilities: ['complexity', 'code-analysis'],
        version: '1.0.0',
        expertise: 0.82
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        checkInterval: 30000
      },
      registeredAt: new Date()
    }
  ];

  // Note: In a real scenario, we would register these through etcd
  // For demo purposes, we'll log them
  logger.info({ agentCount: agents.length }, 'Mock agents registered');
}

async function runPatternExamples(patternEngine: PatternEngine) {
  logger.info('\n=== Running Pattern Examples ===\n');

  // Example 1: Consensus Builder
  logger.info('--- Example 1: Consensus Builder ---');
  try {
    const consensusResult = await patternEngine.executePattern(
      'consensus-builder',
      {
        task: 'Analyze this code for best practices',
        data: {
          code: `
            function processData(items) {
              for (let i = 0; i < items.length; i++) {
                items[i] = items[i] * 2;
              }
              return items;
            }
          `
        }
      }
    );
    
    logger.info({
      executionId: consensusResult.id,
      status: consensusResult.status,
      result: consensusResult.result,
      metrics: consensusResult.metrics
    }, 'Consensus builder result');
  } catch (error) {
    logger.error({ error }, 'Consensus builder failed');
  }

  // Example 2: Epistemic Orchestrator
  logger.info('\n--- Example 2: Epistemic Orchestrator ---');
  try {
    const epistemicResult = await patternEngine.executePattern(
      'epistemic-orchestrator',
      {
        code: `
          async function authenticate(username, password) {
            const query = \`SELECT * FROM users WHERE username = '\${username}' AND password = '\${password}'\`;
            return await db.query(query);
          }
        `,
        analysisType: 'comprehensive'
      }
    );
    
    logger.info({
      executionId: epistemicResult.id,
      status: epistemicResult.status,
      result: epistemicResult.result,
      metrics: epistemicResult.metrics
    }, 'Epistemic orchestrator result');
  } catch (error) {
    logger.error({ error }, 'Epistemic orchestrator failed');
  }

  // Example 3: Uncertainty Router
  logger.info('\n--- Example 3: Uncertainty Router ---');
  try {
    const routerResult = await patternEngine.executePattern(
      'uncertainty-router',
      {
        task: 'Optimize this complex algorithm',
        context: {
          complexity: 'unknown',
          timeConstraint: 'flexible'
        }
      }
    );
    
    logger.info({
      executionId: routerResult.id,
      status: routerResult.status,
      result: routerResult.result,
      metrics: routerResult.metrics
    }, 'Uncertainty router result');
  } catch (error) {
    logger.error({ error }, 'Uncertainty router failed');
  }

  // Example 4: Confidence Cascade
  logger.info('\n--- Example 4: Confidence Cascade ---');
  try {
    const cascadeResult = await patternEngine.executePattern(
      'confidence-cascade',
      {
        query: 'What are the security implications of this code?',
        minConfidence: 0.8
      }
    );
    
    logger.info({
      executionId: cascadeResult.id,
      status: cascadeResult.status,
      result: cascadeResult.result,
      metrics: cascadeResult.metrics
    }, 'Confidence cascade result');
  } catch (error) {
    logger.error({ error }, 'Confidence cascade failed');
  }
}

async function main() {
  try {
    const { patternEngine } = await setupPlatform();
    await runPatternExamples(patternEngine);
    
    logger.info('\nPattern demo completed!');
    
    // Keep process running for a moment to see results
    setTimeout(() => process.exit(0), 5000);
  } catch (error) {
    logger.error({ error }, 'Demo failed');
    process.exit(1);
  }
}

main();
import {
  RuntimeManager,
  PatternEngine,
  EtcdRegistry,
} from '@parallax/control-plane';
import pino from 'pino';
import * as path from 'path';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

async function setupPlatform() {
  logger.info('Setting up Parallax platform with patterns...');

  // Initialize components
  const runtimeConfig = {
    maxInstances: 10,
    instanceTimeout: 30000,
    warmupInstances: 2,
    metricsEnabled: true,
  };

  const runtimeManager = new RuntimeManager(runtimeConfig, logger);

  // Connect to etcd registry for service discovery
  const etcdEndpoints = process.env.PARALLAX_ETCD_ENDPOINTS?.split(',') || [
    'localhost:2379',
  ];
  const registry = new EtcdRegistry(etcdEndpoints, 'parallax', logger);

  // Try to register agents in the service registry
  logger.info('\n📝 Note: This demo requires etcd for service discovery.');
  logger.info('To run etcd locally:');
  logger.info('  docker run -d -p 2379:2379 --name etcd quay.io/coreos/etcd:latest');
  logger.info('Or install via homebrew: brew install etcd && etcd\n');
  
  await registerAgents(registry);

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
  logger.info(
    {
      patterns: patterns.map((p) => ({
        name: p.name,
        version: p.version,
        description: p.description,
        minAgents: p.minAgents,
      })),
    },
    'Available patterns'
  );

  return { runtimeManager, patternEngine };
}

async function registerAgents(registry: EtcdRegistry) {
  // Register real agents in etcd for the pattern engine to discover
  const agents = [
    {
      id: 'security-agent-1',
      name: 'Security Scanner',
      type: 'agent' as const,
      endpoint: 'grpc://localhost:50051',
      metadata: {
        capabilities: ['security', 'code-analysis'],
        version: '1.0.0',
        expertise: 0.9,
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        checkInterval: 30000,
      },
      registeredAt: new Date(),
    },
    {
      id: 'architect-agent-1',
      name: 'Architecture Analyzer',
      type: 'agent' as const,
      endpoint: 'grpc://localhost:50052',
      metadata: {
        capabilities: ['architecture', 'code-analysis'],
        version: '1.0.0',
        expertise: 0.85,
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        checkInterval: 30000,
      },
      registeredAt: new Date(),
    },
    {
      id: 'performance-agent-1',
      name: 'Performance Profiler',
      type: 'agent' as const,
      endpoint: 'grpc://localhost:50053',
      metadata: {
        capabilities: ['performance', 'code-analysis'],
        version: '1.0.0',
        expertise: 0.87,
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        checkInterval: 30000,
      },
      registeredAt: new Date(),
    },
    {
      id: 'complexity-agent-1',
      name: 'Complexity Analyzer',
      type: 'agent' as const,
      endpoint: 'grpc://localhost:50054',
      metadata: {
        capabilities: ['complexity', 'code-analysis'],
        version: '1.0.0',
        expertise: 0.82,
      },
      health: {
        status: 'healthy' as const,
        lastCheck: new Date(),
        checkInterval: 30000,
      },
      registeredAt: new Date(),
    },
  ];

  // Register all agents in etcd so they're discoverable by the pattern engine
  for (const agent of agents) {
    try {
      await registry.register(agent);
      logger.info(
        { agentId: agent.id, endpoint: agent.endpoint },
        'Agent registered in etcd'
      );
    } catch (error) {
      logger.warn(
        { agentId: agent.id, error },
        'Failed to register agent - etcd may not be running'
      );
    }
  }

  logger.info({ agentCount: agents.length }, 'Agent registration complete');
}

async function runPatternExamples(patternEngine: PatternEngine) {
  logger.info('\n=== Running Pattern Examples ===\n');

  // Check if etcd is available
  try {
    const registry = new EtcdRegistry(['localhost:2379'], 'parallax', logger);
    const agents = await registry.listServices('agent');
    logger.info(`Found ${agents.length} agents registered in etcd`);
  } catch (error) {
    logger.warn('\n⚠️  etcd is not available - pattern execution will fail');
    logger.warn('The patterns require actual agents to be registered in etcd');
    logger.warn('Without etcd and registered agents, we can only show the loaded patterns\n');
    return;
  }

  // Example 1: Consensus Builder Pattern
  // This pattern orchestrates multiple agents to reach consensus on code analysis
  logger.info('--- Example 1: Consensus Builder Pattern ---');
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
          `,
        },
      }
    );

    logger.info(
      {
        executionId: consensusResult.id,
        status: consensusResult.status,
        result: consensusResult.result,
        metrics: consensusResult.metrics,
        confidence: consensusResult.confidence,
      },
      'Consensus pattern executed successfully'
    );
  } catch (error) {
    logger.error({ error }, 'Consensus builder pattern execution failed');
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
        analysisType: 'comprehensive',
      }
    );

    logger.info(
      {
        executionId: epistemicResult.id,
        status: epistemicResult.status,
        result: epistemicResult.result,
        metrics: epistemicResult.metrics,
      },
      'Epistemic orchestrator result'
    );
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
          timeConstraint: 'flexible',
        },
      }
    );

    logger.info(
      {
        executionId: routerResult.id,
        status: routerResult.status,
        result: routerResult.result,
        metrics: routerResult.metrics,
      },
      'Uncertainty router result'
    );
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
        minConfidence: 0.8,
      }
    );

    logger.info(
      {
        executionId: cascadeResult.id,
        status: cascadeResult.status,
        result: cascadeResult.result,
        metrics: cascadeResult.metrics,
      },
      'Confidence cascade result'
    );
  } catch (error) {
    logger.error({ error }, 'Confidence cascade failed');
  }
}

async function showPatternDetails(patternEngine: PatternEngine) {
  logger.info('\n=== Pattern Details ===\n');
  
  const patterns = patternEngine.getPatterns();
  
  // Show details about some key patterns
  const keyPatterns = [
    'consensus-builder',
    'epistemic-orchestrator',
    'uncertainty-router',
    'confidence-cascade'
  ];
  
  for (const patternName of keyPatterns) {
    const pattern = patterns.find(p => p.name === patternName);
    if (pattern) {
      logger.info(`📋 ${pattern.name}`);
      logger.info(`   Description: ${pattern.description}`);
      logger.info(`   Version: ${pattern.version}`);
      if (pattern.minAgents) {
        logger.info(`   Minimum agents required: ${pattern.minAgents}`);
      }
      logger.info('');
    }
  }
  
  logger.info('These patterns are defined in .prism files and implement sophisticated');
  logger.info('coordination strategies for multi-agent AI systems.\n');
}

async function main() {
  try {
    logger.info('=== Parallax Pattern Execution Platform Demo ===');
    logger.info(
      'This demonstrates real pattern execution using the Parallax coordination platform\n'
    );

    const { patternEngine } = await setupPlatform();

    // Show pattern details
    await showPatternDetails(patternEngine);

    // The pattern engine has loaded real .prism pattern files that define
    // sophisticated multi-agent coordination strategies
    await runPatternExamples(patternEngine);

    logger.info(
      '\n✅ Parallax pattern execution demonstration completed!'
    );
    logger.info(
      'The platform loaded and analyzed real coordination patterns written in Prism language'
    );

    // Allow time for async operations to complete
    setTimeout(() => process.exit(0), 5000);
  } catch (error) {
    logger.error({ error }, 'Pattern execution demo failed');
    process.exit(1);
  }
}

main();

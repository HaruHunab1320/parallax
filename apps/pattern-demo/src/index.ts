import {
  RuntimeManager,
  PatternEngine,
  EtcdRegistry,
} from '@parallax/control-plane';
import pino from 'pino';
import * as path from 'path';
import { createDemoAgents } from './demo-agents';

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

  // Register our real demo agents
  const demoAgents = createDemoAgents();
  patternEngine.registerLocalAgents(demoAgents);
  
  logger.info('Pattern engine initialized with real agents');

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
  // Note: With real local agents, we don't need to register in etcd
  // This is kept for reference on how to register remote agents
  return;
  
  // Example of how to register remote agents in etcd:
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

  // With local agents, we don't need etcd
  logger.info('Using local in-memory agents for pattern execution');

  // Test with our new simplified pattern first
  logger.info('--- Testing Simple Consensus V2 ---');
  try {
    const simpleResult = await patternEngine.executePattern(
      'SimpleConsensusV2',
      {
        task: 'Analyze code quality'
      }
    );

    logger.info(
      {
        executionId: simpleResult.id,
        status: simpleResult.status,
        result: simpleResult.result,
        metrics: simpleResult.metrics,
      },
      'Simple consensus V2 executed successfully'
    );
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error 
    }, 'Simple consensus V2 failed');
  }

  // Example 1: Consensus Builder V2 Pattern
  logger.info('\n--- Example 1: Consensus Builder V2 ---');
  try {
    const consensusResult = await patternEngine.executePattern(
      'ConsensusBuilderV2',
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
      },
      'Consensus V2 pattern executed successfully'
    );
  } catch (error) {
    logger.error({ error }, 'Consensus builder V2 pattern execution failed');
  }

  // Example 2: Epistemic Orchestrator
  logger.info('\n--- Example 2: Epistemic Orchestrator ---');
  try {
    const epistemicResult = await patternEngine.executePattern(
      'EpistemicOrchestrator',
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
      'UncertaintyRouter',
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
      'ConfidenceCascade',
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

async function runSinglePattern(patternEngine: PatternEngine, patternName: string, input: any) {
  logger.info(`\n--- Running ${patternName} ---`);
  try {
    const result = await patternEngine.executePattern(patternName, input);
    
    logger.info(
      {
        executionId: result.id,
        status: result.status,
        result: result.result,
        metrics: result.metrics,
      },
      `${patternName} executed successfully`
    );
    
    return result;
  } catch (error) {
    logger.error({ 
      error: error instanceof Error ? {
        message: error.message,
        stack: error.stack
      } : error 
    }, `${patternName} failed`);
    throw error;
  }
}

async function main() {
  try {
    logger.info('=== Parallax Pattern Execution Platform Demo ===');
    logger.info(
      'This demonstrates real pattern execution using the Parallax coordination platform\n'
    );

    const { patternEngine } = await setupPlatform();

    // Check if a specific pattern was requested
    const args = process.argv.slice(2);
    const requestedPattern = args[0];
    
    if (requestedPattern) {
      // Run single pattern
      const patterns = patternEngine.getPatterns();
      const pattern = patterns.find(p => p.name.toLowerCase() === requestedPattern.toLowerCase());
      
      if (!pattern) {
        logger.error(`Pattern "${requestedPattern}" not found. Available patterns:`);
        patterns.forEach(p => logger.info(`  - ${p.name}`));
        process.exit(1);
      }
      
      // Define test inputs for each pattern
      const testInputs: Record<string, any> = {
        'TestMinimal': { task: 'Test' },
        'SimpleConsensusV2': { task: 'Analyze code quality' },
        'ConsensusBuilderV2': {
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
        },
        'EpistemicOrchestrator': {
          code: `
            async function authenticate(username, password) {
              const query = \`SELECT * FROM users WHERE username = '\${username}' AND password = '\${password}'\`;
              return await db.query(query);
            }
          `,
          analysisType: 'comprehensive',
        },
        'UncertaintyRouter': {
          task: 'Optimize this complex algorithm',
          context: {
            complexity: 'unknown',
            timeConstraint: 'flexible',
          },
        },
        'ConfidenceCascade': {
          query: 'What are the security implications of this code?',
          minConfidence: 0.8,
        },
      };
      
      const input = testInputs[pattern.name] || { task: 'Default analysis task' };
      await runSinglePattern(patternEngine, pattern.name, input);
      
    } else {
      // Show pattern details
      await showPatternDetails(patternEngine);

      // Run all examples
      await runPatternExamples(patternEngine);
    }

    logger.info('\n✅ Pattern execution completed!');

    // Allow time for async operations to complete
    setTimeout(() => process.exit(0), 2000);
  } catch (error) {
    logger.error({ error }, 'Pattern execution demo failed');
    process.exit(1);
  }
}

main();

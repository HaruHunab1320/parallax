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
  const patterns = patternEngine.listPatterns();
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

  // Define all patterns to test with their inputs
  const patternTests = [
    {
      name: 'SimpleConsensus',
      input: {
        task: 'Analyze code quality'
      }
    },
    {
      name: 'ConsensusBuilder',
      input: {
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
    },
    {
      name: 'EpistemicOrchestrator',
      input: {
        code: 'async function authenticate(user, pass) { return await db.query("SELECT * FROM users WHERE username = ? AND password = ?", [user, pass]); }',
        analysisType: 'comprehensive',
      }
    },
    {
      name: 'UncertaintyRouter',
      input: {
        task: 'Optimize this complex algorithm',
        taskContext: {
          complexity: 'unknown',
          timeConstraint: 'flexible',
        },
      }
    },
    {
      name: 'ConfidenceCascade',
      input: {
        query: 'What are the security implications of this code?',
        minConfidence: 0.8,
      }
    },
    {
      name: 'LoadBalancer',
      input: {
        task: 'Analyze system performance',
        priority: 'high',
        strategy: 'confidence'
      }
    },
    {
      name: 'MultiValidator',
      input: {
        data: { value: 42, type: 'number' },
        validationType: 'strict',
        fastPathThreshold: 0.9
      }
    },
    {
      name: 'ParallelExploration',
      input: {
        task: 'Find optimal solution',
        approaches: ['genetic', 'gradient', 'random'],
        consensusThreshold: 0.6
      }
    },
    {
      name: 'RobustAnalysis',
      input: {
        task: 'Comprehensive code review',
        depth: 'detailed'
      }
    },
    {
      name: 'UncertaintyMapReduce',
      input: {
        data: [1, 2, 3, 4, 5],
        operation: 'transform',
        mapFunction: 'double',
        reduceFunction: 'sum',
        chunkSize: 2
      }
    },
    {
      name: 'CascadingRefinement',
      input: {
        task: 'Refine analysis progressively',
        initialQuality: 'fast',
        minConfidence: 0.8,
        maxTier: 3
      }
    }
  ];

  // Track results
  const results = {
    successful: [] as string[],
    failed: [] as { pattern: string, error: string }[],
    total: patternTests.length
  };

  // Run each pattern sequentially
  for (const test of patternTests) {
    logger.info(`\n--- Testing ${test.name} ---`);
    try {
      const result = await patternEngine.executePattern(test.name, test.input);

      logger.info(
        {
          executionId: result.id,
          status: result.status,
          confidence: result.result?.confidence,
          metrics: result.metrics,
        },
        `${test.name} executed successfully`
      );
      
      results.successful.push(test.name);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ 
        pattern: test.name,
        error: errorMessage
      }, `${test.name} failed`);
      
      results.failed.push({
        pattern: test.name,
        error: errorMessage
      });
    }
  }

  // Summary report
  logger.info('\n=== Pattern Execution Summary ===');
  logger.info(`Total patterns: ${results.total}`);
  logger.info(`Successful: ${results.successful.length} (${results.successful.join(', ')})`);
  logger.info(`Failed: ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    logger.info('\nFailed patterns:');
    results.failed.forEach(failure => {
      logger.error(`  - ${failure.pattern}: ${failure.error}`);
    });
  }

  return results;
}

async function showPatternDetails(patternEngine: PatternEngine) {
  logger.info('\n=== Pattern Details ===\n');
  
  const patterns = patternEngine.listPatterns();
  
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
      const patterns = patternEngine.listPatterns();
      const pattern = patterns.find(p => p.name.toLowerCase() === requestedPattern.toLowerCase());
      
      if (!pattern) {
        logger.error(`Pattern "${requestedPattern}" not found. Available patterns:`);
        patterns.forEach(p => logger.info(`  - ${p.name}`));
        process.exit(1);
      }
      
      // Define test inputs for each pattern
      const testInputs: Record<string, any> = {
        'SimpleConsensus': { task: 'Analyze code quality' },
        'ConsensusBuilder': {
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

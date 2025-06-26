import { ParallaxCoordinator } from '@parallax/runtime';
import { ParallaxAgent, withConfidence } from '@parallax/typescript';
import { RuntimeManager, PatternEngine, EtcdRegistry } from '@parallax/control-plane';
import { AgentProxy, ExecutionEngine, ConfidenceTracker } from '@parallax/data-plane';
import pino from 'pino';

// Create logger
const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Example Security Agent
class SecurityAgent extends ParallaxAgent {
  constructor() {
    super('security-agent-1', 'Security Scanner', ['security', 'code-analysis']);
  }

  @withConfidence({ defaultConfidence: 0.85 })
  async analyze(task: string, data?: any) {
    logger.info({ task }, 'Security agent analyzing');
    
    // Simulate security analysis
    const hasVulnerabilities = data?.code?.includes('eval(') || 
                             data?.code?.includes('innerHTML');
    
    if (hasVulnerabilities) {
      return {
        recommendation: 'Fix security vulnerabilities',
        issues: ['Potential code injection risk'],
        confidence: 0.95
      };
    }
    
    return {
      recommendation: 'Code appears secure',
      issues: [],
      confidence: 0.7
    };
  }
}

// Example Architecture Agent
class ArchitectureAgent extends ParallaxAgent {
  constructor() {
    super('architecture-agent-1', 'Architecture Analyzer', ['architecture', 'code-analysis']);
  }

  @withConfidence()
  async analyze(task: string, data?: any) {
    logger.info({ task }, 'Architecture agent analyzing');
    
    // Simulate architecture analysis
    const complexity = (data?.code?.length || 0) / 100;
    
    if (complexity > 5) {
      return ['Refactor into smaller modules', 0.9];
    }
    
    return ['Architecture is well-structured', 0.8];
  }
}

// Main demo function
async function runDemo() {
  logger.info('Starting Parallax demo application');

  // Initialize components
  const coordinator = new ParallaxCoordinator();
  
  // Register agents
  const securityAgent = new SecurityAgent();
  const architectureAgent = new ArchitectureAgent();
  
  coordinator.registerAgent(securityAgent);
  coordinator.registerAgent(architectureAgent);
  
  logger.info('Agents registered');

  // Example 1: Direct agent analysis
  logger.info('=== Example 1: Direct Agent Analysis ===');
  
  const codeToAnalyze = `
    function processUserInput(input) {
      document.getElementById('output').innerHTML = input;
      eval(input);
    }
  `;

  const results = await coordinator.analyzeWithAllAgents(
    'Analyze this code for issues',
    { code: codeToAnalyze }
  );

  results.forEach(result => {
    logger.info({
      agent: result.agent,
      confidence: result.confidence,
      value: result.value
    }, 'Agent result');
  });

  // Example 2: Check consensus
  logger.info('=== Example 2: Consensus Analysis ===');
  
  const consensus = await coordinator.getConsensus(results);
  logger.info({ consensus }, 'Consensus result');

  // Example 3: Check if we should explore parallel paths
  const shouldExplore = coordinator.shouldExploreParallel(results);
  logger.info({ shouldExplore }, 'Should explore parallel paths?');

  // Example 4: Pattern execution (if patterns were registered)
  logger.info('=== Example 4: Pattern Registration ===');
  
  // In a real app, patterns would be loaded from .prism files
  const mockPattern = {
    name: 'simple-consensus',
    execute: async (agents: any[], task: string) => {
      const results = await Promise.all(
        agents.map(agent => agent.analyze(task))
      );
      return {
        consensus: results,
        confidence: 0.8
      };
    }
  };
  
  coordinator.registerPattern(mockPattern);
  
  logger.info('Demo completed successfully!');
}

// Run the demo
runDemo().catch(error => {
  logger.error({ error }, 'Demo failed');
  process.exit(1);
});
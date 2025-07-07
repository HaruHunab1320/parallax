import { Agent, AgentResult, CoordinationPattern } from '@parallax/runtime';
import pino from 'pino';

const logger = pino({
  transport: {
    target: 'pino-pretty',
    options: { colorize: true }
  }
});

// Create some simple in-memory agents
class SecurityAgent implements Agent {
  id = 'security-1';
  name = 'Security Analyzer';
  capabilities = ['security', 'code-analysis'];
  
  async isAvailable() { return true; }
  
  async analyze<T>(task: string, data?: any): Promise<AgentResult<T>> {
    logger.info(`Security agent analyzing: ${task}`);
    
    const hasIssues = data?.code?.includes('eval(') || data?.code?.includes('innerHTML');
    
    return {
      value: {
        secure: !hasIssues,
        issues: hasIssues ? ['Potential injection vulnerability'] : []
      } as T,
      confidence: hasIssues ? 0.95 : 0.8,
      agent: this.id,
      reasoning: hasIssues ? 'Found dangerous functions' : 'No obvious security issues',
      timestamp: Date.now()
    };
  }
}

class PerformanceAgent implements Agent {
  id = 'perf-1';
  name = 'Performance Analyzer';
  capabilities = ['performance', 'optimization'];
  
  async isAvailable() { return true; }
  
  async analyze<T>(task: string, data?: any): Promise<AgentResult<T>> {
    logger.info(`Performance agent analyzing: ${task}`);
    
    return {
      value: {
        optimized: false,
        suggestions: ['Consider using array methods instead of loops']
      } as T,
      confidence: 0.75,
      agent: this.id,
      reasoning: 'Found optimization opportunities',
      timestamp: Date.now()
    };
  }
}

// Simple consensus pattern
class SimpleConsensusPattern implements CoordinationPattern {
  name = 'simple-consensus';
  description = 'Get consensus from multiple agents';
  
  async execute<T>(agents: Agent[], task: string, data?: any): Promise<T> {
    logger.info(`Executing consensus pattern with ${agents.length} agents`);
    
    // Get results from all agents
    const results = await Promise.all(
      agents.map(agent => agent.analyze(task, data))
    );
    
    // Calculate average confidence
    const avgConfidence = results.reduce((sum, r) => sum + r.confidence, 0) / results.length;
    
    // Combine results
    const consensus = {
      results: results.map(r => ({
        agent: r.agent,
        value: r.value,
        confidence: r.confidence,
        reasoning: r.reasoning
      })),
      overallConfidence: avgConfidence,
      consensus: avgConfidence > 0.8 ? 'high' : avgConfidence > 0.6 ? 'medium' : 'low'
    };
    
    return consensus as T;
  }
}

async function runDemo() {
  logger.info('🚀 Parallax Simple Demo - No Infrastructure Required!');
  logger.info('This demonstrates the core concepts without needing etcd or other services\n');
  
  // Create agents
  const agents = [
    new SecurityAgent(),
    new PerformanceAgent()
  ];
  
  logger.info(`Created ${agents.length} agents:`);
  agents.forEach(agent => {
    logger.info(`  - ${agent.name} (${agent.capabilities.join(', ')})`);
  });
  
  // Create pattern
  const consensusPattern = new SimpleConsensusPattern();
  logger.info(`\nUsing pattern: ${consensusPattern.name}`);
  
  // Example code to analyze
  const codeToAnalyze = {
    code: `
      function processUserInput(input) {
        const result = eval(input);  // Security issue!
        document.body.innerHTML = result;  // Another issue!
        return result;
      }
    `
  };
  
  logger.info('\n📝 Analyzing code for issues...\n');
  
  // Execute pattern
  const result = await consensusPattern.execute(
    agents,
    'Analyze this code for security and performance issues',
    codeToAnalyze
  );
  
  logger.info('✅ Analysis complete!\n');
  logger.info({ result }, 'Consensus results');
  
  logger.info('\n🎉 Demo complete! This shows how Parallax coordinates multiple AI agents.');
  logger.info('For the full platform experience with patterns and service discovery, run:');
  logger.info('  ./start-local.sh');
}

// Run the demo
runDemo().catch(error => {
  logger.error({ error }, 'Demo failed');
  process.exit(1);
});
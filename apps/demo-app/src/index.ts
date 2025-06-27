import { ParallaxCoordinator, Agent, AgentResult } from '@parallax/runtime';
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

// Example Security Agent implementing the runtime Agent interface
class SecurityAgent implements Agent {
  id = 'security-agent-1';
  name = 'Security Scanner';
  capabilities = ['security', 'code-analysis'];
  endpoint = 'grpc://localhost:50051';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async analyze<T = any>(task: string, data?: any): Promise<AgentResult<T>> {
    logger.info({ task }, 'Security agent analyzing');
    
    // Analyze code for security vulnerabilities
    const hasVulnerabilities = data?.code?.includes('eval(') || 
                             data?.code?.includes('innerHTML');
    
    if (hasVulnerabilities) {
      return {
        value: {
          recommendation: 'Fix security vulnerabilities',
          issues: ['Potential code injection risk'],
          severity: 'high'
        } as T,
        confidence: 0.95,
        agent: this.id,
        reasoning: 'Detected potentially dangerous functions that could lead to code injection',
        uncertainties: ['Cannot determine if input is properly sanitized'],
        timestamp: Date.now()
      };
    }
    
    return {
      value: {
        recommendation: 'Code appears secure',
        issues: [],
        severity: 'low'
      } as T,
      confidence: 0.7,
      agent: this.id,
      reasoning: 'No obvious security vulnerabilities detected',
      uncertainties: ['Limited static analysis performed'],
      timestamp: Date.now()
    };
  }
}

// Example Architecture Agent
class ArchitectureAgent implements Agent {
  id = 'architecture-agent-1';
  name = 'Architecture Analyzer';
  capabilities = ['architecture', 'code-analysis'];
  endpoint = 'grpc://localhost:50052';

  async isAvailable(): Promise<boolean> {
    return true;
  }

  async analyze<T = any>(task: string, data?: any): Promise<AgentResult<T>> {
    logger.info({ task }, 'Architecture agent analyzing');
    
    // Analyze code complexity and structure
    const complexity = (data?.code?.length || 0) / 100;
    
    if (complexity > 5) {
      return {
        value: {
          recommendation: 'Refactor into smaller modules',
          complexity: complexity,
          suggestions: ['Extract functions', 'Create separate modules', 'Apply SOLID principles']
        } as T,
        confidence: 0.9,
        agent: this.id,
        reasoning: 'High code complexity indicates potential maintainability issues',
        timestamp: Date.now()
      };
    }
    
    return {
      value: {
        recommendation: 'Architecture is well-structured',
        complexity: complexity,
        suggestions: []
      } as T,
      confidence: 0.8,
      agent: this.id,
      reasoning: 'Code complexity is within acceptable limits',
      timestamp: Date.now()
    };
  }
}

// Main demo function
async function runDemo() {
  logger.info('=== Parallax Multi-Agent Coordination Demo ===');
  logger.info('Demonstrating real-time agent coordination with confidence tracking\n');

  // Initialize the Parallax coordinator
  const coordinator = new ParallaxCoordinator();
  
  // Create agents that implement the runtime Agent interface
  const securityAgent = new SecurityAgent();
  const architectureAgent = new ArchitectureAgent();
  
  // Register agents with the coordinator
  coordinator.registerAgent(securityAgent);
  coordinator.registerAgent(architectureAgent);
  
  logger.info({ 
    agents: [securityAgent.id, architectureAgent.id] 
  }, 'Agents registered and ready');

  // Example 1: Analyze potentially vulnerable code
  logger.info('\n=== Example 1: Security Analysis ===');
  
  const vulnerableCode = `
    function processUserInput(input) {
      // Dangerous: Direct HTML injection
      document.getElementById('output').innerHTML = input;
      
      // Dangerous: Code execution
      eval(input);
    }
  `;

  const results = await coordinator.analyzeWithAllAgents(
    'Analyze this code for security and architectural issues',
    { code: vulnerableCode }
  );

  results.forEach(result => {
    logger.info({
      agent: result.agent,
      confidence: result.confidence,
      value: result.value,
      reasoning: result.reasoning
    }, 'Agent analysis result');
  });

  // Example 2: Check consensus among agents
  logger.info('\n=== Example 2: Consensus Analysis ===');
  
  const consensus = await coordinator.getConsensus(results);
  logger.info({ 
    consensusLevel: consensus.consensus,
    weightedValue: consensus.weightedValue,
    disagreements: consensus.disagreements 
  }, 'Consensus analysis');

  // Example 3: Analyze clean code
  logger.info('\n=== Example 3: Clean Code Analysis ===');
  
  const cleanCode = `
    function addNumbers(a, b) {
      return a + b;
    }
  `;

  const cleanResults = await coordinator.analyzeWithAllAgents(
    'Analyze this simple function',
    { code: cleanCode }
  );

  cleanResults.forEach(result => {
    logger.info({
      agent: result.agent,
      confidence: result.confidence,
      recommendation: (result.value as any).recommendation
    }, 'Clean code analysis');
  });

  // Example 4: Demonstrate parallel path exploration
  logger.info('\n=== Example 4: Parallel Path Exploration ===');
  
  const shouldExplore = coordinator.shouldExploreParallel(results);
  logger.info({ 
    shouldExplore,
    reason: shouldExplore ? 'Mixed confidence levels suggest exploring alternatives' : 'High consensus'
  }, 'Parallel exploration decision');

  // Example 5: Pattern-based coordination
  logger.info('\n=== Example 5: Pattern-Based Coordination ===');
  
  // The Parallax platform uses .prism pattern files for sophisticated coordination
  // Patterns define complex multi-agent strategies using the Prism uncertainty language
  logger.info('Full pattern execution requires the complete Parallax platform stack');
  logger.info('See the pattern-demo app for examples of pattern-based coordination');
  
  logger.info('\n✅ Parallax demonstration completed successfully!');
  logger.info('The platform enables sophisticated multi-agent coordination with confidence tracking');
}

// Run the demo
runDemo().catch(error => {
  logger.error({ error }, 'Demo failed');
  process.exit(1);
});
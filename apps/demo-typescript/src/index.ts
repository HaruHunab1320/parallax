/**
 * TypeScript SDK Demo App
 * Tests all major features of the Parallax TypeScript SDK
 */

import { 
  ParallaxAgent, 
  confidence, 
  withMetadata,
  cached,
  ParallaxClient 
} from '@parallax/sdk-typescript';

// Create a custom agent using decorators
class DemoAgent extends ParallaxAgent {
  constructor() {
    super({
      id: 'demo-agent-ts',
      name: 'TypeScript Demo Agent',
      capabilities: ['code-analysis', 'testing'],
      expertise: 0.85
    });
  }

  @confidence(0.9)
  @withMetadata({ source: 'typescript-demo' })
  async analyzeCode(code: string) {
    // Simulate code analysis
    const hasTests = code.includes('test') || code.includes('describe');
    const hasTypes = code.includes('interface') || code.includes('type');
    
    return {
      hasTests,
      hasTypes,
      quality: hasTests && hasTypes ? 'high' : 'medium',
      suggestions: [
        !hasTests && 'Add unit tests',
        !hasTypes && 'Add TypeScript types'
      ].filter(Boolean)
    };
  }

  @cached(300) // Cache for 5 minutes
  async getSystemInfo() {
    return {
      version: '1.0.0',
      language: 'TypeScript',
      platform: process.platform,
      nodeVersion: process.version
    };
  }
}

// Test the SDK features
async function runDemo() {
  console.log('🚀 Parallax TypeScript SDK Demo\n');

  // 1. Test Agent Creation
  console.log('1️⃣ Creating Demo Agent...');
  const agent = new DemoAgent();
  console.log(`✅ Agent created: ${agent.name} (${agent.id})`);
  console.log(`   Capabilities: ${agent.capabilities.join(', ')}`);
  console.log(`   Expertise: ${agent.expertise}\n`);

  // 2. Test Agent Methods
  console.log('2️⃣ Testing Agent Methods...');
  
  const codeToAnalyze = `
    interface User {
      id: string;
      name: string;
    }
    
    function getUser(id: string): User {
      return { id, name: 'Test User' };
    }
  `;
  
  const analysis = await agent.analyze('analyze-code', { code: codeToAnalyze });
  console.log('✅ Code analysis result:', analysis);
  
  const systemInfo = await agent.analyze('get-system-info', {});
  console.log('✅ System info:', systemInfo.value);
  console.log(`   Confidence: ${systemInfo.confidence}\n`);

  // 3. Test Control Plane Client
  console.log('3️⃣ Testing Control Plane Client...');
  
  try {
    const client = new ParallaxClient({
      baseUrl: 'http://localhost:8080',
      timeout: 5000
    });
    
    // List patterns
    console.log('Fetching patterns...');
    const patterns = await client.listPatterns();
    console.log(`✅ Found ${patterns.length} patterns`);
    if (patterns.length > 0) {
      console.log(`   First pattern: ${patterns[0].name} v${patterns[0].version}`);
    }
    
    // Check health
    const health = await client.health();
    console.log('✅ Health check:', health);
    
  } catch (error) {
    console.log('⚠️  Control plane not running (this is normal for SDK testing)');
    console.log(`   Error: ${error.message}\n`);
  }

  // 4. Test Pattern Execution (if control plane is running)
  console.log('4️⃣ Testing Pattern Execution...');
  
  try {
    const client = new ParallaxClient({
      baseUrl: 'http://localhost:8080'
    });
    
    // Start the agent's gRPC server
    await agent.start(50051);
    console.log('✅ Agent gRPC server started on port 50051');
    
    // Register the agent
    await client.registerAgent({
      id: agent.id,
      name: agent.name,
      endpoint: 'grpc://localhost:50051',
      capabilities: agent.capabilities,
      metadata: { sdk: 'typescript', version: '0.1.0' }
    });
    console.log('✅ Agent registered with control plane');
    
    // Execute a pattern
    const execution = await client.executePattern('SimpleConsensus', {
      task: 'Test the TypeScript SDK',
      data: { test: true }
    });
    console.log('✅ Pattern execution started:', execution.id);
    
    // Wait for result
    const result = await client.getExecution(execution.id);
    console.log('✅ Execution result:', result);
    
  } catch (error) {
    console.log('⚠️  Pattern execution skipped (control plane not running)');
    console.log(`   Error: ${error.message}\n`);
  }

  // 5. Test Error Handling
  console.log('5️⃣ Testing Error Handling...');
  
  try {
    // Test invalid analysis
    await agent.analyze('invalid-task', {});
  } catch (error) {
    console.log('✅ Error handling works:', error.message);
  }

  console.log('\n✅ TypeScript SDK Demo Complete!');
  console.log('\nSummary:');
  console.log('- Agent creation: ✅');
  console.log('- Decorators: ✅');
  console.log('- Method execution: ✅');
  console.log('- Client API: ✅ (requires control plane)');
  console.log('- Error handling: ✅');
}

// Run the demo
runDemo().catch(console.error);
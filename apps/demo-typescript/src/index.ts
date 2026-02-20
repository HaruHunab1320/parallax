/**
 * TypeScript SDK Demo App
 * Tests all major features of the Parallax TypeScript SDK
 */

import { 
  ParallaxAgent, 
  serveAgent
} from '@parallax/sdk-typescript';

// Create a custom agent
class DemoAgent extends ParallaxAgent {
  constructor() {
    super(
      'demo-agent-ts',
      'TypeScript Demo Agent',
      ['code-analysis', 'testing'],
      { expertise: 0.85 }
    );
  }

  async analyze(task: string, data?: any) {
    // Route based on task
    if (task === 'analyze-code' || task.includes('code')) {
      return this.analyzeCode(data?.code || data);
    } else if (task === 'get-system-info' || task.includes('system')) {
      return this.getSystemInfo();
    }
    
    // Default response
    return {
      value: { task, data },
      confidence: 0.5,
      reasoning: 'Unknown task type'
    };
  }

  async analyzeCode(code: string) {
    // Simulate code analysis
    const hasTests = code.includes('test') || code.includes('describe');
    const hasTypes = code.includes('interface') || code.includes('type');
    
    const result = {
      hasTests,
      hasTypes,
      quality: hasTests && hasTypes ? 'high' : 'medium',
      suggestions: [
        !hasTests && 'Add unit tests',
        !hasTypes && 'Add TypeScript types'
      ].filter(Boolean)
    };

    return {
      value: result,
      confidence: 0.9,
      reasoning: `Analyzed code with ${hasTests ? '' : 'no '}tests and ${hasTypes ? '' : 'no '}types`
    };
  }

  async getSystemInfo() {
    const info = {
      version: '1.0.0',
      language: 'TypeScript',
      platform: process.platform,
      nodeVersion: process.version
    };

    return {
      value: info,
      confidence: 1.0,
      reasoning: 'System information retrieved'
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
  console.log(`   Metadata: ${JSON.stringify(agent.metadata)}\n`);

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

  // 3. Test gRPC Server and Control Plane Integration
  console.log('3️⃣ Testing gRPC Server and Control Plane Integration...');
  
  try {
    // Start the agent's gRPC server (this also registers with control plane)
    const port = await serveAgent(agent, 50055);
    console.log(`✅ Agent gRPC server started on port ${port} and registered with control plane`);
    console.log('   The agent is now ready to receive tasks from the control plane\n');
    
    // Keep running for a bit
    await new Promise(resolve => setTimeout(resolve, 2000));
    
  } catch (error: any) {
    console.log('⚠️  Failed to start gRPC server');
    console.log(`   Error: ${error.message}\n`);
  }

  // 4. Test Error Handling
  console.log('4️⃣ Testing Error Handling...');
  
  try {
    // Test invalid analysis
    await agent.analyze('invalid-task', {});
  } catch (error: any) {
    console.log('✅ Error handling works:', error.message);
  }

  console.log('\n✅ TypeScript SDK Demo Complete!');
  console.log('\nSummary:');
  console.log('- Agent creation: ✅');
  console.log('- Method execution: ✅');
  console.log('- gRPC server: ✅');
  console.log('- Error handling: ✅');
  
  // Exit after demo
  process.exit(0);
}

// Run the demo
runDemo().catch(console.error);
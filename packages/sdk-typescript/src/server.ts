import { ParallaxAgent } from './agent-base';
import { GrpcParallaxAgent } from './grpc-agent';

/**
 * Start an agent as a gRPC server
 */
export async function serveAgent(
  agent: ParallaxAgent,
  port: number = 0
): Promise<number> {
  // Create a gRPC-enabled version of the agent
  const grpcAgent = new GrpcParallaxAgent(
    agent.id,
    agent.name,
    agent.capabilities,
    agent.metadata
  );
  
  // Override the analyze method to use the original agent's implementation
  grpcAgent.analyze = agent.analyze.bind(agent);
  grpcAgent.checkHealth = agent.checkHealth.bind(agent);
  
  const actualPort = await grpcAgent.serve(port);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down agent...');
    await grpcAgent.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('Shutting down agent...');
    await grpcAgent.shutdown();
    process.exit(0);
  });
  
  return actualPort;
}

/**
 * Create and serve an agent in one call
 */
export async function createAndServe<T extends ParallaxAgent>(
  AgentClass: new (...args: any[]) => T,
  args: any[],
  port: number = 0
): Promise<{ agent: T; port: number }> {
  const agent = new AgentClass(...args);
  const actualPort = await serveAgent(agent, port);
  return { agent, port: actualPort };
}
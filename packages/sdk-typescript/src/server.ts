import { ParallaxAgent } from './agent-base';

/**
 * Start an agent as a gRPC server
 */
export async function serveAgent(
  agent: ParallaxAgent,
  port: number = 0
): Promise<number> {
  const actualPort = await agent.serve(port);
  
  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down agent...');
    await agent.shutdown();
    process.exit(0);
  });
  
  process.on('SIGTERM', async () => {
    console.log('Shutting down agent...');
    await agent.shutdown();
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
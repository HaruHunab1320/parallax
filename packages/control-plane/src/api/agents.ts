import { Router } from 'express';
import { EtcdRegistry } from '../registry';
import { MetricsCollector } from '../metrics/metrics-collector';
import { Logger } from 'pino';
import { GrpcAgentProxy } from '@parallax/runtime';
import { DatabaseService } from '../db/database.service';

export function createAgentsRouter(
  registry: EtcdRegistry,
  metrics: MetricsCollector,
  logger: Logger,
  database?: DatabaseService
): Router {
  const router = Router();

  // List all agents
  router.get('/', async (_req: any, res: any) => {
    try {
      let agents;
      
      // If database is available, get agents from both database and registry
      if (database) {
        const [dbAgents, registryAgents] = await Promise.all([
          database.agents.findAll(),
          registry.listServices('agent')
        ]);
        
        // Merge agents from both sources
        const agentMap = new Map();
        
        // Add database agents
        dbAgents.forEach(agent => {
          agentMap.set(agent.id, {
            id: agent.id,
            name: agent.name,
            endpoint: agent.endpoint,
            capabilities: agent.capabilities as string[],
            status: agent.status,
            metadata: agent.metadata,
            lastSeen: agent.lastSeen,
            source: 'database'
          });
        });
        
        // Add/update with registry agents
        registryAgents.forEach(agent => {
          const existing = agentMap.get(agent.id);
          if (existing) {
            // Update status from registry
            existing.status = 'active';
            existing.lastSeen = new Date();
          } else {
            agentMap.set(agent.id, {
              id: agent.id,
              name: agent.name,
              endpoint: agent.endpoint,
              capabilities: agent.metadata.capabilities || [],
              status: 'active',
              metadata: agent.metadata,
              lastSeen: new Date(),
              source: 'registry'
            });
          }
        });
        
        agents = Array.from(agentMap.values());
        
        // Persist registry agents to database
        for (const agent of registryAgents) {
          if (!dbAgents.find(db => db.id === agent.id)) {
            await database.agents.create({
              name: agent.name,
              endpoint: agent.endpoint,
              capabilities: agent.metadata.capabilities || [],
              status: 'active',
              metadata: agent.metadata
            }).catch(() => {}); // Ignore duplicates
          }
        }
      } else {
        // Fallback to registry only
        const registryAgents = await registry.listServices('agent');
        agents = registryAgents.map(agent => ({
          id: agent.id,
          name: agent.name,
          endpoint: agent.endpoint,
          capabilities: agent.metadata.capabilities || [],
          status: 'active',
          metadata: agent.metadata,
          lastSeen: new Date(),
          source: 'registry'
        }));
      }
      
      // Update metrics
      metrics.updateActiveAgents('all', agents.filter(a => a.status === 'active').length);
      
      // Group by capabilities
      const byCapability: Record<string, any[]> = {};
      agents.forEach(agent => {
        agent.capabilities.forEach((cap: string) => {
          if (!byCapability[cap]) {
            byCapability[cap] = [];
          }
          byCapability[cap].push(agent);
        });
      });
      
      return res.json({ 
        agents,
        count: agents.length,
        byCapability,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list agents');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list agents'
      });
    }
  });

  // Get agent details
  router.get('/:id', async (req: any, res: any) => {
    const { id } = req.params;
    
    try {
      let agent;
      
      // Try database first
      if (database) {
        agent = await database.agents.findById(id);
      }
      
      // Fallback to registry
      if (!agent) {
        const agents = await registry.listServices('agent');
        const registryAgent = agents.find(a => a.id === id);
        if (registryAgent) {
          agent = {
            id: registryAgent.id,
            name: registryAgent.name,
            endpoint: registryAgent.endpoint,
            capabilities: registryAgent.metadata.capabilities || [],
            status: 'active',
            metadata: registryAgent.metadata,
            lastSeen: new Date()
          };
        }
      }
      
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      return res.json(agent);
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to get agent details');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get agent details'
      });
    }
  });

  // Health check an agent
  router.get('/:id/health', async (req: any, res: any) => {
    const { id } = req.params;
    
    try {
      const agents = await registry.listServices('agent');
      const agent = agents.find(a => a.id === id);
      
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      // Create gRPC proxy to agent
      const proxy = new GrpcAgentProxy(
        agent.id,
        agent.name,
        agent.endpoint
      );
      
      try {
        const isHealthy = await proxy.isAvailable();
        
        // Update agent status in database
        if (isHealthy && database) {
          await database.agents.updateHeartbeat(id);
        }
        
        return res.json({
          agentId: id,
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        return res.json({
          agentId: id,
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Connection failed',
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to health check agent');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to health check agent'
      });
    }
  });

  // Test agent capabilities
  router.post('/:id/test', async (req: any, res: any) => {
    const { id } = req.params;
    const { task, data } = req.body;
    
    if (!task || !data) {
      return res.status(400).json({ 
        error: 'Missing required fields: task, data' 
      });
    }
    
    try {
      const agents = await registry.listServices('agent');
      const agent = agents.find(a => a.id === id);
      
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      // Create gRPC proxy to agent
      const proxy = new GrpcAgentProxy(
        agent.id,
        agent.name,
        agent.endpoint
      );
      
      const result = await proxy.analyze(task, data);
      
      return res.json({
        agentId: id,
        result: result.value,
        confidence: result.confidence,
        reasoning: result.reasoning,
        timestamp: result.timestamp
      });
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to test agent');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to test agent'
      });
    }
  });

  // Get capability statistics
  router.get('/stats/capabilities', async (_req: any, res: any) => {
    try {
      if (database) {
        const stats = await database.agents.getCapabilitiesStats();
        return res.json({ stats });
      } else {
        // Fallback to simple count from registry
        const agents = await registry.listServices('agent');
        const capabilityCount: Record<string, number> = {};
        
        agents.forEach(agent => {
          const capabilities = agent.metadata.capabilities || [];
          capabilities.forEach((cap: string) => {
            capabilityCount[cap] = (capabilityCount[cap] || 0) + 1;
          });
        });
        
        const stats = Object.entries(capabilityCount).map(([capability, count]) => ({
          capability,
          agent_count: count,
          active_count: count // All registry agents are active
        }));
        
        return res.json({ stats });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get capability statistics');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get statistics'
      });
    }
  });

  return router;
}
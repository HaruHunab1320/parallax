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
  router.get('/', async (_req, res) => {
    try {
      const agents = await registry.listServices('agent');
      
      // Update metrics
      metrics.updateActiveAgents('all', agents.length);
      
      // Group by capabilities
      const byCapability: Record<string, any[]> = {};
      agents.forEach(agent => {
        const capabilities = agent.metadata.capabilities || [];
        capabilities.forEach((cap: string) => {
          if (!byCapability[cap]) {
            byCapability[cap] = [];
          }
          byCapability[cap].push(agent);
        });
      });
      
      res.json({ 
        agents,
        count: agents.length,
        byCapability,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list agents');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list agents'
      });
    }
  });

  // Get agent details
  router.get('/:id', async (req, res) => {
    const { id } = req.params;
    
    try {
      const agents = await registry.listServices('agent');
      const agent = agents.find(a => a.id === id);
      
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      res.json({
        id: agent.id,
        name: agent.name,
        endpoint: agent.endpoint,
        capabilities: agent.metadata.capabilities || [],
        expertise: agent.metadata.expertise || {},
        lastSeen: agent.lastSeen,
        status: agent.status,
        metadata: agent.metadata
      });
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to get agent details');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get agent details'
      });
    }
  });

  // Get agent health
  router.get('/:id/health', async (req, res) => {
    const { id } = req.params;
    
    try {
      const agents = await registry.listServices('agent');
      const agent = agents.find(a => a.id === id);
      
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      // Create proxy to check health
      const proxy = new GrpcAgentProxy(
        agent.id,
        agent.name,
        agent.endpoint
      );
      
      try {
        const health = await proxy.health();
        res.json({
          agentId: id,
          status: health.status,
          uptime: health.uptime,
          lastCheck: health.lastCheck,
          details: health.details
        });
      } catch (healthError) {
        res.status(503).json({
          agentId: id,
          status: 'unhealthy',
          error: healthError instanceof Error ? healthError.message : 'Health check failed'
        });
      }
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to check agent health');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to check agent health'
      });
    }
  });

  // Test agent with sample input
  router.post('/:id/test', async (req, res) => {
    const { id } = req.params;
    const { task = 'test', data = {} } = req.body;
    
    try {
      const agents = await registry.listServices('agent');
      const agent = agents.find(a => a.id === id);
      
      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }
      
      // Create proxy to test agent
      const proxy = new GrpcAgentProxy(
        agent.id,
        agent.name,
        agent.endpoint
      );
      
      const startTime = Date.now();
      const result = await proxy.analyze(task, data);
      const duration = Date.now() - startTime;
      
      res.json({
        agentId: id,
        task,
        result: {
          value: result.value,
          confidence: result.confidence,
          reasoning: result.reasoning,
          timestamp: result.timestamp,
          confidence_factors: result.confidence_factors
        },
        duration,
        success: true
      });
    } catch (error) {
      logger.error({ error, agentId: id }, 'Agent test failed');
      res.status(500).json({
        agentId: id,
        task,
        success: false,
        error: error instanceof Error ? error.message : 'Agent test failed'
      });
    }
  });

  // Get agents by capability
  router.get('/capability/:capability', async (req, res) => {
    const { capability } = req.params;
    
    try {
      const agents = await registry.listServices('agent');
      const filtered = agents.filter(agent => {
        const capabilities = agent.metadata.capabilities || [];
        return capabilities.includes(capability);
      });
      
      res.json({
        capability,
        agents: filtered,
        count: filtered.length
      });
    } catch (error) {
      logger.error({ error, capability }, 'Failed to filter agents by capability');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to filter agents'
      });
    }
  });

  // Unregister agent (admin only)
  router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    
    // TODO: Add authentication/authorization
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Agent deletion disabled in production' });
    }
    
    try {
      await registry.unregister(`agent/${id}`);
      res.json({
        message: 'Agent unregistered successfully',
        agentId: id
      });
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to unregister agent');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to unregister agent'
      });
    }
  });

  return router;
}
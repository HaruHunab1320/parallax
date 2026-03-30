import { GrpcAgentProxy } from '@parallaxai/runtime';
import { Router } from 'express';
import type { Logger } from 'pino';
import type { DatabaseService } from '../db/database.service';
import type { MetricsCollector } from '../metrics/metrics-collector';
import type { EtcdRegistry } from '../registry';

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
          registry.listServices('agent'),
        ]);

        // Merge agents from both sources
        const agentMap = new Map();

        // Add database agents
        dbAgents.forEach((agent) => {
          agentMap.set(agent.id, {
            id: agent.id,
            name: agent.name,
            endpoint: agent.endpoint,
            capabilities: agent.capabilities as string[],
            status: agent.status,
            metadata: agent.metadata,
            lastSeen: agent.lastSeen,
            source: 'database',
          });
        });

        // Add/update with registry agents
        registryAgents.forEach((agent) => {
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
              source: 'registry',
            });
          }
        });

        agents = Array.from(agentMap.values());

        // Sync registry agents to database via upsert (prevents duplicate rows)
        for (const agent of registryAgents) {
          await database.agents
            .upsert(agent.id, {
              name: agent.name,
              endpoint: agent.endpoint,
              capabilities: agent.metadata.capabilities || [],
              status: 'active',
              metadata: agent.metadata,
            })
            .catch(() => {});
        }
      } else {
        // Fallback to registry only
        const registryAgents = await registry.listServices('agent');
        agents = registryAgents.map((agent) => ({
          id: agent.id,
          name: agent.name,
          endpoint: agent.endpoint,
          capabilities: agent.metadata.capabilities || [],
          status: 'active',
          metadata: agent.metadata,
          lastSeen: new Date(),
          source: 'registry',
        }));
      }

      // Update metrics
      metrics.updateActiveAgents(
        'all',
        agents.filter((a) => a.status === 'active').length
      );

      // Group by capabilities
      const byCapability: Record<string, any[]> = {};
      agents.forEach((agent) => {
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
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error({ error }, 'Failed to list agents');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list agents',
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
        const registryAgent = agents.find((a) => a.id === id);
        if (registryAgent) {
          agent = {
            id: registryAgent.id,
            name: registryAgent.name,
            endpoint: registryAgent.endpoint,
            capabilities: registryAgent.metadata.capabilities || [],
            status: 'active',
            metadata: registryAgent.metadata,
            lastSeen: new Date(),
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
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get agent details',
      });
    }
  });

  // Health check an agent
  router.get('/:id/health', async (req: any, res: any) => {
    const { id } = req.params;

    try {
      const agents = await registry.listServices('agent');
      const agent = agents.find((a) => a.id === id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Create gRPC proxy to agent
      const proxy = new GrpcAgentProxy(agent.id, agent.name, agent.endpoint);

      try {
        const isHealthy = await proxy.isAvailable();

        // Update agent status in database
        if (isHealthy && database) {
          await database.agents.updateHeartbeat(id);
        }

        return res.json({
          agentId: id,
          status: isHealthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        return res.json({
          agentId: id,
          status: 'unhealthy',
          error: error instanceof Error ? error.message : 'Connection failed',
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to health check agent');
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to health check agent',
      });
    }
  });

  // Test agent capabilities
  router.post('/:id/test', async (req: any, res: any) => {
    const { id } = req.params;
    const { task, data } = req.body;

    if (!task || !data) {
      return res.status(400).json({
        error: 'Missing required fields: task, data',
      });
    }

    try {
      const agents = await registry.listServices('agent');
      const agent = agents.find((a) => a.id === id);

      if (!agent) {
        return res.status(404).json({ error: 'Agent not found' });
      }

      // Create gRPC proxy to agent
      const proxy = new GrpcAgentProxy(agent.id, agent.name, agent.endpoint);

      const result = await proxy.analyze(task, data);

      return res.json({
        agentId: id,
        result: result.value,
        confidence: result.confidence,
        reasoning: result.reasoning,
        timestamp: result.timestamp,
      });
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to test agent');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to test agent',
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

        agents.forEach((agent) => {
          const capabilities = agent.metadata.capabilities || [];
          capabilities.forEach((cap: string) => {
            capabilityCount[cap] = (capabilityCount[cap] || 0) + 1;
          });
        });

        const stats = Object.entries(capabilityCount).map(
          ([capability, count]) => ({
            capability,
            agent_count: count,
            active_count: count, // All registry agents are active
          })
        );

        return res.json({ stats });
      }
    } catch (error) {
      logger.error({ error }, 'Failed to get capability statistics');
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to get statistics',
      });
    }
  });

  // Update agent status
  router.patch('/:id/status', async (req: any, res: any) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['active', 'inactive', 'error'].includes(status)) {
      return res.status(400).json({
        error: 'Invalid status. Must be one of: active, inactive, error',
      });
    }

    try {
      if (database) {
        const agent = await database.agents.update(id, { status });
        logger.info({ agentId: id, status }, 'Agent status updated');
        return res.json(agent);
      }

      return res.status(501).json({
        error: 'Database not available — cannot update agent status',
      });
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to update agent status');
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to update agent status',
      });
    }
  });

  // Delete a specific agent
  router.delete('/:id', async (req: any, res: any) => {
    const { id } = req.params;

    try {
      // Remove from etcd registry
      await registry.unregister('agent', id).catch(() => {});

      // Remove from database
      if (database) {
        await database.agents.delete(id).catch(() => {});
      }

      logger.info({ agentId: id }, 'Agent deleted');
      return res.json({ deleted: id });
    } catch (error) {
      logger.error({ error, agentId: id }, 'Failed to delete agent');
      return res.status(500).json({
        error:
          error instanceof Error ? error.message : 'Failed to delete agent',
      });
    }
  });

  // Bulk delete stale agents
  router.delete('/', async (req: any, res: any) => {
    const { stale, threshold } = req.query;

    if (stale !== 'true') {
      return res.status(400).json({
        error: 'Use ?stale=true to delete stale agents',
      });
    }

    const thresholdSeconds = parseInt(threshold as string, 10) || 300;

    try {
      let deletedCount = 0;

      if (database) {
        const cutoff = new Date(Date.now() - thresholdSeconds * 1000);
        deletedCount = await database.agents.deleteStale(cutoff);
      }

      logger.info({ deletedCount, thresholdSeconds }, 'Stale agents purged');
      return res.json({
        deleted: deletedCount,
        thresholdSeconds,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to delete stale agents');
      return res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Failed to delete stale agents',
      });
    }
  });

  return router;
}

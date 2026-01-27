/**
 * Managed Agents API Router
 *
 * REST endpoints for spawning and managing CLI agents through runtime providers.
 */

import { Router, Request, Response } from 'express';
import { Logger } from 'pino';
import { AgentRuntimeService } from '../agent-runtime';
import { AgentConfig, AgentFilter } from '@parallax/runtime-interface';

export function createManagedAgentsRouter(
  agentRuntimeService: AgentRuntimeService,
  logger: Logger
): Router {
  const router = Router();

  // List all runtimes
  router.get('/runtimes', (_req: Request, res: Response) => {
    const runtimes = agentRuntimeService.listRuntimes();
    res.json({ runtimes });
  });

  // Get runtime health
  router.get('/runtimes/:name/health', async (req: Request, res: Response) => {
    try {
      const health = await agentRuntimeService.getRuntimeHealth(req.params.name);
      if (!health) {
        res.status(404).json({ error: 'Runtime not found' });
        return;
      }
      res.json(health);
    } catch (error) {
      logger.error({ error, runtime: req.params.name }, 'Failed to get runtime health');
      res.status(500).json({ error: 'Failed to get runtime health' });
    }
  });

  // List all managed agents
  router.get('/', async (req: Request, res: Response) => {
    try {
      const filter: AgentFilter = {};

      if (req.query.status) {
        const statuses = Array.isArray(req.query.status)
          ? req.query.status
          : [req.query.status];
        filter.status = statuses as any;
      }

      if (req.query.type) {
        const types = Array.isArray(req.query.type) ? req.query.type : [req.query.type];
        filter.type = types as any;
      }

      if (req.query.role) {
        filter.role = req.query.role as string;
      }

      const agents = await agentRuntimeService.list(filter);
      res.json({ agents, count: agents.length });
    } catch (error) {
      logger.error({ error }, 'Failed to list managed agents');
      res.status(500).json({ error: 'Failed to list agents' });
    }
  });

  // Spawn a new agent
  router.post('/', async (req: Request, res: Response) => {
    try {
      const config: AgentConfig = req.body;
      const preferredRuntime = req.query.runtime as string | undefined;

      // Validate required fields
      if (!config.type) {
        res.status(400).json({ error: 'Agent type is required' });
        return;
      }

      if (!config.name) {
        res.status(400).json({ error: 'Agent name is required' });
        return;
      }

      // Set defaults
      if (!config.capabilities) {
        config.capabilities = [];
      }

      const agent = await agentRuntimeService.spawn(config, preferredRuntime);

      logger.info({ agentId: agent.id, type: config.type, name: config.name }, 'Agent spawned');

      res.status(201).json(agent);
    } catch (error) {
      logger.error({ error }, 'Failed to spawn agent');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to spawn agent',
      });
    }
  });

  // Get agent by ID
  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const agent = await agentRuntimeService.get(req.params.id);
      if (!agent) {
        res.status(404).json({ error: 'Agent not found' });
        return;
      }
      res.json(agent);
    } catch (error) {
      logger.error({ error, agentId: req.params.id }, 'Failed to get agent');
      res.status(500).json({ error: 'Failed to get agent' });
    }
  });

  // Stop an agent
  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const force = req.query.force === 'true';
      const timeout = req.query.timeout
        ? parseInt(req.query.timeout as string, 10)
        : undefined;

      await agentRuntimeService.stop(req.params.id, { force, timeout });

      logger.info({ agentId: req.params.id, force }, 'Agent stopped');

      res.status(204).send();
    } catch (error) {
      logger.error({ error, agentId: req.params.id }, 'Failed to stop agent');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to stop agent',
      });
    }
  });

  // Send message to agent
  router.post('/:id/send', async (req: Request, res: Response) => {
    try {
      const { message, expectResponse, timeout } = req.body;

      if (!message) {
        res.status(400).json({ error: 'Message is required' });
        return;
      }

      const response = await agentRuntimeService.send(req.params.id, message, {
        expectResponse,
        timeout,
      });

      res.json({ sent: true, response });
    } catch (error) {
      logger.error({ error, agentId: req.params.id }, 'Failed to send message');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to send message',
      });
    }
  });

  // Get agent logs
  router.get('/:id/logs', async (req: Request, res: Response) => {
    try {
      const tail = req.query.tail ? parseInt(req.query.tail as string, 10) : 100;

      const logs = await agentRuntimeService.logs(req.params.id, { tail });

      res.json({ logs, count: logs.length });
    } catch (error) {
      logger.error({ error, agentId: req.params.id }, 'Failed to get logs');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get logs',
      });
    }
  });

  // Get agent metrics
  router.get('/:id/metrics', async (req: Request, res: Response) => {
    try {
      const metrics = await agentRuntimeService.metrics(req.params.id);
      if (!metrics) {
        res.status(404).json({ error: 'Agent not found or metrics unavailable' });
        return;
      }
      res.json(metrics);
    } catch (error) {
      logger.error({ error, agentId: req.params.id }, 'Failed to get metrics');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get metrics',
      });
    }
  });

  return router;
}

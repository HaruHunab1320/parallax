/**
 * Managed Threads API Router
 *
 * REST endpoints for listing and supervising long-lived threads through runtime providers.
 */

import { Router, Request, Response } from 'express';
import { Logger } from 'pino';
import { AgentRuntimeService } from '../agent-runtime';
import { SpawnThreadInput, ThreadFilter, ThreadInput } from '@parallaxai/runtime-interface';
import {
  EpisodicExperienceRepository,
  SharedDecisionRepository,
  ThreadRepository,
} from '../db/repositories';
import { ThreadPreparationService } from '../threads';

export function createManagedThreadsRouter(
  agentRuntimeService: AgentRuntimeService,
  logger: Logger,
  threadRepository?: ThreadRepository,
  sharedDecisionRepository?: SharedDecisionRepository,
  episodicExperienceRepository?: EpisodicExperienceRepository,
  threadPreparationService?: ThreadPreparationService
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const filter: ThreadFilter = {};

      if (req.query.status) {
        const statuses = Array.isArray(req.query.status)
          ? req.query.status
          : [req.query.status];
        filter.status = statuses as ThreadFilter['status'];
      }

      if (req.query.executionId) {
        filter.executionId = req.query.executionId as string;
      }

      if (req.query.role) {
        filter.role = req.query.role as string;
      }

      const threads = threadRepository
        ? await threadRepository.findAll(filter)
        : await agentRuntimeService.listThreads(filter);
      res.json({ threads, count: threads.length });
    } catch (error) {
      logger.error({ error }, 'Failed to list managed threads');
      res.status(500).json({ error: 'Failed to list threads' });
    }
  });

  router.post('/', async (req: Request, res: Response) => {
    try {
      const input: SpawnThreadInput = req.body;
      const preferredRuntime = req.query.runtime as string | undefined;

      if (!input.executionId) {
        res.status(400).json({ error: 'Thread executionId is required' });
        return;
      }

      if (!input.agentType) {
        res.status(400).json({ error: 'Thread agentType is required' });
        return;
      }

      if (!input.name) {
        res.status(400).json({ error: 'Thread name is required' });
        return;
      }

      if (!input.objective) {
        res.status(400).json({ error: 'Thread objective is required' });
        return;
      }

      const preparedInput = threadPreparationService
        ? await threadPreparationService.prepareSpawnInput(input)
        : input;
      const thread = await agentRuntimeService.spawnThread(preparedInput, preferredRuntime);
      if (threadRepository) {
        await threadRepository.upsert(thread, preferredRuntime ?? thread.runtimeName);
      }

      logger.info(
        {
          threadId: thread.id,
          executionId: thread.executionId,
          agentType: thread.agentType,
        },
        'Thread spawned'
      );

      res.status(201).json(thread);
    } catch (error) {
      logger.error({ error }, 'Failed to spawn thread');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to spawn thread',
      });
    }
  });

  router.post('/prepare', async (req: Request, res: Response) => {
    if (!threadPreparationService) {
      res.status(501).json({ error: 'Thread preparation service is not available' });
      return;
    }

    try {
      const input: SpawnThreadInput = req.body;

      if (!input.executionId) {
        res.status(400).json({ error: 'Thread executionId is required' });
        return;
      }

      if (!input.name) {
        res.status(400).json({ error: 'Thread name is required' });
        return;
      }

      if (!input.objective) {
        res.status(400).json({ error: 'Thread objective is required' });
        return;
      }

      const prepared = await threadPreparationService.prepare(input);
      res.json({
        executionId: input.executionId,
        name: input.name,
        objective: input.objective,
        role: input.role,
        preparation: prepared.preparation,
        metadata: prepared.metadata,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to prepare thread input');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to prepare thread input',
      });
    }
  });

  router.get('/executions/:executionId', async (req: Request, res: Response) => {
    try {
      const threads = threadRepository
        ? await threadRepository.findByExecutionId(req.params.executionId)
        : await agentRuntimeService.listThreads({
            executionId: req.params.executionId,
          });

      res.json({ threads, count: threads.length });
    } catch (error) {
      logger.error({ error, executionId: req.params.executionId }, 'Failed to list execution threads');
      res.status(500).json({ error: 'Failed to list execution threads' });
    }
  });

  router.get('/executions/:executionId/shared-decisions', async (req: Request, res: Response) => {
    if (!sharedDecisionRepository) {
      res.status(501).json({ error: 'Shared decisions require persistence' });
      return;
    }

    try {
      const decisions = await sharedDecisionRepository.findAll({
        executionId: req.params.executionId,
        category: req.query.category as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      });
      res.json({ decisions, count: decisions.length });
    } catch (error) {
      logger.error(
        { error, executionId: req.params.executionId },
        'Failed to get shared decisions for execution'
      );
      res.status(500).json({ error: 'Failed to get shared decisions for execution' });
    }
  });

  router.get('/experiences', async (req: Request, res: Response) => {
    if (!episodicExperienceRepository) {
      res.status(501).json({ error: 'Episodic experiences require persistence' });
      return;
    }

    try {
      const experiences = await episodicExperienceRepository.findAll({
        executionId: req.query.executionId as string | undefined,
        threadId: req.query.threadId as string | undefined,
        role: req.query.role as string | undefined,
        repo: req.query.repo as string | undefined,
        outcome: req.query.outcome as string | undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      });
      res.json({ experiences, count: experiences.length });
    } catch (error) {
      logger.error({ error }, 'Failed to get episodic experiences');
      res.status(500).json({ error: 'Failed to get episodic experiences' });
    }
  });

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const thread = threadRepository
        ? await threadRepository.findById(req.params.id)
        : await agentRuntimeService.getThread(req.params.id);
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }

      res.json(thread);
    } catch (error) {
      logger.error({ error, threadId: req.params.id }, 'Failed to get thread');
      res.status(500).json({ error: 'Failed to get thread' });
    }
  });

  router.delete('/:id', async (req: Request, res: Response) => {
    try {
      const force = req.query.force === 'true';
      const timeout = req.query.timeout
        ? parseInt(req.query.timeout as string, 10)
        : undefined;

      await agentRuntimeService.stopThread(req.params.id, { force, timeout });

      logger.info({ threadId: req.params.id, force }, 'Thread stopped');
      res.status(204).send();
    } catch (error) {
      logger.error({ error, threadId: req.params.id }, 'Failed to stop thread');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to stop thread',
      });
    }
  });

  router.post('/:id/send', async (req: Request, res: Response) => {
    try {
      const input: ThreadInput = req.body;

      if (!input.message && !input.raw && (!input.keys || input.keys.length === 0)) {
        res.status(400).json({ error: 'Thread input requires message, raw, or keys' });
        return;
      }

      await agentRuntimeService.sendToThread(req.params.id, input);
      res.json({ sent: true });
    } catch (error) {
      logger.error({ error, threadId: req.params.id }, 'Failed to send input to thread');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to send input to thread',
      });
    }
  });

  router.get('/:id/events', async (req: Request, res: Response) => {
    if (!threadRepository) {
      res.status(501).json({ error: 'Thread events require persistence' });
      return;
    }

    try {
      const events = await threadRepository.getEvents(req.params.id);
      res.json({ events, count: events.length });
    } catch (error) {
      logger.error({ error, threadId: req.params.id }, 'Failed to get thread events');
      res.status(500).json({ error: 'Failed to get thread events' });
    }
  });

  router.get('/:id/shared-decisions', async (req: Request, res: Response) => {
    if (!sharedDecisionRepository) {
      res.status(501).json({ error: 'Shared decisions require persistence' });
      return;
    }

    try {
      const decisions = await sharedDecisionRepository.findAll({
        threadId: req.params.id,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
      });
      res.json({ decisions, count: decisions.length });
    } catch (error) {
      logger.error({ error, threadId: req.params.id }, 'Failed to get shared decisions for thread');
      res.status(500).json({ error: 'Failed to get shared decisions for thread' });
    }
  });

  router.post('/:id/shared-decisions', async (req: Request, res: Response) => {
    if (!sharedDecisionRepository) {
      res.status(501).json({ error: 'Shared decisions require persistence' });
      return;
    }

    try {
      const thread = threadRepository
        ? await threadRepository.findById(req.params.id)
        : await agentRuntimeService.getThread(req.params.id);
      if (!thread) {
        res.status(404).json({ error: 'Thread not found' });
        return;
      }

      const { category, summary, details } = req.body;
      if (!category || !summary) {
        res.status(400).json({ error: 'Shared decision category and summary are required' });
        return;
      }

      const decision = await sharedDecisionRepository.create({
        executionId: thread.executionId,
        threadId: req.params.id,
        category,
        summary,
        details,
      });

      res.status(201).json(decision);
    } catch (error) {
      logger.error({ error, threadId: req.params.id }, 'Failed to create shared decision');
      res.status(500).json({ error: 'Failed to create shared decision' });
    }
  });

  return router;
}

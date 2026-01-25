/**
 * Triggers API Router
 *
 * REST API endpoints for managing webhook and event triggers.
 */

import { Router } from 'express';
import { Logger } from 'pino';
import { TriggerService } from '../scheduler';
import { LicenseEnforcer } from '../licensing/license-enforcer';

export function createTriggersRouter(
  triggerService: TriggerService,
  licenseEnforcer: LicenseEnforcer,
  logger: Logger,
  baseUrl?: string
): Router {
  const router = Router();
  const log = logger.child({ component: 'TriggersAPI' });

  // Middleware to check enterprise license
  const requireTriggers = (_req: any, res: any, next: any) => {
    try {
      licenseEnforcer.requireFeature('scheduled_patterns', 'Triggers');
      next();
    } catch (error: any) {
      log.warn('Triggers feature not available');
      return res.status(403).json({
        error: error.message,
        upgradeUrl: error.upgradeUrl || 'https://parallax.ai/enterprise',
      });
    }
  };

  // Apply license check to management routes
  router.use('/', (req, res, next) => {
    // Skip license check for webhook receiver endpoint
    if (req.path.startsWith('/webhook/')) {
      return next();
    }
    return requireTriggers(req, res, next);
  });

  /**
   * GET /triggers
   * List all triggers
   */
  router.get('/', async (req: any, res: any) => {
    try {
      const { type, status, patternName, limit, offset } = req.query;

      const triggers = await triggerService.listTriggers({
        type: type as 'webhook' | 'event',
        status: status as string,
        patternName: patternName as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      // Add webhook URLs
      const triggersWithUrls = triggers.map((trigger) => ({
        ...trigger,
        webhookUrl: trigger.type === 'webhook' && trigger.webhookPath
          ? triggerService.getWebhookUrl(trigger, baseUrl || '')
          : undefined,
      }));

      return res.json({
        triggers: triggersWithUrls,
        count: triggers.length,
      });
    } catch (error) {
      log.error({ error }, 'Failed to list triggers');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list triggers',
      });
    }
  });

  /**
   * POST /triggers/webhook
   * Create a webhook trigger
   */
  router.post('/webhook', async (req: any, res: any) => {
    try {
      const { name, patternName, description, secret, inputMapping, metadata } = req.body;

      if (!name || !patternName) {
        return res.status(400).json({
          error: 'Missing required fields: name, patternName',
        });
      }

      const trigger = await triggerService.createWebhookTrigger({
        name,
        patternName,
        description,
        secret,
        inputMapping,
        metadata,
      });

      const webhookUrl = triggerService.getWebhookUrl(trigger, baseUrl || '');

      log.info({ triggerId: trigger.id, name }, 'Webhook trigger created via API');

      return res.status(201).json({
        ...trigger,
        webhookUrl,
      });
    } catch (error) {
      log.error({ error }, 'Failed to create webhook trigger');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create webhook trigger',
      });
    }
  });

  /**
   * POST /triggers/event
   * Create an event trigger
   */
  router.post('/event', async (req: any, res: any) => {
    try {
      const {
        name,
        patternName,
        description,
        eventType,
        eventFilter,
        inputMapping,
        metadata,
      } = req.body;

      if (!name || !patternName || !eventType) {
        return res.status(400).json({
          error: 'Missing required fields: name, patternName, eventType',
        });
      }

      const trigger = await triggerService.createEventTrigger({
        name,
        patternName,
        description,
        eventType,
        eventFilter,
        inputMapping,
        metadata,
      });

      log.info({ triggerId: trigger.id, name, eventType }, 'Event trigger created via API');

      return res.status(201).json(trigger);
    } catch (error) {
      log.error({ error }, 'Failed to create event trigger');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create event trigger',
      });
    }
  });

  /**
   * GET /triggers/:id
   * Get a trigger by ID
   */
  router.get('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const trigger = await triggerService.getTrigger(id);

      if (!trigger) {
        return res.status(404).json({ error: 'Trigger not found' });
      }

      const response: any = { ...trigger };
      if (trigger.type === 'webhook' && trigger.webhookPath) {
        response.webhookUrl = triggerService.getWebhookUrl(trigger, baseUrl || '');
      }

      return res.json(response);
    } catch (error) {
      log.error({ error, triggerId: req.params.id }, 'Failed to get trigger');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get trigger',
      });
    }
  });

  /**
   * PUT /triggers/:id
   * Update a trigger
   */
  router.put('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const {
        name,
        patternName,
        description,
        secret,
        eventType,
        eventFilter,
        inputMapping,
        metadata,
      } = req.body;

      const trigger = await triggerService.updateTrigger(id, {
        name,
        patternName,
        description,
        secret,
        eventType,
        eventFilter,
        inputMapping,
        metadata,
      });

      log.info({ triggerId: id }, 'Trigger updated via API');

      const response: any = { ...trigger };
      if (trigger.type === 'webhook' && trigger.webhookPath) {
        response.webhookUrl = triggerService.getWebhookUrl(trigger, baseUrl || '');
      }

      return res.json(response);
    } catch (error) {
      log.error({ error, triggerId: req.params.id }, 'Failed to update trigger');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update trigger',
      });
    }
  });

  /**
   * DELETE /triggers/:id
   * Delete a trigger
   */
  router.delete('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await triggerService.deleteTrigger(id);

      log.info({ triggerId: id }, 'Trigger deleted via API');

      return res.status(204).send();
    } catch (error) {
      log.error({ error, triggerId: req.params.id }, 'Failed to delete trigger');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete trigger',
      });
    }
  });

  /**
   * POST /triggers/:id/pause
   * Pause a trigger
   */
  router.post('/:id/pause', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const trigger = await triggerService.pauseTrigger(id);

      log.info({ triggerId: id }, 'Trigger paused via API');

      return res.json(trigger);
    } catch (error) {
      log.error({ error, triggerId: req.params.id }, 'Failed to pause trigger');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to pause trigger',
      });
    }
  });

  /**
   * POST /triggers/:id/resume
   * Resume a paused trigger
   */
  router.post('/:id/resume', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const trigger = await triggerService.resumeTrigger(id);

      log.info({ triggerId: id }, 'Trigger resumed via API');

      return res.json(trigger);
    } catch (error) {
      log.error({ error, triggerId: req.params.id }, 'Failed to resume trigger');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to resume trigger',
      });
    }
  });

  /**
   * POST /triggers/webhook/:path
   * Webhook receiver endpoint (no auth required)
   */
  router.post('/webhook/:path', async (req: any, res: any) => {
    try {
      const { path } = req.params;

      const result = await triggerService.handleWebhook(path, {
        headers: req.headers,
        body: req.body,
        query: req.query,
      });

      if (!result.triggered) {
        if (result.error === 'Trigger not found') {
          return res.status(404).json({ error: result.error });
        }
        if (result.error === 'Invalid signature') {
          return res.status(401).json({ error: result.error });
        }
        return res.status(400).json({ error: result.error });
      }

      log.info({ path, executionId: result.executionId }, 'Webhook received');

      return res.json({
        triggered: true,
        executionId: result.executionId,
      });
    } catch (error) {
      log.error({ error, path: req.params.path }, 'Webhook handler error');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Webhook handler error',
      });
    }
  });

  return router;
}

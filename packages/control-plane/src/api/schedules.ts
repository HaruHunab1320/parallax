/**
 * Schedules API Router
 *
 * REST API endpoints for managing scheduled pattern executions.
 */

import { Router } from 'express';
import { Logger } from 'pino';
import { SchedulerService } from '../scheduler';
import { LicenseEnforcer } from '../licensing/license-enforcer';

export function createSchedulesRouter(
  schedulerService: SchedulerService,
  licenseEnforcer: LicenseEnforcer,
  logger: Logger
): Router {
  const router = Router();
  const log = logger.child({ component: 'SchedulesAPI' });

  // Middleware to check enterprise license
  const requireScheduling = (_req: any, res: any, next: any) => {
    try {
      licenseEnforcer.requireFeature('scheduled_patterns', 'Scheduled Patterns');
      next();
    } catch (error: any) {
      log.warn('Scheduled patterns feature not available');
      return res.status(403).json({
        error: error.message,
        upgradeUrl: error.upgradeUrl || 'https://parallax.ai/enterprise',
      });
    }
  };

  // Apply license check to all routes
  router.use(requireScheduling);

  /**
   * GET /schedules
   * List all schedules
   */
  router.get('/', async (req: any, res: any) => {
    try {
      const { status, patternName, limit, offset } = req.query;

      const schedules = await schedulerService.listSchedules({
        status: status as string,
        patternName: patternName as string,
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      return res.json({
        schedules,
        count: schedules.length,
      });
    } catch (error) {
      log.error({ error }, 'Failed to list schedules');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list schedules',
      });
    }
  });

  /**
   * POST /schedules
   * Create a new schedule
   */
  router.post('/', async (req: any, res: any) => {
    try {
      const {
        name,
        patternName,
        description,
        cron,
        intervalMs,
        timezone,
        input,
        startAt,
        endAt,
        maxRuns,
        retryPolicy,
        metadata,
      } = req.body;

      if (!name || !patternName) {
        return res.status(400).json({
          error: 'Missing required fields: name, patternName',
        });
      }

      if (!cron && !intervalMs) {
        return res.status(400).json({
          error: 'Either cron or intervalMs is required',
        });
      }

      const schedule = await schedulerService.createSchedule({
        name,
        patternName,
        description,
        cron,
        intervalMs,
        timezone,
        input,
        startAt: startAt ? new Date(startAt) : undefined,
        endAt: endAt ? new Date(endAt) : undefined,
        maxRuns,
        retryPolicy,
        metadata,
      });

      log.info({ scheduleId: schedule.id, name }, 'Schedule created via API');

      return res.status(201).json(schedule);
    } catch (error) {
      log.error({ error }, 'Failed to create schedule');

      if (error instanceof Error && error.message.includes('Invalid cron')) {
        return res.status(400).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to create schedule',
      });
    }
  });

  /**
   * GET /schedules/:id
   * Get a schedule by ID
   */
  router.get('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schedule = await schedulerService.getSchedule(id);

      if (!schedule) {
        return res.status(404).json({ error: 'Schedule not found' });
      }

      return res.json(schedule);
    } catch (error) {
      log.error({ error, scheduleId: req.params.id }, 'Failed to get schedule');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get schedule',
      });
    }
  });

  /**
   * PUT /schedules/:id
   * Update a schedule
   */
  router.put('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const {
        name,
        patternName,
        description,
        cron,
        intervalMs,
        timezone,
        input,
        startAt,
        endAt,
        maxRuns,
        retryPolicy,
        metadata,
      } = req.body;

      const schedule = await schedulerService.updateSchedule(id, {
        name,
        patternName,
        description,
        cron,
        intervalMs,
        timezone,
        input,
        startAt: startAt ? new Date(startAt) : undefined,
        endAt: endAt ? new Date(endAt) : undefined,
        maxRuns,
        retryPolicy,
        metadata,
      });

      log.info({ scheduleId: id }, 'Schedule updated via API');

      return res.json(schedule);
    } catch (error) {
      log.error({ error, scheduleId: req.params.id }, 'Failed to update schedule');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to update schedule',
      });
    }
  });

  /**
   * DELETE /schedules/:id
   * Delete a schedule
   */
  router.delete('/:id', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      await schedulerService.deleteSchedule(id);

      log.info({ scheduleId: id }, 'Schedule deleted via API');

      return res.status(204).send();
    } catch (error) {
      log.error({ error, scheduleId: req.params.id }, 'Failed to delete schedule');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to delete schedule',
      });
    }
  });

  /**
   * POST /schedules/:id/pause
   * Pause a schedule
   */
  router.post('/:id/pause', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schedule = await schedulerService.pauseSchedule(id);

      log.info({ scheduleId: id }, 'Schedule paused via API');

      return res.json(schedule);
    } catch (error) {
      log.error({ error, scheduleId: req.params.id }, 'Failed to pause schedule');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to pause schedule',
      });
    }
  });

  /**
   * POST /schedules/:id/resume
   * Resume a paused schedule
   */
  router.post('/:id/resume', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const schedule = await schedulerService.resumeSchedule(id);

      log.info({ scheduleId: id }, 'Schedule resumed via API');

      return res.json(schedule);
    } catch (error) {
      log.error({ error, scheduleId: req.params.id }, 'Failed to resume schedule');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to resume schedule',
      });
    }
  });

  /**
   * POST /schedules/:id/trigger
   * Manually trigger a schedule
   */
  router.post('/:id/trigger', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const run = await schedulerService.triggerSchedule(id);

      log.info({ scheduleId: id, runId: run.id }, 'Schedule manually triggered via API');

      return res.json(run);
    } catch (error) {
      log.error({ error, scheduleId: req.params.id }, 'Failed to trigger schedule');

      if (error instanceof Error && error.message.includes('not found')) {
        return res.status(404).json({ error: error.message });
      }

      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to trigger schedule',
      });
    }
  });

  /**
   * GET /schedules/:id/runs
   * Get schedule run history
   */
  router.get('/:id/runs', async (req: any, res: any) => {
    try {
      const { id } = req.params;
      const { limit, offset } = req.query;

      const runs = await schedulerService.getScheduleRuns(id, {
        limit: limit ? parseInt(limit as string, 10) : undefined,
        offset: offset ? parseInt(offset as string, 10) : undefined,
      });

      return res.json({
        runs,
        count: runs.length,
      });
    } catch (error) {
      log.error({ error, scheduleId: req.params.id }, 'Failed to get schedule runs');
      return res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get schedule runs',
      });
    }
  });

  return router;
}

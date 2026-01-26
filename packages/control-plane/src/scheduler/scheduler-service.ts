/**
 * Scheduler Service
 *
 * Manages scheduled pattern executions with cron expressions or intervals.
 * Only the leader node executes schedules in an HA cluster.
 */

import { PrismaClient, Schedule, ScheduleRun } from '@prisma/client';
import { Logger } from 'pino';
import { EventEmitter } from 'events';
import { parseExpression } from 'cron-parser';
import { LeaderElectionService } from '../ha/leader-election';
import { DistributedLockService, LockResources } from '../ha/distributed-lock';
import { IPatternEngine } from '../pattern-engine/interfaces';

export interface ScheduleConfig {
  name: string;
  patternName: string;
  description?: string;
  cron?: string;
  intervalMs?: number;
  timezone?: string;
  input?: Record<string, any>;
  startAt?: Date;
  endAt?: Date;
  maxRuns?: number;
  retryPolicy?: RetryPolicy;
  metadata?: Record<string, any>;
}

export interface RetryPolicy {
  maxRetries: number;
  retryDelayMs: number;
  backoffMultiplier?: number;
}

export interface SchedulerEvents {
  'schedule-created': (schedule: Schedule) => void;
  'schedule-updated': (schedule: Schedule) => void;
  'schedule-deleted': (scheduleId: string) => void;
  'schedule-executed': (schedule: Schedule, run: ScheduleRun) => void;
  'schedule-failed': (schedule: Schedule, error: Error) => void;
  'error': (error: Error) => void;
}

export declare interface SchedulerService {
  on<E extends keyof SchedulerEvents>(event: E, listener: SchedulerEvents[E]): this;
  emit<E extends keyof SchedulerEvents>(event: E, ...args: Parameters<SchedulerEvents[E]>): boolean;
}

export class SchedulerService extends EventEmitter {
  private prisma: PrismaClient;
  private patternEngine: IPatternEngine;
  private leaderElection: LeaderElectionService | null;
  private lock: DistributedLockService | null;
  private logger: Logger;
  private isRunning = false;
  private pollInterval: NodeJS.Timeout | null = null;
  private pollFrequencyMs: number;

  constructor(
    prisma: PrismaClient,
    patternEngine: IPatternEngine,
    logger: Logger,
    options?: {
      leaderElection?: LeaderElectionService;
      lock?: DistributedLockService;
      pollFrequencyMs?: number;
    }
  ) {
    super();
    this.prisma = prisma;
    this.patternEngine = patternEngine;
    this.leaderElection = options?.leaderElection || null;
    this.lock = options?.lock || null;
    this.pollFrequencyMs = options?.pollFrequencyMs || 1000;
    this.logger = logger.child({ component: 'Scheduler' });
  }

  /**
   * Start the scheduler
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting scheduler service');

    // Start polling for due schedules
    this.pollInterval = setInterval(() => this.poll(), this.pollFrequencyMs);
  }

  /**
   * Stop the scheduler
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.logger.info('Stopping scheduler service');

    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Create a new schedule
   */
  async createSchedule(config: ScheduleConfig): Promise<Schedule> {
    this.validateScheduleConfig(config);

    const nextRunAt = this.calculateNextRun(config.cron, config.intervalMs, config.timezone);

    const schedule = await this.prisma.schedule.create({
      data: {
        name: config.name,
        patternName: config.patternName,
        description: config.description,
        cronExpression: config.cron,
        intervalMs: config.intervalMs,
        timezone: config.timezone || 'UTC',
        input: config.input || {},
        startAt: config.startAt,
        endAt: config.endAt,
        maxRuns: config.maxRuns,
        retryPolicy: config.retryPolicy ? { ...config.retryPolicy } : undefined,
        metadata: config.metadata,
        nextRunAt: config.startAt && config.startAt > new Date() ? config.startAt : nextRunAt,
        status: 'active',
      },
    });

    this.logger.info({ scheduleId: schedule.id, name: schedule.name }, 'Schedule created');
    this.emit('schedule-created', schedule);

    return schedule;
  }

  /**
   * Update a schedule
   */
  async updateSchedule(
    scheduleId: string,
    updates: Partial<ScheduleConfig>
  ): Promise<Schedule> {
    const existing = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    const data: any = {};

    if (updates.name !== undefined) data.name = updates.name;
    if (updates.patternName !== undefined) data.patternName = updates.patternName;
    if (updates.description !== undefined) data.description = updates.description;
    if (updates.cron !== undefined) data.cronExpression = updates.cron;
    if (updates.intervalMs !== undefined) data.intervalMs = updates.intervalMs;
    if (updates.timezone !== undefined) data.timezone = updates.timezone;
    if (updates.input !== undefined) data.input = updates.input;
    if (updates.startAt !== undefined) data.startAt = updates.startAt;
    if (updates.endAt !== undefined) data.endAt = updates.endAt;
    if (updates.maxRuns !== undefined) data.maxRuns = updates.maxRuns;
    if (updates.retryPolicy !== undefined) data.retryPolicy = updates.retryPolicy;
    if (updates.metadata !== undefined) data.metadata = updates.metadata;

    // Recalculate next run if schedule changed
    if (updates.cron !== undefined || updates.intervalMs !== undefined || updates.timezone !== undefined) {
      data.nextRunAt = this.calculateNextRun(
        updates.cron ?? existing.cronExpression ?? undefined,
        updates.intervalMs ?? existing.intervalMs ?? undefined,
        updates.timezone ?? existing.timezone
      );
    }

    const schedule = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data,
    });

    this.logger.info({ scheduleId, name: schedule.name }, 'Schedule updated');
    this.emit('schedule-updated', schedule);

    return schedule;
  }

  /**
   * Delete a schedule
   */
  async deleteSchedule(scheduleId: string): Promise<void> {
    await this.prisma.schedule.delete({
      where: { id: scheduleId },
    });

    this.logger.info({ scheduleId }, 'Schedule deleted');
    this.emit('schedule-deleted', scheduleId);
  }

  /**
   * Get a schedule by ID
   */
  async getSchedule(scheduleId: string): Promise<Schedule | null> {
    return this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });
  }

  /**
   * List all schedules
   */
  async listSchedules(options?: {
    status?: string;
    patternName?: string;
    limit?: number;
    offset?: number;
  }): Promise<Schedule[]> {
    const where: any = {};

    if (options?.status) where.status = options.status;
    if (options?.patternName) where.patternName = options.patternName;

    return this.prisma.schedule.findMany({
      where,
      take: options?.limit,
      skip: options?.offset,
      orderBy: { nextRunAt: 'asc' },
    });
  }

  /**
   * Pause a schedule
   */
  async pauseSchedule(scheduleId: string): Promise<Schedule> {
    const schedule = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: { status: 'paused' },
    });

    this.logger.info({ scheduleId, name: schedule.name }, 'Schedule paused');
    this.emit('schedule-updated', schedule);

    return schedule;
  }

  /**
   * Resume a schedule
   */
  async resumeSchedule(scheduleId: string): Promise<Schedule> {
    const existing = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!existing) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    // Recalculate next run time
    const nextRunAt = this.calculateNextRun(
      existing.cronExpression ?? undefined,
      existing.intervalMs ?? undefined,
      existing.timezone
    );

    const schedule = await this.prisma.schedule.update({
      where: { id: scheduleId },
      data: {
        status: 'active',
        nextRunAt,
      },
    });

    this.logger.info({ scheduleId, name: schedule.name }, 'Schedule resumed');
    this.emit('schedule-updated', schedule);

    return schedule;
  }

  /**
   * Manually trigger a schedule
   */
  async triggerSchedule(scheduleId: string): Promise<ScheduleRun> {
    const schedule = await this.prisma.schedule.findUnique({
      where: { id: scheduleId },
    });

    if (!schedule) {
      throw new Error(`Schedule not found: ${scheduleId}`);
    }

    return this.executeSchedule(schedule, true);
  }

  /**
   * Get schedule run history
   */
  async getScheduleRuns(
    scheduleId: string,
    options?: {
      limit?: number;
      offset?: number;
    }
  ): Promise<ScheduleRun[]> {
    return this.prisma.scheduleRun.findMany({
      where: { scheduleId },
      take: options?.limit || 50,
      skip: options?.offset,
      orderBy: { scheduledFor: 'desc' },
    });
  }

  /**
   * Poll for due schedules
   */
  private async poll(): Promise<void> {
    // Only leader executes schedules in HA mode
    if (this.leaderElection && !this.leaderElection.isLeader()) {
      return;
    }

    try {
      // Acquire lock to prevent multiple executions
      const executeSchedules = async () => {
        const now = new Date();

        // Find due schedules
        const dueSchedules = await this.prisma.schedule.findMany({
          where: {
            status: 'active',
            nextRunAt: { lte: now },
            OR: [
              { endAt: null },
              { endAt: { gt: now } },
            ],
          },
        });

        for (const schedule of dueSchedules) {
          // Check maxRuns
          if (schedule.maxRuns && schedule.runCount >= schedule.maxRuns) {
            await this.prisma.schedule.update({
              where: { id: schedule.id },
              data: { status: 'completed' },
            });
            continue;
          }

          try {
            await this.executeSchedule(schedule);
          } catch (error) {
            this.logger.error({ error, scheduleId: schedule.id }, 'Failed to execute schedule');
            this.emit('schedule-failed', schedule, error as Error);
          }
        }
      };

      if (this.lock) {
        await this.lock.tryWithLock(LockResources.SCHEDULER_RUN, executeSchedules, {
          ttl: 30000,
        });
      } else {
        await executeSchedules();
      }
    } catch (error) {
      this.logger.error({ error }, 'Scheduler poll error');
      this.emit('error', error as Error);
    }
  }

  /**
   * Execute a scheduled pattern
   */
  private async executeSchedule(
    schedule: Schedule,
    isManualTrigger = false
  ): Promise<ScheduleRun> {
    const scheduledFor = isManualTrigger ? new Date() : schedule.nextRunAt || new Date();
    const startedAt = new Date();

    // Create run record
    let run = await this.prisma.scheduleRun.create({
      data: {
        scheduleId: schedule.id,
        scheduledFor,
        startedAt,
        status: 'running',
      },
    });

    try {
      this.logger.info(
        { scheduleId: schedule.id, name: schedule.name, runId: run.id },
        'Executing scheduled pattern'
      );

      // Execute the pattern
      const result = await this.patternEngine.executePattern(
        schedule.patternName,
        (schedule.input as Record<string, any>) || {}
      );

      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Update run record
      run = await this.prisma.scheduleRun.update({
        where: { id: run.id },
        data: {
          executionId: result.id,
          completedAt,
          durationMs,
          status: 'success',
        },
      });

      // Update schedule
      const nextRunAt = this.calculateNextRun(
        schedule.cronExpression ?? undefined,
        schedule.intervalMs ?? undefined,
        schedule.timezone
      );

      await this.prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: startedAt,
          lastRunStatus: 'success',
          runCount: { increment: 1 },
          nextRunAt,
        },
      });

      this.logger.info(
        { scheduleId: schedule.id, runId: run.id, durationMs },
        'Scheduled pattern completed'
      );
      this.emit('schedule-executed', schedule, run);

      return run;
    } catch (error) {
      const completedAt = new Date();
      const durationMs = completedAt.getTime() - startedAt.getTime();

      // Update run record with error
      run = await this.prisma.scheduleRun.update({
        where: { id: run.id },
        data: {
          completedAt,
          durationMs,
          status: 'failure',
          error: (error as Error).message,
        },
      });

      // Update schedule
      const nextRunAt = this.calculateNextRun(
        schedule.cronExpression ?? undefined,
        schedule.intervalMs ?? undefined,
        schedule.timezone
      );

      await this.prisma.schedule.update({
        where: { id: schedule.id },
        data: {
          lastRunAt: startedAt,
          lastRunStatus: 'failure',
          runCount: { increment: 1 },
          nextRunAt,
        },
      });

      this.logger.error(
        { error, scheduleId: schedule.id, runId: run.id },
        'Scheduled pattern failed'
      );

      throw error;
    }
  }

  /**
   * Calculate the next run time
   */
  private calculateNextRun(
    cron?: string,
    intervalMs?: number,
    timezone?: string
  ): Date | null {
    const now = new Date();

    if (cron) {
      try {
        const interval = parseExpression(cron, {
          currentDate: now,
          tz: timezone || 'UTC',
        });
        return interval.next().toDate();
      } catch (error) {
        this.logger.error({ error, cron }, 'Invalid cron expression');
        throw new Error(`Invalid cron expression: ${cron}`);
      }
    }

    if (intervalMs) {
      return new Date(now.getTime() + intervalMs);
    }

    return null;
  }

  /**
   * Validate schedule configuration
   */
  private validateScheduleConfig(config: ScheduleConfig): void {
    if (!config.name) {
      throw new Error('Schedule name is required');
    }

    if (!config.patternName) {
      throw new Error('Pattern name is required');
    }

    if (!config.cron && !config.intervalMs) {
      throw new Error('Either cron expression or interval is required');
    }

    if (config.cron && config.intervalMs) {
      throw new Error('Cannot specify both cron expression and interval');
    }

    if (config.cron) {
      try {
        parseExpression(config.cron);
      } catch {
        throw new Error(`Invalid cron expression: ${config.cron}`);
      }
    }

    if (config.intervalMs && config.intervalMs < 1000) {
      throw new Error('Interval must be at least 1000ms');
    }
  }
}

/**
 * Create a scheduler service
 */
export function createSchedulerService(
  prisma: PrismaClient,
  patternEngine: IPatternEngine,
  logger: Logger,
  options?: {
    leaderElection?: LeaderElectionService;
    lock?: DistributedLockService;
    pollFrequencyMs?: number;
  }
): SchedulerService {
  return new SchedulerService(prisma, patternEngine, logger, options);
}

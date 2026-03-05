/**
 * Timeout Checker
 * Periodically checks for executions that have exceeded their timeout
 * and marks them as failed.
 */

import { Logger } from 'pino';
import { ExecutionRepository } from '../db/repositories/execution.repository';

export interface TimeoutCheckerOptions {
  /** How often to check for timeouts (default: 15000ms) */
  checkIntervalMs?: number;
  /** Default execution timeout if not specified (default: 300000ms = 5 min) */
  defaultTimeoutMs?: number;
  /** Whether this instance is the HA leader (only leader runs the checker) */
  isLeader?: () => boolean;
}

export class TimeoutChecker {
  private logger: Logger;
  private intervalHandle?: NodeJS.Timeout;
  private checkIntervalMs: number;
  private defaultTimeoutMs: number;
  private isLeader: () => boolean;
  private running: boolean = false;

  constructor(
    private executionRepo: ExecutionRepository,
    logger: Logger,
    options?: TimeoutCheckerOptions
  ) {
    this.logger = logger.child({ component: 'TimeoutChecker' });
    this.checkIntervalMs = options?.checkIntervalMs || 15000;
    this.defaultTimeoutMs = options?.defaultTimeoutMs
      || parseInt(process.env.PARALLAX_DEFAULT_EXECUTION_TIMEOUT || '300000');
    this.isLeader = options?.isLeader || (() => true);
  }

  /**
   * Start the periodic timeout checker.
   */
  start(): void {
    if (this.running) return;
    this.running = true;

    this.logger.info(
      { checkIntervalMs: this.checkIntervalMs, defaultTimeoutMs: this.defaultTimeoutMs },
      'Timeout checker started'
    );

    this.intervalHandle = setInterval(async () => {
      await this.check();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the timeout checker.
   */
  stop(): void {
    this.running = false;
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = undefined;
    }
    this.logger.info('Timeout checker stopped');
  }

  /**
   * Run a single timeout check.
   */
  async check(): Promise<number> {
    // In HA mode, only the leader runs the checker
    if (!this.isLeader()) return 0;

    try {
      const timedOut = await this.executionRepo.findTimedOutExecutions(this.defaultTimeoutMs);

      if (timedOut.length === 0) return 0;

      this.logger.warn(
        { count: timedOut.length },
        'Found timed-out executions'
      );

      let failedCount = 0;
      for (const execution of timedOut) {
        const timeout = execution.timeoutMs || this.defaultTimeoutMs;
        try {
          await this.executionRepo.updateStatus(execution.id, 'failed', {
            error: `Execution timed out after ${timeout}ms`,
          });

          await this.executionRepo.addEvent(execution.id, {
            type: 'timeout',
            data: {
              timeoutMs: timeout,
              startedAt: execution.startedAt?.toISOString(),
              failedAt: new Date().toISOString(),
            },
          });

          failedCount++;
          this.logger.info(
            { executionId: execution.id, timeoutMs: timeout },
            'Execution timed out and marked as failed'
          );
        } catch (error) {
          this.logger.error(
            { executionId: execution.id, error },
            'Failed to mark timed-out execution'
          );
        }
      }

      return failedCount;
    } catch (error) {
      this.logger.error({ error }, 'Timeout check failed');
      return 0;
    }
  }
}

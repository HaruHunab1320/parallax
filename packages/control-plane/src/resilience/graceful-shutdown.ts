/**
 * Graceful Shutdown Handler
 * Manages clean shutdown of the control plane:
 * - Stops accepting new executions
 * - Waits for in-flight executions to complete
 * - Force-fails remaining executions after timeout
 * - Cleans up spawned agents
 */

import { Logger } from 'pino';
import { ExecutionRepository } from '../db/repositories/execution.repository';

export interface GracefulShutdownOptions {
  /** Max time to wait for in-flight executions (default: 30000ms) */
  drainTimeoutMs?: number;
  /** Poll interval to check if executions have completed (default: 1000ms) */
  pollIntervalMs?: number;
}

export class GracefulShutdownHandler {
  private logger: Logger;
  private drainTimeoutMs: number;
  private pollIntervalMs: number;

  constructor(
    private executionRepo: ExecutionRepository,
    private nodeId: string,
    logger: Logger,
    private patternEngine: {
      setShuttingDown: (value: boolean) => void;
      getInFlightExecutionIds: () => string[];
    },
    options?: GracefulShutdownOptions
  ) {
    this.logger = logger.child({ component: 'GracefulShutdown' });
    this.drainTimeoutMs = options?.drainTimeoutMs || 30000;
    this.pollIntervalMs = options?.pollIntervalMs || 1000;
  }

  /**
   * Execute graceful shutdown sequence.
   * Returns when all executions have completed or been force-failed.
   */
  async shutdown(): Promise<void> {
    this.logger.info('Starting graceful shutdown...');

    // 1. Stop accepting new executions
    this.patternEngine.setShuttingDown(true);
    this.logger.info('Stopped accepting new executions');

    // 2. Get current in-flight executions
    const inFlightIds = this.patternEngine.getInFlightExecutionIds();
    if (inFlightIds.length === 0) {
      this.logger.info('No in-flight executions, shutdown complete');
      return;
    }

    this.logger.info(
      { count: inFlightIds.length, ids: inFlightIds },
      'Waiting for in-flight executions to complete...'
    );

    // 3. Wait up to drainTimeoutMs for executions to complete
    const deadline = Date.now() + this.drainTimeoutMs;
    let remaining = inFlightIds.length;

    while (remaining > 0 && Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, this.pollIntervalMs));

      const currentInFlight = this.patternEngine.getInFlightExecutionIds();
      remaining = currentInFlight.length;

      if (remaining > 0) {
        this.logger.debug(
          { remaining, timeLeftMs: deadline - Date.now() },
          'Still waiting for in-flight executions...'
        );
      }
    }

    // 4. Force-fail any remaining executions
    const stillInFlight = this.patternEngine.getInFlightExecutionIds();
    if (stillInFlight.length > 0) {
      this.logger.warn(
        { count: stillInFlight.length, ids: stillInFlight },
        'Force-failing remaining executions after drain timeout'
      );

      for (const executionId of stillInFlight) {
        try {
          await this.executionRepo.updateStatus(executionId, 'failed', {
            error: `Server shutdown: execution did not complete within ${this.drainTimeoutMs}ms drain period`,
          });

          await this.executionRepo.addEvent(executionId, {
            type: 'force_failed',
            data: {
              reason: 'graceful_shutdown',
              nodeId: this.nodeId,
              drainTimeoutMs: this.drainTimeoutMs,
              failedAt: new Date().toISOString(),
            },
          });
        } catch (error) {
          this.logger.error(
            { executionId, error },
            'Failed to force-fail execution during shutdown'
          );
        }
      }
    }

    // Also fail any DB-level stuck executions on this node
    try {
      const stuckExecutions = await this.executionRepo.findOrphanedExecutions(this.nodeId);
      for (const exec of stuckExecutions) {
        await this.executionRepo.markOrphaned(
          exec.id,
          `Server shutdown (node: ${this.nodeId})`
        );
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to clean up stuck DB executions during shutdown');
    }

    this.logger.info('Graceful shutdown complete');
  }
}

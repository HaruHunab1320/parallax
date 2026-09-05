/**
 * Startup Recovery Service
 * Recovers orphaned executions after a server restart.
 * Finds executions stuck in 'running' or 'pending' status and marks them as failed.
 */

import type { Logger } from 'pino';
import type { ExecutionRepository } from '../db/repositories/execution.repository';

export class StartupRecoveryService {
  private logger: Logger;

  constructor(
    private executionRepo: ExecutionRepository,
    private nodeId: string,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'StartupRecovery' });
  }

  /**
   * Run once at startup to recover orphaned executions.
   * Finds executions owned by this node that are still running/pending.
   */
  async recoverOrphanedExecutions(): Promise<number> {
    this.logger.info({ nodeId: this.nodeId }, 'Starting orphan recovery...');

    try {
      const orphaned = await this.executionRepo.findOrphanedExecutions(
        this.nodeId
      );

      if (orphaned.length === 0) {
        this.logger.info('No orphaned executions found');
        return 0;
      }

      this.logger.warn(
        { count: orphaned.length },
        'Found orphaned executions, recovering...'
      );

      let recovered = 0;
      for (const execution of orphaned) {
        try {
          const changed = await this.executionRepo.markOrphaned(
            execution.id,
            `Server restarted during execution (node: ${this.nodeId})`
          );

          if (!changed) continue;
          await this.executionRepo.addEvent(execution.id, {
            type: 'orphan_recovered',
            data: {
              previousStatus: execution.status,
              nodeId: this.nodeId,
              recoveredAt: new Date().toISOString(),
              reason: 'Server restarted during execution',
            },
          });

          recovered++;
          this.logger.info(
            { executionId: execution.id, previousStatus: execution.status },
            'Recovered orphaned execution'
          );
        } catch (error) {
          this.logger.error(
            { executionId: execution.id, error },
            'Failed to recover orphaned execution'
          );
        }
      }

      this.logger.info(
        { recovered, total: orphaned.length },
        'Orphan recovery complete'
      );
      return recovered;
    } catch (error) {
      this.logger.error({ error }, 'Orphan recovery failed');
      return 0;
    }
  }

  /**
   * In HA mode: leader recovers orphans from dead nodes.
   * Only pass owners whose loss has been confirmed; leadership changes alone are insufficient.
   */
  async recoverAllOrphanedExecutions(
    confirmedDeadNodeIds: string[] = []
  ): Promise<number> {
    // Becoming leader is not proof that any worker is dead. Unowned records and
    // healthy peers must never be swept. Callers must establish lease expiry/fencing.
    const deadNodeIds = [...new Set(confirmedDeadNodeIds)].filter(
      (id) => id && id !== this.nodeId
    );
    if (deadNodeIds.length === 0) return 0;
    this.logger.info(
      { deadNodeIds },
      'Recovering executions for confirmed stopped nodes'
    );

    try {
      const orphaned = (
        await Promise.all(
          deadNodeIds.map((id) => this.executionRepo.findOrphanedExecutions(id))
        )
      )
        .flat()
        .filter((execution) => deadNodeIds.includes(execution.nodeId));

      if (orphaned.length === 0) {
        this.logger.info('No orphaned executions found across all nodes');
        return 0;
      }

      let recovered = 0;
      for (const execution of orphaned) {
        try {
          const changed = await this.executionRepo.markOrphaned(
            execution.id,
            `Recovered by HA leader (original node: ${execution.nodeId || 'unknown'})`
          );

          if (!changed) continue;
          await this.executionRepo.addEvent(execution.id, {
            type: 'orphan_recovered',
            data: {
              previousStatus: execution.status,
              originalNodeId: execution.nodeId,
              recoveredByNodeId: this.nodeId,
              recoveredAt: new Date().toISOString(),
              reason: 'HA leader recovery',
            },
          });

          recovered++;
        } catch (error) {
          this.logger.error(
            { executionId: execution.id, error },
            'Failed to recover orphaned execution'
          );
        }
      }

      this.logger.info(
        { recovered, total: orphaned.length },
        'HA orphan recovery complete'
      );
      return recovered;
    } catch (error) {
      this.logger.error({ error }, 'HA orphan recovery failed');
      return 0;
    }
  }
}

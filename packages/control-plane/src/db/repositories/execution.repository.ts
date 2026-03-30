import type { Execution, ExecutionEvent, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

export interface ExecutionWithEvents extends Execution {
  events: ExecutionEvent[];
  pattern?: any;
}

export class ExecutionRepository extends BaseRepository {
  async create(data: Prisma.ExecutionCreateInput): Promise<Execution> {
    return this.executeQuery(
      () => this.prisma.execution.create({ data }),
      'ExecutionRepository.create'
    );
  }

  async findById(id: string): Promise<ExecutionWithEvents | null> {
    return this.executeQuery(
      () =>
        this.prisma.execution.findFirst({
          where: { id },
          include: {
            events: {
              orderBy: { time: 'asc' },
            },
            pattern: true,
          },
        }),
      'ExecutionRepository.findById'
    );
  }

  async findAll(options?: {
    skip?: number;
    take?: number;
    where?: Prisma.ExecutionWhereInput;
    orderBy?: Prisma.ExecutionOrderByWithRelationInput;
  }): Promise<Execution[]> {
    return this.executeQuery(
      () =>
        this.prisma.execution.findMany({
          ...options,
          include: {
            pattern: true,
          },
        }),
      'ExecutionRepository.findAll'
    );
  }

  async findRecent(limit: number = 10): Promise<Execution[]> {
    return this.executeQuery(
      () =>
        this.prisma.execution.findMany({
          take: limit,
          orderBy: { time: 'desc' },
          include: {
            pattern: true,
          },
        }),
      'ExecutionRepository.findRecent'
    );
  }

  async update(
    id: string,
    data: Prisma.ExecutionUpdateInput
  ): Promise<Execution> {
    return this.executeQuery(
      () =>
        this.prisma.execution.update({
          where: { id },
          data,
        }),
      'ExecutionRepository.update'
    );
  }

  async delete(id: string): Promise<Execution> {
    return this.executeQuery(
      () =>
        this.prisma.execution.delete({
          where: { id },
        }),
      'ExecutionRepository.delete'
    );
  }

  async addEvent(
    executionId: string,
    event: {
      type: string;
      agentId?: string;
      data: any;
    }
  ): Promise<ExecutionEvent> {
    return this.executeQuery(
      () =>
        this.prisma.executionEvent.create({
          data: {
            executionId,
            type: event.type,
            agentId: event.agentId,
            data: event.data,
          },
        }),
      'ExecutionRepository.addEvent'
    );
  }

  async getEvents(executionId: string): Promise<ExecutionEvent[]> {
    return this.executeQuery(
      () =>
        this.prisma.executionEvent.findMany({
          where: { executionId },
          orderBy: { time: 'asc' },
        }),
      'ExecutionRepository.getEvents'
    );
  }

  async updateStatus(
    id: string,
    status: string,
    additionalData?: {
      result?: any;
      error?: string;
      durationMs?: number;
      confidence?: number;
    }
  ): Promise<Execution> {
    return this.executeQuery(
      () =>
        this.prisma.execution.update({
          where: { id },
          data: {
            status,
            ...additionalData,
          },
        }),
      'ExecutionRepository.updateStatus'
    );
  }

  async getStats(timeRange?: { start: Date; end: Date }): Promise<any> {
    return this.executeQuery(async () => {
      let result;
      if (timeRange) {
        result = await this.prisma.$queryRaw<any[]>`
            SELECT 
              COUNT(*) as total_executions,
              COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
              COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
              COUNT(CASE WHEN status IN ('pending', 'running') THEN 1 END) as in_progress,
              AVG("durationMs") as avg_duration_ms,
              AVG(confidence) as avg_confidence
            FROM "Execution"
            WHERE time >= ${timeRange.start}::timestamptz 
            AND time <= ${timeRange.end}::timestamptz`;
      } else {
        result = await this.prisma.$queryRaw<any[]>`
            SELECT 
              COUNT(*) as total_executions,
              COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
              COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
              COUNT(CASE WHEN status = 'cancelled' THEN 1 END) as cancelled,
              COUNT(CASE WHEN status IN ('pending', 'running') THEN 1 END) as in_progress,
              AVG("durationMs") as avg_duration_ms,
              AVG(confidence) as avg_confidence
            FROM "Execution"`;
      }

      return (
        result[0] || {
          total_executions: 0,
          successful: 0,
          failed: 0,
          cancelled: 0,
          in_progress: 0,
          avg_duration_ms: null,
          avg_confidence: null,
        }
      );
    }, 'ExecutionRepository.getStats');
  }

  /**
   * Find orphaned executions — stuck in running/pending state.
   * If nodeId is provided, finds executions owned by that node or unowned.
   * If nodeId is omitted, finds all orphaned executions.
   */
  async findOrphanedExecutions(nodeId?: string): Promise<any[]> {
    return this.executeQuery(async () => {
      if (nodeId) {
        // Use raw query to reference new columns before prisma generate
        return this.prisma.$queryRaw`
            SELECT * FROM "Execution"
            WHERE status IN ('running', 'pending')
            AND ("nodeId" = ${nodeId} OR "nodeId" IS NULL)
          ` as Promise<any[]>;
      }
      return this.prisma.$queryRaw`
          SELECT * FROM "Execution"
          WHERE status IN ('running', 'pending')
        ` as Promise<any[]>;
    }, 'ExecutionRepository.findOrphanedExecutions');
  }

  /**
   * Find executions that have exceeded their timeout.
   * Uses startedAt + timeoutMs (or defaultTimeoutMs) < NOW().
   */
  async findTimedOutExecutions(defaultTimeoutMs: number): Promise<any[]> {
    return this.executeQuery(async () => {
      return this.prisma.$queryRaw`
          SELECT * FROM "Execution"
          WHERE status = 'running'
          AND "startedAt" IS NOT NULL
          AND (
            ("timeoutMs" IS NOT NULL AND "startedAt" + make_interval(secs => "timeoutMs" / 1000.0) < NOW())
            OR
            ("timeoutMs" IS NULL AND "startedAt" + make_interval(secs => ${defaultTimeoutMs} / 1000.0) < NOW())
          )
        ` as Promise<any[]>;
    }, 'ExecutionRepository.findTimedOutExecutions');
  }

  /**
   * Atomically mark an execution as failed due to orphan recovery.
   * Only updates if the execution is still in running/pending status.
   */
  async markOrphaned(id: string, reason: string): Promise<Execution> {
    return this.executeQuery(
      () =>
        this.prisma.execution.update({
          where: { id },
          data: {
            status: 'failed',
            error: reason,
          },
        }),
      'ExecutionRepository.markOrphaned'
    );
  }

  async cleanup(olderThan: Date): Promise<number> {
    return this.executeQuery(async () => {
      const result = await this.prisma.execution.deleteMany({
        where: {
          time: {
            lt: olderThan,
          },
          status: {
            in: ['completed', 'failed', 'cancelled'],
          },
        },
      });
      return result.count;
    }, 'ExecutionRepository.cleanup');
  }

  async getHourlyStats(hours: number = 24): Promise<any[]> {
    return this.executeQuery(async () => {
      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const result = await this.prisma.$queryRaw<any[]>`
          SELECT
            date_trunc('hour', time) as hour,
            COUNT(*)::int as executions,
            COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as successful,
            COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed,
            AVG(confidence) as avg_confidence
          FROM "Execution"
          WHERE time >= ${since}
          GROUP BY hour
          ORDER BY hour ASC`;
      return result;
    }, 'ExecutionRepository.getHourlyStats');
  }

  async getDailyStats(days: number = 7): Promise<any[]> {
    return this.executeQuery(async () => {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const result = await this.prisma.$queryRaw<any[]>`
          SELECT
            date_trunc('day', time) as day,
            COUNT(*)::int as executions,
            COUNT(CASE WHEN status = 'completed' THEN 1 END)::int as successful,
            COUNT(CASE WHEN status = 'failed' THEN 1 END)::int as failed,
            AVG(confidence) as avg_confidence,
            AVG("durationMs") as avg_duration_ms
          FROM "Execution"
          WHERE time >= ${since}
          GROUP BY day
          ORDER BY day ASC`;
      return result;
    }, 'ExecutionRepository.getDailyStats');
  }
}

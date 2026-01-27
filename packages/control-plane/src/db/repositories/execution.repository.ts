import { Execution, ExecutionEvent, Prisma } from '@prisma/client';
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
      () => this.prisma.execution.findFirst({
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
      () => this.prisma.execution.findMany({
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
      () => this.prisma.execution.findMany({
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
      () => this.prisma.execution.update({
        where: { id },
        data,
      }),
      'ExecutionRepository.update'
    );
  }

  async delete(id: string): Promise<Execution> {
    return this.executeQuery(
      () => this.prisma.execution.delete({
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
      () => this.prisma.executionEvent.create({
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
      () => this.prisma.executionEvent.findMany({
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
      () => this.prisma.execution.update({
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
    return this.executeQuery(
      async () => {
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
        
        return result[0] || {
          total_executions: 0,
          successful: 0,
          failed: 0,
          cancelled: 0,
          in_progress: 0,
          avg_duration_ms: null,
          avg_confidence: null,
        };
      },
      'ExecutionRepository.getStats'
    );
  }

  async cleanup(olderThan: Date): Promise<number> {
    return this.executeQuery(
      async () => {
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
      },
      'ExecutionRepository.cleanup'
    );
  }

  async getHourlyStats(hours: number = 24): Promise<any[]> {
    return this.executeQuery(
      async () => {
        const result = await this.prisma.$queryRaw<any[]>`
          SELECT
            date_trunc('hour', time) as hour,
            COUNT(*) as executions,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
            AVG(confidence) as avg_confidence
          FROM "Execution"
          WHERE time >= NOW() - INTERVAL '${hours} hours'
          GROUP BY hour
          ORDER BY hour ASC`;
        return result;
      },
      'ExecutionRepository.getHourlyStats'
    );
  }

  async getDailyStats(days: number = 7): Promise<any[]> {
    return this.executeQuery(
      async () => {
        const result = await this.prisma.$queryRaw<any[]>`
          SELECT
            date_trunc('day', time) as day,
            COUNT(*) as executions,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed,
            AVG(confidence) as avg_confidence,
            AVG("durationMs") as avg_duration_ms
          FROM "Execution"
          WHERE time >= NOW() - INTERVAL '${days} days'
          GROUP BY day
          ORDER BY day ASC`;
        return result;
      },
      'ExecutionRepository.getDailyStats'
    );
  }
}
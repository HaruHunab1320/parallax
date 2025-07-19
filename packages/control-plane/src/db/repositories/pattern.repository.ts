import { Pattern, Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

export class PatternRepository extends BaseRepository {
  async create(data: Prisma.PatternCreateInput): Promise<Pattern> {
    return this.executeQuery(
      () => this.prisma.pattern.create({ data }),
      'PatternRepository.create'
    );
  }

  async findById(id: string): Promise<Pattern | null> {
    return this.executeQuery(
      () => this.prisma.pattern.findUnique({
        where: { id },
      }),
      'PatternRepository.findById'
    );
  }

  async findByName(name: string): Promise<Pattern | null> {
    return this.executeQuery(
      () => this.prisma.pattern.findUnique({
        where: { name },
      }),
      'PatternRepository.findByName'
    );
  }

  async findAll(options?: {
    skip?: number;
    take?: number;
    orderBy?: Prisma.PatternOrderByWithRelationInput;
  }): Promise<Pattern[]> {
    return this.executeQuery(
      () => this.prisma.pattern.findMany(options),
      'PatternRepository.findAll'
    );
  }

  async update(
    id: string,
    data: Prisma.PatternUpdateInput
  ): Promise<Pattern> {
    return this.executeQuery(
      () => this.prisma.pattern.update({
        where: { id },
        data,
      }),
      'PatternRepository.update'
    );
  }

  async delete(id: string): Promise<Pattern> {
    return this.executeQuery(
      () => this.prisma.pattern.delete({
        where: { id },
      }),
      'PatternRepository.delete'
    );
  }

  async count(where?: Prisma.PatternWhereInput): Promise<number> {
    return this.executeQuery(
      () => this.prisma.pattern.count({ where }),
      'PatternRepository.count'
    );
  }

  async getPerformanceStats(patternId: string): Promise<any> {
    return this.executeQuery(
      async () => {
        const result = await this.prisma.$queryRaw<any[]>`
          SELECT 
            COUNT(*) as total_executions,
            AVG("durationMs") as avg_duration_ms,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_executions,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_executions,
            AVG(confidence) as avg_confidence
          FROM "Execution"
          WHERE "patternId" = ${patternId}
          AND time > NOW() - INTERVAL '7 days'`;
        
        return result[0] || {
          total_executions: 0,
          avg_duration_ms: null,
          successful_executions: 0,
          failed_executions: 0,
          avg_confidence: null,
        };
      },
      'PatternRepository.getPerformanceStats'
    );
  }
}
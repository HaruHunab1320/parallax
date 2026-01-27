import { Pattern, PatternVersion, Prisma } from '@prisma/client';
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

  // Pattern versioning methods

  async createVersion(
    patternId: string,
    data: { script: string; metadata?: any; createdBy?: string }
  ): Promise<PatternVersion> {
    return this.executeQuery(
      async () => {
        // Get the pattern to determine next version
        const pattern = await this.prisma.pattern.findUnique({
          where: { id: patternId },
        });

        if (!pattern) {
          throw new Error(`Pattern ${patternId} not found`);
        }

        // Get the latest version to increment
        const latestVersion = await this.prisma.patternVersion.findFirst({
          where: { patternId },
          orderBy: { createdAt: 'desc' },
        });

        const newVersion = this.incrementVersion(
          latestVersion?.version || pattern.version
        );

        return this.prisma.patternVersion.create({
          data: {
            patternId,
            version: newVersion,
            script: data.script,
            metadata: data.metadata || {},
            createdBy: data.createdBy,
          },
        });
      },
      'PatternRepository.createVersion'
    );
  }

  async getVersions(patternId: string): Promise<PatternVersion[]> {
    return this.executeQuery(
      () =>
        this.prisma.patternVersion.findMany({
          where: { patternId },
          orderBy: { createdAt: 'desc' },
        }),
      'PatternRepository.getVersions'
    );
  }

  async getVersion(
    patternId: string,
    version: string
  ): Promise<PatternVersion | null> {
    return this.executeQuery(
      () =>
        this.prisma.patternVersion.findUnique({
          where: { patternId_version: { patternId, version } },
        }),
      'PatternRepository.getVersion'
    );
  }

  private incrementVersion(version: string): string {
    const parts = version.split('.').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) {
      return '1.0.1'; // Default if version format is unexpected
    }
    parts[2] += 1; // Increment patch version
    return parts.join('.');
  }
}
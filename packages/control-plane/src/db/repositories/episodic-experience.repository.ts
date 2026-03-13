import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { BaseRepository } from './base.repository';

export interface PersistedEpisodicExperience {
  id: string;
  executionId: string;
  threadId: string | null;
  role: string | null;
  repo: string | null;
  objective: string;
  summary: string;
  outcome: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

function toJson(value: unknown): Prisma.JsonValue | null {
  if (value === undefined || value === null) return null;
  return value as Prisma.JsonValue;
}

function normalizeExperience(record: any): PersistedEpisodicExperience {
  return {
    id: record.id,
    executionId: record.executionId,
    threadId: record.threadId ?? null,
    role: record.role ?? null,
    repo: record.repo ?? null,
    objective: record.objective,
    summary: record.summary,
    outcome: record.outcome,
    details: (record.details as Record<string, unknown> | null) ?? null,
    createdAt: new Date(record.createdAt),
  };
}

export class EpisodicExperienceRepository extends BaseRepository {
  async create(input: {
    executionId: string;
    threadId?: string | null;
    role?: string | null;
    repo?: string | null;
    objective: string;
    summary: string;
    outcome: string;
    details?: Record<string, unknown>;
  }): Promise<PersistedEpisodicExperience> {
    return this.executeQuery(async () => {
      const rows = await this.prisma.$queryRaw<PersistedEpisodicExperience[]>`
        INSERT INTO "episodic_experiences" (
          "id",
          "execution_id",
          "thread_id",
          "role",
          "repo",
          "objective",
          "summary",
          "outcome",
          "details"
        )
        VALUES (
          ${randomUUID()},
          ${input.executionId},
          ${input.threadId ?? null},
          ${input.role ?? null},
          ${input.repo ?? null},
          ${input.objective},
          ${input.summary},
          ${input.outcome},
          ${toJson(input.details)}
        )
        RETURNING
          "id",
          "execution_id" AS "executionId",
          "thread_id" AS "threadId",
          "role",
          "repo",
          "objective",
          "summary",
          "outcome",
          "details",
          "created_at" AS "createdAt"
      `;

      return normalizeExperience(rows[0]);
    }, 'EpisodicExperienceRepository.create');
  }

  async findAll(filter?: {
    executionId?: string;
    threadId?: string;
    role?: string;
    repo?: string;
    outcome?: string;
    limit?: number;
  }): Promise<PersistedEpisodicExperience[]> {
    return this.executeQuery(async () => {
      const where: string[] = [];
      const params: unknown[] = [];

      if (filter?.executionId) {
        params.push(filter.executionId);
        where.push(`"execution_id" = $${params.length}`);
      }
      if (filter?.threadId) {
        params.push(filter.threadId);
        where.push(`"thread_id" = $${params.length}`);
      }
      if (filter?.role) {
        params.push(filter.role);
        where.push(`"role" = $${params.length}`);
      }
      if (filter?.repo) {
        params.push(filter.repo);
        where.push(`"repo" = $${params.length}`);
      }
      if (filter?.outcome) {
        params.push(filter.outcome);
        where.push(`"outcome" = $${params.length}`);
      }
      if (filter?.limit) {
        params.push(filter.limit);
      }

      const rows = await this.prisma.$queryRawUnsafe<PersistedEpisodicExperience[]>(
        `
          SELECT
            "id",
            "execution_id" AS "executionId",
            "thread_id" AS "threadId",
            "role",
            "repo",
            "objective",
            "summary",
            "outcome",
            "details",
            "created_at" AS "createdAt"
          FROM "episodic_experiences"
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY "created_at" DESC
          ${filter?.limit ? `LIMIT $${params.length}` : ''}
        `,
        ...params
      );

      return rows.map(normalizeExperience);
    }, 'EpisodicExperienceRepository.findAll');
  }

  async findLatestForThread(threadId: string): Promise<PersistedEpisodicExperience | null> {
    return this.executeQuery(async () => {
      const rows = await this.prisma.$queryRaw<PersistedEpisodicExperience[]>`
        SELECT
          "id",
          "execution_id" AS "executionId",
          "thread_id" AS "threadId",
          "role",
          "repo",
          "objective",
          "summary",
          "outcome",
          "details",
          "created_at" AS "createdAt"
        FROM "episodic_experiences"
        WHERE "thread_id" = ${threadId}
        ORDER BY "created_at" DESC
        LIMIT 1
      `;

      return rows[0] ? normalizeExperience(rows[0]) : null;
    }, 'EpisodicExperienceRepository.findLatestForThread');
  }
}

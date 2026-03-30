import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import { BaseRepository } from './base.repository';

export interface PersistedSharedDecision {
  id: string;
  executionId: string;
  threadId: string | null;
  category: string;
  summary: string;
  details: Record<string, unknown> | null;
  createdAt: Date;
}

function toJson(value: unknown): Prisma.JsonValue | null {
  if (value === undefined || value === null) return null;
  return value as Prisma.JsonValue;
}

function normalizeSharedDecision(record: any): PersistedSharedDecision {
  return {
    id: record.id,
    executionId: record.executionId,
    threadId: record.threadId ?? null,
    category: record.category,
    summary: record.summary,
    details: (record.details as Record<string, unknown> | null) ?? null,
    createdAt: new Date(record.createdAt),
  };
}

export class SharedDecisionRepository extends BaseRepository {
  async create(input: {
    executionId: string;
    threadId?: string | null;
    category: string;
    summary: string;
    details?: Record<string, unknown>;
  }): Promise<PersistedSharedDecision> {
    return this.executeQuery(async () => {
      const rows = await this.prisma.$queryRaw<PersistedSharedDecision[]>`
        INSERT INTO "shared_decisions" (
          "id",
          "execution_id",
          "thread_id",
          "category",
          "summary",
          "details"
        )
        VALUES (
          ${randomUUID()},
          ${input.executionId},
          ${input.threadId ?? null},
          ${input.category},
          ${input.summary},
          ${toJson(input.details)}
        )
        RETURNING
          "id",
          "execution_id" AS "executionId",
          "thread_id" AS "threadId",
          "category",
          "summary",
          "details",
          "created_at" AS "createdAt"
      `;

      return normalizeSharedDecision(rows[0]);
    }, 'SharedDecisionRepository.create');
  }

  async findAll(filter?: {
    executionId?: string;
    threadId?: string;
    category?: string;
    limit?: number;
  }): Promise<PersistedSharedDecision[]> {
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
      if (filter?.category) {
        params.push(filter.category);
        where.push(`"category" = $${params.length}`);
      }

      if (filter?.limit) {
        params.push(filter.limit);
      }

      const rows = await this.prisma.$queryRawUnsafe<PersistedSharedDecision[]>(
        `
          SELECT
            "id",
            "execution_id" AS "executionId",
            "thread_id" AS "threadId",
            "category",
            "summary",
            "details",
            "created_at" AS "createdAt"
          FROM "shared_decisions"
          ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
          ORDER BY "created_at" DESC
          ${filter?.limit ? `LIMIT $${params.length}` : ''}
        `,
        ...params
      );

      return rows.map(normalizeSharedDecision);
    }, 'SharedDecisionRepository.findAll');
  }

  async findLatestForThreadCategory(
    threadId: string,
    category: string
  ): Promise<PersistedSharedDecision | null> {
    return this.executeQuery(async () => {
      const rows = await this.prisma.$queryRaw<PersistedSharedDecision[]>`
        SELECT
          "id",
          "execution_id" AS "executionId",
          "thread_id" AS "threadId",
          "category",
          "summary",
          "details",
          "created_at" AS "createdAt"
        FROM "shared_decisions"
        WHERE "thread_id" = ${threadId}
          AND "category" = ${category}
        ORDER BY "created_at" DESC
        LIMIT 1
      `;

      return rows[0] ? normalizeSharedDecision(rows[0]) : null;
    }, 'SharedDecisionRepository.findLatestForThreadCategory');
  }
}

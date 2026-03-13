import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { ThreadEvent, ThreadFilter, ThreadHandle } from '@parallaxai/runtime-interface';
import { BaseRepository } from './base.repository';

export interface PersistedThread {
  id: string;
  executionId: string;
  runtimeName: string;
  agentId: string | null;
  agentType: string;
  role: string | null;
  status: string;
  objective: string;
  workspace: Record<string, unknown> | null;
  summary: string | null;
  completion: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
  lastActivityAt: Date | null;
}

export interface PersistedThreadEvent {
  id: string;
  threadId: string;
  executionId: string;
  time: Date;
  type: string;
  data: Record<string, unknown>;
}

function toJson(value: unknown): Prisma.JsonValue | null {
  if (value === undefined || value === null) return null;
  return value as Prisma.JsonValue;
}

function normalizeThreadRecord(record: any): PersistedThread {
  return {
    id: record.id,
    executionId: record.executionId,
    runtimeName: record.runtimeName,
    agentId: record.agentId ?? null,
    agentType: record.agentType,
    role: record.role ?? null,
    status: record.status,
    objective: record.objective,
    workspace: (record.workspace as Record<string, unknown> | null) ?? null,
    summary: record.summary ?? null,
    completion: (record.completion as Record<string, unknown> | null) ?? null,
    metadata: (record.metadata as Record<string, unknown> | null) ?? null,
    createdAt: new Date(record.createdAt),
    updatedAt: new Date(record.updatedAt),
    lastActivityAt: record.lastActivityAt ? new Date(record.lastActivityAt) : null,
  };
}

function normalizeThreadEventRecord(record: any): PersistedThreadEvent {
  return {
    id: record.id,
    threadId: record.threadId,
    executionId: record.executionId,
    time: new Date(record.time),
    type: record.type,
    data: (record.data as Record<string, unknown>) ?? {},
  };
}

export class ThreadRepository extends BaseRepository {
  async upsert(thread: ThreadHandle, runtimeName?: string): Promise<PersistedThread> {
    return this.executeQuery(async () => {
      const rows = await this.prisma.$queryRaw<PersistedThread[]>`
        INSERT INTO "threads" (
          "id",
          "execution_id",
          "runtime_name",
          "agent_id",
          "agent_type",
          "role",
          "status",
          "objective",
          "workspace",
          "summary",
          "completion",
          "metadata",
          "created_at",
          "updated_at",
          "last_activity_at"
        )
        VALUES (
          ${thread.id},
          ${thread.executionId},
          ${runtimeName ?? thread.runtimeName},
          ${thread.agentId ?? null},
          ${thread.agentType},
          ${thread.role ?? null},
          ${thread.status},
          ${thread.objective},
          ${toJson(thread.workspace)},
          ${thread.summary ?? null},
          ${toJson(thread.completion)},
          ${toJson(thread.metadata)},
          ${thread.createdAt},
          NOW(),
          ${thread.lastActivityAt ?? null}
        )
        ON CONFLICT ("id") DO UPDATE SET
          "execution_id" = EXCLUDED."execution_id",
          "runtime_name" = EXCLUDED."runtime_name",
          "agent_id" = EXCLUDED."agent_id",
          "agent_type" = EXCLUDED."agent_type",
          "role" = EXCLUDED."role",
          "status" = EXCLUDED."status",
          "objective" = EXCLUDED."objective",
          "workspace" = EXCLUDED."workspace",
          "summary" = EXCLUDED."summary",
          "completion" = EXCLUDED."completion",
          "metadata" = EXCLUDED."metadata",
          "updated_at" = NOW(),
          "last_activity_at" = EXCLUDED."last_activity_at"
        RETURNING
          "id",
          "execution_id" AS "executionId",
          "runtime_name" AS "runtimeName",
          "agent_id" AS "agentId",
          "agent_type" AS "agentType",
          "role",
          "status",
          "objective",
          "workspace",
          "summary",
          "completion",
          "metadata",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt",
          "last_activity_at" AS "lastActivityAt"
      `;

      return normalizeThreadRecord(rows[0]);
    }, 'ThreadRepository.upsert');
  }

  async findById(id: string): Promise<PersistedThread | null> {
    return this.executeQuery(async () => {
      const rows = await this.prisma.$queryRaw<PersistedThread[]>`
        SELECT
          "id",
          "execution_id" AS "executionId",
          "runtime_name" AS "runtimeName",
          "agent_id" AS "agentId",
          "agent_type" AS "agentType",
          "role",
          "status",
          "objective",
          "workspace",
          "summary",
          "completion",
          "metadata",
          "created_at" AS "createdAt",
          "updated_at" AS "updatedAt",
          "last_activity_at" AS "lastActivityAt"
        FROM "threads"
        WHERE "id" = ${id}
        LIMIT 1
      `;

      return rows[0] ? normalizeThreadRecord(rows[0]) : null;
    }, 'ThreadRepository.findById');
  }

  async findAll(filter?: ThreadFilter): Promise<PersistedThread[]> {
    return this.executeQuery(async () => {
      const query = this.buildThreadListQuery(filter);
      const rows = await this.prisma.$queryRawUnsafe<PersistedThread[]>(query.sql, ...query.params);
      return rows.map(normalizeThreadRecord);
    }, 'ThreadRepository.findAll');
  }

  async findByExecutionId(executionId: string): Promise<PersistedThread[]> {
    return this.findAll({ executionId });
  }

  async addEvent(
    threadId: string,
    executionId: string,
    type: string,
    data: Record<string, unknown> = {}
  ): Promise<PersistedThreadEvent> {
    return this.executeQuery(async () => {
      const rows = await this.prisma.$queryRaw<PersistedThreadEvent[]>`
        INSERT INTO "thread_events" (
          "id",
          "thread_id",
          "execution_id",
          "time",
          "type",
          "data"
        )
        VALUES (
          ${randomUUID()},
          ${threadId},
          ${executionId},
          NOW(),
          ${type},
          ${toJson(data) ?? {}}
        )
        RETURNING
          "id",
          "thread_id" AS "threadId",
          "execution_id" AS "executionId",
          "time",
          "type",
          "data"
      `;

      return normalizeThreadEventRecord(rows[0]);
    }, 'ThreadRepository.addEvent');
  }

  async getEvents(threadId: string): Promise<PersistedThreadEvent[]> {
    return this.executeQuery(async () => {
      const rows = await this.prisma.$queryRaw<PersistedThreadEvent[]>`
        SELECT
          "id",
          "thread_id" AS "threadId",
          "execution_id" AS "executionId",
          "time",
          "type",
          "data"
        FROM "thread_events"
        WHERE "thread_id" = ${threadId}
        ORDER BY "time" ASC
      `;

      return rows.map(normalizeThreadEventRecord);
    }, 'ThreadRepository.getEvents');
  }

  async recordRuntimeProjection(
    thread: ThreadHandle,
    event: ThreadEvent,
    runtimeName?: string
  ): Promise<void> {
    await this.executeQuery(async () => {
      await this.upsert(
        {
          ...thread,
          status: thread.status,
          lastActivityAt: event.timestamp,
          updatedAt: event.timestamp,
        },
        runtimeName
      );

      await this.addEvent(event.threadId, event.executionId, event.type, {
        ...(event.data ?? {}),
        runtimeName: runtimeName ?? thread.runtimeName,
      });
    }, 'ThreadRepository.recordRuntimeProjection');
  }

  private buildThreadListQuery(filter?: ThreadFilter): { sql: string; params: unknown[] } {
    const where: string[] = [];
    const params: unknown[] = [];

    if (filter?.executionId) {
      params.push(filter.executionId);
      where.push(`"execution_id" = $${params.length}`);
    }

    if (filter?.role) {
      params.push(filter.role);
      where.push(`"role" = $${params.length}`);
    }

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      const placeholders = statuses.map((status) => {
        params.push(status);
        return `$${params.length}`;
      });
      where.push(`"status" IN (${placeholders.join(', ')})`);
    }

    if (filter?.agentType) {
      const agentTypes = Array.isArray(filter.agentType) ? filter.agentType : [filter.agentType];
      const placeholders = agentTypes.map((agentType) => {
        params.push(agentType);
        return `$${params.length}`;
      });
      where.push(`"agent_type" IN (${placeholders.join(', ')})`);
    }

    const sql = `
      SELECT
        "id",
        "execution_id" AS "executionId",
        "runtime_name" AS "runtimeName",
        "agent_id" AS "agentId",
        "agent_type" AS "agentType",
        "role",
        "status",
        "objective",
        "workspace",
        "summary",
        "completion",
        "metadata",
        "created_at" AS "createdAt",
        "updated_at" AS "updatedAt",
        "last_activity_at" AS "lastActivityAt"
      FROM "threads"
      ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
      ORDER BY "created_at" DESC
    `;

    return { sql, params };
  }
}

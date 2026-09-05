import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import { ExecutionRepository } from '@/db/repositories/execution.repository';
import {
  createExecutionInDb,
  updateExecutionInDb,
} from '@/pattern-engine/pattern-engine-db';

const logger = pino({ level: 'silent' });

describe('execution persistence', () => {
  it('lets only one concurrent terminal transition win', async () => {
    const row = {
      id: 'exec',
      status: 'running',
      error: undefined as string | undefined,
    };
    const updateMany = vi.fn(async ({ where, data }) => {
      expect(where).toEqual({
        id: 'exec',
        status: { in: ['pending', 'running'] },
      });
      if (!where.status.in.includes(row.status)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    });
    const repo = new ExecutionRepository(
      { execution: { updateMany } } as any,
      logger
    );
    expect(
      await Promise.all([
        repo.transitionStatus('exec', 'cancelled'),
        repo.transitionStatus('exec', 'completed', { result: 'late' }),
        repo.markOrphaned('exec', 'late recovery'),
      ])
    ).toEqual([true, false, false]);
    expect(row.status).toBe('cancelled');
    expect(row.error).toBeUndefined();
  });

  it('never sweeps healthy or unowned executions by default', async () => {
    const query = vi.fn().mockResolvedValue([]);
    const repo = new ExecutionRepository({ $queryRaw: query } as any, logger);
    expect(await repo.findOrphanedExecutions()).toEqual([]);
    expect(query).not.toHaveBeenCalled();
    await repo.findOrphanedExecutions('dead-node');
    const sql = query.mock.calls[0][0].join('?');
    expect(sql).toContain('"nodeId" = ?');
    expect(sql).not.toContain('IS NULL');
    expect(query.mock.calls[0][1]).toBe('dead-node');
  });

  it('persists canonical ownership and unlimited timeout without credentials', async () => {
    const database = {
      patterns: { findByName: vi.fn().mockResolvedValue({ id: 'pattern' }) },
      executions: {
        create: vi.fn().mockResolvedValue({ id: 'canonical' }),
        addEvent: vi.fn(),
      },
    };
    await createExecutionInDb(
      database as any,
      'test',
      {},
      {
        executionId: 'canonical',
        nodeId: 'owner',
        timeoutMs: 0,
        credentials: { token: 'test-secret-must-not-persist' },
        arbitrary: 'not metadata',
      }
    );
    const data = database.executions.create.mock.calls[0][0];
    expect(data).toMatchObject({
      id: 'canonical',
      nodeId: 'owner',
      timeoutMs: 0,
    });
    expect(JSON.stringify(data)).not.toContain('test-secret-must-not-persist');
    expect(data.metrics).not.toHaveProperty('credentials');
    expect(data.metrics).not.toHaveProperty('arbitrary');
  });

  it('does not emit contradictory events when a late terminal update loses', async () => {
    const database = {
      executions: {
        transitionStatus: vi.fn().mockResolvedValue(false),
        addEvent: vi.fn(),
      },
    };
    expect(
      await updateExecutionInDb(database as any, 'exec', {
        status: 'completed',
      })
    ).toBe(false);
    expect(database.executions.addEvent).not.toHaveBeenCalled();
  });
});

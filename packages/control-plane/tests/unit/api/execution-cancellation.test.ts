import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createExecutionsRouter } from '@/api/executions';
import { PatternEngine } from '@/pattern-engine/pattern-engine';

const logger = pino({ level: 'silent' });

describe('execution cancellation API', () => {
  it.each([
    false,
    true,
  ])('persists failed reconciliation after incomplete cancellation (database=%s)', async (useDatabase) => {
    const engine = new PatternEngine({
      agentRegistry: { listServices: async () => [] } as any,
      logger,
      patternsDir: '/tmp/test',
      agentRuntimeService: {
        stopThread: async () => {
          throw new Error('worker offline');
        },
      } as any,
    });
    vi.spyOn(engine, 'getPattern').mockReturnValue({
      name: 'test',
      version: '1',
      script: '',
      description: 'test',
      input: { type: 'any' },
    });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: () => new Promise(() => {}),
    });
    let record: any;
    const database = useDatabase
      ? {
          patterns: { findByName: async () => ({ id: 'pattern' }) },
          executions: {
            create: async (data: any) => {
              record = { ...data, time: new Date() };
              return record;
            },
            addEvent: vi.fn().mockResolvedValue(undefined),
            findById: async () => record,
            transitionStatus: vi.fn(
              async (_id: string, status: string, updates: any) => {
                if (!['pending', 'running'].includes(record.status))
                  return false;
                Object.assign(record, updates, { status });
                return true;
              }
            ),
          },
        }
      : undefined;
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };
    const app = express()
      .use(express.json())
      .use(
        createExecutionsRouter(
          engine,
          logger,
          database as any,
          undefined,
          webhook as any
        )
      );
    const created = await request(app)
      .post('/')
      .send({
        patternName: 'test',
        input: {},
        options: { timeout: 0 },
        webhook: { url: 'https://example.com/hook' },
      })
      .expect(202);
    const id = created.body.id;
    (engine as any).spawnedThreads.set(id, [{ id: 'offline-thread' }]);
    const cancelled = await request(app).post(`/${id}/cancel`).expect(500);
    expect(cancelled.body.error).toContain('reconciliation required');
    expect((await request(app).get(`/${id}`).expect(200)).body).toMatchObject({
      status: 'failed',
      error: expect.stringContaining('reconciliation required'),
    });
    expect(engine.getExecution(id)?.status).toBe('failed');
    await vi.waitFor(() => expect(webhook.send).toHaveBeenCalledTimes(1));
    expect(webhook.send.mock.calls[0][1].status).toBe('failed');
  });

  it('refuses cancellation after an external publication request has started', async () => {
    let finish!: (value: unknown) => void;
    const publication = new Promise((resolve) => {
      finish = resolve;
    });
    const finalize = vi.fn(() => publication);
    const engine = new PatternEngine({
      agentRegistry: { listServices: async () => [] } as any,
      logger,
      patternsDir: '/tmp/test',
      workspaceService: {
        provision: async () => ({
          id: 'ws',
          path: '/tmp/ws',
          repo: 'org/repo',
          branch: { name: 'work', baseBranch: 'main' },
        }),
        finalize,
      } as any,
    });
    vi.spyOn(engine, 'getPattern').mockReturnValue({
      name: 'test',
      version: '1',
      script: '',
      description: 'test',
      input: { type: 'any' },
      workspace: { enabled: true, repo: 'org/repo', createPr: true },
    });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: async () => ({ value: 'done', confidence: 1 }),
    });
    const app = express()
      .use(express.json())
      .use(createExecutionsRouter(engine, logger));
    const created = await request(app)
      .post('/')
      .send({ patternName: 'test', input: {}, options: { timeout: 0 } })
      .expect(202);
    await vi.waitFor(() => expect(finalize).toHaveBeenCalled());
    const response = await request(app)
      .post(`/${created.body.id}/cancel`)
      .expect(409);
    expect(response.body.error).toContain('Publication has already started');
    expect(engine.getExecution(created.body.id)?.status).toBe('running');
    finish(null);
    await vi.waitFor(() =>
      expect(engine.getExecution(created.body.id)?.status).toBe('completed')
    );
  });

  it('keeps cancellation terminal after the background task rejects and sends one cancelled webhook', async () => {
    let finish!: (value: unknown) => void;
    const module = new Promise((resolve) => {
      finish = resolve;
    });
    const engine = new PatternEngine({
      agentRegistry: { listServices: async () => [] } as any,
      logger,
      patternsDir: '/tmp/test',
    });
    vi.spyOn(engine, 'getPattern').mockReturnValue({
      name: 'test',
      version: '1',
      script: '',
      description: 'test',
      input: { type: 'any' },
    });
    vi.spyOn((engine as any).loader, 'getModule').mockReturnValue({
      execute: () => module,
    });
    const webhook = { send: vi.fn().mockResolvedValue(undefined) };
    const app = express()
      .use(express.json())
      .use(
        createExecutionsRouter(
          engine,
          logger,
          undefined,
          undefined,
          webhook as any
        )
      );
    const created = await request(app)
      .post('/')
      .send({
        patternName: 'test',
        input: {},
        options: { timeout: 0 },
        webhook: { url: 'https://example.com/hook' },
      })
      .expect(202);
    const id = created.body.id;
    await request(app).post(`/${id}/cancel`).expect(200);
    expect((await request(app).get(`/${id}`).expect(200)).body.status).toBe(
      'cancelled'
    );
    finish({ value: 'too late', confidence: 1 });
    await Promise.resolve();
    await Promise.resolve();
    expect((await request(app).get(`/${id}`).expect(200)).body.status).toBe(
      'cancelled'
    );
    expect(webhook.send).toHaveBeenCalledTimes(1);
    expect(webhook.send.mock.calls[0][1].status).toBe('cancelled');
    await request(app).post(`/${id}/cancel`).expect(409);
    await request(app).post('/missing/cancel').expect(404);
  });

  it('does not pretend to cancel work owned by another server', async () => {
    const engine = { getExecution: vi.fn(), cancelExecution: vi.fn() };
    const database = {
      executions: {
        findById: vi.fn().mockResolvedValue({
          id: 'remote',
          status: 'running',
          nodeId: 'other',
        }),
        transitionStatus: vi.fn(),
      },
    };
    const app = express().use(
      createExecutionsRouter(engine as any, logger, database as any)
    );
    await request(app).post('/remote/cancel').expect(409);
    expect(engine.cancelExecution).not.toHaveBeenCalled();
    expect(database.executions.transitionStatus).not.toHaveBeenCalled();
  });
});

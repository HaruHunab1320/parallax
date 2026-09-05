import { EventEmitter } from 'node:events';
import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExecutionsRouter } from '@/api/executions';
import { ExecutionEventBus } from '@/execution-events';

const logger = pino({ level: 'silent' });
const openRequests: EventEmitter[] = [];
afterEach(() => {
  for (const req of openRequests.splice(0)) req.emit('close');
});

function fixture(database?: any) {
  const owners = new Map([
    ['own-thread', 'own'],
    ['other-thread', 'other'],
  ]);
  const engine = {
    getExecution: (id: string) =>
      id === 'own' ? { id, status: 'running' } : undefined,
    ownsThread: vi.fn(
      async (id: string, threadId: string) => owners.get(threadId) === id
    ),
  };
  const events = new ExecutionEventBus();
  const router = createExecutionsRouter(
    engine as any,
    logger,
    database,
    events
  );
  return { engine, owners, events, router, app: express().use(router) };
}

async function subscribe(f: ReturnType<typeof fixture>, query = {}) {
  const req = Object.assign(new EventEmitter(), {
    params: { id: 'own' },
    query,
  });
  openRequests.push(req);
  const res = {
    writeHead: vi.fn(),
    write: vi.fn(),
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  };
  const route = f.router.stack.find(
    (layer: any) => layer.route?.path === '/:id/threads/stream'
  )!.route!;
  await route.stack[0].handle(req as any, res as any, () => {});
  return { req, res };
}

function emit(
  f: ReturnType<typeof fixture>,
  threadId: string,
  executionId = threadId,
  marker = threadId
) {
  f.events.emitEvent({
    executionId,
    type: 'gateway_thread_output',
    data: { thread_id: threadId, marker },
    timestamp: new Date(),
  });
}

describe('execution thread stream ownership', () => {
  it('rejects a missing execution and cross-execution client filters before starting SSE', async () => {
    const f = fixture();
    await request(f.app).get('/missing/threads/stream').expect(404);
    await request(f.app)
      .get('/own/threads/stream?threadIds=other-thread')
      .expect(403);
    await request(f.app)
      .get('/own/threads/stream?threadIds=own-thread,other-thread')
      .expect(403);
    await request(f.app)
      .get('/own/threads/stream?threadIds[]=own-thread')
      .expect(400);
  });

  it('forwards only mapped execution threads for both gateway and runtime event shapes', async () => {
    const f = fixture();
    const { res } = await subscribe(f);
    emit(f, 'other-thread');
    emit(f, 'other-thread', 'other');
    emit(f, 'other-thread', 'own', 'forged-membership');
    emit(f, 'own-thread', 'other', 'wrong-execution');
    emit(f, 'own-thread', 'own', 'runtime');
    emit(f, 'own-thread', 'own-thread', 'gateway');
    await vi.waitFor(() => expect(res.write).toHaveBeenCalledTimes(3));
    const output = res.write.mock.calls.map(([text]) => text).join('');
    expect(output).toContain('runtime');
    expect(output).toContain('gateway');
    expect(output).not.toContain('other-thread');
    expect(output).not.toContain('forged-membership');
    expect(output).not.toContain('wrong-execution');
  });

  it('discovers late threads without reopening the stream and keeps event ordering through async lookup', async () => {
    const f = fixture();
    const { res } = await subscribe(f);
    f.owners.set('late-thread', 'own');
    let release!: (value: boolean) => void;
    f.engine.ownsThread.mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = resolve;
        })
    );
    emit(f, 'late-thread', 'late-thread', 'first');
    emit(f, 'own-thread', 'own', 'second');
    await vi.waitFor(() => expect(release).toBeTypeOf('function'));
    expect(res.write).toHaveBeenCalledTimes(1);
    release(true);
    await vi.waitFor(() => expect(res.write).toHaveBeenCalledTimes(3));
    expect(res.write.mock.calls[1][0]).toContain('first');
    expect(res.write.mock.calls[2][0]).toContain('second');
  });

  it('uses persisted ownership, fails closed on lookup errors, and stops after disconnect', async () => {
    const database = {
      executions: { findById: vi.fn().mockResolvedValue({ id: 'own' }) },
      threads: {
        findById: vi.fn(async (id: string) => ({
          id,
          executionId: id === 'persisted' ? 'own' : 'other',
        })),
      },
    };
    const f = fixture(database);
    const { req, res } = await subscribe(f);
    emit(f, 'persisted');
    emit(f, 'own-thread'); // Persisted ownership overrides a conflicting runtime handle.
    await vi.waitFor(() =>
      expect(database.threads.findById).toHaveBeenCalledTimes(2)
    );
    await vi.waitFor(() => expect(res.write).toHaveBeenCalledTimes(2));
    database.threads.findById.mockRejectedValueOnce(
      new Error('database unavailable')
    );
    emit(f, 'unverified');
    emit(f, 'persisted', 'persisted', 'after-error');
    await vi.waitFor(() => expect(res.write).toHaveBeenCalledTimes(3));
    expect(res.write.mock.calls.map(([text]) => text).join('')).not.toContain(
      'unverified'
    );
    req.emit('close');
    emit(f, 'persisted', 'persisted', 'after-close');
    await Promise.resolve();
    expect(res.write).toHaveBeenCalledTimes(3);
  });
});

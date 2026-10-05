import express from 'express';
import pino from 'pino';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createPatternsRouter } from '@/api/patterns';

const logger = pino({ level: 'silent' });
function setup() {
  const engine = {
    getNodeId: () => 'owner',
    getExecutionTimeout: () => 0,
    getExecution: vi.fn(),
    executePattern: vi.fn().mockResolvedValue({
      id: 'canonical',
      status: 'completed',
      result: 'done',
    }),
  };
  const database = {
    patterns: { findByName: vi.fn().mockResolvedValue({ id: 'pattern' }) },
    executions: {
      create: vi.fn().mockResolvedValue({ id: 'canonical' }),
      addEvent: vi.fn(),
      transitionStatus: vi.fn().mockResolvedValue(true),
    },
  };
  const metrics = { recordApiCall: vi.fn(), recordPatternExecution: vi.fn() };
  const app = express()
    .use(express.json())
    .use(
      createPatternsRouter(
        engine as any,
        metrics as any,
        logger,
        undefined,
        database as any
      )
    );
  return { engine, database, app };
}

describe('synchronous pattern execution persistence', () => {
  it('uses the persisted ID and owner while keeping credentials out of metadata', async () => {
    const { engine, database, app } = setup();
    const credentials = { token: 'test-secret-not-metadata' };
    await request(app)
      .post('/test/execute')
      .send({ input: {}, options: { credentials, timeout: 0 } })
      .expect(200);
    expect(engine.executePattern).toHaveBeenCalledWith(
      'test',
      {},
      { executionId: 'canonical', credentials, timeout: 0 }
    );
    const stored = database.executions.create.mock.calls[0][0];
    expect(stored).toMatchObject({ nodeId: 'owner', timeoutMs: 0 });
    expect(JSON.stringify(stored)).not.toContain('test-secret-not-metadata');
  });

  it('does not report success when another terminal transition won', async () => {
    const { database, app } = setup();
    database.executions.transitionStatus.mockResolvedValue(false);
    await request(app).post('/test/execute').send({ input: {} }).expect(409);
    expect(database.executions.addEvent).toHaveBeenCalledTimes(1); // started only
  });

  it('preserves cancellation when the synchronous execution rejects', async () => {
    const { engine, database, app } = setup();
    engine.executePattern.mockRejectedValue(new Error('Execution cancelled'));
    engine.getExecution.mockReturnValue({ status: 'cancelled' });
    await request(app).post('/test/execute').send({ input: {} }).expect(500);
    expect(database.executions.transitionStatus).toHaveBeenCalledWith(
      'canonical',
      'cancelled',
      expect.objectContaining({ error: 'Execution cancelled' })
    );
  });
});

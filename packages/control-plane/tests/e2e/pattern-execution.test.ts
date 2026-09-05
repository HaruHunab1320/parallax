import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  createTestAdminToken,
  startHttpServer,
} from '../fixtures/http-server-fixture';
import { getTestPrisma } from '../setup';

describe('Pattern Execution E2E', () => {
  let app: string;
  let server: Awaited<ReturnType<typeof startHttpServer>>;
  let authToken: string;

  beforeAll(async () => {
    server = await startHttpServer();
    app = server.url;
  });

  beforeEach(async () => {
    authToken = await createTestAdminToken();
  });

  afterAll(async () => {
    await server?.stop();
  });

  it('rejects and persists a synchronous run when its required agents are unavailable', async () => {
    // ConsensusBuilder requires three agents; this isolated registry has none.
    const executeResponse = await request(app)
      .post('/api/patterns/ConsensusBuilder/execute')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        input: {
          task: 'analyze test data',
          data: { test: true, value: 42 },
        },
        options: { timeout: 10000 },
      });

    expect(executeResponse.status).toBe(500);
    expect(executeResponse.body.error).toContain(
      'Not enough agents available. Required: 3, Available: 0'
    );
    const records = await getTestPrisma().execution.findMany();
    expect(records).toHaveLength(1);
    expect(records[0].status).toBe('failed');
    expect(records[0].error).toBe(executeResponse.body.error);
  });

  it('should handle pattern not found gracefully', async () => {
    const executeResponse = await request(app)
      .post('/api/patterns/non-existent-pattern/execute')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        input: { task: 'test' },
      })
      .expect(404);

    expect(executeResponse.body).toHaveProperty('error');
    expect(executeResponse.body.error).toContain('not found');
  });

  it('persists an asynchronous failure under the returned execution ID', async () => {
    // Create execution (async) via the executions endpoint
    const createResponse = await request(app)
      .post('/api/executions')
      .set('Authorization', `Bearer ${authToken}`)
      .send({
        patternName: 'ConsensusBuilder',
        input: { task: 'async test', data: {} },
        options: { stream: false },
      })
      .expect(202);

    expect(createResponse.body.status).toBe('accepted');
    expect(createResponse.body.id).toBeDefined();

    const executionId = createResponse.body.id;

    let outcome: Record<string, unknown> | undefined;
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await request(app)
        .get(`/api/executions/${executionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);
      if (!['pending', 'running'].includes(response.body.status)) {
        outcome = response.body;
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    expect(outcome?.status).toBe('failed');
    expect(outcome?.error).toContain(
      'Not enough agents available. Required: 3, Available: 0'
    );
    const persisted = await getTestPrisma().execution.findUniqueOrThrow({
      where: { id: executionId },
    });
    expect(persisted.status).toBe('failed');
    expect(persisted.error).toBe(outcome?.error);
  });
});

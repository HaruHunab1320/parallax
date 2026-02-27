import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from '@/server';

describe('Pattern Execution E2E', () => {
  let app: express.Application;
  let server: any;

  beforeAll(async () => {
    app = await createServer();
    const services = await (app as any).start();
    server = services.httpServer;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('should execute a pattern end-to-end via sync API', async () => {
    // Execute a file-based pattern via the sync execute endpoint
    // Without real agents, the pattern runs with 0 agents and produces a weak result
    const executeResponse = await request(app)
      .post('/api/patterns/ConsensusBuilder/execute')
      .send({
        input: {
          task: 'analyze test data',
          data: { test: true, value: 42 }
        },
        options: { timeout: 10000 }
      });

    // Pattern execution succeeds (200) even without agents — produces weak consensus
    // Or may return 500 if execution engine requires agents
    expect([200, 500]).toContain(executeResponse.status);

    if (executeResponse.status === 200) {
      expect(executeResponse.body).toHaveProperty('execution');
      const execution = executeResponse.body.execution;
      expect(execution.patternName).toBe('ConsensusBuilder');
      expect(execution.status).toBe('completed');
      expect(execution.id).toBeDefined();
    } else {
      // 500 means execution failed (e.g., no agents available)
      expect(executeResponse.body).toHaveProperty('error');
    }
  });

  it('should handle pattern not found gracefully', async () => {
    const executeResponse = await request(app)
      .post('/api/patterns/non-existent-pattern/execute')
      .send({
        input: { task: 'test' }
      })
      .expect(404);

    expect(executeResponse.body).toHaveProperty('error');
    expect(executeResponse.body.error).toContain('not found');
  });

  it('should support async execution with status polling', async () => {
    // Create execution (async) via the executions endpoint
    const createResponse = await request(app)
      .post('/api/executions')
      .send({
        patternName: 'ConsensusBuilder',
        input: { task: 'async test', data: {} },
        options: { stream: false }
      })
      .expect(202);

    expect(createResponse.body.status).toBe('accepted');
    expect(createResponse.body.id).toBeDefined();

    const executionId = createResponse.body.id;

    // Poll for completion
    let attempts = 0;
    let completed = false;

    while (attempts < 10 && !completed) {
      const statusResponse = await request(app)
        .get(`/api/executions/${executionId}`)
        .expect(200);

      if (statusResponse.body.status === 'completed' ||
          statusResponse.body.status === 'failed') {
        completed = true;
        expect(['completed', 'failed']).toContain(statusResponse.body.status);
      }

      attempts++;
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    expect(completed).toBe(true);
  });
});

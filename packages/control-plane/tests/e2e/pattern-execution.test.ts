import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from '@/server';
import { createTestPattern, createTestAgent, getTestPrisma } from '../setup';

describe('Pattern Execution E2E', () => {
  let app: express.Application;
  let server: any;
  let prisma: any;

  beforeAll(async () => {
    app = await createServer();
    server = (app as any).start();
    prisma = getTestPrisma();
  });

  afterAll(async () => {
    if (server && server.close) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it('should execute a pattern end-to-end', async () => {
    // Step 1: Create a pattern
    const pattern = await createTestPattern({
      name: 'e2e-test-pattern',
      description: 'End-to-end test pattern',
      script: `
        pattern e2e-test {
          input { task: string, data: any }
          agents { capabilities = ["analyze"], min = 1 }
          steps {
            let results = agents.map(agent => agent.analyze(input.task, input.data))
            return { results: results }
          }
        }
      `
    });

    // Step 2: Create test agents
    const agent1 = await createTestAgent({
      name: 'e2e-agent-1',
      capabilities: ['analyze', 'test'],
      status: 'active'
    });

    const agent2 = await createTestAgent({
      name: 'e2e-agent-2',
      capabilities: ['analyze', 'process'],
      status: 'active'
    });

    // Step 3: Execute the pattern via API
    const executeResponse = await request(app)
      .post('/api/patterns/e2e-test-pattern/execute')
      .send({
        input: {
          task: 'analyze test data',
          data: { test: true, value: 42 }
        },
        options: {
          timeout: 10000
        }
      })
      .expect(200);

    expect(executeResponse.body).toHaveProperty('execution');
    expect(executeResponse.body).toHaveProperty('duration');
    
    const execution = executeResponse.body.execution;
    expect(execution.patternName).toBe('e2e-test-pattern');
    expect(execution.status).toBe('completed');
    expect(execution.id).toBeDefined();

    // Step 4: Verify execution was persisted
    const dbExecution = await prisma.execution.findFirst({
      where: { id: execution.id },
      include: { events: true }
    });

    expect(dbExecution).toBeDefined();
    expect(dbExecution.patternId).toBe(pattern.id);
    expect(dbExecution.status).toBe('completed');
    expect(dbExecution.input).toEqual({
      task: 'analyze test data',
      data: { test: true, value: 42 }
    });

    // Step 5: Check execution events
    expect(dbExecution.events.length).toBeGreaterThan(0);
    const startEvent = dbExecution.events.find((e: any) => e.type === 'started');
    expect(startEvent).toBeDefined();

    // Step 6: Get execution details via API
    const detailsResponse = await request(app)
      .get(`/api/executions/${execution.id}`)
      .expect(200);

    expect(detailsResponse.body.id).toBe(execution.id);
    expect(detailsResponse.body.patternName).toBe('e2e-test-pattern');
    expect(detailsResponse.body.status).toBe('completed');

    // Step 7: Get execution events via API
    const eventsResponse = await request(app)
      .get(`/api/executions/${execution.id}/events`)
      .expect(200);

    expect(eventsResponse.body.events).toBeDefined();
    expect(Array.isArray(eventsResponse.body.events)).toBe(true);
    expect(eventsResponse.body.events.length).toBeGreaterThan(0);

    // Step 8: List executions
    const listResponse = await request(app)
      .get('/api/executions')
      .query({ status: 'completed', limit: 10 })
      .expect(200);

    expect(listResponse.body.executions).toBeDefined();
    const foundExecution = listResponse.body.executions.find(
      (e: any) => e.id === execution.id
    );
    expect(foundExecution).toBeDefined();

    // Step 9: Get pattern metrics
    const metricsResponse = await request(app)
      .get('/api/patterns/e2e-test-pattern/metrics')
      .expect(200);

    expect(metricsResponse.body.stats).toBeDefined();
    expect(metricsResponse.body.stats.totalExecutions).toBeGreaterThan(0);
    expect(metricsResponse.body.stats.successRate).toBeGreaterThan(0);
  });

  it('should handle pattern execution failure gracefully', async () => {
    // Create a pattern that will fail
    const pattern = await createTestPattern({
      name: 'failing-pattern',
      description: 'Pattern designed to fail',
      script: `
        pattern failing {
          input { shouldFail: boolean }
          steps {
            if (input.shouldFail) {
              throw new Error("Intentional failure")
            }
            return { success: true }
          }
        }
      `
    });

    // Execute with failure condition
    const executeResponse = await request(app)
      .post('/api/patterns/failing-pattern/execute')
      .send({
        input: { shouldFail: true }
      })
      .expect(500);

    expect(executeResponse.body).toHaveProperty('error');
  });

  it('should support async execution with status polling', async () => {
    // Create a pattern
    await createTestPattern({
      name: 'async-pattern',
      description: 'Pattern for async execution',
      minAgents: 1
    });

    // Create execution (async)
    const createResponse = await request(app)
      .post('/api/executions')
      .send({
        patternName: 'async-pattern',
        input: { async: true },
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
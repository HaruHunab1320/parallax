import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from '@/server';
import { createTestPattern } from '../../setup';

describe('Patterns API', () => {
  let app: express.Application;
  let server: any;

  beforeAll(async () => {
    app = await createServer();
    server = (app as any).start();
  });

  afterAll(async () => {
    if (server && server.close) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  describe('GET /api/patterns', () => {
    it('should list all patterns', async () => {
      // Create test patterns
      await createTestPattern({ name: 'pattern-1' });
      await createTestPattern({ name: 'pattern-2' });

      const response = await request(app)
        .get('/api/patterns')
        .expect(200);

      expect(response.body).toHaveProperty('patterns');
      expect(response.body).toHaveProperty('count');
      expect(response.body.count).toBeGreaterThanOrEqual(2);
      
      const patternNames = response.body.patterns.map((p: any) => p.name);
      expect(patternNames).toContain('pattern-1');
      expect(patternNames).toContain('pattern-2');
    });

    it('should return empty list when no patterns exist', async () => {
      // Clear all patterns first
      const prisma = (global as any).prisma;
      await prisma.pattern.deleteMany();

      const response = await request(app)
        .get('/api/patterns')
        .expect(200);

      expect(response.body.patterns).toEqual([]);
      expect(response.body.count).toBe(0);
    });
  });

  describe('GET /api/patterns/:name', () => {
    it('should get pattern details by name', async () => {
      await createTestPattern({ 
        name: 'test-details',
        description: 'Test pattern for details',
        version: '2.0.0'
      });

      const response = await request(app)
        .get('/api/patterns/test-details')
        .expect(200);

      expect(response.body.name).toBe('test-details');
      expect(response.body.description).toBe('Test pattern for details');
      expect(response.body.version).toBe('2.0.0');
    });

    it('should return 404 for non-existent pattern', async () => {
      const response = await request(app)
        .get('/api/patterns/non-existent')
        .expect(404);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /api/patterns/:name/validate', () => {
    it('should validate pattern input', async () => {
      await createTestPattern({ 
        name: 'validation-test',
        metadata: {
          inputSchema: {
            required: ['task', 'data']
          }
        }
      });

      const response = await request(app)
        .post('/api/patterns/validation-test/validate')
        .send({
          input: {
            task: 'analyze',
            data: { test: true }
          }
        })
        .expect(200);

      expect(response.body.valid).toBe(true);
      expect(response.body.errors).toEqual([]);
    });

    it('should return validation errors for missing fields', async () => {
      await createTestPattern({ 
        name: 'validation-test-2',
        metadata: {
          inputSchema: {
            required: ['task', 'data']
          }
        }
      });

      const response = await request(app)
        .post('/api/patterns/validation-test-2/validate')
        .send({
          input: {
            task: 'analyze'
            // missing 'data' field
          }
        })
        .expect(200);

      expect(response.body.valid).toBe(false);
      expect(response.body.errors).toContain('Missing required field: data');
    });

    it('should return 400 for missing input', async () => {
      const response = await request(app)
        .post('/api/patterns/some-pattern/validate')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Missing required field: input');
    });
  });

  describe('POST /api/patterns/:name/execute', () => {
    it('should execute pattern', async () => {
      await createTestPattern({ 
        name: 'execution-test',
        script: 'pattern execution-test { return "success"; }'
      });

      const response = await request(app)
        .post('/api/patterns/execution-test/execute')
        .send({
          input: { test: 'data' },
          options: { timeout: 5000 }
        })
        .expect(200);

      expect(response.body).toHaveProperty('execution');
      expect(response.body).toHaveProperty('duration');
      expect(response.body.execution).toHaveProperty('id');
      expect(response.body.execution.patternName).toBe('execution-test');
      expect(response.body.execution.status).toBe('completed');
    });

    it('should return 404 for non-existent pattern', async () => {
      const response = await request(app)
        .post('/api/patterns/non-existent/execute')
        .send({
          input: { test: 'data' }
        })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });

    it('should return 400 for missing input', async () => {
      const response = await request(app)
        .post('/api/patterns/some-pattern/execute')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Missing required field: input');
    });
  });

  describe('GET /api/patterns/:name/metrics', () => {
    it('should get pattern metrics', async () => {
      const pattern = await createTestPattern({ name: 'metrics-test' });
      
      // Create some executions
      const prisma = (global as any).prisma;
      await prisma.execution.create({
        data: {
          patternId: pattern.id,
          input: {},
          status: 'completed',
          durationMs: 1000,
          confidence: 0.9
        }
      });

      await prisma.execution.create({
        data: {
          patternId: pattern.id,
          input: {},
          status: 'failed',
          durationMs: 500,
          confidence: 0.5
        }
      });

      const response = await request(app)
        .get('/api/patterns/metrics-test/metrics')
        .expect(200);

      expect(response.body).toHaveProperty('pattern', 'metrics-test');
      expect(response.body).toHaveProperty('stats');
      expect(response.body.stats.totalExecutions).toBe(2);
      expect(response.body.stats.successRate).toBe(0.5);
      expect(response.body.stats.avgDuration).toBeDefined();
      expect(response.body.stats.avgConfidence).toBeDefined();
    });

    it('should return 404 for pattern with no metrics', async () => {
      await createTestPattern({ name: 'no-metrics' });

      const response = await request(app)
        .get('/api/patterns/no-metrics/metrics')
        .expect(404);

      expect(response.body.error).toContain('No metrics found');
    });
  });
});
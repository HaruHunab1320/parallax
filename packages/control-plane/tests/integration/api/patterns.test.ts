import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import express from 'express';
import { createServer } from '@/server';

describe('Patterns API', () => {
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

  describe('GET /api/patterns', () => {
    it('should list all patterns', async () => {
      const response = await request(app)
        .get('/api/patterns')
        .expect(200);

      expect(response.body).toHaveProperty('patterns');
      expect(response.body).toHaveProperty('count');
      // File-based patterns from the patterns directory
      expect(response.body.count).toBeGreaterThan(0);

      const patternNames = response.body.patterns.map((p: any) => p.name);
      expect(patternNames).toContain('ConsensusBuilder');
      expect(patternNames).toContain('ConfidenceCascade');
    });

    it('should include pattern metadata', async () => {
      const response = await request(app)
        .get('/api/patterns')
        .expect(200);

      const consensus = response.body.patterns.find((p: any) => p.name === 'ConsensusBuilder');
      expect(consensus).toBeDefined();
      expect(consensus).toHaveProperty('name', 'ConsensusBuilder');
      expect(consensus).toHaveProperty('version');
      expect(consensus).toHaveProperty('description');
    });
  });

  describe('GET /api/patterns/:name', () => {
    it('should get pattern details by name', async () => {
      const response = await request(app)
        .get('/api/patterns/ConsensusBuilder')
        .expect(200);

      expect(response.body.name).toBe('ConsensusBuilder');
      expect(response.body.description).toBeDefined();
      expect(response.body.version).toBe('1.0.0');
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
      const response = await request(app)
        .post('/api/patterns/ConsensusBuilder/validate')
        .send({
          input: {
            task: 'analyze code',
            data: { test: true }
          }
        })
        .expect(200);

      expect(response.body.valid).toBe(true);
    });

    it('should return 400 for missing input', async () => {
      const response = await request(app)
        .post('/api/patterns/ConsensusBuilder/validate')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Missing required field: input');
    });

    it('should return 404 for non-existent pattern', async () => {
      const response = await request(app)
        .post('/api/patterns/non-existent/validate')
        .send({ input: { task: 'test' } })
        .expect(404);

      expect(response.body.error).toContain('not found');
    });
  });

  describe('POST /api/patterns/:name/execute', () => {
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
        .post('/api/patterns/ConsensusBuilder/execute')
        .send({})
        .expect(400);

      expect(response.body.error).toContain('Missing required field: input');
    });
  });

  describe('GET /api/patterns/:name/metrics', () => {
    it('should return 404 for pattern with no metrics', async () => {
      const response = await request(app)
        .get('/api/patterns/ConsensusBuilder/metrics')
        .expect(404);

      expect(response.body.error).toContain('No metrics found');
    });
  });
});

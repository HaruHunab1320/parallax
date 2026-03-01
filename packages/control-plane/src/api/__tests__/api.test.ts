import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios, { AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';
import { createServer } from '../../server';
import type { Server } from 'http';

describe('Control Plane HTTP API', () => {
  let server: Server;
  let baseURL: string;
  let api: AxiosInstance;

  beforeAll(async () => {
    const app = await createServer();
    const services = await (app as any).start();
    server = services.httpServer;

    // Wait for server to be listening
    await new Promise<void>((resolve) => {
      if (server.listening) return resolve();
      server.on('listening', resolve);
    });

    // Get the actual port
    const address = server.address();
    const port = typeof address === 'object' ? address?.port : 3000;
    baseURL = `http://localhost:${port}`;

    // Create an axios instance with auth header for protected endpoints
    const secret = process.env.JWT_SECRET || 'test-secret';
    const authToken = jwt.sign(
      { sub: 'test-user', email: 'test@test.com', role: 'admin', type: 'access' },
      secret,
      { expiresIn: 3600 }
    );
    api = axios.create({
      baseURL,
      headers: { Authorization: `Bearer ${authToken}` },
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('Health endpoints', () => {
    it('should return health status', async () => {
      const response = await axios.get(`${baseURL}/health`);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('status');
      expect(['healthy', 'degraded', 'unhealthy']).toContain(response.data.status);
    });
  });

  describe('Pattern endpoints', () => {
    it('should list patterns', async () => {
      const response = await api.get('/api/patterns');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('patterns');
      expect(Array.isArray(response.data.patterns)).toBe(true);
    });

    it('should get pattern details', async () => {
      // First get list of patterns
      const listResponse = await api.get('/api/patterns');
      const patterns = listResponse.data.patterns;

      if (patterns.length > 0) {
        const patternName = patterns[0].name;
        const response = await api.get(`/api/patterns/${patternName}`);
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('name');
        expect(response.data).toHaveProperty('version');
        expect(response.data).toHaveProperty('description');
      }
    });

    it('should return 404 for non-existent pattern', async () => {
      try {
        await api.get('/api/patterns/non-existent-pattern');
      } catch (error: any) {
        expect(error.response.status).toBe(404);
        expect(error.response.data).toHaveProperty('error');
      }
    });

    it('should validate pattern input', async () => {
      const listResponse = await api.get('/api/patterns');
      const patterns = listResponse.data.patterns;

      if (patterns.length > 0) {
        const patternName = patterns[0].name;
        const response = await api.post(`/api/patterns/${patternName}/validate`, {
          input: { task: 'test', data: {} }
        });
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('valid');
        expect(typeof response.data.valid).toBe('boolean');
      }
    });
  });

  describe('Agent endpoints', () => {
    it('should list agents', async () => {
      const response = await api.get('/api/agents');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('agents');
      expect(Array.isArray(response.data.agents)).toBe(true);
      expect(response.data).toHaveProperty('count');
    });
  });

  describe('Execution endpoints', () => {
    it('should list executions', async () => {
      const response = await api.get('/api/executions');
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('executions');
      expect(Array.isArray(response.data.executions)).toBe(true);
      expect(response.data).toHaveProperty('total');
      expect(response.data).toHaveProperty('limit');
      expect(response.data).toHaveProperty('offset');
    });

    it('should create new execution', async () => {
      const listResponse = await api.get('/api/patterns');
      const patterns = listResponse.data.patterns;

      if (patterns.length > 0) {
        const patternName = patterns[0].name;
        const response = await api.post('/api/executions', {
          patternName,
          input: { task: 'test', data: {} }
        });

        expect(response.status).toBe(202);
        expect(response.data).toHaveProperty('id');
        expect(response.data).toHaveProperty('status', 'accepted');
      }
    });
  });

  describe('Root endpoint', () => {
    it('should return service info', async () => {
      const response = await axios.get(baseURL);
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('service', 'Parallax Control Plane');
      expect(response.data).toHaveProperty('endpoints');
    });
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParallaxError } from '../src/error';
import { HttpClient } from '../src/http';

describe('HttpClient', () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(
    response: Partial<Response> & { json?: () => Promise<unknown> }
  ) {
    const fn = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
      ...response,
    });
    globalThis.fetch = fn;
    return fn;
  }

  describe('request basics', () => {
    it('should make GET requests', async () => {
      const fetchMock = mockFetch({
        json: async () => ({ data: 'test' }),
      });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      const result = await client.get<{ data: string }>('/api/test');

      expect(result.data).toBe('test');
      expect(fetchMock).toHaveBeenCalledOnce();

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('http://localhost:8081/api/test');
      expect(init.method).toBe('GET');
    });

    it('should make POST requests with body', async () => {
      const fetchMock = mockFetch({
        json: async () => ({ id: '123' }),
      });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      await client.post('/api/patterns', { name: 'test' });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('POST');
      expect(init.body).toBe(JSON.stringify({ name: 'test' }));
      expect(init.headers['Content-Type']).toBe('application/json');
    });

    it('should make PUT requests', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      await client.put('/api/patterns/test', { script: 'let x = 1' });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('PUT');
    });

    it('should make PATCH requests', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      await client.patch('/api/agents/123/status', { status: 'active' });

      const [, init] = fetchMock.mock.calls[0];
      expect(init.method).toBe('PATCH');
    });

    it('should make DELETE requests', async () => {
      mockFetch({ status: 204, ok: true, json: async () => undefined });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      const result = await client.delete('/api/patterns/test');

      expect(result).toBeUndefined();
    });

    it('should handle 204 No Content', async () => {
      mockFetch({ status: 204, ok: true });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      const result = await client.delete('/api/patterns/test');

      expect(result).toBeUndefined();
    });
  });

  describe('query parameters', () => {
    it('should append query params to URL', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      await client.get('/api/executions', {
        limit: 10,
        offset: 0,
        status: 'completed',
      });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('limit=10');
      expect(url).toContain('offset=0');
      expect(url).toContain('status=completed');
    });

    it('should skip undefined query params', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      await client.get('/api/executions', { limit: 10, status: undefined });

      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain('limit=10');
      expect(url).not.toContain('status');
    });
  });

  describe('authentication', () => {
    it('should send API key in Authorization header (plx_ format)', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        apiKey: 'plx_test123',
      });
      await client.get('/api/patterns');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('plx_test123');
    });

    it('should send API key with ApiKey prefix for non-plx keys', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        apiKey: 'some-other-key',
      });
      await client.get('/api/patterns');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('ApiKey some-other-key');
    });

    it('should send Bearer token', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        auth: { accessToken: 'jwt-token-here' },
      });
      await client.get('/api/patterns');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer jwt-token-here');
    });

    it('should allow no auth for OSS mode', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });
      await client.get('/api/patterns');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBeUndefined();
    });

    it('should update access token via setAccessToken', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        auth: { accessToken: 'old-token' },
      });

      client.setAccessToken('new-token');
      await client.get('/api/patterns');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers.Authorization).toBe('Bearer new-token');
    });
  });

  describe('custom headers', () => {
    it('should include custom headers', async () => {
      const fetchMock = mockFetch({ json: async () => ({}) });

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        headers: { 'X-Custom': 'value' },
      });
      await client.get('/api/patterns');

      const [, init] = fetchMock.mock.calls[0];
      expect(init.headers['X-Custom']).toBe('value');
    });
  });

  describe('error handling', () => {
    it('should throw ParallaxError on 400', async () => {
      mockFetch({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Missing required field: name' }),
      });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });

      await expect(client.post('/api/patterns', {})).rejects.toThrow(
        ParallaxError
      );
      await expect(client.post('/api/patterns', {})).rejects.toMatchObject({
        status: 400,
        message: 'Missing required field: name',
        isValidation: true,
      });
    });

    it('should throw ParallaxError on 403 with upgradeUrl', async () => {
      mockFetch({
        ok: false,
        status: 403,
        json: async () => ({
          error: 'Pattern management requires Parallax Enterprise',
          upgradeUrl: 'https://parallax.ai/enterprise',
        }),
      });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });

      try {
        await client.post('/api/patterns', {});
        expect.unreachable('Should have thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(ParallaxError);
        const e = error as ParallaxError;
        expect(e.isForbidden).toBe(true);
        expect(e.isEnterprise).toBe(true);
        expect(e.upgradeUrl).toBe('https://parallax.ai/enterprise');
      }
    });

    it('should throw ParallaxError on 404', async () => {
      mockFetch({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Pattern not found' }),
      });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });

      await expect(
        client.get('/api/patterns/nonexistent')
      ).rejects.toMatchObject({
        status: 404,
        isNotFound: true,
      });
    });

    it('should throw ParallaxError on 409', async () => {
      mockFetch({
        ok: false,
        status: 409,
        json: async () => ({ error: 'Pattern already exists' }),
      });

      const client = new HttpClient({ baseUrl: 'http://localhost:8081' });

      await expect(client.post('/api/patterns', {})).rejects.toMatchObject({
        status: 409,
        isConflict: true,
      });
    });

    it('should handle non-JSON error responses', async () => {
      mockFetch({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error('not json');
        },
      });

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        retries: 0,
      });

      await expect(client.get('/api/patterns')).rejects.toMatchObject({
        status: 500,
        isServerError: true,
      });
    });
  });

  describe('retries', () => {
    it('should retry on 500 errors', async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return {
            ok: false,
            status: 500,
            json: async () => ({ error: 'Server error' }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ data: 'ok' }) };
      });

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        retries: 2,
      });

      const result = await client.get<{ data: string }>('/api/patterns');
      expect(result.data).toBe('ok');
      expect(callCount).toBe(3);
    });

    it('should not retry on 4xx errors (except 429)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ error: 'Bad request' }),
      });
      globalThis.fetch = fetchMock;

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        retries: 3,
      });

      await expect(client.post('/api/patterns', {})).rejects.toThrow(
        ParallaxError
      );
      expect(fetchMock).toHaveBeenCalledOnce();
    });

    it('should respect retries: 0', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Server error' }),
      });
      globalThis.fetch = fetchMock;

      const client = new HttpClient({
        baseUrl: 'http://localhost:8081',
        retries: 0,
      });

      await expect(client.get('/api/patterns')).rejects.toThrow(ParallaxError);
      expect(fetchMock).toHaveBeenCalledOnce();
    });
  });
});

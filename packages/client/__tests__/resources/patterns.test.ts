import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('PatternsResource', () => {
  let client: ParallaxClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new ParallaxClient({
      baseUrl: 'http://localhost:8081',
      apiKey: 'plx_test',
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(body: unknown, status = 200) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    });
  }

  describe('list', () => {
    it('should list patterns', async () => {
      const patterns = [
        { name: 'SignalNoiseStation', version: '1.0.5' },
        { name: 'SignalNoiseConversation', version: '1.0.0' },
      ];
      mockFetch({ patterns, count: 2 });

      const result = await client.patterns.list();

      expect(result.patterns).toHaveLength(2);
      expect(result.count).toBe(2);
      expect(result.patterns[0].name).toBe('SignalNoiseStation');
    });
  });

  describe('get', () => {
    it('should get a pattern by name', async () => {
      mockFetch({ name: 'SignalNoiseStation', version: '1.0.5' });

      const result = await client.patterns.get('SignalNoiseStation');

      expect(result.name).toBe('SignalNoiseStation');
    });
  });

  describe('validate', () => {
    it('should validate pattern input', async () => {
      mockFetch({ valid: true, errors: [] });

      const result = await client.patterns.validate('SignalNoiseStation', {
        task: 'hello',
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('execute', () => {
    it('should execute a pattern synchronously', async () => {
      mockFetch({
        execution: {
          id: 'exec-123',
          result: { primary: { channel: 'prism' } },
          confidence: 0.85,
        },
        duration: 1500,
      });

      const result = await client.patterns.execute('SignalNoiseStation', {
        task: 'discuss portfolio',
      });

      expect(result.execution.id).toBe('exec-123');
      expect(result.duration).toBe(1500);
    });
  });

  describe('metrics', () => {
    it('should get pattern metrics', async () => {
      mockFetch({
        pattern: 'SignalNoiseStation',
        stats: {
          totalExecutions: 10,
          avgDuration: 1200,
          avgConfidence: 0.82,
          successRate: 0.9,
          recentExecutions: [],
        },
        metrics: [],
      });

      const result = await client.patterns.metrics('SignalNoiseStation');

      expect(result.stats.totalExecutions).toBe(10);
      expect(result.stats.avgConfidence).toBe(0.82);
    });
  });

  describe('create (Enterprise)', () => {
    it('should create a pattern', async () => {
      mockFetch({ name: 'TestPattern', version: '1.0.0' }, 201);

      const result = await client.patterns.create({
        name: 'TestPattern',
        script: 'let result = {}\nresult ~> 0.5',
      });

      expect(result.name).toBe('TestPattern');
    });
  });

  describe('update (Enterprise)', () => {
    it('should update a pattern', async () => {
      mockFetch({ name: 'TestPattern', version: '2.0.0' });

      const result = await client.patterns.update('TestPattern', {
        version: '2.0.0',
      });

      expect(result.version).toBe('2.0.0');
    });
  });

  describe('delete (Enterprise)', () => {
    it('should delete a pattern', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });

      await expect(
        client.patterns.delete('TestPattern')
      ).resolves.toBeUndefined();
    });
  });

  describe('upload (Enterprise)', () => {
    it('should upload a pattern file', async () => {
      mockFetch(
        {
          pattern: { name: 'SignalNoiseConversation', version: '1.0.0' },
        },
        201
      );

      const result = await client.patterns.upload({
        filename: 'SignalNoiseConversation.prism',
        content: '// pattern script here',
        overwrite: true,
      });

      expect(result.pattern.name).toBe('SignalNoiseConversation');
    });
  });

  describe('uploadBatch (Enterprise)', () => {
    it('should batch upload patterns', async () => {
      mockFetch({
        results: [
          { filename: 'a.prism', success: true, pattern: { name: 'A' } },
          { filename: 'b.prism', success: false, error: 'Parse error' },
        ],
      });

      const result = await client.patterns.uploadBatch({
        files: [
          { filename: 'a.prism', content: '...' },
          { filename: 'b.prism', content: '...' },
        ],
        overwrite: false,
      });

      expect(result.results).toHaveLength(2);
      expect(result.results[0].success).toBe(true);
      expect(result.results[1].success).toBe(false);
    });
  });

  describe('versions (Enterprise)', () => {
    it('should get pattern versions', async () => {
      mockFetch({ pattern: 'TestPattern', versions: [{ version: '1.0.0' }] });

      const result = await client.patterns.versions('TestPattern');

      expect(result.pattern).toBe('TestPattern');
      expect(result.versions).toHaveLength(1);
    });
  });
});

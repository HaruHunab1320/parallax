import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('ExecutionsResource', () => {
  let client: ParallaxClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new ParallaxClient({ baseUrl: 'http://localhost:8081' });
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

  it('should list executions', async () => {
    mockFetch({
      executions: [{ id: 'exec-1', status: 'completed' }],
      total: 1,
      limit: 100,
      offset: 0,
    });

    const result = await client.executions.list();

    expect(result.executions).toHaveLength(1);
    expect(result.executions[0].status).toBe('completed');
  });

  it('should list executions with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ executions: [], total: 0, limit: 10, offset: 5 }),
    });
    globalThis.fetch = fetchMock;

    await client.executions.list({ limit: 10, offset: 5, status: 'failed' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
    expect(url).toContain('status=failed');
  });

  it('should get execution details', async () => {
    mockFetch({
      id: 'exec-1',
      status: 'completed',
      result: { data: 'test' },
      confidence: 0.85,
    });

    const result = await client.executions.get('exec-1');

    expect(result.id).toBe('exec-1');
    expect(result.confidence).toBe(0.85);
  });

  it('should create an async execution', async () => {
    mockFetch(
      {
        id: 'exec-new',
        status: 'accepted',
        message: 'Execution started',
        webhookConfigured: false,
      },
      202
    );

    const result = await client.executions.create({
      patternName: 'SignalNoiseStation',
      input: { task: 'discuss' },
    });

    expect(result.id).toBe('exec-new');
    expect(result.status).toBe('accepted');
  });

  it('should get execution events', async () => {
    mockFetch({ events: [{ type: 'started' }, { type: 'completed' }] });

    const result = await client.executions.events('exec-1');

    expect(result.events).toHaveLength(2);
  });

  it('should cancel an execution', async () => {
    mockFetch({ message: 'Execution cancelled', id: 'exec-1' });

    const result = await client.executions.cancel('exec-1');

    expect(result.message).toBe('Execution cancelled');
  });

  it('should retry an execution', async () => {
    mockFetch({
      message: 'Retry available',
      retryRequest: { patternName: 'Test', input: {} },
      hint: 'POST this to /api/executions to retry',
    });

    const result = await client.executions.retry('exec-1');

    expect(result.retryRequest.patternName).toBe('Test');
  });

  it('should get execution stats summary', async () => {
    mockFetch({
      total_executions: 100,
      successful: 85,
      failed: 10,
      cancelled: 5,
      in_progress: 0,
      avg_duration_ms: 2500,
      avg_confidence: 0.82,
    });

    const result = await client.executions.stats();

    expect(result.total_executions).toBe(100);
    expect(result.successful).toBe(85);
  });

  it('should get hourly stats', async () => {
    mockFetch({
      stats: [
        {
          hour: '2026-03-14T10:00:00Z',
          executions: 5,
          successful: 4,
          failed: 1,
          avg_confidence: 0.8,
        },
      ],
    });

    const result = await client.executions.hourlyStats(12);

    expect(result.stats).toHaveLength(1);
    expect(result.stats[0].executions).toBe(5);
  });

  it('should get daily stats', async () => {
    mockFetch({
      stats: [
        {
          day: '2026-03-14',
          executions: 50,
          successful: 45,
          failed: 5,
          avg_confidence: 0.83,
          avg_duration_ms: 2000,
        },
      ],
    });

    const result = await client.executions.dailyStats(7);

    expect(result.stats).toHaveLength(1);
  });

  it('should poll waitForCompletion until done', async () => {
    let callCount = 0;
    globalThis.fetch = vi.fn().mockImplementation(async () => {
      callCount++;
      const status = callCount < 3 ? 'running' : 'completed';
      return {
        ok: true,
        status: 200,
        json: async () => ({
          id: 'exec-1',
          status,
          result: callCount >= 3 ? 'done' : undefined,
        }),
      };
    });

    const result = await client.executions.waitForCompletion(
      'exec-1',
      10,
      5000
    );

    expect(result.status).toBe('completed');
    expect(callCount).toBe(3);
  });
});

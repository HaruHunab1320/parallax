import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('AuditResource', () => {
  let client: ParallaxClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new ParallaxClient({ baseUrl: 'http://localhost:8081', apiKey: 'plx_admin' });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function mockFetch(body: unknown) {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => body,
    });
  }

  it('should query audit logs', async () => {
    mockFetch({
      logs: [{ id: 'log-1', action: 'create', resource: 'pattern' }],
      total: 1,
      limit: 100,
      offset: 0,
    });

    const result = await client.audit.query();
    expect(result.logs).toHaveLength(1);
  });

  it('should query audit logs with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ logs: [], total: 0, limit: 50, offset: 0 }),
    });
    globalThis.fetch = fetchMock;

    await client.audit.query({ userId: 'user-1', action: 'delete', limit: 50 });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('userId=user-1');
    expect(url).toContain('action=delete');
    expect(url).toContain('limit=50');
  });

  it('should get audit stats', async () => {
    mockFetch({ period: '24 hours', totalEvents: 150 });

    const result = await client.audit.stats(24);
    expect(result.period).toBe('24 hours');
  });

  it('should get user activity', async () => {
    mockFetch({
      logs: [{ id: 'log-1', action: 'login' }],
      userId: 'user-1',
    });

    const result = await client.audit.userActivity('user-1');
    expect(result.userId).toBe('user-1');
    expect(result.logs).toHaveLength(1);
  });

  it('should get resource history', async () => {
    mockFetch({
      logs: [{ id: 'log-1', action: 'update' }],
      resource: 'pattern',
      resourceId: 'SignalNoise',
    });

    const result = await client.audit.resourceHistory('pattern', 'SignalNoise');
    expect(result.resource).toBe('pattern');
  });

  it('should get failed logins', async () => {
    mockFetch({
      period: '24 hours',
      email: 'all',
      count: 3,
    });

    const result = await client.audit.failedLogins();
    expect(result.period).toBe('24 hours');
  });

  it('should cleanup old logs', async () => {
    mockFetch({
      message: 'Audit log cleanup completed',
      deletedCount: 500,
      retentionDays: 90,
    });

    const result = await client.audit.cleanup(90);
    expect(result.deletedCount).toBe(500);
    expect(result.retentionDays).toBe(90);
  });
});

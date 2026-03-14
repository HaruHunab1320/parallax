import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('BackupResource', () => {
  let client: ParallaxClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new ParallaxClient({ baseUrl: 'http://localhost:8081', apiKey: 'plx_admin' });
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

  it('should export a backup', async () => {
    const backupData = {
      version: '1.0',
      timestamp: '2026-03-14T10:00:00Z',
      tables: {
        patterns: [{ name: 'Test' }],
        agents: [],
        users: [],
        schedules: [],
        triggers: [],
        licenses: [],
      },
      metadata: { totalRecords: 1 },
    };
    mockFetch(backupData);

    const result = await client.backup.export();
    expect(result.version).toBe('1.0');
    expect(result.tables.patterns).toHaveLength(1);
  });

  it('should get backup info', async () => {
    mockFetch({
      tables: { patterns: 5, agents: 10, users: 3, schedules: 2, triggers: 1, executions: 100 },
      totalRecords: 21,
      executionsExcluded: true,
      executionCount: 100,
      note: 'Executions are not included in backups',
    });

    const result = await client.backup.info();
    expect(result.totalRecords).toBe(21);
    expect(result.executionsExcluded).toBe(true);
  });

  it('should restore from backup in merge mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        message: 'Restore completed',
        mode: 'merge',
        backupTimestamp: '2026-03-14T10:00:00Z',
        results: {
          patterns: { created: 2, updated: 0, skipped: 3 },
        },
      }),
    });
    globalThis.fetch = fetchMock;

    const backup = {
      version: '1.0',
      timestamp: '2026-03-14T10:00:00Z',
      tables: { patterns: [], agents: [], users: [], schedules: [], triggers: [], licenses: [] },
      metadata: { totalRecords: 0 },
    };

    const result = await client.backup.restore(backup, 'merge');
    expect(result.mode).toBe('merge');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('mode=merge');
  });

  it('should restore in replace mode', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({
        message: 'Restore completed',
        mode: 'replace',
        backupTimestamp: '2026-03-14T10:00:00Z',
        results: {},
      }),
    });
    globalThis.fetch = fetchMock;

    const backup = {
      version: '1.0',
      timestamp: '2026-03-14T10:00:00Z',
      tables: { patterns: [], agents: [], users: [], schedules: [], triggers: [], licenses: [] },
      metadata: { totalRecords: 0 },
    };

    await client.backup.restore(backup, 'replace');

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('mode=replace');
  });

  it('should validate a backup', async () => {
    mockFetch({
      valid: true,
      issues: [],
      backup: {
        version: '1.0',
        timestamp: '2026-03-14T10:00:00Z',
        records: 50,
        tables: { patterns: 10, agents: 20, users: 5, schedules: 10, triggers: 5 },
      },
    });

    const backup = {
      version: '1.0',
      timestamp: '2026-03-14T10:00:00Z',
      tables: { patterns: [], agents: [], users: [], schedules: [], triggers: [], licenses: [] },
      metadata: { totalRecords: 50 },
    };

    const result = await client.backup.validate(backup);
    expect(result.valid).toBe(true);
    expect(result.issues).toHaveLength(0);
  });

  it('should report invalid backup', async () => {
    mockFetch({
      valid: false,
      issues: ['Missing version field', 'Missing tables field'],
    });

    const result = await client.backup.validate({} as any);
    expect(result.valid).toBe(false);
    expect(result.issues).toHaveLength(2);
  });
});

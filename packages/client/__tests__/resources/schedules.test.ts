import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('SchedulesResource', () => {
  let client: ParallaxClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new ParallaxClient({
      baseUrl: 'http://localhost:8081',
      apiKey: 'plx_enterprise',
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

  it('should list schedules', async () => {
    mockFetch({
      schedules: [
        { id: 'sched-1', name: 'conversation-loop', status: 'active' },
      ],
      count: 1,
    });

    const result = await client.schedules.list();

    expect(result.schedules).toHaveLength(1);
    expect(result.schedules[0].name).toBe('conversation-loop');
  });

  it('should list schedules with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ schedules: [], count: 0 }),
    });
    globalThis.fetch = fetchMock;

    await client.schedules.list({
      status: 'active',
      patternName: 'SignalNoiseConversation',
    });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('status=active');
    expect(url).toContain('patternName=SignalNoiseConversation');
  });

  it('should create a schedule with intervalMs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'sched-new',
        name: 'conversation-loop',
        patternName: 'SignalNoiseConversation',
        intervalMs: 30000,
        status: 'active',
        runCount: 0,
      }),
    });
    globalThis.fetch = fetchMock;

    const result = await client.schedules.create({
      name: 'conversation-loop',
      patternName: 'SignalNoiseConversation',
      intervalMs: 30000,
      input: { topic: 'portfolio' },
      metadata: { chainOutput: true },
    });

    expect(result.id).toBe('sched-new');
    expect(result.status).toBe('active');

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.intervalMs).toBe(30000);
    expect(body.metadata.chainOutput).toBe(true);
  });

  it('should create a schedule with cron', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: 'sched-cron',
        name: 'daily-report',
        status: 'active',
        runCount: 0,
      }),
    });
    globalThis.fetch = fetchMock;

    await client.schedules.create({
      name: 'daily-report',
      patternName: 'DailyReport',
      cron: '0 9 * * *',
      timezone: 'America/Los_Angeles',
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.cron).toBe('0 9 * * *');
    expect(body.timezone).toBe('America/Los_Angeles');
  });

  it('should convert Date objects to ISO strings', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: 'sched-1', status: 'active', runCount: 0 }),
    });
    globalThis.fetch = fetchMock;

    const startAt = new Date('2026-04-01T00:00:00Z');
    await client.schedules.create({
      name: 'future-schedule',
      patternName: 'Test',
      intervalMs: 60000,
      startAt,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.startAt).toBe('2026-04-01T00:00:00.000Z');
  });

  it('should get a schedule', async () => {
    mockFetch({ id: 'sched-1', name: 'test', status: 'active', runCount: 5 });

    const result = await client.schedules.get('sched-1');

    expect(result.runCount).toBe(5);
  });

  it('should update a schedule', async () => {
    mockFetch({
      id: 'sched-1',
      intervalMs: 60000,
      status: 'active',
      runCount: 5,
    });

    const result = await client.schedules.update('sched-1', {
      intervalMs: 60000,
    });

    expect(result.intervalMs).toBe(60000);
  });

  it('should delete a schedule', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    await expect(client.schedules.delete('sched-1')).resolves.toBeUndefined();
  });

  it('should pause a schedule', async () => {
    mockFetch({ id: 'sched-1', status: 'paused', runCount: 10 });

    const result = await client.schedules.pause('sched-1');

    expect(result.status).toBe('paused');
  });

  it('should resume a schedule', async () => {
    mockFetch({ id: 'sched-1', status: 'active', runCount: 10 });

    const result = await client.schedules.resume('sched-1');

    expect(result.status).toBe('active');
  });

  it('should trigger a schedule', async () => {
    mockFetch({
      id: 'run-1',
      scheduleId: 'sched-1',
      status: 'success',
      durationMs: 1500,
    });

    const result = await client.schedules.trigger('sched-1');

    expect(result.id).toBe('run-1');
    expect(result.status).toBe('success');
  });

  it('should get schedule runs', async () => {
    mockFetch({
      runs: [
        { id: 'run-1', status: 'success' },
        { id: 'run-2', status: 'failure' },
      ],
      count: 2,
    });

    const result = await client.schedules.runs('sched-1');

    expect(result.runs).toHaveLength(2);
  });
});

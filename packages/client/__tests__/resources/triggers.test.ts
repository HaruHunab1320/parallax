import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('TriggersResource', () => {
  let client: ParallaxClient;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    client = new ParallaxClient({ baseUrl: 'http://localhost:8081', apiKey: 'plx_test' });
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

  it('should list triggers', async () => {
    mockFetch({
      triggers: [{ id: 'trig-1', name: 'deploy-hook', type: 'webhook', status: 'active' }],
      count: 1,
    });

    const result = await client.triggers.list();
    expect(result.triggers).toHaveLength(1);
    expect(result.triggers[0].type).toBe('webhook');
  });

  it('should list triggers with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ triggers: [], count: 0 }),
    });
    globalThis.fetch = fetchMock;

    await client.triggers.list({ type: 'webhook', status: 'active' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('type=webhook');
    expect(url).toContain('status=active');
  });

  it('should create a webhook trigger', async () => {
    mockFetch({
      id: 'trig-new',
      name: 'deploy-hook',
      type: 'webhook',
      webhookUrl: 'http://localhost:8081/api/triggers/webhook/abc123',
    }, 201);

    const result = await client.triggers.createWebhook({
      name: 'deploy-hook',
      patternName: 'DeployPattern',
    });

    expect(result.id).toBe('trig-new');
    expect(result.webhookUrl).toBeDefined();
  });

  it('should create an event trigger', async () => {
    mockFetch({
      id: 'trig-evt',
      name: 'on-commit',
      type: 'event',
      eventType: 'git.push',
    }, 201);

    const result = await client.triggers.createEvent({
      name: 'on-commit',
      patternName: 'CodeReview',
      eventType: 'git.push',
    });

    expect(result.type).toBe('event');
  });

  it('should get a trigger', async () => {
    mockFetch({ id: 'trig-1', name: 'test', status: 'active' });

    const result = await client.triggers.get('trig-1');
    expect(result.name).toBe('test');
  });

  it('should update a trigger', async () => {
    mockFetch({ id: 'trig-1', name: 'updated', status: 'active' });

    const result = await client.triggers.update('trig-1', { name: 'updated' });
    expect(result.name).toBe('updated');
  });

  it('should delete a trigger', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await expect(client.triggers.delete('trig-1')).resolves.toBeUndefined();
  });

  it('should pause a trigger', async () => {
    mockFetch({ id: 'trig-1', status: 'paused' });

    const result = await client.triggers.pause('trig-1');
    expect(result.status).toBe('paused');
  });

  it('should resume a trigger', async () => {
    mockFetch({ id: 'trig-1', status: 'active' });

    const result = await client.triggers.resume('trig-1');
    expect(result.status).toBe('active');
  });

  it('should send a webhook payload', async () => {
    mockFetch({ triggered: true, executionId: 'exec-123' });

    const result = await client.triggers.sendWebhook('abc123', { event: 'deploy' });
    expect(result.triggered).toBe(true);
    expect(result.executionId).toBe('exec-123');
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('AgentsResource', () => {
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

  it('should list agents', async () => {
    mockFetch({
      agents: [
        { id: 'echo-1', name: 'Echo', capabilities: ['conversation'] },
        { id: 'vero-1', name: 'Vero', capabilities: ['portfolio'] },
      ],
      count: 2,
      byCapability: {},
      timestamp: '2026-03-14T00:00:00Z',
    });

    const result = await client.agents.list();

    expect(result.agents).toHaveLength(2);
    expect(result.count).toBe(2);
  });

  it('should get agent details', async () => {
    mockFetch({ id: 'echo-1', name: 'Echo', capabilities: ['conversation'] });

    const result = await client.agents.get('echo-1');

    expect(result.name).toBe('Echo');
  });

  it('should health check an agent', async () => {
    mockFetch({
      agentId: 'echo-1',
      status: 'healthy',
      timestamp: '2026-03-14T00:00:00Z',
    });

    const result = await client.agents.health('echo-1');

    expect(result.status).toBe('healthy');
  });

  it('should test an agent', async () => {
    mockFetch({
      agentId: 'echo-1',
      result: { message: 'Hello' },
      confidence: 0.9,
    });

    const result = await client.agents.test('echo-1', {
      task: 'greet',
      data: { name: 'World' },
    });

    expect(result.confidence).toBe(0.9);
  });

  it('should get capability stats', async () => {
    mockFetch({
      stats: [{ capability: 'conversation', agent_count: 4, active_count: 3 }],
    });

    const result = await client.agents.capabilityStats();

    expect(result.stats[0].capability).toBe('conversation');
    expect(result.stats[0].agent_count).toBe(4);
  });

  it('should update agent status', async () => {
    mockFetch({ id: 'echo-1', status: 'inactive' });

    const result = await client.agents.updateStatus('echo-1', 'inactive');

    expect(result.status).toBe('inactive');
  });

  it('should delete an agent', async () => {
    mockFetch({ deleted: 'echo-1' });

    const result = await client.agents.delete('echo-1');

    expect(result.deleted).toBe('echo-1');
  });

  it('should bulk delete stale agents', async () => {
    mockFetch({ deleted: 5, thresholdSeconds: 600 });

    const result = await client.agents.deleteStale(600);

    expect(result.deleted).toBe(5);
    expect(result.thresholdSeconds).toBe(600);
  });
});

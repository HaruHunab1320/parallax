import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('ManagedAgentsResource', () => {
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

  it('should list runtimes', async () => {
    mockFetch({
      runtimes: [
        { name: 'local', type: 'pty', available: true },
        { name: 'docker', type: 'docker', available: false },
      ],
    });

    const result = await client.managedAgents.runtimes();

    expect(result.runtimes).toHaveLength(2);
  });

  it('should get runtime health', async () => {
    mockFetch({ name: 'local', healthy: true });

    const result = await client.managedAgents.runtimeHealth('local');

    expect(result.healthy).toBe(true);
  });

  it('should list managed agents', async () => {
    mockFetch({
      agents: [{ id: 'agent-1', name: 'Claude', type: 'claude-code', status: 'running' }],
      count: 1,
    });

    const result = await client.managedAgents.list();

    expect(result.agents).toHaveLength(1);
  });

  it('should spawn a managed agent', async () => {
    mockFetch(
      { id: 'agent-new', name: 'Claude', type: 'claude-code', status: 'starting' },
      201
    );

    const result = await client.managedAgents.spawn({
      type: 'claude-code',
      name: 'Claude',
      capabilities: ['coding'],
    });

    expect(result.id).toBe('agent-new');
  });

  it('should get a managed agent', async () => {
    mockFetch({ id: 'agent-1', name: 'Claude', status: 'running' });

    const result = await client.managedAgents.get('agent-1');

    expect(result.name).toBe('Claude');
  });

  it('should stop a managed agent', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    await expect(client.managedAgents.stop('agent-1')).resolves.toBeUndefined();
  });

  it('should send a message to a managed agent', async () => {
    mockFetch({ sent: true, response: 'Hello back' });

    const result = await client.managedAgents.send('agent-1', {
      message: 'Hello',
      expectResponse: true,
    });

    expect(result.sent).toBe(true);
    expect(result.response).toBe('Hello back');
  });

  it('should get agent logs', async () => {
    mockFetch({ logs: ['line 1', 'line 2'], count: 2 });

    const result = await client.managedAgents.logs('agent-1', 50);

    expect(result.logs).toHaveLength(2);
  });

  it('should get agent metrics', async () => {
    mockFetch({ cpu: 45, memory: 128 });

    const result = await client.managedAgents.metrics('agent-1');

    expect(result.cpu).toBe(45);
  });
});

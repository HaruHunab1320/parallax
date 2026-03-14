import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('ManagedThreadsResource', () => {
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

  it('should list threads', async () => {
    mockFetch({
      threads: [{ id: 'thread-1', name: 'Worker', status: 'running' }],
      count: 1,
    });

    const result = await client.managedThreads.list();

    expect(result.threads).toHaveLength(1);
  });

  it('should spawn a thread', async () => {
    mockFetch(
      {
        id: 'thread-new',
        executionId: 'exec-1',
        agentType: 'claude-code',
        name: 'Worker',
        status: 'starting',
      },
      201
    );

    const result = await client.managedThreads.spawn({
      executionId: 'exec-1',
      agentType: 'claude-code',
      name: 'Worker',
      objective: 'Implement feature X',
    });

    expect(result.id).toBe('thread-new');
  });

  it('should prepare thread input', async () => {
    mockFetch({
      executionId: 'exec-1',
      name: 'Worker',
      objective: 'Implement feature X',
      preparation: { files: ['src/index.ts'] },
    });

    const result = await client.managedThreads.prepare({
      executionId: 'exec-1',
      agentType: 'claude-code',
      name: 'Worker',
      objective: 'Implement feature X',
    });

    expect(result.preparation).toBeDefined();
  });

  it('should get threads by execution', async () => {
    mockFetch({
      threads: [
        { id: 'thread-1', executionId: 'exec-1' },
        { id: 'thread-2', executionId: 'exec-1' },
      ],
      count: 2,
    });

    const result = await client.managedThreads.byExecution('exec-1');

    expect(result.threads).toHaveLength(2);
  });

  it('should get a thread by ID', async () => {
    mockFetch({ id: 'thread-1', name: 'Worker', status: 'running' });

    const result = await client.managedThreads.get('thread-1');

    expect(result.name).toBe('Worker');
  });

  it('should stop a thread', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });

    await expect(client.managedThreads.stop('thread-1')).resolves.toBeUndefined();
  });

  it('should send input to a thread', async () => {
    mockFetch({ sent: true });

    const result = await client.managedThreads.send('thread-1', {
      message: 'Continue working',
    });

    expect(result.sent).toBe(true);
  });

  it('should get thread events', async () => {
    mockFetch({ events: [{ type: 'started' }], count: 1 });

    const result = await client.managedThreads.events('thread-1');

    expect(result.events).toHaveLength(1);
  });

  it('should get thread shared decisions', async () => {
    mockFetch({
      decisions: [{ id: 'dec-1', category: 'architecture', summary: 'Use REST' }],
      count: 1,
    });

    const result = await client.managedThreads.decisions('thread-1');

    expect(result.decisions).toHaveLength(1);
    expect(result.decisions[0].category).toBe('architecture');
  });

  it('should create a shared decision', async () => {
    mockFetch(
      {
        id: 'dec-new',
        executionId: 'exec-1',
        threadId: 'thread-1',
        category: 'design',
        summary: 'Use factory pattern',
      },
      201
    );

    const result = await client.managedThreads.createDecision('thread-1', {
      category: 'design',
      summary: 'Use factory pattern',
    });

    expect(result.id).toBe('dec-new');
  });

  it('should get execution shared decisions', async () => {
    mockFetch({
      decisions: [{ id: 'dec-1', summary: 'Use REST' }],
      count: 1,
    });

    const result = await client.managedThreads.executionDecisions('exec-1');

    expect(result.count).toBe(1);
  });

  it('should get episodic experiences', async () => {
    mockFetch({
      experiences: [{ id: 'exp-1', role: 'lead', outcome: 'success' }],
      count: 1,
    });

    const result = await client.managedThreads.experiences({ role: 'lead' });

    expect(result.experiences).toHaveLength(1);
  });
});

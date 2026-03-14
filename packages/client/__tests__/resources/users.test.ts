import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('UsersResource', () => {
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

  it('should list users', async () => {
    mockFetch({
      users: [{ id: 'user-1', email: 'admin@test.com', role: 'admin', status: 'active' }],
      count: 1,
    });

    const result = await client.users.list();
    expect(result.count).toBe(1);
  });

  it('should list users with filters', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ users: [], count: 0 }),
    });
    globalThis.fetch = fetchMock;

    await client.users.list({ role: 'admin', status: 'active' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('role=admin');
    expect(url).toContain('status=active');
  });

  it('should create a user', async () => {
    mockFetch({
      id: 'user-new',
      email: 'new@test.com',
      role: 'viewer',
      status: 'pending',
    }, 201);

    const result = await client.users.create({ email: 'new@test.com', name: 'New User' });
    expect(result.id).toBe('user-new');
    expect(result.status).toBe('pending');
  });

  it('should get current user', async () => {
    mockFetch({ id: 'user-1', email: 'me@test.com', role: 'admin', status: 'active' });

    const result = await client.users.me();
    expect(result.email).toBe('me@test.com');
  });

  it('should get a user by ID', async () => {
    mockFetch({ id: 'user-1', email: 'test@test.com', role: 'editor', status: 'active' });

    const result = await client.users.get('user-1');
    expect(result.role).toBe('editor');
  });

  it('should update a user', async () => {
    mockFetch({ id: 'user-1', role: 'admin', status: 'active' });

    const result = await client.users.update('user-1', { role: 'admin' });
    expect(result.role).toBe('admin');
  });

  it('should delete a user', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await expect(client.users.delete('user-1')).resolves.toBeUndefined();
  });

  it('should create an API key', async () => {
    mockFetch({
      id: 'key-1',
      name: 'my-key',
      keyPrefix: 'plx_abc12345',
      key: 'plx_abc123456789full',
      warning: 'Save this key securely. It will not be shown again.',
    }, 201);

    const result = await client.users.createApiKey('user-1', { name: 'my-key' });
    expect(result.key).toContain('plx_');
    expect(result.warning).toBeDefined();
  });

  it('should create an API key with expiry Date', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true, status: 201,
      json: async () => ({ id: 'key-1', name: 'temp', key: 'plx_temp' }),
    });
    globalThis.fetch = fetchMock;

    const expires = new Date('2026-12-31');
    await client.users.createApiKey('user-1', { name: 'temp', expiresAt: expires });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.expiresAt).toBe('2026-12-31T00:00:00.000Z');
  });

  it('should list API keys', async () => {
    mockFetch({
      apiKeys: [
        { id: 'key-1', name: 'production', keyPrefix: 'plx_abc' },
      ],
      count: 1,
    });

    const result = await client.users.listApiKeys('user-1');
    expect(result.apiKeys).toHaveLength(1);
  });

  it('should revoke an API key', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({ ok: true, status: 204 });
    await expect(client.users.revokeApiKey('user-1', 'key-1')).resolves.toBeUndefined();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ParallaxClient } from '../../src/index';

describe('AuthResource', () => {
  let client: ParallaxClient;
  let originalFetch: typeof globalThis.fetch;
  let tokenRefreshCallback: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    tokenRefreshCallback = vi.fn();
    client = new ParallaxClient({
      baseUrl: 'http://localhost:8081',
      onTokenRefresh: tokenRefreshCallback,
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

  it('should register a user', async () => {
    mockFetch({
      user: { id: 'user-1', email: 'test@example.com', role: 'admin' },
      tokens: { accessToken: 'jwt-access', refreshToken: 'jwt-refresh' },
    }, 201);

    const result = await client.auth.register('test@example.com', 'password123', 'Test');

    expect(result.user.email).toBe('test@example.com');
    expect(result.tokens.accessToken).toBe('jwt-access');
    expect(tokenRefreshCallback).toHaveBeenCalledWith({
      accessToken: 'jwt-access',
      refreshToken: 'jwt-refresh',
    });
  });

  it('should login', async () => {
    mockFetch({
      user: { id: 'user-1', email: 'test@example.com', role: 'admin' },
      tokens: { accessToken: 'jwt-new', refreshToken: 'jwt-refresh-new' },
    });

    const result = await client.auth.login('test@example.com', 'password123');

    expect(result.user.id).toBe('user-1');
    expect(tokenRefreshCallback).toHaveBeenCalledWith({
      accessToken: 'jwt-new',
      refreshToken: 'jwt-refresh-new',
    });
  });

  it('should refresh tokens', async () => {
    mockFetch({
      tokens: { accessToken: 'jwt-refreshed', refreshToken: 'jwt-refresh-new' },
    });

    const result = await client.auth.refresh('old-refresh-token');

    expect(result.tokens.accessToken).toBe('jwt-refreshed');
    expect(tokenRefreshCallback).toHaveBeenCalled();
  });

  it('should request forgot password', async () => {
    mockFetch({ message: 'If an account exists with this email, a password reset link has been sent' });

    const result = await client.auth.forgotPassword('test@example.com');
    expect(result.message).toBeDefined();
  });

  it('should reset password', async () => {
    mockFetch({ message: 'Password has been reset successfully' });

    const result = await client.auth.resetPassword('reset-token', 'newpassword');
    expect(result.message).toContain('reset');
  });

  it('should change password', async () => {
    mockFetch({ message: 'Password changed successfully' });

    const result = await client.auth.changePassword('old', 'new');
    expect(result.message).toContain('changed');
  });

  it('should get current user', async () => {
    mockFetch({ user: { id: 'user-1', email: 'test@example.com' } });

    const result = await client.auth.me();
    expect(result.user.email).toBe('test@example.com');
  });

  it('should logout', async () => {
    mockFetch({ message: 'Logged out successfully' });

    const result = await client.auth.logout();
    expect(result.message).toContain('Logged out');
  });

  it('should verify a token', async () => {
    mockFetch({
      valid: true,
      payload: { sub: 'user-1', email: 'test@example.com', role: 'admin' },
    });

    const result = await client.auth.verify('some-jwt-token');
    expect(result.valid).toBe(true);
    expect(result.payload?.sub).toBe('user-1');
  });

  it('should handle invalid token verification', async () => {
    mockFetch({ valid: false, error: 'Invalid token', code: 'INVALID_TOKEN' });

    const result = await client.auth.verify('bad-token');
    expect(result.valid).toBe(false);
  });
});

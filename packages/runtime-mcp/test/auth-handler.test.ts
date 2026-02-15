import { describe, it, expect, beforeEach } from 'vitest';
import pino from 'pino';
import jwt from 'jsonwebtoken';
import { McpAuthHandler } from '../src/auth/auth-handler.js';
import { McpAuthError, type McpAuthConfig } from '../src/auth/types.js';

describe('McpAuthHandler', () => {
  const logger = pino({ level: 'silent' });
  const jwtSecret = 'test-secret-key-for-testing';

  describe('JWT Authentication', () => {
    let authHandler: McpAuthHandler;

    beforeEach(() => {
      const config: McpAuthConfig = {
        enabled: true,
        jwt: {
          secret: jwtSecret,
          algorithm: 'HS256',
          issuer: 'test-issuer',
          audience: 'test-audience',
        },
      };
      authHandler = new McpAuthHandler(config, logger);
    });

    it('should authenticate valid JWT token', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['developer'],
        },
        jwtSecret,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '1h',
        }
      );

      const context = await authHandler.authenticate(token);

      expect(context.type).toBe('jwt');
      expect(context.userId).toBe('user-123');
      expect(context.roles).toContain('developer');
      expect(context.jwtPayload).toBeDefined();
    });

    it('should reject expired JWT token', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          email: 'test@example.com',
          name: 'Test User',
          roles: ['developer'],
        },
        jwtSecret,
        {
          issuer: 'test-issuer',
          audience: 'test-audience',
          expiresIn: '-1h', // Already expired
        }
      );

      await expect(authHandler.authenticate(token)).rejects.toThrow(McpAuthError);
      await expect(authHandler.authenticate(token)).rejects.toMatchObject({
        code: 'TOKEN_EXPIRED',
      });
    });

    it('should reject invalid JWT token', async () => {
      const token = 'invalid.jwt.token';

      await expect(authHandler.authenticate(token)).rejects.toThrow(McpAuthError);
      await expect(authHandler.authenticate(token)).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      });
    });

    it('should reject JWT with wrong issuer', async () => {
      const token = jwt.sign(
        { sub: 'user-123', email: 'test@example.com', name: 'Test', roles: [] },
        jwtSecret,
        { issuer: 'wrong-issuer', audience: 'test-audience' }
      );

      await expect(authHandler.authenticate(token)).rejects.toThrow(McpAuthError);
    });

    it('should reject refresh tokens', async () => {
      const token = jwt.sign(
        {
          sub: 'user-123',
          email: 'test@example.com',
          name: 'Test',
          roles: [],
          type: 'refresh',
        },
        jwtSecret,
        { issuer: 'test-issuer', audience: 'test-audience' }
      );

      await expect(authHandler.authenticate(token)).rejects.toThrow(McpAuthError);
      await expect(authHandler.authenticate(token)).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      });
    });

    it('should map admin role to wildcard permissions', async () => {
      const token = jwt.sign(
        { sub: 'admin-1', email: 'admin@example.com', name: 'Admin', roles: ['admin'] },
        jwtSecret,
        { issuer: 'test-issuer', audience: 'test-audience' }
      );

      const context = await authHandler.authenticate(token);

      expect(context.permissions).toContain('*');
    });

    it('should map developer role to limited permissions', async () => {
      const token = jwt.sign(
        { sub: 'dev-1', email: 'dev@example.com', name: 'Dev', roles: ['developer'] },
        jwtSecret,
        { issuer: 'test-issuer', audience: 'test-audience' }
      );

      const context = await authHandler.authenticate(token);

      expect(context.permissions).toContain('agents:spawn');
      expect(context.permissions).toContain('agents:list');
      expect(context.permissions).not.toContain('*');
    });
  });

  describe('API Key Authentication', () => {
    let authHandler: McpAuthHandler;
    const testApiKey = 'plx_test_api_key_12345';

    beforeEach(() => {
      const config: McpAuthConfig = {
        enabled: true,
        apiKeys: new Map([
          [testApiKey, {
            name: 'test-key',
            permissions: ['agents:spawn', 'agents:list'],
          }],
        ]),
      };
      authHandler = new McpAuthHandler(config, logger);
    });

    it('should authenticate valid API key', async () => {
      const context = await authHandler.authenticate(testApiKey);

      expect(context.type).toBe('apiKey');
      expect(context.userId).toBe('test-key');
      expect(context.permissions).toContain('agents:spawn');
      expect(context.permissions).toContain('agents:list');
    });

    it('should reject invalid API key', async () => {
      await expect(authHandler.authenticate('plx_invalid_key')).rejects.toThrow(McpAuthError);
      await expect(authHandler.authenticate('plx_invalid_key')).rejects.toMatchObject({
        code: 'INVALID_TOKEN',
      });
    });

    it('should reject expired API key', async () => {
      const expiredConfig: McpAuthConfig = {
        enabled: true,
        apiKeys: new Map([
          ['plx_expired_key', {
            name: 'expired-key',
            permissions: ['*'],
            expiresAt: new Date(Date.now() - 86400000), // Expired yesterday
          }],
        ]),
      };
      const handler = new McpAuthHandler(expiredConfig, logger);

      await expect(handler.authenticate('plx_expired_key')).rejects.toThrow(McpAuthError);
      await expect(handler.authenticate('plx_expired_key')).rejects.toMatchObject({
        code: 'API_KEY_EXPIRED',
      });
    });
  });

  describe('Permission Checking', () => {
    let authHandler: McpAuthHandler;

    beforeEach(() => {
      const config: McpAuthConfig = {
        enabled: true,
        apiKeys: new Map([
          ['plx_limited', { name: 'limited', permissions: ['agents:list', 'agents:get'] }],
          ['plx_wildcard', { name: 'wildcard', permissions: ['agents:*'] }],
          ['plx_admin', { name: 'admin', permissions: ['*'] }],
        ]),
      };
      authHandler = new McpAuthHandler(config, logger);
    });

    it('should allow specific permission', async () => {
      const context = await authHandler.authenticate('plx_limited');

      expect(authHandler.hasPermission(context, 'agents:list')).toBe(true);
      expect(authHandler.hasPermission(context, 'agents:get')).toBe(true);
    });

    it('should deny non-granted permission', async () => {
      const context = await authHandler.authenticate('plx_limited');

      expect(authHandler.hasPermission(context, 'agents:spawn')).toBe(false);
      expect(authHandler.hasPermission(context, 'health:check')).toBe(false);
    });

    it('should allow wildcard resource permission', async () => {
      const context = await authHandler.authenticate('plx_wildcard');

      expect(authHandler.hasPermission(context, 'agents:spawn')).toBe(true);
      expect(authHandler.hasPermission(context, 'agents:stop')).toBe(true);
      expect(authHandler.hasPermission(context, 'health:check')).toBe(false);
    });

    it('should allow global wildcard permission', async () => {
      const context = await authHandler.authenticate('plx_admin');

      expect(authHandler.hasPermission(context, 'agents:spawn')).toBe(true);
      expect(authHandler.hasPermission(context, 'health:check')).toBe(true);
      expect(authHandler.hasPermission(context, 'anything:else')).toBe(true);
    });
  });

  describe('Token Extraction', () => {
    let authHandler: McpAuthHandler;

    beforeEach(() => {
      authHandler = new McpAuthHandler({ enabled: true }, logger);
    });

    it('should extract Bearer token', () => {
      const token = authHandler.extractToken('Bearer my-jwt-token');
      expect(token).toBe('my-jwt-token');
    });

    it('should extract ApiKey token', () => {
      const token = authHandler.extractToken('ApiKey plx_my_api_key');
      expect(token).toBe('plx_my_api_key');
    });

    it('should extract direct plx_ key', () => {
      const token = authHandler.extractToken('plx_direct_key');
      expect(token).toBe('plx_direct_key');
    });

    it('should return null for missing header', () => {
      const token = authHandler.extractToken(undefined);
      expect(token).toBeNull();
    });

    it('should return null for unsupported format', () => {
      const token = authHandler.extractToken('Basic dXNlcjpwYXNz');
      expect(token).toBeNull();
    });
  });

  describe('Auth Disabled', () => {
    it('should return permissive context when auth is disabled', async () => {
      const authHandler = new McpAuthHandler({ enabled: false }, logger);

      const context = await authHandler.authenticate('any-token');

      expect(context.type).toBe('custom');
      expect(context.permissions).toContain('*');
    });
  });

  describe('Custom Validator', () => {
    it('should use custom validator when provided', async () => {
      const config: McpAuthConfig = {
        enabled: true,
        customValidator: async (token: string) => {
          if (token === 'custom-valid-token') {
            return {
              type: 'custom',
              userId: 'custom-user',
              permissions: ['custom:permission'],
            };
          }
          return null;
        },
      };
      const authHandler = new McpAuthHandler(config, logger);

      const context = await authHandler.authenticate('custom-valid-token');

      expect(context.type).toBe('custom');
      expect(context.userId).toBe('custom-user');
      expect(context.permissions).toContain('custom:permission');
    });

    it('should reject when custom validator returns null', async () => {
      const config: McpAuthConfig = {
        enabled: true,
        customValidator: async () => null,
      };
      const authHandler = new McpAuthHandler(config, logger);

      await expect(authHandler.authenticate('invalid')).rejects.toThrow(McpAuthError);
    });
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { JWTService } from './jwt-service';
import { AuthConfig, User } from '../types';
import pino from 'pino';

const logger = pino({ level: 'silent' });

const jwtConfig: AuthConfig['jwt'] = {
  secret: 'test-secret-key-at-least-32-chars-long',
  algorithm: 'HS256',
  expiresIn: '1h',
  refreshExpiresIn: '7d',
  issuer: 'parallax-test',
  audience: 'parallax-api',
};

const testUser: User = {
  id: 'user-1',
  email: 'test@parallax.dev',
  name: 'Test User',
  roles: ['developer'],
  tenantId: 'tenant-1',
  createdAt: new Date(),
  updatedAt: new Date(),
};

describe('JWTService', () => {
  let service: JWTService;

  beforeEach(() => {
    service = new JWTService(jwtConfig, logger);
  });

  describe('generateTokens', () => {
    it('should generate access and refresh tokens', async () => {
      const tokens = await service.generateTokens(testUser);
      expect(tokens.accessToken).toBeDefined();
      expect(tokens.refreshToken).toBeDefined();
      expect(tokens.tokenType).toBe('Bearer');
      expect(tokens.expiresIn).toBe(3600); // 1h = 3600s
    });

    it('should generate valid JWT strings', async () => {
      const tokens = await service.generateTokens(testUser);
      // JWTs have 3 parts separated by dots
      expect(tokens.accessToken.split('.')).toHaveLength(3);
      expect(tokens.refreshToken!.split('.')).toHaveLength(3);
    });
  });

  describe('verifyToken', () => {
    it('should verify and decode a valid token', async () => {
      const tokens = await service.generateTokens(testUser);
      const decoded = await service.verifyToken(tokens.accessToken);

      expect(decoded.sub).toBe('user-1');
      expect(decoded.email).toBe('test@parallax.dev');
      expect(decoded.name).toBe('Test User');
      expect(decoded.roles).toEqual(['developer']);
      expect(decoded.tenantId).toBe('tenant-1');
    });

    it('should reject an invalid token', async () => {
      await expect(service.verifyToken('invalid.token.here')).rejects.toThrow();
    });

    it('should reject a token signed with wrong secret', async () => {
      const otherService = new JWTService(
        { ...jwtConfig, secret: 'different-secret-key-at-least-32-chars' },
        logger
      );
      const tokens = await otherService.generateTokens(testUser);
      await expect(service.verifyToken(tokens.accessToken)).rejects.toThrow();
    });
  });

  describe('refreshAccessToken', () => {
    it('should generate new tokens from a valid refresh token', async () => {
      const tokens = await service.generateTokens(testUser);
      const newTokens = await service.refreshAccessToken(tokens.refreshToken!);

      expect(newTokens.accessToken).toBeDefined();
      expect(newTokens.refreshToken).toBeDefined();
      expect(newTokens.accessToken).not.toBe(tokens.accessToken);
    });

    it('should reject an access token used as refresh', async () => {
      const tokens = await service.generateTokens(testUser);
      // Access tokens don't have type: 'refresh'
      await expect(service.refreshAccessToken(tokens.accessToken)).rejects.toThrow(
        'Invalid refresh token'
      );
    });
  });
});

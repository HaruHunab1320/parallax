/**
 * MCP Auth Handler
 *
 * Validates tokens and API keys for MCP server authentication.
 */

import * as jwt from 'jsonwebtoken';
import { createHash, timingSafeEqual } from 'crypto';
import type { Logger } from 'pino';
import type { JWTPayload } from '@parallax/auth';
import {
  type McpAuthConfig,
  type AuthContext,
  McpAuthError,
} from './types.js';

export class McpAuthHandler {
  private config: McpAuthConfig;
  private logger: Logger;

  constructor(config: McpAuthConfig, logger: Logger) {
    this.config = config;
    this.logger = logger.child({ component: 'mcp-auth' });
  }

  /**
   * Validate a token and return auth context
   */
  async authenticate(token: string): Promise<AuthContext> {
    if (!this.config.enabled) {
      // Auth disabled, return anonymous context
      return { type: 'custom', permissions: ['*'] };
    }

    if (!token) {
      throw new McpAuthError('No credentials provided', 'NO_CREDENTIALS');
    }

    // Try API key first (faster, no crypto)
    if (this.config.apiKeys && this.isApiKey(token)) {
      return this.validateApiKey(token);
    }

    // Try JWT token
    if (this.config.jwt) {
      return this.validateJwt(token);
    }

    // Try custom validator
    if (this.config.customValidator) {
      const context = await this.config.customValidator(token);
      if (context) {
        return context;
      }
    }

    throw new McpAuthError('Invalid token', 'INVALID_TOKEN');
  }

  /**
   * Extract token from Authorization header
   */
  extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) {
      return null;
    }

    // Bearer token
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // API key formats
    if (authHeader.startsWith('ApiKey ')) {
      return authHeader.slice(7);
    }

    // Direct API key (starts with plx_)
    if (authHeader.startsWith('plx_')) {
      return authHeader;
    }

    return null;
  }

  /**
   * Check if user has required permission
   */
  hasPermission(context: AuthContext, permission: string): boolean {
    // Wildcard permission
    if (context.permissions?.includes('*')) {
      return true;
    }

    // Check specific permission
    if (context.permissions?.includes(permission)) {
      return true;
    }

    // Check wildcard for resource (e.g., "agents:*" matches "agents:spawn")
    const [resource] = permission.split(':');
    if (context.permissions?.includes(`${resource}:*`)) {
      return true;
    }

    return false;
  }

  /**
   * Check if token looks like an API key
   */
  private isApiKey(token: string): boolean {
    return token.startsWith('plx_');
  }

  /**
   * Validate API key
   */
  private validateApiKey(apiKey: string): AuthContext {
    if (!this.config.apiKeys) {
      throw new McpAuthError('API key authentication not configured', 'INVALID_TOKEN');
    }

    // Hash the incoming key for comparison
    const keyHash = this.hashApiKey(apiKey);

    // Look up by hash
    const keyConfig = this.config.apiKeys.get(keyHash);
    if (!keyConfig) {
      // Also try direct lookup (for pre-hashed storage)
      const directConfig = this.config.apiKeys.get(apiKey);
      if (!directConfig) {
        this.logger.warn({ keyPrefix: apiKey.slice(0, 8) }, 'Invalid API key');
        throw new McpAuthError('Invalid API key', 'INVALID_TOKEN');
      }
    }

    const config = keyConfig || this.config.apiKeys.get(apiKey)!;

    // Check expiration
    if (config.expiresAt && config.expiresAt < new Date()) {
      this.logger.warn({ keyName: config.name }, 'API key expired');
      throw new McpAuthError('API key expired', 'API_KEY_EXPIRED');
    }

    this.logger.debug({ keyName: config.name }, 'API key authenticated');

    return {
      type: 'apiKey',
      userId: config.name,
      permissions: config.permissions || ['*'],
      apiKey: config,
    };
  }

  /**
   * Validate JWT token
   */
  private async validateJwt(token: string): Promise<AuthContext> {
    if (!this.config.jwt) {
      throw new McpAuthError('JWT authentication not configured', 'INVALID_TOKEN');
    }

    try {
      const secret = this.config.jwt.algorithm === 'RS256'
        ? this.config.jwt.publicKey!
        : this.config.jwt.secret;

      const options: jwt.VerifyOptions = {
        algorithms: [this.config.jwt.algorithm || 'HS256'],
      };

      if (this.config.jwt.issuer) {
        options.issuer = this.config.jwt.issuer;
      }

      if (this.config.jwt.audience) {
        options.audience = this.config.jwt.audience;
      }

      const payload = jwt.verify(token, secret, options) as JWTPayload;

      // Reject refresh tokens
      if (payload.type === 'refresh') {
        throw new McpAuthError('Refresh tokens not allowed', 'INVALID_TOKEN');
      }

      this.logger.debug({ userId: payload.sub }, 'JWT authenticated');

      return {
        type: 'jwt',
        userId: payload.sub,
        roles: payload.roles,
        permissions: this.rolesToPermissions(payload.roles),
        jwtPayload: payload,
      };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new McpAuthError('Token expired', 'TOKEN_EXPIRED');
      }
      if (error instanceof McpAuthError) {
        throw error;
      }
      this.logger.warn({ error }, 'JWT verification failed');
      throw new McpAuthError('Invalid token', 'INVALID_TOKEN');
    }
  }

  /**
   * Hash an API key for secure comparison
   */
  private hashApiKey(key: string): string {
    return createHash('sha256').update(key).digest('hex');
  }

  /**
   * Convert roles to permissions
   * Override this method to customize role-permission mapping
   */
  private rolesToPermissions(roles: string[]): string[] {
    const permissions: string[] = [];

    for (const role of roles) {
      switch (role.toLowerCase()) {
        case 'admin':
          permissions.push('*');
          break;
        case 'operator':
          permissions.push('agents:*', 'executions:*');
          break;
        case 'developer':
          permissions.push('agents:spawn', 'agents:list', 'agents:get', 'agents:send');
          break;
        case 'viewer':
          permissions.push('agents:list', 'agents:get', 'health:check');
          break;
        default:
          // Unknown role gets no permissions
          break;
      }
    }

    return [...new Set(permissions)];
  }
}

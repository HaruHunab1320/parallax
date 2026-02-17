/**
 * Authentication Handler for MCP Server
 *
 * Supports API key and JWT authentication.
 */

import jwt from 'jsonwebtoken';
import type { Logger } from 'pino';

export type AuthErrorCode =
  | 'NO_CREDENTIALS'
  | 'INVALID_CREDENTIALS'
  | 'EXPIRED_TOKEN'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'UNKNOWN_ERROR';

export class McpAuthError extends Error {
  constructor(
    message: string,
    public readonly code: AuthErrorCode
  ) {
    super(message);
    this.name = 'McpAuthError';
  }
}

export interface ApiKeyConfig {
  key: string;
  permissions: string[];
  name?: string;
}

export interface McpAuthConfig {
  apiKeys?: ApiKeyConfig[];
  jwtSecret?: string;
  jwtIssuer?: string;
}

export interface AuthContext {
  type: 'api_key' | 'jwt' | 'custom';
  userId?: string;
  keyName?: string;
  permissions: string[];
}

export class McpAuthHandler {
  private apiKeys: Map<string, ApiKeyConfig> = new Map();
  private jwtSecret?: string;
  private jwtIssuer?: string;
  private logger: Logger;

  constructor(config: McpAuthConfig, logger: Logger) {
    this.logger = logger;

    // Index API keys
    if (config.apiKeys) {
      for (const keyConfig of config.apiKeys) {
        this.apiKeys.set(keyConfig.key, keyConfig);
      }
    }

    this.jwtSecret = config.jwtSecret;
    this.jwtIssuer = config.jwtIssuer;
  }

  /**
   * Extract token from Authorization header
   */
  extractToken(authHeader: string | undefined): string | null {
    if (!authHeader) return null;

    // Bearer token
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // API key
    if (authHeader.startsWith('ApiKey ')) {
      return authHeader.slice(7);
    }

    // Raw token
    return authHeader;
  }

  /**
   * Authenticate a token
   */
  async authenticate(token: string): Promise<AuthContext> {
    // Try API key first
    const apiKeyConfig = this.apiKeys.get(token);
    if (apiKeyConfig) {
      return {
        type: 'api_key',
        keyName: apiKeyConfig.name,
        permissions: apiKeyConfig.permissions,
      };
    }

    // Try JWT
    if (this.jwtSecret) {
      try {
        const payload = jwt.verify(token, this.jwtSecret, {
          issuer: this.jwtIssuer,
        }) as jwt.JwtPayload;

        return {
          type: 'jwt',
          userId: payload.sub,
          permissions: (payload.permissions as string[]) || ['*'],
        };
      } catch (error) {
        if (error instanceof jwt.TokenExpiredError) {
          throw new McpAuthError('Token expired', 'EXPIRED_TOKEN');
        }
        // Fall through to invalid credentials
      }
    }

    throw new McpAuthError('Invalid credentials', 'INVALID_CREDENTIALS');
  }

  /**
   * Check if context has a specific permission
   */
  hasPermission(context: AuthContext, permission: string): boolean {
    // Wildcard grants all permissions
    if (context.permissions.includes('*')) {
      return true;
    }

    // Check exact match
    if (context.permissions.includes(permission)) {
      return true;
    }

    // Check prefix match (e.g., 'agents:*' matches 'agents:spawn')
    const permissionParts = permission.split(':');
    for (const p of context.permissions) {
      if (p.endsWith(':*')) {
        const prefix = p.slice(0, -2);
        if (permission.startsWith(prefix + ':')) {
          return true;
        }
      }
    }

    return false;
  }
}

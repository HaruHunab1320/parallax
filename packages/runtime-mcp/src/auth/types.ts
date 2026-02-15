/**
 * MCP Auth Types
 */

import type { JWTPayload } from '@parallax/auth';

/**
 * Auth configuration for MCP server
 */
export interface McpAuthConfig {
  /**
   * Enable authentication (default: false for stdio, true for HTTP)
   */
  enabled: boolean;

  /**
   * JWT configuration (for token-based auth)
   */
  jwt?: {
    secret: string;
    algorithm?: 'HS256' | 'RS256';
    publicKey?: string;
    issuer?: string;
    audience?: string;
  };

  /**
   * Static API keys (for simple auth)
   * Map of key -> permissions/metadata
   */
  apiKeys?: Map<string, ApiKeyConfig>;

  /**
   * Custom token validator function
   * Use this to integrate with external auth systems
   */
  customValidator?: (token: string) => Promise<AuthContext | null>;
}

/**
 * API key configuration
 */
export interface ApiKeyConfig {
  /**
   * Human-readable name for the key
   */
  name: string;

  /**
   * Permissions granted to this key
   * If empty, all operations are allowed
   */
  permissions?: string[];

  /**
   * Key expiration (optional)
   */
  expiresAt?: Date;

  /**
   * Additional metadata
   */
  metadata?: Record<string, unknown>;
}

/**
 * Auth context attached to validated requests
 */
export interface AuthContext {
  /**
   * Type of authentication used
   */
  type: 'jwt' | 'apiKey' | 'custom';

  /**
   * User ID (from JWT sub claim or API key name)
   */
  userId?: string;

  /**
   * User roles (from JWT)
   */
  roles?: string[];

  /**
   * Permissions granted
   */
  permissions?: string[];

  /**
   * Full JWT payload (if JWT auth)
   */
  jwtPayload?: JWTPayload;

  /**
   * API key config (if API key auth)
   */
  apiKey?: ApiKeyConfig;

  /**
   * Additional context from custom validator
   */
  extra?: Record<string, unknown>;
}

/**
 * Auth error types
 */
export type AuthErrorCode =
  | 'NO_CREDENTIALS'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'INSUFFICIENT_PERMISSIONS'
  | 'API_KEY_EXPIRED';

export class McpAuthError extends Error {
  constructor(
    message: string,
    public code: AuthErrorCode
  ) {
    super(message);
    this.name = 'McpAuthError';
  }
}

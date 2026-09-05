/**
 * Authentication Middleware
 *
 * Express middleware for JWT authentication and API key validation.
 */

import type { NextFunction, Request, Response } from 'express';
import type { Logger } from 'pino';
import { AuthError, type AuthService, type TokenPayload } from './auth-service';

// Extend Express Request to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload & { permissions?: string[] };
      apiKey?: {
        id: string;
        permissions?: any;
      };
    }
  }
}

export interface AuthMiddlewareOptions {
  optional?: boolean; // If true, continue even if no auth provided
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(
  authService: AuthService,
  logger: Logger,
  options: AuthMiddlewareOptions = {}
) {
  const log = logger.child({ component: 'AuthMiddleware' });

  return async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        if (options.optional) {
          return next();
        }
        throw new AuthError('No authorization header', 'NO_AUTH');
      }

      const identity = await authenticateAuthorization(authService, authHeader);
      req.user = identity.user;
      req.apiKey = identity.apiKey;
      next();
    } catch (error) {
      if (error instanceof AuthError) {
        log.debug({ error: error.message, code: error.code }, 'Auth failed');

        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      log.error({ error }, 'Unexpected auth error');
      res.status(500).json({
        error: 'Authentication error',
        code: 'AUTH_ERROR',
      });
    }
  };
}

/**
 * Middleware to require authentication (not optional)
 */
export function requireAuth(authService: AuthService, logger: Logger) {
  return createAuthMiddleware(authService, logger, { optional: false });
}

/**
 * Middleware for optional authentication
 */
export function optionalAuth(authService: AuthService, logger: Logger) {
  return createAuthMiddleware(authService, logger, { optional: true });
}

/** Shared by HTTP requests and WebSocket upgrades; current user/key state is authoritative. */
export async function authenticateAuthorization(
  authService: AuthService,
  authHeader?: string
) {
  if (!authHeader) throw new AuthError('Authentication required', 'NO_AUTH');
  if (authHeader.startsWith('Bearer ')) {
    return {
      user: await authService.authenticateAccessToken(authHeader.slice(7)),
      apiKey: undefined,
    };
  }
  if (authHeader.startsWith('ApiKey ') || authHeader.startsWith('plx_')) {
    const rawKey = authHeader.startsWith('ApiKey ')
      ? authHeader.slice(7)
      : authHeader;
    const { user, apiKey } = await authService.authenticateApiKey(rawKey);
    return {
      user: {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'access' as const,
      },
      apiKey,
    };
  }
  throw new AuthError('Invalid authorization format', 'INVALID_AUTH');
}

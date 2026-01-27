/**
 * Authentication Middleware
 *
 * Express middleware for JWT authentication and API key validation.
 */

import { Request, Response, NextFunction } from 'express';
import { AuthService, TokenPayload, AuthError } from './auth-service';
import { Logger } from 'pino';

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

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        if (options.optional) {
          return next();
        }
        throw new AuthError('No authorization header', 'NO_AUTH');
      }

      // Check for Bearer token (JWT)
      if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7);
        const payload = authService.verifyAccessToken(token);
        req.user = payload;
        return next();
      }

      // Check for API key
      if (authHeader.startsWith('ApiKey ') || authHeader.startsWith('plx_')) {
        const apiKey = authHeader.startsWith('ApiKey ')
          ? authHeader.slice(7)
          : authHeader;

        const user = await authService.verifyApiKey(apiKey);
        req.user = {
          sub: user.id,
          email: user.email,
          role: user.role,
          type: 'access',
        };

        // Get API key details for permission checking
        const keyHash = require('crypto').createHash('sha256').update(apiKey).digest('hex');
        const keyRecord = await (authService as any).prisma.apiKey.findUnique({
          where: { keyHash },
          select: { id: true, permissions: true },
        });

        if (keyRecord) {
          req.apiKey = {
            id: keyRecord.id,
            permissions: keyRecord.permissions,
          };
        }

        return next();
      }

      throw new AuthError('Invalid authorization format', 'INVALID_AUTH');
    } catch (error) {
      if (error instanceof AuthError) {
        log.debug({ error: error.message, code: error.code }, 'Auth failed');

        if (options.optional) {
          return next();
        }

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

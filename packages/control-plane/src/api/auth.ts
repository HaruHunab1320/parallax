/**
 * Authentication API Router
 *
 * REST API endpoints for user authentication (login, register, refresh, etc.)
 */

import { createHash, timingSafeEqual } from 'node:crypto';
import { type Request, type Response, Router } from 'express';
import type { Logger } from 'pino';
import { z } from 'zod';
import { createAuthMiddleware } from '../auth/auth-middleware';
import { AuthError, type AuthService } from '../auth/auth-service';
import { PasswordServiceBusyError } from '../auth/password';
import type { LicenseEnforcer } from '../licensing/license-enforcer';

export function createAuthRouter(
  authService: AuthService,
  _licenseEnforcer: LicenseEnforcer,
  logger: Logger
): Router {
  const router = Router();
  const log = logger.child({ component: 'AuthAPI' });

  // Basic authentication is available with every license. Limit public auth
  // attempts before password work; the password module separately bounds memory.
  const attempts = new Map<string, { count: number; resetAt: number }>();
  router.use((req, res, next) => {
    if (req.method !== 'POST') {
      next();
      return;
    }
    const now = Date.now();
    for (const [key, value] of attempts)
      if (value.resetAt <= now) attempts.delete(key);
    const key = req.ip || req.socket.remoteAddress || 'unknown';
    let entry = attempts.get(key);
    if (!entry) {
      if (attempts.size >= 10000) {
        res.status(429).json({ error: 'Too many authentication requests' });
        return;
      }
      entry = { count: 0, resetAt: now + 60000 };
      attempts.set(key, entry);
    }
    if (++entry.count > 30) {
      res.setHeader(
        'Retry-After',
        String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000)))
      );
      res.status(429).json({ error: 'Too many authentication requests' });
      return;
    }
    const shapes: Record<string, z.ZodTypeAny> = {
      '/register': z
        .object({
          email: z.string().email(),
          password: z.string().min(1).max(1024),
          name: z.string().max(200).optional(),
        })
        .strict(),
      '/login': z
        .object({
          email: z.string().email(),
          password: z.string().min(1).max(1024),
        })
        .strict(),
      '/refresh': z
        .object({ refreshToken: z.string().min(1).max(8192) })
        .strict(),
      '/forgot-password': z.object({ email: z.string().email() }).strict(),
      '/reset-password': z
        .object({
          token: z.string().min(1).max(256),
          newPassword: z.string().min(1).max(1024),
        })
        .strict(),
      '/change-password': z
        .object({
          currentPassword: z.string().min(1).max(1024),
          newPassword: z.string().min(1).max(1024),
        })
        .strict(),
      '/verify': z.object({ token: z.string().min(1).max(8192) }).strict(),
    };
    const schema = shapes[req.path.replace(/\/+$/, '').toLowerCase()];
    if (schema) {
      const result = schema.safeParse(req.body);
      if (!result.success) {
        res
          .status(400)
          .json({ error: 'Invalid request', code: 'INVALID_INPUT' });
        return;
      }
      req.body = result.data;
    }
    next();
  });

  /**
   * POST /auth/register
   * Register a new user account
   */
  router.post('/register', async (req: Request, res: Response) => {
    try {
      // In production, bootstrap requires an operator-provided one-time setup secret.
      const bootstrapToken = process.env.PARALLAX_BOOTSTRAP_TOKEN;
      if (process.env.NODE_ENV === 'production' || bootstrapToken) {
        const supplied = req.header('x-parallax-bootstrap-token') || '';
        const digest = (value: string) =>
          createHash('sha256').update(value).digest();
        if (
          !bootstrapToken ||
          bootstrapToken.length < 32 ||
          !timingSafeEqual(digest(bootstrapToken), digest(supplied))
        ) {
          res.status(403).json({
            error: 'Valid bootstrap token required',
            code: 'FORBIDDEN',
          });
          return;
        }
      }

      const { email, password, name } = req.body;

      if (!email || !password) {
        res.status(400).json({
          error: 'Email and password are required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const result = await authService.register(email, password, name);

      log.info({ userId: result.user.id, email }, 'User registered');

      res.status(201).json({
        user: result.user,
        tokens: result.tokens,
      });
    } catch (error) {
      if (
        error instanceof AuthError ||
        error instanceof PasswordServiceBusyError
      ) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      log.error({ error }, 'Registration failed');
      res.status(500).json({
        error: 'Registration failed',
        code: 'REGISTRATION_ERROR',
      });
    }
  });

  /**
   * POST /auth/login
   * Login with email and password
   */
  router.post('/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        res.status(400).json({
          error: 'Email and password are required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const result = await authService.login(email, password);

      log.info({ userId: result.user.id, email }, 'User logged in');

      res.json({
        user: result.user,
        tokens: result.tokens,
      });
    } catch (error) {
      if (
        error instanceof AuthError ||
        error instanceof PasswordServiceBusyError
      ) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      log.error({ error }, 'Login failed');
      res.status(500).json({
        error: 'Login failed',
        code: 'LOGIN_ERROR',
      });
    }
  });

  /**
   * POST /auth/refresh
   * Refresh access token using refresh token
   */
  router.post('/refresh', async (req: Request, res: Response) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        res.status(400).json({
          error: 'Refresh token is required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const tokens = await authService.refreshTokens(refreshToken);

      log.debug('Tokens refreshed');

      res.json({ tokens });
    } catch (error) {
      if (
        error instanceof AuthError ||
        error instanceof PasswordServiceBusyError
      ) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      log.error({ error }, 'Token refresh failed');
      res.status(500).json({
        error: 'Token refresh failed',
        code: 'REFRESH_ERROR',
      });
    }
  });

  /**
   * POST /auth/forgot-password
   * Request a password reset token
   */
  router.post('/forgot-password', (_req: Request, res: Response) => {
    // There is no email transport wired here yet. Do not expose reset tokens
    // over an unauthenticated API, including NODE_ENV=development.
    res.status(503).json({
      error:
        'Password reset delivery is not configured. Contact your administrator.',
      code: 'PASSWORD_RESET_NOT_CONFIGURED',
    });
  });

  /**
   * POST /auth/reset-password
   * Reset password using reset token
   */
  router.post('/reset-password', async (req: Request, res: Response) => {
    try {
      const { token, newPassword } = req.body;

      if (!token || !newPassword) {
        res.status(400).json({
          error: 'Token and new password are required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      await authService.resetPassword(token, newPassword);

      log.info('Password reset completed');

      res.json({
        message: 'Password has been reset successfully',
      });
    } catch (error) {
      if (
        error instanceof AuthError ||
        error instanceof PasswordServiceBusyError
      ) {
        res.status(error.statusCode).json({
          error: error.message,
          code: error.code,
        });
        return;
      }

      log.error({ error }, 'Password reset failed');
      res.status(500).json({
        error: 'Password reset failed',
        code: 'PASSWORD_RESET_ERROR',
      });
    }
  });

  /**
   * POST /auth/change-password
   * Change password for authenticated user
   * Requires authentication
   */
  router.post(
    '/change-password',
    createAuthMiddleware(authService, logger),
    async (req: Request, res: Response) => {
      try {
        if (req.apiKey) {
          res.status(403).json({ error: 'Account session required' });
          return;
        }
        const { currentPassword, newPassword } = req.body;
        const userId = (req as any).user?.sub;

        if (!userId) {
          res.status(401).json({
            error: 'Not authenticated',
            code: 'NO_AUTH',
          });
          return;
        }

        if (!currentPassword || !newPassword) {
          res.status(400).json({
            error: 'Current password and new password are required',
            code: 'INVALID_INPUT',
          });
          return;
        }

        await authService.changePassword(userId, currentPassword, newPassword);

        log.info({ userId }, 'Password changed');

        res.json({
          message: 'Password changed successfully',
        });
      } catch (error) {
        if (
          error instanceof AuthError ||
          error instanceof PasswordServiceBusyError
        ) {
          res.status(error.statusCode).json({
            error: error.message,
            code: error.code,
          });
          return;
        }

        log.error({ error }, 'Password change failed');
        res.status(500).json({
          error: 'Password change failed',
          code: 'PASSWORD_CHANGE_ERROR',
        });
      }
    }
  );

  /**
   * GET /auth/me
   * Get current authenticated user
   * Requires authentication
   */
  router.get(
    '/me',
    createAuthMiddleware(authService, logger),
    async (req: Request, res: Response) => {
      try {
        const userId = (req as any).user?.sub;

        if (!userId) {
          res.status(401).json({
            error: 'Not authenticated',
            code: 'NO_AUTH',
          });
          return;
        }

        if (req.apiKey) {
          res.status(403).json({ error: 'Account session required' });
          return;
        }
        const user = await authService.getUserById(userId);

        if (!user) {
          res.status(404).json({
            error: 'User not found',
            code: 'USER_NOT_FOUND',
          });
          return;
        }

        res.json({ user });
      } catch (error) {
        log.error({ error }, 'Failed to get current user');
        res.status(500).json({
          error: 'Failed to get user',
          code: 'USER_ERROR',
        });
      }
    }
  );

  /**
   * POST /auth/logout
   * Logout (client-side token invalidation)
   *
   * Note: With JWT, logout is typically handled client-side by discarding tokens.
   * This endpoint exists for consistency and could be extended to:
   * - Add tokens to a blocklist (if using Redis)
   * - Log the logout event for audit purposes
   */
  router.post('/logout', async (_req: Request, res: Response) => {
    // In a stateless JWT system, we just acknowledge the logout
    // The client should discard their tokens
    log.debug('Logout acknowledged');

    res.json({
      message: 'Logged out successfully',
    });
  });

  /**
   * POST /auth/verify
   * Verify a token is valid (for external services)
   */
  router.post('/verify', async (req: Request, res: Response) => {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          error: 'Token is required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const payload = await authService.authenticateAccessToken(token);

      res.json({
        valid: true,
        payload: {
          sub: payload.sub,
          email: payload.email,
          role: payload.role,
        },
      });
    } catch (error) {
      if (
        error instanceof AuthError ||
        error instanceof PasswordServiceBusyError
      ) {
        res.json({
          valid: false,
          error: error.message,
          code: error.code,
        });
        return;
      }

      res.json({
        valid: false,
        error: 'Invalid token',
        code: 'INVALID_TOKEN',
      });
    }
  });

  return router;
}

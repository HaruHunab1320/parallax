/**
 * Authentication API Router
 *
 * REST API endpoints for user authentication (login, register, refresh, etc.)
 */

import { Router } from 'express';
import { Logger } from 'pino';
import { AuthService, AuthError } from '../auth/auth-service';
import { createAuthMiddleware } from '../auth/auth-middleware';
import { LicenseEnforcer } from '../licensing/license-enforcer';

export function createAuthRouter(
  authService: AuthService,
  licenseEnforcer: LicenseEnforcer,
  logger: Logger
): Router {
  const router = Router();
  const log = logger.child({ component: 'AuthAPI' });

  // Middleware to check if multi_user feature is enabled
  const requireMultiUser = (_req: any, res: any, next: any) => {
    try {
      licenseEnforcer.requireFeature('multi_user', 'Multi-User Authentication');
      next();
    } catch (error: any) {
      log.warn('Multi-user feature not available');
      res.status(403).json({
        error: error.message,
        code: 'FEATURE_NOT_AVAILABLE',
        upgradeUrl: error.upgradeUrl || 'https://parallax.ai/enterprise',
      });
    }
  };

  // Apply license check to all routes
  router.use(requireMultiUser);

  /**
   * POST /auth/register
   * Register a new user account
   */
  router.post('/register', async (req: any, res: any) => {
    try {
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
      if (error instanceof AuthError) {
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
  router.post('/login', async (req: any, res: any) => {
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
      if (error instanceof AuthError) {
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
  router.post('/refresh', async (req: any, res: any) => {
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
      if (error instanceof AuthError) {
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
  router.post('/forgot-password', async (req: any, res: any) => {
    try {
      const { email } = req.body;

      if (!email) {
        res.status(400).json({
          error: 'Email is required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const token = await authService.generatePasswordResetToken(email);

      // In production, you would send this token via email
      // For security, always return success even if email doesn't exist
      log.info({ email }, 'Password reset requested');

      // In development, return the token for testing
      if (process.env.NODE_ENV === 'development' && token) {
        res.json({
          message: 'Password reset email sent',
          // Only in development:
          _devToken: token,
        });
        return;
      }

      res.json({
        message: 'If an account exists with this email, a password reset link has been sent',
      });
    } catch (error) {
      log.error({ error }, 'Password reset request failed');
      res.status(500).json({
        error: 'Failed to process password reset request',
        code: 'PASSWORD_RESET_ERROR',
      });
    }
  });

  /**
   * POST /auth/reset-password
   * Reset password using reset token
   */
  router.post('/reset-password', async (req: any, res: any) => {
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
      if (error instanceof AuthError) {
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
    async (req: any, res: any) => {
      try {
        const { currentPassword, newPassword } = req.body;
        const userId = req.user?.sub;

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
        if (error instanceof AuthError) {
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
    async (req: any, res: any) => {
      try {
        const userId = req.user?.sub;

        if (!userId) {
          res.status(401).json({
            error: 'Not authenticated',
            code: 'NO_AUTH',
          });
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
  router.post('/logout', async (req: any, res: any) => {
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
  router.post('/verify', async (req: any, res: any) => {
    try {
      const { token } = req.body;

      if (!token) {
        res.status(400).json({
          error: 'Token is required',
          code: 'INVALID_INPUT',
        });
        return;
      }

      const payload = authService.verifyAccessToken(token);

      res.json({
        valid: true,
        payload: {
          sub: payload.sub,
          email: payload.email,
          role: payload.role,
        },
      });
    } catch (error) {
      if (error instanceof AuthError) {
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

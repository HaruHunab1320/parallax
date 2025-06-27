import { Router, Response } from 'express';
import { Logger } from 'pino';
import { OAuthProvider } from './oauth-provider';
import { JWTService } from '../jwt/jwt-service';
import { OAuthConfig } from '../types';

export interface OAuthMiddlewareOptions {
  providers: {
    [key: string]: OAuthConfig;
  };
  jwtService: JWTService;
  callbackPath?: string;
  successRedirect?: string;
  failureRedirect?: string;
  onUserAuthenticated?: (user: any) => Promise<any>;
}

export class OAuthMiddleware {
  private providers: Map<string, OAuthProvider> = new Map();
  private router: Router;

  constructor(
    private options: OAuthMiddlewareOptions,
    private logger: Logger
  ) {
    this.router = Router();
    this.setupRoutes();
  }

  /**
   * Initialize all OAuth providers
   */
  async initialize(): Promise<void> {
    for (const [name, config] of Object.entries(this.options.providers)) {
      const provider = new OAuthProvider(name, config, this.logger);
      await provider.initialize();
      this.providers.set(name, provider);
    }
  }

  /**
   * Get Express router for OAuth endpoints
   */
  getRouter(): Router {
    return this.router;
  }

  /**
   * Setup OAuth routes
   */
  private setupRoutes(): void {
    // OAuth login route
    this.router.get('/auth/:provider', async (req: any, res: any) => {
      const providerName = req.params.provider;
      const provider = this.providers.get(providerName);

      if (!provider) {
        return res.status(404).json({
          error: 'Provider not found',
          message: `OAuth provider '${providerName}' is not configured`,
        });
      }

      try {
        const authUrl = provider.getAuthorizationUrl({
          state: req.query.state as string,
        });
        res.redirect(authUrl);
      } catch (error) {
        this.logger.error({ error, provider: providerName }, 'Failed to generate auth URL');
        res.status(500).json({
          error: 'OAuth error',
          message: 'Failed to initiate OAuth flow',
        });
      }
    });

    // OAuth callback route
    this.router.get('/auth/:provider/callback', async (req: any, res: any) => {
      const providerName = req.params.provider;
      const provider = this.providers.get(providerName);

      if (!provider) {
        return res.status(404).json({
          error: 'Provider not found',
          message: `OAuth provider '${providerName}' is not configured`,
        });
      }

      const { code, state, error } = req.query;

      if (error) {
        this.logger.warn({ error, provider: providerName }, 'OAuth error');
        return this.handleAuthError(res, error as string);
      }

      if (!code || !state) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'Missing code or state parameter',
        });
      }

      try {
        // Exchange code for tokens
        const tokens = await provider.exchangeCodeForTokens(
          code as string,
          state as string
        );

        // Get user info
        const oauthUser = await provider.getUserInfo(tokens.accessToken);

        // Convert to user object
        const user = await provider.oauthUserToUser(oauthUser);

        // Call custom handler if provided
        if (this.options.onUserAuthenticated) {
          await this.options.onUserAuthenticated(user);
        }

        // Generate JWT tokens
        const authTokens = await this.options.jwtService.generateTokens(user);

        // Success response
        if (this.options.successRedirect) {
          // Redirect with tokens in query params (should use secure method in production)
          const redirectUrl = new URL(this.options.successRedirect);
          redirectUrl.searchParams.set('token', authTokens.accessToken);
          if (authTokens.refreshToken) {
            redirectUrl.searchParams.set('refreshToken', authTokens.refreshToken);
          }
          res.redirect(redirectUrl.toString());
        } else {
          res.json({
            success: true,
            user: {
              id: user.id,
              email: user.email,
              name: user.name,
              roles: user.roles,
            },
            tokens: authTokens,
          });
        }
      } catch (error) {
        this.logger.error({ error, provider: providerName }, 'OAuth callback error');
        this.handleAuthError(res, 'Authentication failed');
      }
    });

    // Token refresh route
    this.router.post('/auth/refresh', async (req: any, res: any) => {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        return res.status(400).json({
          error: 'Bad request',
          message: 'Refresh token required',
        });
      }

      try {
        const tokens = await this.options.jwtService.refreshAccessToken(refreshToken);
        res.json(tokens);
      } catch (error) {
        this.logger.error({ error }, 'Token refresh error');
        res.status(401).json({
          error: 'Invalid token',
          message: 'Failed to refresh token',
        });
      }
    });

    // Logout route
    this.router.post('/auth/logout', async (req, res) => {
      const token = req.headers.authorization?.split(' ')[1];

      if (token) {
        try {
          await this.options.jwtService.revokeToken(token);
        } catch (error) {
          this.logger.error({ error }, 'Failed to revoke token');
        }
      }

      res.json({ success: true, message: 'Logged out successfully' });
    });
  }

  /**
   * Handle authentication errors
   */
  private handleAuthError(res: Response, error: string): void {
    if (this.options.failureRedirect) {
      const redirectUrl = new URL(this.options.failureRedirect);
      redirectUrl.searchParams.set('error', error);
      res.redirect(redirectUrl.toString());
    } else {
      res.status(401).json({
        error: 'Authentication failed',
        message: error,
      });
    }
  }
}
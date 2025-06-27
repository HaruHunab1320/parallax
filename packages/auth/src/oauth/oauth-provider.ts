import { Issuer, Client, generators, TokenSet } from 'openid-client';
import { Logger } from 'pino';
import { OAuthConfig, User } from '../types';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  idToken?: string;
  expiresAt?: Date;
  scope?: string;
}

export interface OAuthUserInfo {
  id: string;
  email: string;
  name: string;
  picture?: string;
  emailVerified?: boolean;
  metadata?: Record<string, any>;
}

export class OAuthProvider {
  private client?: Client;
  private codeVerifier?: string;
  private state?: string;

  constructor(
    private name: string,
    private config: OAuthConfig,
    private logger: Logger
  ) {}

  /**
   * Initialize the OAuth client
   */
  async initialize(): Promise<void> {
    try {
      const issuer = await Issuer.discover(this.config.authorizationUrl);
      
      this.client = new issuer.Client({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uris: [this.config.redirectUri],
        response_types: ['code'],
      });

      this.logger.info({ provider: this.name }, 'OAuth provider initialized');
    } catch (error) {
      this.logger.error({ error, provider: this.name }, 'Failed to initialize OAuth provider');
      throw error;
    }
  }

  /**
   * Get authorization URL for OAuth flow
   */
  getAuthorizationUrl(options: { state?: string; nonce?: string } = {}): string {
    if (!this.client) {
      throw new Error('OAuth client not initialized');
    }

    // Generate PKCE challenge
    this.codeVerifier = generators.codeVerifier();
    const codeChallenge = generators.codeChallenge(this.codeVerifier);

    // Generate state for CSRF protection
    this.state = options.state || generators.state();

    const params: any = {
      scope: this.config.scope.join(' '),
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
      state: this.state,
    };

    if (options.nonce) {
      params.nonce = options.nonce;
    }

    return this.client.authorizationUrl(params);
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCodeForTokens(
    code: string,
    state: string
  ): Promise<OAuthTokens> {
    if (!this.client || !this.codeVerifier) {
      throw new Error('OAuth client not properly initialized');
    }

    // Verify state
    if (state !== this.state) {
      throw new Error('Invalid state parameter');
    }

    try {
      const tokenSet = await this.client.callback(
        this.config.redirectUri,
        { code, state },
        { code_verifier: this.codeVerifier, state: this.state }
      );

      return this.tokenSetToOAuthTokens(tokenSet);
    } catch (error) {
      this.logger.error({ error, provider: this.name }, 'Failed to exchange code for tokens');
      throw error;
    }
  }

  /**
   * Get user information from OAuth provider
   */
  async getUserInfo(accessToken: string): Promise<OAuthUserInfo> {
    if (!this.client) {
      throw new Error('OAuth client not initialized');
    }

    try {
      const userInfo = await this.client.userinfo(accessToken);
      
      return {
        id: userInfo.sub,
        email: userInfo.email as string,
        name: userInfo.name as string || userInfo.email as string,
        picture: userInfo.picture as string,
        emailVerified: userInfo.email_verified as boolean,
        metadata: {
          ...userInfo,
          provider: this.name,
        },
      };
    } catch (error) {
      this.logger.error({ error, provider: this.name }, 'Failed to get user info');
      throw error;
    }
  }

  /**
   * Refresh tokens using refresh token
   */
  async refreshTokens(refreshToken: string): Promise<OAuthTokens> {
    if (!this.client) {
      throw new Error('OAuth client not initialized');
    }

    try {
      const tokenSet = await this.client.refresh(refreshToken);
      return this.tokenSetToOAuthTokens(tokenSet);
    } catch (error) {
      this.logger.error({ error, provider: this.name }, 'Failed to refresh tokens');
      throw error;
    }
  }

  /**
   * Revoke tokens
   */
  async revokeToken(token: string, tokenType: 'access_token' | 'refresh_token' = 'access_token'): Promise<void> {
    if (!this.client) {
      throw new Error('OAuth client not initialized');
    }

    try {
      await this.client.revoke(token, tokenType);
      this.logger.info({ provider: this.name, tokenType }, 'Token revoked');
    } catch (error) {
      this.logger.error({ error, provider: this.name }, 'Failed to revoke token');
      throw error;
    }
  }

  /**
   * Convert user info to User object
   */
  async oauthUserToUser(oauthUser: OAuthUserInfo, tenantId?: string): Promise<User> {
    return {
      id: `${this.name}:${oauthUser.id}`,
      email: oauthUser.email,
      name: oauthUser.name,
      roles: ['user'], // Default role, should be customized
      tenantId,
      metadata: {
        ...oauthUser.metadata,
        picture: oauthUser.picture,
        emailVerified: oauthUser.emailVerified,
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }

  /**
   * Convert TokenSet to OAuthTokens
   */
  private tokenSetToOAuthTokens(tokenSet: TokenSet): OAuthTokens {
    return {
      accessToken: tokenSet.access_token!,
      refreshToken: tokenSet.refresh_token,
      idToken: tokenSet.id_token,
      expiresAt: tokenSet.expires_at ? new Date(tokenSet.expires_at * 1000) : undefined,
      scope: tokenSet.scope,
    };
  }
}
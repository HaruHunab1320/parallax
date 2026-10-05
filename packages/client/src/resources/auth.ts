import type { ParallaxClientConfig } from '../config.js';
import type { HttpClient } from '../http.js';
import type {
  AuthResponse,
  AuthUser,
  PasswordResetResponse,
  TokenRefreshResponse,
  TokenVerifyResponse,
} from '../types/auth.js';

export class AuthResource {
  private config: ParallaxClientConfig;

  constructor(
    private http: HttpClient,
    config: ParallaxClientConfig
  ) {
    this.config = config;
  }

  /** Bootstrap the first administrator; production requires a setup token */
  async register(
    email: string,
    password: string,
    name?: string,
    bootstrapToken?: string
  ): Promise<AuthResponse> {
    const result = await this.http.request<AuthResponse>({
      method: 'POST',
      path: '/api/auth/register',
      body: { email, password, name },
      headers: bootstrapToken
        ? { 'X-Parallax-Bootstrap-Token': bootstrapToken }
        : undefined,
    });

    // Auto-update the HTTP client with the new tokens
    this.http.setAccessToken(result.tokens.accessToken);

    if (this.config.onTokenRefresh) {
      this.config.onTokenRefresh(result.tokens);
    }

    return result;
  }

  /** Login with email and password */
  async login(email: string, password: string): Promise<AuthResponse> {
    const result = await this.http.post<AuthResponse>('/api/auth/login', {
      email,
      password,
    });

    // Auto-update the HTTP client with the new tokens
    this.http.setAccessToken(result.tokens.accessToken);

    if (this.config.onTokenRefresh) {
      this.config.onTokenRefresh(result.tokens);
    }

    return result;
  }

  /** Refresh access token using refresh token */
  async refresh(refreshToken: string): Promise<TokenRefreshResponse> {
    const result = await this.http.post<TokenRefreshResponse>(
      '/api/auth/refresh',
      { refreshToken }
    );

    // Auto-update the HTTP client with the new access token
    this.http.setAccessToken(result.tokens.accessToken);

    if (this.config.onTokenRefresh) {
      this.config.onTokenRefresh(result.tokens);
    }

    return result;
  }

  /** Request a password reset */
  async forgotPassword(email: string): Promise<PasswordResetResponse> {
    return this.http.post<PasswordResetResponse>('/api/auth/forgot-password', {
      email,
    });
  }

  /** Reset password using a reset token */
  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/reset-password', {
      token,
      newPassword,
    });
  }

  /** Change password for authenticated user */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  /** Get the current authenticated user */
  async me(): Promise<{ user: AuthUser }> {
    return this.http.get<{ user: AuthUser }>('/api/auth/me');
  }

  /** Logout */
  async logout(): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/logout');
  }

  /** Verify a token is valid */
  async verify(token: string): Promise<TokenVerifyResponse> {
    return this.http.post<TokenVerifyResponse>('/api/auth/verify', { token });
  }
}

import { HttpClient } from '../http.js';
import {
  AuthResponse,
  TokenRefreshResponse,
  PasswordResetResponse,
  TokenVerifyResponse,
  AuthUser,
} from '../types/auth.js';
import { ParallaxClientConfig } from '../config.js';

export class AuthResource {
  private config: ParallaxClientConfig;

  constructor(
    private http: HttpClient,
    config: ParallaxClientConfig
  ) {
    this.config = config;
  }

  /** Register a new user account (Enterprise) */
  async register(
    email: string,
    password: string,
    name?: string
  ): Promise<AuthResponse> {
    const result = await this.http.post<AuthResponse>('/api/auth/register', {
      email,
      password,
      name,
    });

    // Auto-update the HTTP client with the new tokens
    this.http.setAccessToken(result.tokens.accessToken);

    if (this.config.onTokenRefresh) {
      this.config.onTokenRefresh(result.tokens);
    }

    return result;
  }

  /** Login with email and password (Enterprise) */
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

  /** Refresh access token using refresh token (Enterprise) */
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

  /** Request a password reset (Enterprise) */
  async forgotPassword(email: string): Promise<PasswordResetResponse> {
    return this.http.post<PasswordResetResponse>('/api/auth/forgot-password', {
      email,
    });
  }

  /** Reset password using a reset token (Enterprise) */
  async resetPassword(
    token: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/reset-password', {
      token,
      newPassword,
    });
  }

  /** Change password for authenticated user (Enterprise) */
  async changePassword(
    currentPassword: string,
    newPassword: string
  ): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/change-password', {
      currentPassword,
      newPassword,
    });
  }

  /** Get the current authenticated user (Enterprise) */
  async me(): Promise<{ user: AuthUser }> {
    return this.http.get<{ user: AuthUser }>('/api/auth/me');
  }

  /** Logout (Enterprise) */
  async logout(): Promise<{ message: string }> {
    return this.http.post<{ message: string }>('/api/auth/logout');
  }

  /** Verify a token is valid (Enterprise) */
  async verify(token: string): Promise<TokenVerifyResponse> {
    return this.http.post<TokenVerifyResponse>('/api/auth/verify', { token });
  }
}

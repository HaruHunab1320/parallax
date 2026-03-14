export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name?: string;
  role: string;
  status?: string;
  [key: string]: unknown;
}

export interface AuthResponse {
  user: AuthUser;
  tokens: AuthTokens;
}

export interface TokenRefreshResponse {
  tokens: AuthTokens;
}

export interface PasswordResetResponse {
  message: string;
  _devToken?: string;
}

export interface TokenVerifyResponse {
  valid: boolean;
  payload?: {
    sub: string;
    email: string;
    role: string;
  };
  error?: string;
  code?: string;
}

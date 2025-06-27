export interface User {
  id: string;
  email: string;
  name: string;
  roles: string[];
  tenantId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface AuthToken {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: string;
}

export interface JWTPayload {
  sub: string; // User ID
  email: string;
  name: string;
  roles: string[];
  tenantId?: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scope: string[];
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  jwksUri?: string;
}

export interface Permission {
  resource: string;
  action: string;
  scope?: string; // e.g., 'own', 'tenant', 'all'
}

export interface Role {
  name: string;
  description: string;
  permissions: Permission[];
}

import { Request } from 'express';

export interface AuthRequest extends Request {
  user?: JWTPayload;
  token?: string;
}

export interface AuthConfig {
  jwt: {
    secret: string;
    publicKey?: string;
    privateKey?: string;
    algorithm: 'HS256' | 'RS256';
    expiresIn: string;
    refreshExpiresIn: string;
    issuer: string;
    audience: string;
  };
  oauth?: {
    providers: {
      [key: string]: OAuthConfig;
    };
  };
  rbac: {
    roles: Role[];
    defaultRole: string;
  };
  security: {
    bcryptRounds: number;
    tokenLength: number;
    sessionTimeout: number;
  };
}
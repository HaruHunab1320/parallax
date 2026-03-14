export interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  status: string;
  ssoProvider?: string;
  lastLoginAt?: string;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
}

export interface UserListResponse {
  users?: User[];
  count: number;
}

export interface UserListParams {
  status?: string;
  role?: string;
  limit?: number;
  offset?: number;
}

export interface UserCreateInput {
  email: string;
  name?: string;
  role?: string;
  password?: string;
}

export interface UserUpdateInput {
  name?: string;
  role?: string;
  status?: string;
  password?: string;
  metadata?: Record<string, unknown>;
}

export interface ApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  permissions?: unknown;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt?: string;
}

export interface ApiKeyCreateInput {
  name: string;
  expiresAt?: string | Date;
  permissions?: unknown;
}

export interface ApiKeyCreateResponse extends ApiKey {
  key: string;
  warning: string;
}

export interface ApiKeyListResponse {
  apiKeys: ApiKey[];
  count: number;
}

import type { HttpClient } from '../http.js';
import type {
  ApiKeyCreateInput,
  ApiKeyCreateResponse,
  ApiKeyListResponse,
  User,
  UserCreateInput,
  UserListParams,
  UserListResponse,
  UserUpdateInput,
} from '../types/users.js';

export class UsersResource {
  constructor(private http: HttpClient) {}

  /** List all users (Enterprise) */
  async list(params?: UserListParams): Promise<UserListResponse> {
    return this.http.get<UserListResponse>('/api/users', {
      status: params?.status,
      role: params?.role,
      limit: params?.limit,
      offset: params?.offset,
    });
  }

  /** Create a new user (Enterprise) */
  async create(input: UserCreateInput): Promise<User> {
    return this.http.post<User>('/api/users', input);
  }

  /** Get current user from auth token (Enterprise) */
  async me(): Promise<User> {
    return this.http.get<User>('/api/users/me');
  }

  /** Get a user by ID (Enterprise) */
  async get(id: string): Promise<User> {
    return this.http.get<User>(`/api/users/${encodeURIComponent(id)}`);
  }

  /** Update a user (Enterprise) */
  async update(id: string, updates: UserUpdateInput): Promise<User> {
    return this.http.put<User>(`/api/users/${encodeURIComponent(id)}`, updates);
  }

  /** Delete a user (Enterprise) */
  async delete(id: string): Promise<void> {
    await this.http.delete(`/api/users/${encodeURIComponent(id)}`);
  }

  /** Create an API key for a user (Enterprise) */
  async createApiKey(
    userId: string,
    input: ApiKeyCreateInput
  ): Promise<ApiKeyCreateResponse> {
    return this.http.post<ApiKeyCreateResponse>(
      `/api/users/${encodeURIComponent(userId)}/api-keys`,
      {
        ...input,
        expiresAt:
          input.expiresAt instanceof Date
            ? input.expiresAt.toISOString()
            : input.expiresAt,
      }
    );
  }

  /** List API keys for a user (Enterprise) */
  async listApiKeys(userId: string): Promise<ApiKeyListResponse> {
    return this.http.get<ApiKeyListResponse>(
      `/api/users/${encodeURIComponent(userId)}/api-keys`
    );
  }

  /** Revoke an API key (Enterprise) */
  async revokeApiKey(userId: string, keyId: string): Promise<void> {
    await this.http.delete(
      `/api/users/${encodeURIComponent(userId)}/api-keys/${encodeURIComponent(keyId)}`
    );
  }
}

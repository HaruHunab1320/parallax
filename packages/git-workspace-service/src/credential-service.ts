/**
 * Git Credential Service
 *
 * Manages credentials for private repository access.
 * Supports GitHub App, OAuth device flow, deploy keys, and PATs.
 *
 * Credential priority:
 * 1. User-provided (PAT, OAuth token, SSH)
 * 2. Cached OAuth token (from TokenStore)
 * 3. Provider adapter (GitHub App, etc.)
 * 4. OAuth device flow (interactive)
 */

import { randomUUID } from 'crypto';
import type {
  GitCredential,
  GitCredentialRequest,
  CredentialGrant,
  GitProvider,
  CredentialType,
  GitProviderAdapter,
  OAuthToken,
  AuthPromptEmitter,
  AgentPermissions,
} from './types';
import { OAuthDeviceFlow, TokenStore, MemoryTokenStore } from './oauth';

export interface CredentialServiceLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
}

export interface CredentialGrantStore {
  create(grant: CredentialGrant & { reason?: string }): Promise<void>;
  findById(id: string): Promise<CredentialGrant | null>;
  findByExecutionId(executionId: string): Promise<CredentialGrant[]>;
  revoke(id: string): Promise<void>;
  revokeForExecution(executionId: string): Promise<number>;
}

export interface OAuthConfig {
  /**
   * OAuth Client ID (required for device flow)
   */
  clientId: string;

  /**
   * OAuth Client Secret (optional for public clients)
   */
  clientSecret?: string;

  /**
   * Default permissions to request
   */
  permissions?: AgentPermissions;

  /**
   * Callback for auth prompts (for PTY integration)
   */
  promptEmitter?: AuthPromptEmitter;
}

export interface CredentialServiceOptions {
  /**
   * Default TTL for credentials in seconds
   */
  defaultTtlSeconds?: number;

  /**
   * Maximum TTL allowed
   */
  maxTtlSeconds?: number;

  /**
   * Provider adapters keyed by provider name
   */
  providers?: Map<GitProvider, GitProviderAdapter>;

  /**
   * Optional persistent store for grants
   */
  grantStore?: CredentialGrantStore;

  /**
   * Token store for cached OAuth tokens
   * Default: MemoryTokenStore
   */
  tokenStore?: TokenStore;

  /**
   * OAuth configuration for device flow authentication
   * If provided, enables interactive OAuth as a fallback
   */
  oauth?: OAuthConfig;

  /**
   * Optional logger
   */
  logger?: CredentialServiceLogger;
}

export class CredentialService {
  private grants: Map<string, CredentialGrant> = new Map();
  private readonly defaultTtl: number;
  private readonly maxTtl: number;
  private readonly providers: Map<GitProvider, GitProviderAdapter>;
  private readonly grantStore?: CredentialGrantStore;
  private readonly tokenStore: TokenStore;
  private readonly oauthConfig?: OAuthConfig;
  private readonly logger?: CredentialServiceLogger;

  constructor(options: CredentialServiceOptions = {}) {
    this.defaultTtl = options.defaultTtlSeconds || 3600; // 1 hour
    this.maxTtl = options.maxTtlSeconds || 3600; // 1 hour max
    this.providers = options.providers || new Map();
    this.grantStore = options.grantStore;
    this.tokenStore = options.tokenStore || new MemoryTokenStore();
    this.oauthConfig = options.oauth;
    this.logger = options.logger;
  }

  /**
   * Get the token store (for external access to cached tokens)
   */
  getTokenStore(): TokenStore {
    return this.tokenStore;
  }

  /**
   * Register a provider adapter
   */
  registerProvider(provider: GitProviderAdapter): void {
    this.providers.set(provider.name, provider);
    this.log('info', { provider: provider.name }, 'Provider registered');
  }

  /**
   * Get a provider adapter
   */
  getProvider(name: GitProvider): GitProviderAdapter | undefined {
    return this.providers.get(name);
  }

  /**
   * Request credentials for a repository.
   * If request.optional is true, returns null when no credentials available.
   * Otherwise throws an error.
   */
  async getCredentials(request: GitCredentialRequest): Promise<GitCredential | null> {
    const provider = this.detectProvider(request.repo);

    this.log(
      'info',
      {
        repo: request.repo,
        provider,
        access: request.access,
        executionId: request.context.executionId,
      },
      'Credential request'
    );

    // Determine TTL
    const ttlSeconds = Math.min(
      request.ttlSeconds || this.defaultTtl,
      this.maxTtl
    );

    // Try credential sources in order of preference
    let credential: GitCredential | null = null;

    // Priority 1: User-provided credentials (PAT, OAuth token, or SSH)
    if (request.userProvided) {
      credential = this.createUserProvidedCredential(request, ttlSeconds, provider);
      this.log(
        'info',
        { repo: request.repo, type: request.userProvided.type },
        'Using user-provided credentials'
      );
    }

    // Priority 2: Cached OAuth token
    if (!credential) {
      credential = await this.getCachedOAuthCredential(provider, request, ttlSeconds);
    }

    // Priority 3: Provider-specific credentials (GitHub App, etc.)
    if (!credential) {
      const providerAdapter = this.providers.get(provider);
      if (providerAdapter) {
        try {
          credential = await providerAdapter.getCredentials(request);
        } catch (error) {
          this.log(
            'warn',
            { repo: request.repo, provider, error },
            'Failed to get provider credentials'
          );
        }
      }
    }

    // Priority 4: Interactive OAuth device flow
    if (!credential && this.oauthConfig) {
      credential = await this.getOAuthCredentialViaDeviceFlow(provider, request, ttlSeconds);
    }

    if (!credential) {
      // If optional flag is set, return null instead of throwing
      if (request.optional) {
        this.log(
          'info',
          { repo: request.repo },
          'No credentials available (optional request, returning null)'
        );
        return null;
      }

      throw new Error(
        `No credentials available for repository: ${request.repo}. ` +
          (this.oauthConfig
            ? 'OAuth device flow failed or was cancelled.'
            : 'Configure OAuth to enable interactive authentication.')
      );
    }

    // Record the grant
    const grant: CredentialGrant = {
      id: credential.id,
      type: credential.type,
      repo: request.repo,
      provider,
      grantedTo: {
        executionId: request.context.executionId,
        taskId: request.context.taskId,
        agentId: request.context.agentId,
      },
      permissions: credential.permissions,
      createdAt: new Date(),
      expiresAt: credential.expiresAt,
    };

    // Store grant in memory
    this.grants.set(grant.id, grant);

    // Persist to store if available
    if (this.grantStore) {
      try {
        await this.grantStore.create({
          ...grant,
          reason: request.context.reason,
        });
      } catch (error) {
        this.log(
          'warn',
          { grantId: grant.id, error },
          'Failed to persist credential grant'
        );
      }
    }

    this.log(
      'info',
      {
        grantId: grant.id,
        repo: request.repo,
        expiresAt: credential.expiresAt,
        persisted: !!this.grantStore,
      },
      'Credential granted'
    );

    return credential;
  }

  /**
   * Revoke a credential grant
   */
  async revokeCredential(grantId: string): Promise<void> {
    const grant = this.grants.get(grantId);
    if (!grant) {
      // Try to revoke in store even if not in memory
      if (this.grantStore) {
        try {
          await this.grantStore.revoke(grantId);
        } catch (error) {
          this.log('warn', { grantId, error }, 'Failed to revoke credential in store');
        }
      }
      return;
    }

    grant.revokedAt = new Date();
    this.grants.set(grantId, grant);

    // Revoke via provider if applicable
    const provider = this.providers.get(grant.provider);
    if (provider) {
      try {
        await provider.revokeCredential(grantId);
      } catch (error) {
        this.log('warn', { grantId, error }, 'Failed to revoke credential via provider');
      }
    }

    // Update store
    if (this.grantStore) {
      try {
        await this.grantStore.revoke(grantId);
      } catch (error) {
        this.log('warn', { grantId, error }, 'Failed to revoke credential in store');
      }
    }

    this.log('info', { grantId }, 'Credential revoked');
  }

  /**
   * Revoke all credentials for an execution
   */
  async revokeForExecution(executionId: string): Promise<number> {
    let count = 0;

    // Revoke in memory
    for (const [id, grant] of this.grants) {
      if (grant.grantedTo.executionId === executionId && !grant.revokedAt) {
        grant.revokedAt = new Date();
        this.grants.set(id, grant);
        count++;
      }
    }

    // Revoke in store
    if (this.grantStore) {
      try {
        const storeCount = await this.grantStore.revokeForExecution(executionId);
        // Use the larger count (store may have grants not in memory)
        count = Math.max(count, storeCount);
      } catch (error) {
        this.log('warn', { executionId, error }, 'Failed to revoke credentials in store');
      }
    }

    this.log('info', { executionId, revokedCount: count }, 'Credentials revoked for execution');
    return count;
  }

  /**
   * Check if a credential is valid
   */
  isValid(grantId: string): boolean {
    const grant = this.grants.get(grantId);
    if (!grant) return false;
    if (grant.revokedAt) return false;
    if (new Date() > grant.expiresAt) return false;
    return true;
  }

  /**
   * Get grant info for audit
   */
  async getGrant(grantId: string): Promise<CredentialGrant | null> {
    // Check memory first
    const memoryGrant = this.grants.get(grantId);
    if (memoryGrant) {
      return memoryGrant;
    }

    // Check store
    if (this.grantStore) {
      try {
        return await this.grantStore.findById(grantId);
      } catch (error) {
        this.log('warn', { grantId, error }, 'Failed to get grant from store');
      }
    }

    return null;
  }

  /**
   * List all grants for an execution
   */
  async getGrantsForExecution(executionId: string): Promise<CredentialGrant[]> {
    // Try store first for complete history
    if (this.grantStore) {
      try {
        return await this.grantStore.findByExecutionId(executionId);
      } catch (error) {
        this.log('warn', { executionId, error }, 'Failed to get grants from store');
      }
    }

    // Fallback to memory
    return Array.from(this.grants.values()).filter(
      (g) => g.grantedTo.executionId === executionId
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────

  private detectProvider(repo: string): GitProvider {
    const lowerRepo = repo.toLowerCase();

    if (lowerRepo.includes('github.com') || lowerRepo.startsWith('github:')) {
      return 'github';
    }
    if (lowerRepo.includes('gitlab.com') || lowerRepo.startsWith('gitlab:')) {
      return 'gitlab';
    }
    if (lowerRepo.includes('bitbucket.org') || lowerRepo.startsWith('bitbucket:')) {
      return 'bitbucket';
    }
    if (lowerRepo.includes('dev.azure.com') || lowerRepo.includes('visualstudio.com')) {
      return 'azure_devops';
    }

    return 'self_hosted';
  }

  /**
   * Create a GitCredential from user-provided credentials (PAT or OAuth token)
   */
  private createUserProvidedCredential(
    request: GitCredentialRequest,
    ttlSeconds: number,
    provider: GitProvider
  ): GitCredential {
    const userCreds = request.userProvided!;
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Map user credential type to our CredentialType
    let credentialType: CredentialType;
    let token: string;

    if (userCreds.type === 'ssh') {
      // SSH credentials don't need a token - system SSH agent handles auth
      credentialType = 'ssh_key';
      token = ''; // No token needed for SSH
    } else {
      credentialType = userCreds.type === 'pat' ? 'pat' : 'oauth';
      token = userCreds.token;
    }

    // For user-provided credentials, we assume full repo access based on what they provided
    // The actual permissions are determined by the token's scope at the provider level
    const permissions =
      request.access === 'write'
        ? ['contents:read', 'contents:write', 'pull_requests:write']
        : ['contents:read'];

    return {
      id: randomUUID(),
      type: credentialType,
      token,
      repo: request.repo,
      permissions,
      expiresAt,
      provider: userCreds.provider || provider,
    };
  }

  /**
   * Check for a cached OAuth token and create credential from it
   */
  private async getCachedOAuthCredential(
    provider: GitProvider,
    request: GitCredentialRequest,
    ttlSeconds: number
  ): Promise<GitCredential | null> {
    try {
      const cachedToken = await this.tokenStore.get(provider);

      if (!cachedToken) {
        return null;
      }

      // Check if token is expired
      if (this.tokenStore.isExpired(cachedToken)) {
        // Try to refresh if we have a refresh token
        if (cachedToken.refreshToken && this.oauthConfig) {
          const refreshedToken = await this.refreshOAuthToken(provider, cachedToken.refreshToken);
          if (refreshedToken) {
            return this.createOAuthCredential(refreshedToken, request, ttlSeconds);
          }
        }
        // Token expired and can't refresh
        this.log('info', { provider }, 'Cached OAuth token expired');
        return null;
      }

      // Check if token needs refresh (close to expiry)
      if (this.tokenStore.needsRefresh(cachedToken) && cachedToken.refreshToken && this.oauthConfig) {
        const refreshedToken = await this.refreshOAuthToken(provider, cachedToken.refreshToken);
        if (refreshedToken) {
          return this.createOAuthCredential(refreshedToken, request, ttlSeconds);
        }
        // If refresh fails, continue with existing token if still valid
      }

      this.log('info', { provider }, 'Using cached OAuth token');
      return this.createOAuthCredential(cachedToken, request, ttlSeconds);
    } catch (error) {
      this.log('warn', { provider, error }, 'Failed to get cached OAuth token');
      return null;
    }
  }

  /**
   * Initiate interactive OAuth device flow
   */
  private async getOAuthCredentialViaDeviceFlow(
    provider: GitProvider,
    request: GitCredentialRequest,
    ttlSeconds: number
  ): Promise<GitCredential | null> {
    if (!this.oauthConfig) {
      return null;
    }

    // Only GitHub is supported for now
    if (provider !== 'github') {
      this.log('warn', { provider }, 'OAuth device flow only supported for GitHub');
      return null;
    }

    this.log('info', { repo: request.repo }, 'Starting OAuth device flow for authentication');

    try {
      const deviceFlow = new OAuthDeviceFlow({
        clientId: this.oauthConfig.clientId,
        clientSecret: this.oauthConfig.clientSecret,
        provider,
        permissions: this.oauthConfig.permissions,
        promptEmitter: this.oauthConfig.promptEmitter,
      });

      const token = await deviceFlow.authorize();

      // Cache the token for future use
      await this.tokenStore.save(provider, token);

      this.log('info', { provider }, 'OAuth device flow completed successfully');
      return this.createOAuthCredential(token, request, ttlSeconds);
    } catch (error) {
      this.log('error', { provider, error }, 'OAuth device flow failed');
      return null;
    }
  }

  /**
   * Refresh an OAuth token
   */
  private async refreshOAuthToken(
    provider: GitProvider,
    refreshToken: string
  ): Promise<OAuthToken | null> {
    if (!this.oauthConfig) {
      return null;
    }

    try {
      const deviceFlow = new OAuthDeviceFlow({
        clientId: this.oauthConfig.clientId,
        clientSecret: this.oauthConfig.clientSecret,
        provider,
        permissions: this.oauthConfig.permissions,
      });

      const newToken = await deviceFlow.refreshToken(refreshToken);

      // Update the cache
      await this.tokenStore.save(provider, newToken);

      this.log('info', { provider }, 'OAuth token refreshed successfully');
      return newToken;
    } catch (error) {
      this.log('warn', { provider, error }, 'Failed to refresh OAuth token');
      return null;
    }
  }

  /**
   * Create a GitCredential from an OAuthToken
   */
  private createOAuthCredential(
    token: OAuthToken,
    request: GitCredentialRequest,
    ttlSeconds: number
  ): GitCredential {
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000);

    // Map permissions to string array
    const permissions: string[] = [];
    if (token.permissions.contents === 'read' || token.permissions.contents === 'write') {
      permissions.push('contents:read');
    }
    if (token.permissions.contents === 'write') {
      permissions.push('contents:write');
    }
    if (token.permissions.pullRequests === 'read' || token.permissions.pullRequests === 'write') {
      permissions.push('pull_requests:read');
    }
    if (token.permissions.pullRequests === 'write') {
      permissions.push('pull_requests:write');
    }
    if (token.permissions.issues === 'read' || token.permissions.issues === 'write') {
      permissions.push('issues:read');
    }
    if (token.permissions.issues === 'write') {
      permissions.push('issues:write');
    }

    return {
      id: randomUUID(),
      type: 'oauth',
      token: token.accessToken,
      repo: request.repo,
      permissions,
      expiresAt,
      provider: token.provider,
    };
  }

  private log(
    level: 'info' | 'warn' | 'error',
    data: Record<string, unknown>,
    message: string
  ): void {
    if (this.logger) {
      this.logger[level](data, message);
    }
  }
}

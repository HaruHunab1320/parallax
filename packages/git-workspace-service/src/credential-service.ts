/**
 * Git Credential Service
 *
 * Manages credentials for private repository access.
 * Supports GitHub App, OAuth, deploy keys, and PATs.
 */

import { randomUUID } from 'crypto';
import type {
  GitCredential,
  GitCredentialRequest,
  CredentialGrant,
  GitProvider,
  CredentialType,
  GitProviderAdapter,
} from './types';

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
  private readonly logger?: CredentialServiceLogger;

  constructor(options: CredentialServiceOptions = {}) {
    this.defaultTtl = options.defaultTtlSeconds || 3600; // 1 hour
    this.maxTtl = options.maxTtlSeconds || 3600; // 1 hour max
    this.providers = options.providers || new Map();
    this.grantStore = options.grantStore;
    this.logger = options.logger;
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
   * Request credentials for a repository
   */
  async getCredentials(request: GitCredentialRequest): Promise<GitCredential> {
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

    // Priority 1: User-provided credentials (PAT or OAuth token)
    if (request.userProvided) {
      credential = this.createUserProvidedCredential(request, ttlSeconds, provider);
      this.log(
        'info',
        { repo: request.repo, type: request.userProvided.type },
        'Using user-provided credentials'
      );
    }
    // Priority 2: Provider-specific credentials
    else {
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

    if (!credential) {
      throw new Error(
        `No credentials available for repository: ${request.repo}`
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
    const credentialType: CredentialType = userCreds.type === 'pat' ? 'pat' : 'oauth';

    // For user-provided credentials, we assume full repo access based on what they provided
    // The actual permissions are determined by the token's scope at the provider level
    const permissions =
      request.access === 'write'
        ? ['contents:read', 'contents:write', 'pull_requests:write']
        : ['contents:read'];

    return {
      id: randomUUID(),
      type: credentialType,
      token: userCreds.token,
      repo: request.repo,
      permissions,
      expiresAt,
      provider: userCreds.provider || provider,
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

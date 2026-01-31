/**
 * Git Credential Service
 *
 * Manages credentials for private repository access.
 * Supports GitHub App, OAuth, deploy keys, and PATs.
 */

import { Logger } from 'pino';
import { randomUUID } from 'crypto';
import {
  GitCredential,
  GitCredentialRequest,
  CredentialGrant,
  GitProvider,
  CredentialType,
  GitHubAppConfig,
  GitHubAppInstallation,
  UserProvidedCredentials,
} from './types';
import { GitHubProvider, GitHubProviderConfig } from './providers/github-provider';
import { CredentialGrantRepository } from '../db/repositories/credential-grant.repository';

export interface CredentialServiceConfig {
  /**
   * GitHub App configuration (recommended)
   */
  githubApp?: GitHubProviderConfig;

  /**
   * Pre-initialized GitHub provider (alternative to githubApp config)
   */
  githubProvider?: GitHubProvider;

  /**
   * Default TTL for credentials in seconds
   */
  defaultTtlSeconds?: number;

  /**
   * Maximum TTL allowed
   */
  maxTtlSeconds?: number;

  /**
   * Encryption key for storing credentials
   */
  encryptionKey?: string;

  /**
   * Database repository for persistent storage (optional)
   * If not provided, grants are stored in memory only
   */
  repository?: CredentialGrantRepository;
}

export class CredentialService {
  private grants: Map<string, CredentialGrant> = new Map();
  private installations: Map<string, GitHubAppInstallation> = new Map();
  private readonly defaultTtl: number;
  private readonly maxTtl: number;
  private githubProvider?: GitHubProvider;
  private repository?: CredentialGrantRepository;

  constructor(
    private readonly config: CredentialServiceConfig,
    private readonly logger: Logger
  ) {
    this.defaultTtl = config.defaultTtlSeconds || 3600; // 1 hour
    this.maxTtl = config.maxTtlSeconds || 3600; // 1 hour max
    this.repository = config.repository;

    // Use pre-initialized provider if provided, otherwise create from config
    if (config.githubProvider) {
      this.githubProvider = config.githubProvider;
    } else if (config.githubApp) {
      this.githubProvider = new GitHubProvider(config.githubApp, logger);
    }
  }

  /**
   * Initialize the credential service
   */
  async initialize(): Promise<void> {
    if (this.githubProvider) {
      await this.githubProvider.initialize();
    }
    this.logger.info('Credential service initialized');
  }

  /**
   * Get the GitHub provider (for direct API access)
   */
  getGitHubProvider(): GitHubProvider | undefined {
    return this.githubProvider;
  }

  /**
   * Request credentials for a repository
   */
  async getCredentials(request: GitCredentialRequest): Promise<GitCredential> {
    const provider = this.detectProvider(request.repo);

    this.logger.info(
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
      this.logger.info(
        { repo: request.repo, type: request.userProvided.type },
        'Using user-provided credentials'
      );
    }
    // Priority 2: GitHub App credentials
    else if (provider === 'github' && this.githubProvider) {
      credential = await this.getGitHubAppCredential(request, ttlSeconds);
    }

    // TODO: Add OAuth, deploy key fallbacks

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

    // Persist to database if repository is available
    if (this.repository) {
      try {
        await this.repository.create({
          id: grant.id,
          type: grant.type,
          repo: grant.repo,
          provider: grant.provider,
          executionId: grant.grantedTo.executionId,
          taskId: grant.grantedTo.taskId,
          agentId: grant.grantedTo.agentId,
          permissions: grant.permissions,
          reason: request.context.reason,
          expiresAt: grant.expiresAt,
        });
      } catch (error) {
        this.logger.warn({ grantId: grant.id, error }, 'Failed to persist credential grant to database');
      }
    }

    this.logger.info(
      {
        grantId: grant.id,
        repo: request.repo,
        expiresAt: credential.expiresAt,
        persisted: !!this.repository,
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
      // Try to revoke in database even if not in memory
      if (this.repository) {
        try {
          await this.repository.revoke(grantId);
        } catch (error) {
          this.logger.warn({ grantId, error }, 'Failed to revoke credential in database');
        }
      }
      return;
    }

    grant.revokedAt = new Date();
    this.grants.set(grantId, grant);

    // Update database
    if (this.repository) {
      try {
        await this.repository.revoke(grantId);
      } catch (error) {
        this.logger.warn({ grantId, error }, 'Failed to revoke credential in database');
      }
    }

    this.logger.info({ grantId }, 'Credential revoked');
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

    // Revoke in database
    if (this.repository) {
      try {
        const dbCount = await this.repository.revokeForExecution(executionId);
        // Use the larger count (database may have grants not in memory)
        count = Math.max(count, dbCount);
      } catch (error) {
        this.logger.warn({ executionId, error }, 'Failed to revoke credentials in database');
      }
    }

    this.logger.info({ executionId, revokedCount: count }, 'Credentials revoked for execution');
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

    // Check database
    if (this.repository) {
      try {
        const dbGrant = await this.repository.findById(grantId);
        if (dbGrant) {
          // Convert database model to CredentialGrant
          return {
            id: dbGrant.id,
            type: dbGrant.type as CredentialType,
            repo: dbGrant.repo,
            provider: dbGrant.provider as GitProvider,
            grantedTo: {
              executionId: dbGrant.executionId,
              taskId: dbGrant.taskId || undefined,
              agentId: dbGrant.agentId || undefined,
            },
            permissions: dbGrant.permissions as string[],
            createdAt: dbGrant.createdAt,
            expiresAt: dbGrant.expiresAt,
            revokedAt: dbGrant.revokedAt || undefined,
          };
        }
      } catch (error) {
        this.logger.warn({ grantId, error }, 'Failed to get grant from database');
      }
    }

    return null;
  }

  /**
   * List all grants for an execution
   */
  async getGrantsForExecution(executionId: string): Promise<CredentialGrant[]> {
    // Try database first for complete history
    if (this.repository) {
      try {
        const dbGrants = await this.repository.findByExecutionId(executionId);
        return dbGrants.map((g) => ({
          id: g.id,
          type: g.type as CredentialType,
          repo: g.repo,
          provider: g.provider as GitProvider,
          grantedTo: {
            executionId: g.executionId,
            taskId: g.taskId || undefined,
            agentId: g.agentId || undefined,
          },
          permissions: g.permissions as string[],
          createdAt: g.createdAt,
          expiresAt: g.expiresAt,
          revokedAt: g.revokedAt || undefined,
        }));
      } catch (error) {
        this.logger.warn({ executionId, error }, 'Failed to get grants from database');
      }
    }

    // Fallback to memory
    return Array.from(this.grants.values()).filter(
      (g) => g.grantedTo.executionId === executionId
    );
  }

  /**
   * Register a GitHub App installation
   */
  registerInstallation(installation: GitHubAppInstallation): void {
    this.installations.set(installation.accountLogin, installation);
    this.logger.info(
      {
        accountLogin: installation.accountLogin,
        repos: installation.repositories.length,
      },
      'GitHub App installation registered'
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

  private async getGitHubAppCredential(
    request: GitCredentialRequest,
    ttlSeconds: number
  ): Promise<GitCredential | null> {
    if (!this.githubProvider) {
      return null;
    }

    // Parse repo to get owner
    const repoInfo = this.parseGitHubRepo(request.repo);
    if (!repoInfo) {
      return null;
    }

    try {
      // Use the GitHub provider to get credentials
      const credential = await this.githubProvider.getCredentials(
        repoInfo.owner,
        repoInfo.repo,
        request.access,
        ttlSeconds
      );

      return credential;
    } catch (error) {
      this.logger.warn(
        { repo: request.repo, error },
        'Failed to get GitHub App credentials'
      );
      return null;
    }
  }

  private parseGitHubRepo(repo: string): { owner: string; repo: string } | null {
    // Handle various formats:
    // - https://github.com/owner/repo
    // - git@github.com:owner/repo.git
    // - github.com/owner/repo
    // - owner/repo

    const patterns = [
      /github\.com[/:]([^/]+)\/([^/.]+)/,
      /^([^/]+)\/([^/]+)$/,
    ];

    for (const pattern of patterns) {
      const match = repo.match(pattern);
      if (match) {
        return { owner: match[1], repo: match[2].replace(/\.git$/, '') };
      }
    }

    return null;
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
    const permissions = request.access === 'write'
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

}

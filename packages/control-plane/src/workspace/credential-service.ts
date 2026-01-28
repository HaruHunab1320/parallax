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
} from './types';
import { GitHubProvider, GitHubProviderConfig } from './providers/github-provider';

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
}

export class CredentialService {
  private grants: Map<string, CredentialGrant> = new Map();
  private installations: Map<string, GitHubAppInstallation> = new Map();
  private readonly defaultTtl: number;
  private readonly maxTtl: number;
  private githubProvider?: GitHubProvider;

  constructor(
    private readonly config: CredentialServiceConfig,
    private readonly logger: Logger
  ) {
    this.defaultTtl = config.defaultTtlSeconds || 3600; // 1 hour
    this.maxTtl = config.maxTtlSeconds || 3600; // 1 hour max

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

    if (provider === 'github' && this.config.githubApp) {
      credential = await this.getGitHubAppCredential(request, ttlSeconds);
    }

    // TODO: Add OAuth, deploy key, PAT fallbacks

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

    this.grants.set(grant.id, grant);

    this.logger.info(
      {
        grantId: grant.id,
        repo: request.repo,
        expiresAt: credential.expiresAt,
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
      return;
    }

    grant.revokedAt = new Date();
    this.grants.set(grantId, grant);

    this.logger.info({ grantId }, 'Credential revoked');
  }

  /**
   * Revoke all credentials for an execution
   */
  async revokeForExecution(executionId: string): Promise<number> {
    let count = 0;

    for (const [id, grant] of this.grants) {
      if (grant.grantedTo.executionId === executionId && !grant.revokedAt) {
        grant.revokedAt = new Date();
        this.grants.set(id, grant);
        count++;
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
  getGrant(grantId: string): CredentialGrant | null {
    return this.grants.get(grantId) || null;
  }

  /**
   * List all grants for an execution
   */
  getGrantsForExecution(executionId: string): CredentialGrant[] {
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

}

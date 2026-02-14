/**
 * GitHub Provider
 *
 * Handles GitHub App authentication and API operations.
 * Requires @octokit/rest and @octokit/auth-app as peer dependencies.
 */

import { randomUUID } from 'crypto';
import type {
  GitProviderAdapter,
  GitCredential,
  GitCredentialRequest,
  PullRequestInfo,
  GitHubAppInstallation,
} from '../types';

// Lazy-loaded Octokit - using any for the cache since types are dynamically loaded
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let octokitCache: { Octokit: any; createAppAuth: any } | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function loadOctokit(): { Octokit: any; createAppAuth: any } {
  if (!octokitCache) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { Octokit } = require('@octokit/rest');
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { createAppAuth } = require('@octokit/auth-app');
      octokitCache = { Octokit, createAppAuth };
    } catch {
      throw new Error(
        '@octokit/rest and @octokit/auth-app are required for GitHub provider. ' +
          'Install them with: npm install @octokit/rest @octokit/auth-app'
      );
    }
  }
  return octokitCache;
}

export interface GitHubProviderConfig {
  /**
   * GitHub App ID
   */
  appId: string;

  /**
   * GitHub App private key (PEM format)
   */
  privateKey: string;

  /**
   * Webhook secret for verifying webhooks
   */
  webhookSecret?: string;

  /**
   * GitHub API base URL (for GitHub Enterprise)
   */
  baseUrl?: string;
}

export interface GitHubProviderLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
  debug(data: Record<string, unknown>, message: string): void;
}

export class GitHubProvider implements GitProviderAdapter {
  readonly name = 'github' as const;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private appOctokit!: any;
  private installations: Map<string, GitHubAppInstallation> = new Map();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private installationOctokits: Map<number, any> = new Map();
  private initialized = false;

  constructor(
    private readonly config: GitHubProviderConfig,
    private readonly logger?: GitHubProviderLogger
  ) {}

  /**
   * Initialize provider - fetch all installations
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const { Octokit, createAppAuth } = loadOctokit();

    this.log('info', {}, 'Initializing GitHub provider');

    // Create app-level Octokit for installation management
    this.appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: this.config.appId,
        privateKey: this.config.privateKey,
      },
      baseUrl: this.config.baseUrl,
    });

    try {
      const { data: installations } = await this.appOctokit.apps.listInstallations();

      for (const installation of installations) {
        await this.registerInstallation(installation.id);
      }

      this.initialized = true;
      this.log(
        'info',
        { installationCount: installations.length },
        'GitHub provider initialized'
      );
    } catch (error) {
      this.log('error', { error }, 'Failed to initialize GitHub provider');
      throw error;
    }
  }

  /**
   * Register an installation (called on webhook or init)
   */
  async registerInstallation(installationId: number): Promise<GitHubAppInstallation> {
    if (!this.appOctokit) {
      await this.initialize();
    }

    try {
      // Get installation details
      const { data: installation } = await this.appOctokit.apps.getInstallation({
        installation_id: installationId,
      });

      // Get accessible repositories
      const octokit = await this.getInstallationOctokit(installationId);
      const { data: repos } = await octokit.apps.listReposAccessibleToInstallation({
        per_page: 100,
      });

      // Handle different account types
      const account = installation.account as {
        login?: string;
        type?: string;
        slug?: string;
      } | null;
      const accountLogin = account?.login || account?.slug || 'unknown';
      const accountType = account?.type === 'Organization' ? 'Organization' : 'User';

      const appInstallation: GitHubAppInstallation = {
        installationId,
        accountLogin,
        accountType,
        repositories: repos.repositories?.map((r: { full_name: string }) => r.full_name) || [],
        permissions: installation.permissions as Record<string, string>,
      };

      this.installations.set(appInstallation.accountLogin, appInstallation);

      this.log(
        'info',
        {
          installationId,
          account: appInstallation.accountLogin,
          repoCount: appInstallation.repositories.length,
        },
        'Installation registered'
      );

      return appInstallation;
    } catch (error) {
      this.log('error', { installationId, error }, 'Failed to register installation');
      throw error;
    }
  }

  /**
   * Get installation for a repository
   */
  getInstallationForRepo(owner: string, repo: string): GitHubAppInstallation | null {
    // Check by owner
    const installation = this.installations.get(owner);
    if (!installation) {
      return null;
    }

    // Check if repo is accessible
    const fullName = `${owner}/${repo}`;
    if (!installation.repositories.includes(fullName)) {
      return null;
    }

    return installation;
  }

  /**
   * Get credentials for a repository (implements GitProviderAdapter)
   */
  async getCredentials(request: GitCredentialRequest): Promise<GitCredential> {
    // Parse repo to get owner/repo
    const repoInfo = this.parseRepo(request.repo);
    if (!repoInfo) {
      throw new Error(`Invalid repository format: ${request.repo}`);
    }

    return this.getCredentialsForRepo(
      repoInfo.owner,
      repoInfo.repo,
      request.access,
      request.ttlSeconds
    );
  }

  /**
   * Get credentials for a repository by owner/repo
   */
  async getCredentialsForRepo(
    owner: string,
    repo: string,
    access: 'read' | 'write',
    ttlSeconds: number = 3600
  ): Promise<GitCredential> {
    if (!this.initialized) {
      await this.initialize();
    }

    const installation = this.getInstallationForRepo(owner, repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${repo}`);
    }

    const { createAppAuth } = loadOctokit();

    // Get installation access token with specific permissions
    const auth = createAppAuth({
      appId: this.config.appId,
      privateKey: this.config.privateKey,
    });

    const { token, expiresAt } = await auth({
      type: 'installation',
      installationId: installation.installationId,
      repositoryNames: [repo],
      permissions:
        access === 'write'
          ? { contents: 'write', pull_requests: 'write', metadata: 'read' }
          : { contents: 'read', metadata: 'read' },
    });

    return {
      id: randomUUID(),
      type: 'github_app',
      token,
      repo: `${owner}/${repo}`,
      permissions:
        access === 'write'
          ? ['contents:write', 'pull_requests:write', 'metadata:read']
          : ['contents:read', 'metadata:read'],
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + ttlSeconds * 1000),
      provider: 'github',
    };
  }

  /**
   * Revoke a credential (no-op for GitHub App tokens - they expire automatically)
   */
  async revokeCredential(_credentialId: string): Promise<void> {
    // GitHub App tokens expire automatically, no explicit revocation needed
  }

  /**
   * Create a pull request (implements GitProviderAdapter)
   */
  async createPullRequest(options: {
    repo: string;
    sourceBranch: string;
    targetBranch: string;
    title: string;
    body: string;
    draft?: boolean;
    labels?: string[];
    reviewers?: string[];
    credential: GitCredential;
  }): Promise<PullRequestInfo> {
    const repoInfo = this.parseRepo(options.repo);
    if (!repoInfo) {
      throw new Error(`Invalid repository format: ${options.repo}`);
    }

    return this.createPullRequestForRepo(repoInfo.owner, repoInfo.repo, {
      title: options.title,
      body: options.body,
      head: options.sourceBranch,
      base: options.targetBranch,
      draft: options.draft,
      labels: options.labels,
      reviewers: options.reviewers,
    });
  }

  /**
   * Create a pull request by owner/repo
   */
  async createPullRequestForRepo(
    owner: string,
    repo: string,
    options: {
      title: string;
      body: string;
      head: string;
      base: string;
      draft?: boolean;
      labels?: string[];
      reviewers?: string[];
    }
  ): Promise<PullRequestInfo> {
    if (!this.initialized) {
      await this.initialize();
    }

    const installation = this.getInstallationForRepo(owner, repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${repo}`);
    }

    const octokit = await this.getInstallationOctokit(installation.installationId);

    const { data: pr } = await octokit.pulls.create({
      owner,
      repo,
      title: options.title,
      body: options.body,
      head: options.head,
      base: options.base,
      draft: options.draft,
    });

    // Add labels if specified
    if (options.labels && options.labels.length > 0) {
      await octokit.issues.addLabels({
        owner,
        repo,
        issue_number: pr.number,
        labels: options.labels,
      });
    }

    // Request reviewers if specified
    if (options.reviewers && options.reviewers.length > 0) {
      await octokit.pulls.requestReviewers({
        owner,
        repo,
        pull_number: pr.number,
        reviewers: options.reviewers,
      });
    }

    this.log(
      'info',
      { owner, repo, prNumber: pr.number, title: options.title },
      'Pull request created'
    );

    return {
      number: pr.number,
      url: pr.html_url,
      state: pr.state as 'open' | 'closed' | 'merged',
      sourceBranch: options.head,
      targetBranch: options.base,
      title: options.title,
      executionId: '', // Set by caller
      createdAt: new Date(pr.created_at),
    };
  }

  /**
   * Check if a branch exists (implements GitProviderAdapter)
   */
  async branchExists(
    repo: string,
    branch: string,
    _credential: GitCredential
  ): Promise<boolean> {
    const repoInfo = this.parseRepo(repo);
    if (!repoInfo) {
      return false;
    }

    if (!this.initialized) {
      await this.initialize();
    }

    const installation = this.getInstallationForRepo(repoInfo.owner, repoInfo.repo);
    if (!installation) {
      return false;
    }

    const octokit = await this.getInstallationOctokit(installation.installationId);

    try {
      await octokit.repos.getBranch({
        owner: repoInfo.owner,
        repo: repoInfo.repo,
        branch,
      });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the default branch for a repository (implements GitProviderAdapter)
   */
  async getDefaultBranch(repo: string, _credential: GitCredential): Promise<string> {
    const repoInfo = this.parseRepo(repo);
    if (!repoInfo) {
      throw new Error(`Invalid repository format: ${repo}`);
    }

    if (!this.initialized) {
      await this.initialize();
    }

    const installation = this.getInstallationForRepo(repoInfo.owner, repoInfo.repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${repo}`);
    }

    const octokit = await this.getInstallationOctokit(installation.installationId);

    const { data: repoData } = await octokit.repos.get({
      owner: repoInfo.owner,
      repo: repoInfo.repo,
    });

    return repoData.default_branch;
  }

  /**
   * Get pull request status
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequestInfo> {
    if (!this.initialized) {
      await this.initialize();
    }

    const installation = this.getInstallationForRepo(owner, repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${repo}`);
    }

    const octokit = await this.getInstallationOctokit(installation.installationId);

    const { data: pr } = await octokit.pulls.get({
      owner,
      repo,
      pull_number: prNumber,
    });

    return {
      number: pr.number,
      url: pr.html_url,
      state: pr.merged ? 'merged' : (pr.state as 'open' | 'closed'),
      sourceBranch: pr.head.ref,
      targetBranch: pr.base.ref,
      title: pr.title,
      executionId: '', // Would need to parse from branch name
      createdAt: new Date(pr.created_at),
      mergedAt: pr.merged_at ? new Date(pr.merged_at) : undefined,
    };
  }

  /**
   * Delete a branch
   */
  async deleteBranch(owner: string, repo: string, branch: string): Promise<void> {
    if (!this.initialized) {
      await this.initialize();
    }

    const installation = this.getInstallationForRepo(owner, repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${repo}`);
    }

    const octokit = await this.getInstallationOctokit(installation.installationId);

    await octokit.git.deleteRef({
      owner,
      repo,
      ref: `heads/${branch}`,
    });

    this.log('info', { owner, repo, branch }, 'Branch deleted');
  }

  /**
   * List all managed branches for a repo
   */
  async listManagedBranches(
    owner: string,
    repo: string,
    prefix = 'parallax/'
  ): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const installation = this.getInstallationForRepo(owner, repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${repo}`);
    }

    const octokit = await this.getInstallationOctokit(installation.installationId);

    const branches: string[] = [];
    let page = 1;

    while (true) {
      const { data } = await octokit.repos.listBranches({
        owner,
        repo,
        per_page: 100,
        page,
      });

      if (data.length === 0) break;

      for (const branch of data) {
        if (branch.name.startsWith(prefix)) {
          branches.push(branch.name);
        }
      }

      page++;
    }

    return branches;
  }

  // ─────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async getInstallationOctokit(installationId: number): Promise<any> {
    if (!this.installationOctokits.has(installationId)) {
      const { Octokit, createAppAuth } = loadOctokit();

      const octokit = new Octokit({
        authStrategy: createAppAuth,
        auth: {
          appId: this.config.appId,
          privateKey: this.config.privateKey,
          installationId,
        },
        baseUrl: this.config.baseUrl,
      });

      this.installationOctokits.set(installationId, octokit);
    }

    return this.installationOctokits.get(installationId)!;
  }

  private parseRepo(repo: string): { owner: string; repo: string } | null {
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

  private log(
    level: 'info' | 'warn' | 'error' | 'debug',
    data: Record<string, unknown>,
    message: string
  ): void {
    if (this.logger) {
      this.logger[level](data, message);
    }
  }
}

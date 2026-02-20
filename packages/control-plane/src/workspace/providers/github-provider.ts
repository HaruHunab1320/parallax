/**
 * GitHub Provider
 *
 * Handles GitHub App authentication and API operations.
 */

import { Octokit } from '@octokit/rest';
import { createAppAuth } from '@octokit/auth-app';
import { Logger } from 'pino';
import type {
  GitCredential,
  GitHubAppConfig,
  GitHubAppInstallation,
  PullRequestInfo,
} from 'git-workspace-service';
import { randomUUID } from 'crypto';

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

export class GitHubProvider {
  private appOctokit: Octokit;
  private installations: Map<string, GitHubAppInstallation> = new Map();
  private installationOctokits: Map<number, Octokit> = new Map();

  constructor(
    private readonly config: GitHubProviderConfig,
    private readonly logger: Logger
  ) {
    // Create app-level Octokit for installation management
    this.appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: {
        appId: config.appId,
        privateKey: config.privateKey,
      },
      baseUrl: config.baseUrl,
    });
  }

  /**
   * Initialize provider - fetch all installations
   */
  async initialize(): Promise<void> {
    this.logger.info('Initializing GitHub provider');

    try {
      const { data: installations } = await this.appOctokit.apps.listInstallations();

      for (const installation of installations) {
        await this.registerInstallation(installation.id);
      }

      this.logger.info(
        { installationCount: installations.length },
        'GitHub provider initialized'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize GitHub provider');
      throw error;
    }
  }

  /**
   * Register an installation (called on webhook or init)
   */
  async registerInstallation(installationId: number): Promise<GitHubAppInstallation> {
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
      const account = installation.account as { login?: string; type?: string; slug?: string } | null;
      const accountLogin = account?.login || account?.slug || 'unknown';
      const accountType = account?.type === 'Organization' ? 'Organization' : 'User';

      const appInstallation: GitHubAppInstallation = {
        installationId,
        accountLogin,
        accountType,
        repositories: repos.repositories?.map((r) => r.full_name) || [],
        permissions: installation.permissions as Record<string, string>,
      };

      this.installations.set(appInstallation.accountLogin, appInstallation);

      this.logger.info(
        {
          installationId,
          account: appInstallation.accountLogin,
          repoCount: appInstallation.repositories.length,
        },
        'Installation registered'
      );

      return appInstallation;
    } catch (error) {
      this.logger.error({ installationId, error }, 'Failed to register installation');
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
   * Get credentials for a repository
   */
  async getCredentials(
    owner: string,
    repo: string,
    access: 'read' | 'write',
    ttlSeconds: number = 3600
  ): Promise<GitCredential> {
    const installation = this.getInstallationForRepo(owner, repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${repo}`);
    }

    // Get installation access token
    const octokit = await this.getInstallationOctokit(installation.installationId);

    // The token is already available from the auth strategy
    // For explicit token, we'd use createAppAuth directly
    const auth = createAppAuth({
      appId: this.config.appId,
      privateKey: this.config.privateKey,
    });

    const { token, expiresAt } = await auth({
      type: 'installation',
      installationId: installation.installationId,
      repositoryNames: [repo],
      permissions: access === 'write'
        ? { contents: 'write', pull_requests: 'write', metadata: 'read' }
        : { contents: 'read', metadata: 'read' },
    });

    return {
      id: randomUUID(),
      type: 'github_app',
      token,
      repo: `${owner}/${repo}`,
      permissions: access === 'write'
        ? ['contents:write', 'pull_requests:write', 'metadata:read']
        : ['contents:read', 'metadata:read'],
      expiresAt: expiresAt ? new Date(expiresAt) : new Date(Date.now() + ttlSeconds * 1000),
      provider: 'github',
    };
  }

  /**
   * Create a pull request
   */
  async createPullRequest(
    owner: string,
    repo: string,
    options: {
      title: string;
      body: string;
      head: string;
      base: string;
      draft?: boolean;
    }
  ): Promise<PullRequestInfo> {
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

    this.logger.info(
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
   * Add labels to a pull request
   */
  async addLabels(
    owner: string,
    repo: string,
    prNumber: number,
    labels: string[]
  ): Promise<void> {
    const installation = this.getInstallationForRepo(owner, repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${repo}`);
    }

    const octokit = await this.getInstallationOctokit(installation.installationId);

    await octokit.issues.addLabels({
      owner,
      repo,
      issue_number: prNumber,
      labels,
    });
  }

  /**
   * Request reviewers for a pull request
   */
  async requestReviewers(
    owner: string,
    repo: string,
    prNumber: number,
    reviewers: string[]
  ): Promise<void> {
    const installation = this.getInstallationForRepo(owner, repo);
    if (!installation) {
      throw new Error(`No GitHub App installation found for ${owner}/${repo}`);
    }

    const octokit = await this.getInstallationOctokit(installation.installationId);

    await octokit.pulls.requestReviewers({
      owner,
      repo,
      pull_number: prNumber,
      reviewers,
    });
  }

  /**
   * Get pull request status
   */
  async getPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<PullRequestInfo> {
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

    this.logger.info({ owner, repo, branch }, 'Branch deleted');
  }

  /**
   * List all Parallax branches for a repo
   */
  async listParallaxBranches(owner: string, repo: string): Promise<string[]> {
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
        if (branch.name.startsWith('parallax/')) {
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

  private async getInstallationOctokit(installationId: number): Promise<Octokit> {
    if (!this.installationOctokits.has(installationId)) {
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
}

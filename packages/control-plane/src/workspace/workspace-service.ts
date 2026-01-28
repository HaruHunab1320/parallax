/**
 * Workspace Service
 *
 * Provisions and manages git workspaces for agent tasks.
 * Handles cloning, branching, and PR creation.
 */

import { Logger } from 'pino';
import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import {
  Workspace,
  WorkspaceConfig,
  WorkspaceFinalization,
  BranchInfo,
  PullRequestInfo,
} from './types';
import { CredentialService } from './credential-service';
import {
  generateBranchName,
  createBranchInfo,
  generateSlug,
  filterBranchesByExecution,
} from './branch-naming';

const execAsync = promisify(exec);

export interface WorkspaceServiceConfig {
  /**
   * Base directory for workspaces
   */
  workspacesDir: string;

  /**
   * Whether to clean up workspaces automatically after TTL
   */
  autoCleanup?: boolean;

  /**
   * TTL for workspaces in seconds
   */
  workspaceTtlSeconds?: number;
}

export class WorkspaceService {
  private workspaces: Map<string, Workspace> = new Map();
  private readonly workspacesDir: string;

  constructor(
    private readonly config: WorkspaceServiceConfig,
    private readonly credentialService: CredentialService,
    private readonly logger: Logger
  ) {
    this.workspacesDir = config.workspacesDir;
  }

  /**
   * Initialize the workspace service
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.workspacesDir, { recursive: true });
    this.logger.info({ workspacesDir: this.workspacesDir }, 'Workspace service initialized');
  }

  /**
   * Provision a new workspace for a task
   */
  async provision(config: WorkspaceConfig): Promise<Workspace> {
    const workspaceId = randomUUID();

    this.logger.info(
      {
        workspaceId,
        repo: config.repo,
        executionId: config.execution.id,
        role: config.task.role,
      },
      'Provisioning workspace'
    );

    // Create workspace directory
    const workspacePath = path.join(this.workspacesDir, workspaceId);
    await fs.mkdir(workspacePath, { recursive: true });

    // Get credentials
    const credential = await this.credentialService.getCredentials({
      repo: config.repo,
      access: 'write',
      context: {
        executionId: config.execution.id,
        taskId: config.task.id,
        userId: config.user?.id,
        reason: `Workspace for ${config.task.role} in ${config.execution.patternName}`,
      },
    });

    // Generate branch name
    const slug = config.task.slug || generateSlug(config.task.role);
    const branchInfo = createBranchInfo({
      executionId: config.execution.id,
      role: config.task.role,
      slug,
      baseBranch: config.baseBranch,
    });

    // Create workspace object
    const workspace: Workspace = {
      id: workspaceId,
      path: workspacePath,
      repo: config.repo,
      branch: branchInfo,
      credential,
      provisionedAt: new Date(),
      status: 'provisioning',
    };

    this.workspaces.set(workspaceId, workspace);

    try {
      // Clone repository
      await this.cloneRepo(workspace, credential.token);

      // Create and checkout branch
      await this.createBranch(workspace);

      // Configure git for this workspace
      await this.configureGit(workspace);

      workspace.status = 'ready';
      this.workspaces.set(workspaceId, workspace);

      this.logger.info(
        {
          workspaceId,
          path: workspacePath,
          branch: branchInfo.name,
        },
        'Workspace provisioned'
      );

      return workspace;
    } catch (error) {
      workspace.status = 'error';
      this.workspaces.set(workspaceId, workspace);

      this.logger.error(
        { workspaceId, error },
        'Failed to provision workspace'
      );

      throw error;
    }
  }

  /**
   * Finalize a workspace (push, create PR, cleanup)
   */
  async finalize(
    workspaceId: string,
    options: WorkspaceFinalization
  ): Promise<PullRequestInfo | void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    workspace.status = 'finalizing';
    this.workspaces.set(workspaceId, workspace);

    this.logger.info(
      {
        workspaceId,
        push: options.push,
        createPr: options.createPr,
      },
      'Finalizing workspace'
    );

    let pr: PullRequestInfo | undefined;

    try {
      if (options.push) {
        await this.pushBranch(workspace);
      }

      if (options.createPr && options.pr) {
        pr = await this.createPullRequest(workspace, options.pr);
        workspace.branch.pullRequest = pr;
      }

      if (options.cleanup) {
        await this.cleanup(workspaceId);
      } else {
        workspace.status = 'ready';
        this.workspaces.set(workspaceId, workspace);
      }

      return pr;
    } catch (error) {
      this.logger.error({ workspaceId, error }, 'Failed to finalize workspace');
      throw error;
    }
  }

  /**
   * Get a workspace by ID
   */
  get(workspaceId: string): Workspace | null {
    return this.workspaces.get(workspaceId) || null;
  }

  /**
   * Get all workspaces for an execution
   */
  getForExecution(executionId: string): Workspace[] {
    return Array.from(this.workspaces.values()).filter(
      (w) => w.branch.executionId === executionId
    );
  }

  /**
   * Clean up a workspace
   */
  async cleanup(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return;
    }

    this.logger.info({ workspaceId }, 'Cleaning up workspace');

    // Revoke credentials
    await this.credentialService.revokeCredential(workspace.credential.id);

    // Remove workspace directory
    try {
      await fs.rm(workspace.path, { recursive: true, force: true });
    } catch (error) {
      this.logger.warn({ workspaceId, error }, 'Failed to remove workspace directory');
    }

    workspace.status = 'cleaned_up';
    this.workspaces.set(workspaceId, workspace);
  }

  /**
   * Clean up all workspaces for an execution
   */
  async cleanupForExecution(executionId: string): Promise<void> {
    const workspaces = this.getForExecution(executionId);
    await Promise.all(workspaces.map((w) => this.cleanup(w.id)));

    // Also revoke all credentials for this execution
    await this.credentialService.revokeForExecution(executionId);
  }

  // ─────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────

  private async cloneRepo(workspace: Workspace, token: string): Promise<void> {
    // Build authenticated URL
    const authUrl = this.buildAuthenticatedUrl(workspace.repo, token);

    // Clone with depth 1 for speed
    await this.execInDir(workspace.path, `git clone --depth 1 --branch ${workspace.branch.baseBranch} ${authUrl} .`);
  }

  private async createBranch(workspace: Workspace): Promise<void> {
    // Create and checkout the new branch
    await this.execInDir(workspace.path, `git checkout -b ${workspace.branch.name}`);
  }

  private async configureGit(workspace: Workspace): Promise<void> {
    // Configure git identity
    await this.execInDir(workspace.path, 'git config user.name "Parallax Agent"');
    await this.execInDir(workspace.path, 'git config user.email "agent@parallax.io"');

    // Configure credential helper (uses our service)
    // TODO: Implement credential helper script
  }

  private async pushBranch(workspace: Workspace): Promise<void> {
    const token = workspace.credential.token;
    const authUrl = this.buildAuthenticatedUrl(workspace.repo, token);

    await this.execInDir(workspace.path, `git push -u ${authUrl} ${workspace.branch.name}`);
  }

  private async createPullRequest(
    workspace: Workspace,
    config: NonNullable<WorkspaceFinalization['pr']>
  ): Promise<PullRequestInfo> {
    // Parse repo to get owner/repo
    const repoInfo = this.parseRepo(workspace.repo);
    if (!repoInfo) {
      throw new Error(`Invalid repository format: ${workspace.repo}`);
    }

    // Get GitHub provider from credential service
    const githubProvider = this.credentialService.getGitHubProvider();
    if (!githubProvider) {
      throw new Error('GitHub provider not configured');
    }

    // Create the PR
    const pr = await githubProvider.createPullRequest(
      repoInfo.owner,
      repoInfo.repo,
      {
        title: config.title,
        body: config.body,
        head: workspace.branch.name,
        base: config.targetBranch,
        draft: config.draft,
      }
    );

    // Add labels if specified
    if (config.labels && config.labels.length > 0) {
      await githubProvider.addLabels(
        repoInfo.owner,
        repoInfo.repo,
        pr.number,
        config.labels
      );
    }

    // Request reviewers if specified
    if (config.reviewers && config.reviewers.length > 0) {
      await githubProvider.requestReviewers(
        repoInfo.owner,
        repoInfo.repo,
        pr.number,
        config.reviewers
      );
    }

    // Set execution ID
    pr.executionId = workspace.branch.executionId;

    this.logger.info(
      {
        workspaceId: workspace.id,
        prNumber: pr.number,
        prUrl: pr.url,
      },
      'Pull request created'
    );

    return pr;
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

  private buildAuthenticatedUrl(repo: string, token: string): string {
    // Handle various repo formats
    let url = repo;

    // Convert SSH to HTTPS
    if (url.startsWith('git@github.com:')) {
      url = url.replace('git@github.com:', 'https://github.com/');
    }

    // Add .git if missing
    if (!url.endsWith('.git')) {
      url = `${url}.git`;
    }

    // Ensure HTTPS
    if (!url.startsWith('https://')) {
      url = `https://${url}`;
    }

    // Insert token
    url = url.replace('https://', `https://x-access-token:${token}@`);

    return url;
  }

  private async execInDir(dir: string, command: string): Promise<string> {
    // Mask tokens in logs
    const safeCommand = command.replace(/x-access-token:[^@]+@/g, 'x-access-token:***@');
    this.logger.debug({ dir, command: safeCommand }, 'Executing git command');

    const { stdout, stderr } = await execAsync(command, { cwd: dir });

    if (stderr && !stderr.includes('Cloning into')) {
      this.logger.debug({ stderr: stderr.substring(0, 200) }, 'Git stderr');
    }

    return stdout;
  }
}

/**
 * Workspace Service
 *
 * Provisions and manages git workspaces for agent tasks.
 * Handles cloning, branching, and PR creation.
 */

import { randomUUID } from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import type {
  Workspace,
  WorkspaceConfig,
  WorkspaceFinalization,
  PullRequestInfo,
  WorkspaceServiceConfig,
  WorkspaceEvent,
  WorkspaceEventHandler,
} from './types';
import { CredentialService } from './credential-service';
import { createBranchInfo } from './utils/branch-naming';
import {
  configureCredentialHelper,
  cleanupCredentialFiles,
  getGitCredentialConfig,
  type CredentialHelperContext,
} from './utils/git-credential-helper';

const execAsync = promisify(exec);

export interface WorkspaceServiceLogger {
  info(data: Record<string, unknown>, message: string): void;
  warn(data: Record<string, unknown>, message: string): void;
  error(data: Record<string, unknown>, message: string): void;
  debug(data: Record<string, unknown>, message: string): void;
}

export interface WorkspaceServiceOptions {
  /**
   * Configuration
   */
  config: WorkspaceServiceConfig;

  /**
   * Credential service for managing git credentials
   */
  credentialService: CredentialService;

  /**
   * Optional logger
   */
  logger?: WorkspaceServiceLogger;
}

export class WorkspaceService {
  private workspaces: Map<string, Workspace> = new Map();
  private readonly baseDir: string;
  private readonly branchPrefix: string;
  private readonly credentialService: CredentialService;
  private readonly logger?: WorkspaceServiceLogger;
  private readonly eventHandlers: Set<WorkspaceEventHandler> = new Set();

  constructor(options: WorkspaceServiceOptions) {
    this.baseDir = options.config.baseDir;
    this.branchPrefix = options.config.branchPrefix || 'parallax';
    this.credentialService = options.credentialService;
    this.logger = options.logger;
  }

  /**
   * Initialize the workspace service
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.baseDir, { recursive: true });
    this.log('info', { baseDir: this.baseDir }, 'Workspace service initialized');
  }

  /**
   * Register an event handler
   */
  onEvent(handler: WorkspaceEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Provision a new workspace for a task
   */
  async provision(config: WorkspaceConfig): Promise<Workspace> {
    const workspaceId = randomUUID();

    this.log(
      'info',
      {
        workspaceId,
        repo: config.repo,
        executionId: config.execution.id,
        role: config.task.role,
      },
      'Provisioning workspace'
    );

    await this.emitEvent({
      type: 'workspace:provisioning',
      workspaceId,
      executionId: config.execution.id,
      timestamp: new Date(),
    });

    // Create workspace directory
    const workspacePath = path.join(this.baseDir, workspaceId);
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
      // Pass user-provided credentials if available
      userProvided: config.userCredentials,
    });

    await this.emitEvent({
      type: 'credential:granted',
      workspaceId,
      credentialId: credential.id,
      executionId: config.execution.id,
      timestamp: new Date(),
    });

    // Generate branch name
    const branchInfo = createBranchInfo(
      {
        executionId: config.execution.id,
        role: config.task.role,
        slug: config.task.slug,
        baseBranch: config.baseBranch,
      },
      { prefix: this.branchPrefix }
    );

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

      this.log(
        'info',
        {
          workspaceId,
          path: workspacePath,
          branch: branchInfo.name,
        },
        'Workspace provisioned'
      );

      await this.emitEvent({
        type: 'workspace:ready',
        workspaceId,
        executionId: config.execution.id,
        timestamp: new Date(),
      });

      return workspace;
    } catch (error) {
      workspace.status = 'error';
      this.workspaces.set(workspaceId, workspace);

      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', { workspaceId, error: errorMessage }, 'Failed to provision workspace');

      await this.emitEvent({
        type: 'workspace:error',
        workspaceId,
        executionId: config.execution.id,
        timestamp: new Date(),
        error: errorMessage,
      });

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

    this.log(
      'info',
      {
        workspaceId,
        push: options.push,
        createPr: options.createPr,
      },
      'Finalizing workspace'
    );

    await this.emitEvent({
      type: 'workspace:finalizing',
      workspaceId,
      executionId: workspace.branch.executionId,
      timestamp: new Date(),
    });

    let pr: PullRequestInfo | undefined;

    try {
      if (options.push) {
        await this.pushBranch(workspace);
      }

      if (options.createPr && options.pr) {
        pr = await this.createPullRequest(workspace, options.pr);
        workspace.branch.pullRequest = pr;

        await this.emitEvent({
          type: 'pr:created',
          workspaceId,
          executionId: workspace.branch.executionId,
          timestamp: new Date(),
          data: {
            prNumber: pr.number,
            prUrl: pr.url,
          },
        });
      }

      if (options.cleanup) {
        await this.cleanup(workspaceId);
      } else {
        workspace.status = 'ready';
        this.workspaces.set(workspaceId, workspace);
      }

      return pr;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('error', { workspaceId, error: errorMessage }, 'Failed to finalize workspace');
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

    this.log('info', { workspaceId }, 'Cleaning up workspace');

    // Clean up credential files first (securely remove tokens)
    try {
      await cleanupCredentialFiles(workspace.path);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('warn', { workspaceId, error: errorMessage }, 'Failed to clean up credential files');
    }

    // Revoke credentials
    await this.credentialService.revokeCredential(workspace.credential.id);

    await this.emitEvent({
      type: 'credential:revoked',
      workspaceId,
      credentialId: workspace.credential.id,
      executionId: workspace.branch.executionId,
      timestamp: new Date(),
    });

    // Remove workspace directory
    try {
      await fs.rm(workspace.path, { recursive: true, force: true });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('warn', { workspaceId, error: errorMessage }, 'Failed to remove workspace directory');
    }

    workspace.status = 'cleaned_up';
    this.workspaces.set(workspaceId, workspace);

    await this.emitEvent({
      type: 'workspace:cleaned_up',
      workspaceId,
      executionId: workspace.branch.executionId,
      timestamp: new Date(),
    });
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
    // For SSH credentials (empty token), use the URL as-is
    // For token-based auth, build authenticated HTTPS URL
    const cloneUrl = token
      ? this.buildAuthenticatedUrl(workspace.repo, token)
      : workspace.repo;

    // Clone with depth 1 for speed
    await this.execInDir(
      workspace.path,
      `git clone --depth 1 --branch ${workspace.branch.baseBranch} ${cloneUrl} .`
    );
  }

  private async createBranch(workspace: Workspace): Promise<void> {
    // Create and checkout the new branch
    await this.execInDir(workspace.path, `git checkout -b ${workspace.branch.name}`);
  }

  private async configureGit(workspace: Workspace): Promise<void> {
    // Configure git identity
    await this.execInDir(workspace.path, 'git config user.name "Workspace Agent"');
    await this.execInDir(workspace.path, 'git config user.email "agent@workspace.local"');

    // Skip credential helper for SSH-based auth (no token = SSH)
    if (!workspace.credential.token) {
      this.log(
        'debug',
        { workspaceId: workspace.id },
        'Using SSH authentication, skipping credential helper'
      );
      return;
    }

    // Configure credential helper for token-based auth
    const credentialContext: CredentialHelperContext = {
      workspaceId: workspace.id,
      executionId: workspace.branch.executionId,
      repo: workspace.repo,
      token: workspace.credential.token,
      expiresAt: workspace.credential.expiresAt.toISOString(),
    };

    const helperScriptPath = await configureCredentialHelper(
      workspace.path,
      credentialContext
    );

    // Configure git to use our credential helper
    const configCommands = getGitCredentialConfig(helperScriptPath);
    for (const cmd of configCommands) {
      await this.execInDir(workspace.path, cmd);
    }

    this.log(
      'debug',
      { workspaceId: workspace.id, helperPath: helperScriptPath },
      'Git credential helper configured'
    );
  }

  private async pushBranch(workspace: Workspace): Promise<void> {
    // Push using origin remote - credentials provided by helper
    await this.execInDir(workspace.path, `git push -u origin ${workspace.branch.name}`);
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

    // Get provider from credential service
    const provider = this.credentialService.getProvider(workspace.credential.provider);
    if (!provider) {
      throw new Error(`Provider not configured: ${workspace.credential.provider}`);
    }

    // Create the PR
    const pr = await provider.createPullRequest({
      repo: workspace.repo,
      sourceBranch: workspace.branch.name,
      targetBranch: config.targetBranch,
      title: config.title,
      body: config.body,
      draft: config.draft,
      labels: config.labels,
      reviewers: config.reviewers,
      credential: workspace.credential,
    });

    // Set execution ID
    pr.executionId = workspace.branch.executionId;

    this.log(
      'info',
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
    const patterns = [/github\.com[/:]([^/]+)\/([^/.]+)/, /^([^/]+)\/([^/]+)$/];

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
    this.log('debug', { dir, command: safeCommand }, 'Executing git command');

    const { stdout, stderr } = await execAsync(command, { cwd: dir });

    if (stderr && !stderr.includes('Cloning into')) {
      this.log('debug', { stderr: stderr.substring(0, 200) }, 'Git stderr');
    }

    return stdout;
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

  private async emitEvent(event: WorkspaceEvent): Promise<void> {
    for (const handler of this.eventHandlers) {
      try {
        await handler(event);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('warn', { event: event.type, error: errorMessage }, 'Event handler error');
      }
    }
  }
}

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
  WorkspaceStrategy,
  WorkspacePhase,
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
    const strategy: WorkspaceStrategy = config.strategy || 'clone';

    // Validate worktree config
    if (strategy === 'worktree') {
      if (!config.parentWorkspace) {
        throw new Error('parentWorkspace is required when strategy is "worktree"');
      }
      const parent = this.workspaces.get(config.parentWorkspace);
      if (!parent) {
        throw new Error(`Parent workspace not found: ${config.parentWorkspace}`);
      }
      if (parent.strategy !== 'clone') {
        throw new Error('Parent workspace must be a clone, not a worktree');
      }
      if (parent.repo !== config.repo) {
        throw new Error('Worktree must be for the same repository as parent');
      }
    }

    const workspaceId = randomUUID();

    this.log(
      'info',
      {
        workspaceId,
        repo: config.repo,
        executionId: config.execution.id,
        role: config.task.role,
        strategy,
      },
      'Provisioning workspace'
    );

    await this.emitEvent({
      type: 'workspace:provisioning',
      workspaceId,
      executionId: config.execution.id,
      timestamp: new Date(),
    });

    // Create workspace directory (for clone) or use worktree path
    const workspacePath = path.join(this.baseDir, workspaceId);

    // Get credentials (or reuse parent's for worktree)
    // For public repos, we try unauthenticated clone first
    let credential;

    if (strategy === 'worktree' && config.parentWorkspace) {
      const parent = this.workspaces.get(config.parentWorkspace)!;
      credential = parent.credential;
    } else {
      await fs.mkdir(workspacePath, { recursive: true });

      // If user provided credentials, use them
      if (config.userCredentials) {
        credential = await this.credentialService.getCredentials({
          repo: config.repo,
          access: 'write',
          context: {
            executionId: config.execution.id,
            taskId: config.task.id,
            userId: config.user?.id,
            reason: `Workspace for ${config.task.role} in ${config.execution.patternName}`,
          },
          userProvided: config.userCredentials,
        });
      }
      // Otherwise, we'll try unauthenticated first (handled in cloneRepo)

      if (credential) {
        await this.emitEvent({
          type: 'credential:granted',
          workspaceId,
          credentialId: credential.id,
          executionId: config.execution.id,
          timestamp: new Date(),
        });
      }
    }

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

    // Create workspace object (credential may be set later for public repos)
    const workspace: Workspace = {
      id: workspaceId,
      path: workspacePath,
      repo: config.repo,
      branch: branchInfo,
      credential: credential!,  // Will be set before any write operations
      provisionedAt: new Date(),
      status: 'provisioning',
      strategy,
      parentWorkspaceId: config.parentWorkspace,
      onComplete: config.onComplete,
      progress: {
        phase: 'initializing',
        message: 'Initializing workspace',
        updatedAt: new Date(),
      },
    };

    this.workspaces.set(workspaceId, workspace);

    try {
      if (strategy === 'clone') {
        // Clone repository
        this.updateProgress(workspace, 'cloning', 'Cloning repository');

        // Try unauthenticated clone first for public repos
        if (!credential) {
          const cloneResult = await this.tryUnauthenticatedClone(workspace);
          if (!cloneResult.success) {
            // Unauthenticated clone failed, need credentials
            this.log(
              'info',
              { workspaceId, error: cloneResult.error },
              'Unauthenticated clone failed, requesting credentials'
            );

            credential = await this.credentialService.getCredentials({
              repo: config.repo,
              access: 'write',
              context: {
                executionId: config.execution.id,
                taskId: config.task.id,
                userId: config.user?.id,
                reason: `Workspace for ${config.task.role} in ${config.execution.patternName}`,
              },
            });

            workspace.credential = credential;
            this.workspaces.set(workspaceId, workspace);

            await this.emitEvent({
              type: 'credential:granted',
              workspaceId,
              credentialId: credential.id,
              executionId: config.execution.id,
              timestamp: new Date(),
            });

            // Now clone with credentials
            await this.cloneRepo(workspace, credential.token);
          }
          // else: unauthenticated clone succeeded, credential stays undefined
        } else {
          // We have credentials (user-provided or worktree parent)
          await this.cloneRepo(workspace, credential.token);
        }

        // Create and checkout branch
        this.updateProgress(workspace, 'creating_branch', 'Creating branch');
        await this.createBranch(workspace);
      } else {
        // Add worktree from parent
        const parent = this.workspaces.get(config.parentWorkspace!)!;
        await this.addWorktreeFromParent(parent, workspace);

        // Track worktree in parent
        if (!parent.worktreeIds) {
          parent.worktreeIds = [];
        }
        parent.worktreeIds.push(workspaceId);
        this.workspaces.set(parent.id, parent);

        await this.emitEvent({
          type: 'worktree:added',
          workspaceId,
          executionId: config.execution.id,
          timestamp: new Date(),
          data: { parentWorkspaceId: parent.id },
        });
      }

      // Configure git for this workspace
      this.updateProgress(workspace, 'configuring', 'Configuring git');
      await this.configureGit(workspace);

      // Mark as ready
      workspace.status = 'ready';
      this.updateProgress(workspace, 'ready', 'Workspace ready');
      this.workspaces.set(workspaceId, workspace);

      // Execute completion hook if configured
      await this.executeCompletionHook(workspace, 'success');

      this.log(
        'info',
        {
          workspaceId,
          path: workspacePath,
          branch: branchInfo.name,
          strategy,
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
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateProgress(workspace, 'error', errorMessage);
      this.workspaces.set(workspaceId, workspace);

      this.log('error', { workspaceId, error: errorMessage }, 'Failed to provision workspace');

      await this.emitEvent({
        type: 'workspace:error',
        workspaceId,
        executionId: config.execution.id,
        timestamp: new Date(),
        error: errorMessage,
      });

      // Execute completion hook on error if configured
      await this.executeCompletionHook(workspace, 'error');

      throw error;
    }
  }

  /**
   * Add a worktree to an existing clone workspace (convenience method)
   */
  async addWorktree(
    parentWorkspaceId: string,
    options: {
      branch: string;
      execution: { id: string; patternName: string };
      task: { id: string; role: string; slug?: string };
    }
  ): Promise<Workspace> {
    const parent = this.workspaces.get(parentWorkspaceId);
    if (!parent) {
      throw new Error(`Parent workspace not found: ${parentWorkspaceId}`);
    }

    return this.provision({
      repo: parent.repo,
      strategy: 'worktree',
      parentWorkspace: parentWorkspaceId,
      branchStrategy: 'feature_branch',
      baseBranch: options.branch,
      execution: options.execution,
      task: options.task,
    });
  }

  /**
   * List all worktrees for a parent workspace
   */
  listWorktrees(parentWorkspaceId: string): Workspace[] {
    const parent = this.workspaces.get(parentWorkspaceId);
    if (!parent) {
      return [];
    }

    if (!parent.worktreeIds || parent.worktreeIds.length === 0) {
      return [];
    }

    return parent.worktreeIds
      .map((id) => this.workspaces.get(id))
      .filter((w): w is Workspace => w !== undefined);
  }

  /**
   * Remove a worktree (alias for cleanup with worktree-specific handling)
   */
  async removeWorktree(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (!workspace) {
      return;
    }

    if (workspace.strategy !== 'worktree') {
      throw new Error('Workspace is not a worktree. Use cleanup() instead.');
    }

    await this.cleanup(workspaceId);
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

    this.log('info', { workspaceId, strategy: workspace.strategy }, 'Cleaning up workspace');

    // If this is a clone with worktrees, clean up worktrees first
    if (workspace.strategy === 'clone' && workspace.worktreeIds?.length) {
      this.log(
        'info',
        { workspaceId, worktreeCount: workspace.worktreeIds.length },
        'Cleaning up child worktrees first'
      );
      for (const worktreeId of workspace.worktreeIds) {
        await this.cleanup(worktreeId);
      }
    }

    // Clean up credential files first (securely remove tokens)
    try {
      await cleanupCredentialFiles(workspace.path);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.log('warn', { workspaceId, error: errorMessage }, 'Failed to clean up credential files');
    }

    // Handle worktree removal via git
    if (workspace.strategy === 'worktree' && workspace.parentWorkspaceId) {
      const parent = this.workspaces.get(workspace.parentWorkspaceId);
      if (parent) {
        try {
          // Remove worktree using git command from parent
          await this.execInDir(parent.path, `git worktree remove "${workspace.path}" --force`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.log('warn', { workspaceId, error: errorMessage }, 'Failed to remove worktree via git');
        }

        // Remove from parent's worktreeIds
        if (parent.worktreeIds) {
          parent.worktreeIds = parent.worktreeIds.filter((id) => id !== workspaceId);
          this.workspaces.set(parent.id, parent);
        }

        await this.emitEvent({
          type: 'worktree:removed',
          workspaceId,
          executionId: workspace.branch.executionId,
          timestamp: new Date(),
          data: { parentWorkspaceId: parent.id },
        });
      }
    }

    // Revoke credentials (only for clone workspaces with credentials - worktrees share parent's credential)
    if (workspace.strategy === 'clone' && workspace.credential) {
      await this.credentialService.revokeCredential(workspace.credential.id);

      await this.emitEvent({
        type: 'credential:revoked',
        workspaceId,
        credentialId: workspace.credential.id,
        executionId: workspace.branch.executionId,
        timestamp: new Date(),
      });
    }

    // Remove workspace directory (for clones or if worktree removal failed)
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

  /**
   * Try to clone a public repository without authentication
   */
  private async tryUnauthenticatedClone(
    workspace: Workspace
  ): Promise<{ success: boolean; error?: string }> {
    // Build HTTPS URL without auth
    let cloneUrl = workspace.repo;

    // Convert SSH to HTTPS
    if (cloneUrl.startsWith('git@github.com:')) {
      cloneUrl = cloneUrl.replace('git@github.com:', 'https://github.com/');
    }

    // Add .git if missing
    if (!cloneUrl.endsWith('.git')) {
      cloneUrl = `${cloneUrl}.git`;
    }

    // Ensure HTTPS
    if (!cloneUrl.startsWith('https://')) {
      cloneUrl = `https://${cloneUrl}`;
    }

    try {
      await this.execInDir(
        workspace.path,
        `git clone --depth 1 --branch ${workspace.branch.baseBranch} ${cloneUrl} .`
      );
      this.log('info', { workspaceId: workspace.id }, 'Public repository cloned without authentication');
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Check if it's an auth error (401/403) or repo not found
      const isAuthError =
        errorMessage.includes('401') ||
        errorMessage.includes('403') ||
        errorMessage.includes('Authentication failed') ||
        errorMessage.includes('could not read Username') ||
        errorMessage.includes('terminal prompts disabled');

      if (isAuthError) {
        return { success: false, error: 'Authentication required' };
      }

      // For other errors (repo not found, network issues), throw
      throw error;
    }
  }

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

  private async addWorktreeFromParent(parent: Workspace, workspace: Workspace): Promise<void> {
    // Fetch the base branch first to ensure it's up to date
    try {
      await this.execInDir(parent.path, `git fetch origin ${workspace.branch.baseBranch}`);
    } catch {
      // May fail if already fetched or in shallow clone, continue anyway
    }

    // Create the worktree with a new branch based on the base branch
    // Use -b to create the new branch at the same time
    await this.execInDir(
      parent.path,
      `git worktree add -b ${workspace.branch.name} "${workspace.path}" origin/${workspace.branch.baseBranch}`
    );
  }

  private async configureGit(workspace: Workspace): Promise<void> {
    // Configure git identity
    await this.execInDir(workspace.path, 'git config user.name "Workspace Agent"');
    await this.execInDir(workspace.path, 'git config user.email "agent@workspace.local"');

    // Skip credential helper if no credentials (public repo) or SSH-based auth (no token)
    if (!workspace.credential || !workspace.credential.token) {
      this.log(
        'debug',
        { workspaceId: workspace.id },
        workspace.credential
          ? 'Using SSH authentication, skipping credential helper'
          : 'No credentials (public repo), skipping credential helper'
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
    // Push requires credentials
    if (!workspace.credential) {
      throw new Error(
        'Push requires authentication. This workspace was cloned from a public repository without credentials.'
      );
    }

    // Push using origin remote - credentials provided by helper
    await this.execInDir(workspace.path, `git push -u origin ${workspace.branch.name}`);
  }

  private async createPullRequest(
    workspace: Workspace,
    config: NonNullable<WorkspaceFinalization['pr']>
  ): Promise<PullRequestInfo> {
    // PR creation requires credentials
    if (!workspace.credential) {
      throw new Error(
        'Pull request creation requires authentication. This workspace was cloned from a public repository without credentials.'
      );
    }

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

  /**
   * Update workspace progress
   */
  private updateProgress(workspace: Workspace, phase: WorkspacePhase, message?: string): void {
    workspace.progress = {
      phase,
      message,
      updatedAt: new Date(),
    };
    this.workspaces.set(workspace.id, workspace);

    this.log(
      'debug',
      { workspaceId: workspace.id, phase, message },
      'Progress updated'
    );
  }

  /**
   * Execute completion hook if configured
   */
  private async executeCompletionHook(
    workspace: Workspace,
    status: 'success' | 'error'
  ): Promise<void> {
    const hook = workspace.onComplete;
    if (!hook) return;

    // Check if we should run on error
    if (status === 'error' && hook.runOnError === false) {
      return;
    }

    // Set up environment variables for command
    const env = {
      ...process.env,
      WORKSPACE_ID: workspace.id,
      REPO: workspace.repo,
      BRANCH: workspace.branch.name,
      STATUS: status,
      WORKSPACE_PATH: workspace.path,
    };

    // Execute command if configured
    if (hook.command) {
      try {
        this.log('info', { workspaceId: workspace.id, command: hook.command }, 'Executing completion hook command');
        await execAsync(hook.command, { env });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('warn', { workspaceId: workspace.id, error: errorMessage }, 'Completion hook command failed');
      }
    }

    // Call webhook if configured
    if (hook.webhook) {
      try {
        this.log('info', { workspaceId: workspace.id, webhook: hook.webhook }, 'Calling completion webhook');
        const payload = {
          workspaceId: workspace.id,
          repo: workspace.repo,
          branch: workspace.branch.name,
          status,
          timestamp: new Date().toISOString(),
        };

        await fetch(hook.webhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...hook.webhookHeaders,
          },
          body: JSON.stringify(payload),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.log('warn', { workspaceId: workspace.id, error: errorMessage }, 'Completion webhook failed');
      }
    }
  }
}

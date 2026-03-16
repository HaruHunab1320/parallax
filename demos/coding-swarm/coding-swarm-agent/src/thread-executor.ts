/**
 * Thread Executor
 *
 * Manages the lifecycle of coding agent threads on this machine.
 * Uses tmux-manager + coding-agent-adapters for session management,
 * and local git operations for workspace provisioning.
 */

import { TmuxManager } from 'tmux-manager';
import { createAdapter } from 'coding-agent-adapters';
import type { GatewayThreadEvent, GatewayThreadStatusUpdate } from '@parallaxai/sdk-typescript';
import type { Logger } from 'pino';
import { ManagedThread, type ManagedThreadInfo } from './managed-thread';
import { execSync } from 'child_process';
import { mkdirSync, writeFileSync } from 'fs';
import path from 'path';
import type { AdapterType } from './config';

export interface ThreadSpawnParams {
  threadId: string;
  adapterType: string;
  task: string;
  preparationJson: string;
  policyJson: string;
  timeoutMs: number;
}

interface Preparation {
  workspace?: {
    repo?: string;
    baseBranch?: string;
    featureBranch?: string;
    credentialsToken?: string;
  };
  contextFiles?: Array<{ relativePath: string; content: string }>;
  env?: Record<string, string>;
}

interface Policy {
  approvalPreset?: string;
  interactive?: boolean;
  maxTurns?: number;
}

export class ThreadExecutor {
  private manager: TmuxManager;
  private threads: Map<string, ManagedThread> = new Map();
  private workspacesDir: string;

  constructor(
    private readonly defaultAdapterType: AdapterType,
    private readonly logger: Logger,
    config?: {
      tmuxPrefix?: string;
      workspacesDir?: string;
      terminalCols?: number;
      terminalRows?: number;
    }
  ) {
    this.manager = new TmuxManager({
      sessionPrefix: config?.tmuxPrefix || 'swarm',
      logger: {
        info: (...args: any[]) => typeof args[0] === 'string' ? logger.info(args[0]) : logger.info(args[0], args[1]),
        warn: (...args: any[]) => typeof args[0] === 'string' ? logger.warn(args[0]) : logger.warn(args[0], args[1]),
        error: (...args: any[]) => typeof args[0] === 'string' ? logger.error(args[0]) : logger.error(args[0], args[1]),
        debug: (...args: any[]) => typeof args[0] === 'string' ? logger.debug(args[0]) : logger.debug(args[0], args[1]),
      } as any,
      stallDetectionEnabled: true,
      stallTimeoutMs: 120000, // 2 min stall timeout for coding agents
    });

    this.workspacesDir = config?.workspacesDir
      || process.env.PARALLAX_WORKSPACES_DIR
      || path.join(process.env.HOME || '/tmp', '.parallax-swarm-workspaces');

    // Register adapters
    this.registerAdapters();
  }

  private registerAdapters(): void {
    const types: AdapterType[] = ['claude', 'codex', 'gemini', 'aider', 'hermes'];
    for (const type of types) {
      try {
        const adapter = createAdapter(type);
        this.manager.adapters.register(adapter);
        this.logger.debug({ type }, 'Registered adapter');
      } catch {
        this.logger.debug({ type }, 'Adapter not available');
      }
    }
  }

  /**
   * Spawn a new coding thread.
   */
  async spawn(
    params: ThreadSpawnParams,
    onEvent: (event: GatewayThreadEvent) => void,
    onStatusUpdate: (update: GatewayThreadStatusUpdate) => void
  ): Promise<ManagedThread> {
    const { threadId, task, preparationJson, policyJson } = params;
    const adapterType = params.adapterType || this.defaultAdapterType;

    const preparation: Preparation = this.safeParse(preparationJson);
    const policy: Policy = this.safeParse(policyJson);

    // Provision workspace
    const workspaceDir = await this.provisionWorkspace(threadId, preparation);

    // Write context files
    if (preparation.contextFiles) {
      for (const file of preparation.contextFiles) {
        const filePath = path.join(workspaceDir, file.relativePath);
        mkdirSync(path.dirname(filePath), { recursive: true });
        writeFileSync(filePath, file.content, 'utf-8');
      }
    }

    // Build environment
    const env: Record<string, string> = {
      ...preparation.env,
    };

    // Spawn the coding CLI via tmux-manager
    const session = await this.manager.spawn({
      name: threadId,
      type: adapterType,
      workdir: workspaceDir,
      cols: 120,
      rows: 40,
      env,
      adapterConfig: {
        interactive: policy.interactive !== false,
        approvalPreset: policy.approvalPreset || 'autonomous',
      },
    });

    const info: ManagedThreadInfo = {
      threadId,
      sessionId: session.id,
      adapterType,
      workspaceDir,
      startedAt: new Date(),
    };

    const thread = new ManagedThread(info, this.manager, onEvent, onStatusUpdate, this.logger);
    this.threads.set(threadId, thread);

    this.logger.info(
      { threadId, adapterType, workspaceDir, sessionId: session.id },
      'Thread spawned'
    );

    // Send the initial task once the session is ready
    this.manager.once('session_ready', (readySession: any) => {
      if (readySession.id === session.id) {
        this.logger.info({ threadId }, 'Sending initial task to thread');
        this.manager.send(session.id, task);
      }
    });

    return thread;
  }

  /**
   * Send input to a running thread.
   */
  sendInput(threadId: string, input: string): void {
    const thread = this.threads.get(threadId);
    if (!thread) {
      this.logger.warn({ threadId }, 'Thread not found for input');
      return;
    }
    thread.sendInput(input);
  }

  /**
   * Stop a thread.
   */
  async stopThread(threadId: string, force: boolean = false): Promise<void> {
    const thread = this.threads.get(threadId);
    if (!thread) {
      this.logger.warn({ threadId }, 'Thread not found for stop');
      return;
    }

    await thread.stop(force);
    this.threads.delete(threadId);
    this.logger.info({ threadId, force }, 'Thread stopped');
  }

  /**
   * Get a thread by ID.
   */
  getThread(threadId: string): ManagedThread | undefined {
    return this.threads.get(threadId);
  }

  /**
   * Provision a local git workspace for the thread.
   */
  private async provisionWorkspace(threadId: string, preparation: Preparation): Promise<string> {
    const ws = preparation.workspace;

    // If no repo specified, create a plain directory
    if (!ws?.repo) {
      const dir = path.join(this.workspacesDir, threadId);
      mkdirSync(dir, { recursive: true });
      return dir;
    }

    const dir = path.join(this.workspacesDir, threadId);
    mkdirSync(this.workspacesDir, { recursive: true });

    // Configure git credential helper if token provided
    const cloneUrl = this.buildCloneUrl(ws.repo, ws.credentialsToken);

    // Clone the repo
    this.logger.info({ threadId, repo: ws.repo, dir }, 'Cloning repository');
    execSync(`git clone --depth 1 ${cloneUrl} ${dir}`, {
      stdio: 'pipe',
      timeout: 120000,
    });

    // Checkout or create feature branch
    const baseBranch = ws.baseBranch || 'main';
    const featureBranch = ws.featureBranch || `swarm/${threadId}`;

    try {
      execSync(`git checkout -b ${featureBranch}`, { cwd: dir, stdio: 'pipe' });
      this.logger.info({ threadId, featureBranch, baseBranch }, 'Created feature branch');
    } catch {
      // Branch might already exist
      execSync(`git checkout ${featureBranch}`, { cwd: dir, stdio: 'pipe' });
    }

    return dir;
  }

  private buildCloneUrl(repo: string, token?: string): string {
    if (!token) return repo;
    // Convert https://github.com/owner/repo to https://<token>@github.com/owner/repo
    try {
      const url = new URL(repo);
      url.username = token;
      url.password = 'x-oauth-basic';
      return url.toString();
    } catch {
      // Not a URL, return as-is
      return repo;
    }
  }

  private safeParse(json: string): any {
    try {
      return JSON.parse(json);
    } catch {
      return {};
    }
  }

  /**
   * Shut down all threads and the tmux manager.
   */
  async shutdown(): Promise<void> {
    for (const [threadId, thread] of this.threads) {
      try {
        await thread.stop(true);
      } catch {
        this.logger.warn({ threadId }, 'Error stopping thread during shutdown');
      }
    }
    this.threads.clear();
    await this.manager.shutdown();
  }
}

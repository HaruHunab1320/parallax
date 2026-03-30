/**
 * Thread Executor
 *
 * Manages the lifecycle of coding agent threads on this machine.
 * Uses tmux-manager + coding-agent-adapters for session management,
 * and local git operations for workspace provisioning.
 */

import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type {
  GatewayThreadEvent,
  GatewayThreadStatusUpdate,
} from '@parallaxai/sdk-typescript';
import { createAdapter } from 'coding-agent-adapters';
import type { Logger } from 'pino';
import { TmuxManager } from 'tmux-manager';
import type { AdapterType } from './config';
import { ManagedThread, type ManagedThreadInfo } from './managed-thread';

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
        info: (...args: any[]) =>
          typeof args[0] === 'string'
            ? logger.info(args[0])
            : logger.info(args[0], args[1]),
        warn: (...args: any[]) =>
          typeof args[0] === 'string'
            ? logger.warn(args[0])
            : logger.warn(args[0], args[1]),
        error: (...args: any[]) =>
          typeof args[0] === 'string'
            ? logger.error(args[0])
            : logger.error(args[0], args[1]),
        debug: (...args: any[]) =>
          typeof args[0] === 'string'
            ? logger.debug(args[0])
            : logger.debug(args[0], args[1]),
      } as any,
      stallDetectionEnabled: true,
      stallTimeoutMs: 120000, // 2 min stall timeout for coding agents
    });

    this.workspacesDir =
      config?.workspacesDir ||
      process.env.PARALLAX_WORKSPACES_DIR ||
      path.join(process.env.HOME || '/tmp', '.parallax-swarm-workspaces');

    // Register adapters
    this.registerAdapters();
  }

  private registerAdapters(): void {
    const types: AdapterType[] = [
      'claude',
      'codex',
      'gemini',
      'aider',
      'hermes',
    ];
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

    // Write approval config files for the CLI agent
    const approvalPreset = policy.approvalPreset || 'autonomous';
    try {
      const { generateApprovalConfig } = require('coding-agent-adapters');
      const approvalConfig = generateApprovalConfig(
        adapterType,
        approvalPreset
      );
      if (approvalConfig?.workspaceFiles) {
        for (const file of approvalConfig.workspaceFiles) {
          const filePath = path.join(workspaceDir, file.relativePath);
          mkdirSync(path.dirname(filePath), { recursive: true });
          writeFileSync(filePath, file.content, 'utf-8');
          this.logger.info({ filePath }, 'Wrote approval config file');
        }
      }
    } catch (err: any) {
      this.logger.warn(
        { error: err.message },
        'Could not write approval config files'
      );
    }

    // Write swarm coordination MCP config and initial state
    try {
      const swarmDir = path.join(workspaceDir, '.parallax-swarm');
      mkdirSync(swarmDir, { recursive: true });

      // Write initial swarm state
      const swarmState = {
        executionId: threadId.split('-thread-')[0] || threadId,
        sharedDecisions: [],
        siblings: [],
      };
      writeFileSync(
        path.join(swarmDir, 'state.json'),
        JSON.stringify(swarmState, null, 2)
      );

      // Write MCP config for Claude Code
      const mcpEntrypoint = path.join(
        __dirname,
        'mcp',
        'swarm-mcp-entrypoint.js'
      );
      const claudeDir = path.join(workspaceDir, '.claude');
      mkdirSync(claudeDir, { recursive: true });

      const mcpSettings = {
        mcpServers: {
          'parallax-swarm': {
            command: 'node',
            args: [mcpEntrypoint],
            env: {
              PARALLAX_THREAD_ID: threadId,
              PARALLAX_EXECUTION_ID: threadId.split('-thread-')[0] || threadId,
              PARALLAX_ROLE: adapterType,
              PARALLAX_WORKSPACE_DIR: workspaceDir,
            },
          },
        },
      };
      writeFileSync(
        path.join(claudeDir, 'settings.local.json'),
        JSON.stringify(mcpSettings, null, 2)
      );

      this.logger.info({ workspaceDir }, 'Wrote swarm MCP config');
    } catch (err: any) {
      this.logger.warn(
        { error: err.message },
        'Could not write swarm MCP config'
      );
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
        approvalPreset,
      },
    });

    const info: ManagedThreadInfo = {
      threadId,
      sessionId: session.id,
      adapterType,
      workspaceDir,
      startedAt: new Date(),
    };

    const thread = new ManagedThread(
      info,
      this.manager,
      onEvent,
      onStatusUpdate,
      this.logger
    );
    this.threads.set(threadId, thread);

    this.logger.info(
      { threadId, adapterType, workspaceDir, sessionId: session.id },
      'Thread spawned'
    );

    // Send the initial task once this specific session is ready
    // (skip if task is empty — workflow executor will send the task later)
    if (task?.trim()) {
      const onReady = (readySession: any) => {
        if (readySession.id === session.id) {
          this.logger.info({ threadId }, 'Sending initial task to thread');
          this.manager.send(session.id, task);
          this.manager.removeListener('session_ready', onReady);
        }
      };
      this.manager.on('session_ready', onReady);
    } else {
      this.logger.info(
        { threadId },
        'No initial task — waiting for workflow to send task'
      );
    }

    return thread;
  }

  /**
   * Send input to a running thread.
   * Uses deferred delivery — waits for session_ready if not already ready,
   * then adds a per-adapter settle delay before sending.
   */
  sendInput(threadId: string, input: string): void {
    const thread = this.threads.get(threadId);
    if (!thread) {
      this.logger.warn({ threadId }, 'Thread not found for input');
      return;
    }

    const session = this.manager.get(thread.info.sessionId);
    if (!session) {
      this.logger.warn(
        { threadId, sessionId: thread.info.sessionId },
        'Session not found for input'
      );
      return;
    }

    const POST_READY_DELAY: Record<string, number> = {
      claude: 800,
      codex: 2000,
      gemini: 1500,
      aider: 200,
      hermes: 200,
    };

    const settleMs = POST_READY_DELAY[thread.info.adapterType] || 500;

    const deliverTask = () => {
      this.logger.info(
        { threadId, settleMs, adapterType: thread.info.adapterType },
        'Delivering task after settle delay'
      );
      setTimeout(() => {
        thread.sendInput(input);
        // Retry: check after 5s if agent accepted (output grew)
        setTimeout(() => {
          const currentSession = this.manager.get(thread.info.sessionId);
          if (currentSession && currentSession.status === 'ready') {
            this.logger.info(
              { threadId },
              'Agent may not have accepted task — retrying'
            );
            thread.sendInput(input);
          }
        }, 5000);
      }, settleMs);
    };

    if (session.status === 'ready') {
      deliverTask();
    } else {
      this.logger.info(
        { threadId, sessionStatus: session.status },
        'Session not ready — deferring task delivery'
      );
      const onReady = (readySession: any) => {
        if (readySession.id === thread.info.sessionId) {
          this.manager.removeListener('session_ready', onReady);
          deliverTask();
        }
      };
      this.manager.on('session_ready', onReady);

      // Timeout: force delivery after 30s even if not ready
      setTimeout(() => {
        this.manager.removeListener('session_ready', onReady);
        this.logger.warn(
          { threadId },
          'Session ready timeout — force delivering task'
        );
        thread.sendInput(input);
      }, 30000);
    }
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
  private async provisionWorkspace(
    threadId: string,
    preparation: Preparation
  ): Promise<string> {
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
    execSync(`git clone --depth 1 --template= ${cloneUrl} ${dir}`, {
      stdio: 'pipe',
      timeout: 120000,
    });

    // Checkout or create feature branch
    const baseBranch = ws.baseBranch || 'main';
    const featureBranch = ws.featureBranch || `swarm/${threadId}`;

    try {
      execSync(`git checkout -b ${featureBranch}`, { cwd: dir, stdio: 'pipe' });
      this.logger.info(
        { threadId, featureBranch, baseBranch },
        'Created feature branch'
      );
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

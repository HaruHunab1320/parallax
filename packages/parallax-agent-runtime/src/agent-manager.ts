/**
 * Agent Manager
 *
 * Manages AI coding agents using pty-manager, coding-agent-adapters,
 * and git-workspace-service.
 */

import { EventEmitter } from 'events';
import {
  PTYManager,
  type SessionHandle,
  type SessionMessage,
  type PTYManagerConfig,
  type AuthRequiredInfo as PtyAuthRequiredInfo,
  type AutoResponseRule,
} from 'pty-manager';
import {
  ClaudeAdapter,
  GeminiAdapter,
  CodexAdapter,
  AiderAdapter,
  checkAdapters,
  createAdapter,
  generateApprovalConfig,
  type PreflightResult,
  type AgentFileDescriptor,
  type WriteMemoryOptions,
  type ApprovalPreset,
} from 'coding-agent-adapters';
import {
  WorkspaceService,
  type WorkspaceServiceOptions,
  type Workspace,
  type WorkspaceConfig,
  type WorkspaceFinalization,
  type PullRequestInfo,
} from 'git-workspace-service';
import type { Logger } from 'pino';
import type {
  AgentType,
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentFilter,
  AgentStatus,
  AgentMetrics,
  BlockingPromptInfo,
  AuthRequiredInfo,
  StallClassification,
} from './types.js';

export interface AgentManagerOptions {
  maxAgents?: number;

  /** Enable stall detection for all agents (default: false) */
  stallDetectionEnabled?: boolean;

  /** Default stall timeout in ms (default: 8000). Can be overridden per-agent. */
  stallTimeoutMs?: number;

  /** External stall classification callback. */
  onStallClassify?: (
    agentId: string,
    recentOutput: string,
    stallDurationMs: number,
  ) => Promise<StallClassification | null>;

  /** Options for the workspace service. If provided, workspace provisioning is enabled. */
  workspace?: WorkspaceServiceOptions;
}

export interface AgentManagerEvents {
  agent_started: (agent: AgentHandle) => void;
  agent_ready: (agent: AgentHandle) => void;
  agent_stopped: (agent: AgentHandle, reason: string) => void;
  agent_error: (agent: AgentHandle, error: string) => void;
  login_required: (agent: AgentHandle, instructions?: string, url?: string) => void;
  auth_required: (agent: AgentHandle, auth: AuthRequiredInfo) => void;
  blocking_prompt: (agent: AgentHandle, promptInfo: BlockingPromptInfo, autoResponded: boolean) => void;
  message: (message: AgentMessage) => void;
  question: (agent: AgentHandle, question: string) => void;
  stall_detected: (agent: AgentHandle, recentOutput: string, stallDurationMs: number) => void;
}

/** Adapter preflight status included in health checks */
export interface AdapterHealth {
  type: string;
  installed: boolean;
  version?: string;
  error?: string;
}

/**
 * Manages AI coding agents via PTY sessions
 */
export class AgentManager extends EventEmitter {
  private ptyManager: PTYManager;
  private logger: Logger;
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private maxAgents: number;
  private workspaceService: WorkspaceService | null = null;

  constructor(logger: Logger, options: AgentManagerOptions = {}) {
    super();
    this.logger = logger;
    this.maxAgents = options.maxAgents ?? 10;

    // Create PTY manager with stall detection config
    const ptyConfig: PTYManagerConfig = {
      logger: this.createPtyLogger(),
      maxLogLines: 1000,
      stallDetectionEnabled: options.stallDetectionEnabled ?? false,
      stallTimeoutMs: options.stallTimeoutMs,
      onStallClassify: options.onStallClassify,
    };

    this.ptyManager = new PTYManager(ptyConfig);

    // Register all coding agent adapters
    this.ptyManager.registerAdapter(new ClaudeAdapter());
    this.ptyManager.registerAdapter(new GeminiAdapter());
    this.ptyManager.registerAdapter(new CodexAdapter());
    this.ptyManager.registerAdapter(new AiderAdapter());

    // Initialize workspace service if configured
    if (options.workspace) {
      this.workspaceService = new WorkspaceService(options.workspace);
    }

    // Set up event forwarding
    this.setupEventForwarding();
  }

  private createPtyLogger() {
    // Adapter for pino -> pty-manager logger interface
    return {
      debug: (arg1: unknown, arg2?: unknown) => {
        if (typeof arg1 === 'string') {
          this.logger.debug(arg1);
        } else {
          this.logger.debug(arg1 as object, arg2 as string);
        }
      },
      info: (arg1: unknown, arg2?: unknown) => {
        if (typeof arg1 === 'string') {
          this.logger.info(arg1);
        } else {
          this.logger.info(arg1 as object, arg2 as string);
        }
      },
      warn: (arg1: unknown, arg2?: unknown) => {
        if (typeof arg1 === 'string') {
          this.logger.warn(arg1);
        } else {
          this.logger.warn(arg1 as object, arg2 as string);
        }
      },
      error: (arg1: unknown, arg2?: unknown) => {
        if (typeof arg1 === 'string') {
          this.logger.error(arg1);
        } else {
          this.logger.error(arg1 as object, arg2 as string);
        }
      },
    };
  }

  private setupEventForwarding(): void {
    this.ptyManager.on('session_started', (handle: SessionHandle) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('agent_started', agentHandle);
    });

    this.ptyManager.on('session_ready', (handle: SessionHandle) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('agent_ready', agentHandle);
    });

    this.ptyManager.on('session_stopped', (handle: SessionHandle, reason: string) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('agent_stopped', agentHandle, reason);
    });

    this.ptyManager.on('session_error', (handle: SessionHandle, error: string) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('agent_error', agentHandle, error);
    });

    this.ptyManager.on('login_required', (handle: SessionHandle, instructions?: string, url?: string) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('login_required', agentHandle, instructions, url);
    });

    this.ptyManager.on('auth_required', (handle: SessionHandle, auth: PtyAuthRequiredInfo) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('auth_required', agentHandle, auth as AuthRequiredInfo);
    });

    this.ptyManager.on('blocking_prompt', (handle: SessionHandle, promptInfo: BlockingPromptInfo, autoResponded: boolean) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('blocking_prompt', agentHandle, promptInfo, autoResponded);
    });

    this.ptyManager.on('message', (msg: SessionMessage) => {
      const agentMessage = this.toAgentMessage(msg);
      this.emit('message', agentMessage);
    });

    this.ptyManager.on('question', (handle: SessionHandle, question: string) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('question', agentHandle, question);
    });

    this.ptyManager.on('stall_detected', (handle: SessionHandle, recentOutput: string, stallDurationMs: number) => {
      const agentHandle = this.toAgentHandle(handle);
      this.emit('stall_detected', agentHandle, recentOutput, stallDurationMs);
    });
  }

  private toAgentHandle(handle: SessionHandle): AgentHandle {
    const config = this.agentConfigs.get(handle.id);
    return {
      id: handle.id,
      name: handle.name,
      type: (config?.type ?? handle.type) as AgentHandle['type'],
      status: handle.status as AgentStatus,
      pid: handle.pid,
      role: config?.role,
      capabilities: config?.capabilities ?? [],
      startedAt: handle.startedAt,
      lastActivityAt: handle.lastActivityAt,
      error: handle.error,
      exitCode: handle.exitCode,
    };
  }

  private toAgentMessage(msg: SessionMessage): AgentMessage {
    return {
      id: msg.id,
      agentId: msg.sessionId,
      direction: msg.direction,
      type: msg.type,
      content: msg.content,
      metadata: msg.metadata,
      timestamp: msg.timestamp,
    };
  }

  /**
   * Initialize the manager
   */
  async initialize(): Promise<void> {
    this.logger.info('Agent manager initialized');
  }

  /**
   * Spawn a new agent
   */
  async spawn(config: AgentConfig): Promise<AgentHandle> {
    // Check max agents
    const currentCount = (await this.list()).length;
    if (currentCount >= this.maxAgents) {
      throw new Error(`Maximum agents (${this.maxAgents}) reached`);
    }

    // Store config for later lookup
    const id = config.id ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.agentConfigs.set(id, { ...config, id });

    // Write approval config files to workspace before spawning
    if (config.approvalPreset && config.workdir && config.type !== 'custom') {
      const approvalConfig = generateApprovalConfig(
        config.type as 'claude' | 'gemini' | 'codex' | 'aider',
        config.approvalPreset,
      );
      const { writeFile: fsWriteFile, mkdir: fsMkdir } = await import('node:fs/promises');
      const { join, dirname } = await import('node:path');

      const writtenFiles: string[] = [];
      for (const file of approvalConfig.workspaceFiles) {
        const fullPath = join(config.workdir, file.relativePath);
        await fsMkdir(dirname(fullPath), { recursive: true });
        await fsWriteFile(fullPath, file.content, 'utf-8');
        writtenFiles.push(file.relativePath);
      }
      this.logger.info(
        { agentId: id, preset: config.approvalPreset, files: writtenFiles },
        'Wrote approval config files to workspace',
      );
    }

    // Map to pty-manager spawn config
    // Convert credentials to adapter config (Record<string, unknown>)
    // Include approvalPreset so the adapter's getArgs() can add CLI flags
    const adapterConfig: Record<string, unknown> = {
      ...(config.credentials ?? {}),
      ...(config.approvalPreset ? { approvalPreset: config.approvalPreset } : {}),
      interactive: config.interactive ?? true,
    };

    const spawnConfig = {
      id,
      name: config.name,
      type: config.type,
      workdir: config.workdir,
      env: config.env,
      adapterConfig: Object.keys(adapterConfig).length > 0 ? adapterConfig : undefined,
      // Pass through new pty-manager features
      ruleOverrides: config.ruleOverrides as Record<string, Record<string, unknown> | null> | undefined,
      stallTimeoutMs: config.stallTimeoutMs,
    };

    this.logger.info({ agentId: id, type: config.type, name: config.name }, 'Spawning agent');

    const handle = await this.ptyManager.spawn(spawnConfig);
    return this.toAgentHandle(handle);
  }

  /**
   * Stop an agent
   */
  async stop(agentId: string, options?: { force?: boolean; timeout?: number }): Promise<void> {
    this.logger.info({ agentId, force: options?.force }, 'Stopping agent');
    await this.ptyManager.stop(agentId, options);
    this.agentConfigs.delete(agentId);
  }

  /**
   * Get an agent by ID
   */
  async get(agentId: string): Promise<AgentHandle | null> {
    const handle = await this.ptyManager.get(agentId);
    return handle ? this.toAgentHandle(handle) : null;
  }

  /**
   * List agents with optional filtering
   */
  async list(filter?: AgentFilter): Promise<AgentHandle[]> {
    const sessionFilter = filter ? {
      status: filter.status,
      type: filter.type,
    } : undefined;

    const handles = await this.ptyManager.list(sessionFilter);
    let agents = handles.map(h => this.toAgentHandle(h));

    // Apply agent-specific filters
    if (filter?.role) {
      agents = agents.filter(a => a.role === filter.role);
    }
    if (filter?.capabilities) {
      agents = agents.filter(a =>
        filter.capabilities!.every(c => a.capabilities.includes(c))
      );
    }

    return agents;
  }

  /**
   * Send a message to an agent
   */
  async send(agentId: string, message: string): Promise<AgentMessage> {
    this.logger.debug({ agentId, message: message.slice(0, 100) }, 'Sending message to agent');
    const sessionMsg = await this.ptyManager.send(agentId, message);
    return this.toAgentMessage(sessionMsg);
  }

  /**
   * Get logs for an agent
   */
  async *logs(agentId: string, options?: { tail?: number }): AsyncIterable<string> {
    yield* this.ptyManager.logs(agentId, options);
  }

  /**
   * Get metrics for an agent
   */
  async metrics(agentId: string): Promise<AgentMetrics | null> {
    // Use pty-manager's built-in metrics
    const ptyMetrics = this.ptyManager.metrics(agentId);
    if (!ptyMetrics) return null;

    return {
      uptime: ptyMetrics.uptime,
      messageCount: ptyMetrics.messageCount,
    };
  }

  /**
   * Attach to agent terminal
   */
  attachTerminal(agentId: string) {
    return this.ptyManager.attachTerminal(agentId);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Runtime Auto-Response Rules API
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Add an auto-response rule to an agent's session.
   * Session rules are checked before adapter rules.
   */
  addAutoResponseRule(agentId: string, rule: AutoResponseRule): void {
    this.ptyManager.addAutoResponseRule(agentId, rule);
  }

  /**
   * Remove an auto-response rule by pattern.
   */
  removeAutoResponseRule(agentId: string, pattern: RegExp): boolean {
    return this.ptyManager.removeAutoResponseRule(agentId, pattern);
  }

  /**
   * Set all session auto-response rules, replacing existing ones.
   */
  setAutoResponseRules(agentId: string, rules: AutoResponseRule[]): void {
    this.ptyManager.setAutoResponseRules(agentId, rules);
  }

  /**
   * Get all session auto-response rules.
   */
  getAutoResponseRules(agentId: string): AutoResponseRule[] {
    return this.ptyManager.getAutoResponseRules(agentId);
  }

  /**
   * Clear all session auto-response rules.
   */
  clearAutoResponseRules(agentId: string): void {
    this.ptyManager.clearAutoResponseRules(agentId);
  }

  /**
   * Handle external stall classification for an agent.
   */
  handleStallClassification(agentId: string, classification: StallClassification | null): void {
    const session = this.ptyManager.getSession(agentId);
    if (session) {
      session.handleStallClassification(classification);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Workspace Provisioning (git-workspace-service)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Provision a git workspace. Requires workspace service to be configured.
   */
  async provisionWorkspace(config: WorkspaceConfig): Promise<Workspace> {
    if (!this.workspaceService) {
      throw new Error('Workspace service not configured. Pass workspace options to AgentManagerOptions.');
    }

    this.logger.info({ repo: config.repo, strategy: config.strategy ?? 'clone' }, 'Provisioning workspace');
    return this.workspaceService.provision(config);
  }

  /**
   * Finalize a workspace (push, create PR, cleanup).
   * Returns PR info if a PR was created.
   */
  async finalizeWorkspace(workspaceId: string, options: WorkspaceFinalization): Promise<PullRequestInfo | void> {
    if (!this.workspaceService) {
      throw new Error('Workspace service not configured. Pass workspace options to AgentManagerOptions.');
    }

    this.logger.info({ workspaceId, push: options.push, createPr: options.createPr }, 'Finalizing workspace');
    return this.workspaceService.finalize(workspaceId, options);
  }

  /**
   * Clean up a workspace.
   */
  async cleanupWorkspace(workspaceId: string): Promise<void> {
    if (!this.workspaceService) {
      throw new Error('Workspace service not configured. Pass workspace options to AgentManagerOptions.');
    }

    this.logger.info({ workspaceId }, 'Cleaning up workspace');
    await this.workspaceService.cleanup(workspaceId);
  }

  /**
   * Check if workspace service is available.
   */
  hasWorkspaceService(): boolean {
    return this.workspaceService !== null;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Workspace Files (coding-agent-adapters)
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Get workspace file descriptors for an agent type.
   * Static lookup — no running agent needed.
   */
  getWorkspaceFiles(agentType: AgentType): AgentFileDescriptor[] {
    if (agentType === 'custom') return [];
    const adapter = createAdapter(agentType as 'claude' | 'gemini' | 'codex' | 'aider');
    return adapter.getWorkspaceFiles();
  }

  /**
   * Write a workspace/memory file for an agent type.
   * Creates a temporary adapter and delegates to writeMemoryFile().
   */
  async writeWorkspaceFile(
    agentType: AgentType,
    workspacePath: string,
    content: string,
    options?: WriteMemoryOptions,
  ): Promise<string> {
    if (agentType === 'custom') {
      throw new Error('Custom agents have no default workspace files');
    }
    const adapter = createAdapter(agentType as 'claude' | 'gemini' | 'codex' | 'aider');
    return adapter.writeMemoryFile(workspacePath, content, options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────

  /**
   * Shutdown all agents
   */
  async shutdown(force = false): Promise<void> {
    this.logger.info({ force }, 'Shutting down agent manager');
    await this.ptyManager.shutdown();
    this.agentConfigs.clear();
  }

  /**
   * Get runtime health status with adapter installation checks
   */
  async getHealth(): Promise<{
    healthy: boolean;
    agentCount: number;
    maxAgents: number;
    adapters: AdapterHealth[];
    workspaceServiceEnabled: boolean;
    stallDetectionEnabled: boolean;
  }> {
    const agents = await this.list();

    // Run preflight checks on all adapter CLIs
    const preflightResults = await checkAdapters(['claude', 'gemini', 'codex', 'aider']);
    const adapters: AdapterHealth[] = preflightResults.map((r: PreflightResult) => ({
      type: r.adapter,
      installed: r.installed,
      version: r.version,
      error: r.error,
    }));

    return {
      healthy: true,
      agentCount: agents.length,
      maxAgents: this.maxAgents,
      adapters,
      workspaceServiceEnabled: this.workspaceService !== null,
      stallDetectionEnabled: true,
    };
  }
}

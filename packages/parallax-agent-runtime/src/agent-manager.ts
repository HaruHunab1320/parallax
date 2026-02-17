/**
 * Agent Manager
 *
 * Manages AI coding agents using pty-manager and coding-agent-adapters.
 */

import { EventEmitter } from 'events';
import {
  PTYManager,
  type SessionHandle,
  type SessionMessage,
  type PTYManagerConfig,
} from 'pty-manager';
import {
  ClaudeAdapter,
  GeminiAdapter,
  CodexAdapter,
  AiderAdapter,
} from 'coding-agent-adapters';
import type { Logger } from 'pino';
import type {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentFilter,
  AgentStatus,
  AgentMetrics,
  BlockingPromptInfo,
} from './types.js';

export interface AgentManagerOptions {
  maxAgents?: number;
}

export interface AgentManagerEvents {
  agent_started: (agent: AgentHandle) => void;
  agent_ready: (agent: AgentHandle) => void;
  agent_stopped: (agent: AgentHandle, reason: string) => void;
  agent_error: (agent: AgentHandle, error: string) => void;
  login_required: (agent: AgentHandle, instructions?: string, url?: string) => void;
  blocking_prompt: (agent: AgentHandle, promptInfo: BlockingPromptInfo, autoResponded: boolean) => void;
  message: (message: AgentMessage) => void;
  question: (agent: AgentHandle, question: string) => void;
}

/**
 * Manages AI coding agents via PTY sessions
 */
export class AgentManager extends EventEmitter {
  private ptyManager: PTYManager;
  private logger: Logger;
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private maxAgents: number;

  constructor(logger: Logger, options: AgentManagerOptions = {}) {
    super();
    this.logger = logger;
    this.maxAgents = options.maxAgents ?? 10;

    // Create PTY manager
    const ptyConfig: PTYManagerConfig = {
      logger: this.createPtyLogger(),
      maxLogLines: 1000,
    };

    this.ptyManager = new PTYManager(ptyConfig);

    // Register all coding agent adapters
    this.ptyManager.registerAdapter(new ClaudeAdapter());
    this.ptyManager.registerAdapter(new GeminiAdapter());
    this.ptyManager.registerAdapter(new CodexAdapter());
    this.ptyManager.registerAdapter(new AiderAdapter());

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

    // Map to pty-manager spawn config
    // Convert credentials to adapter config (Record<string, unknown>)
    const adapterConfig: Record<string, unknown> | undefined = config.credentials
      ? { ...config.credentials }
      : undefined;

    const spawnConfig = {
      id,
      name: config.name,
      type: config.type,
      workdir: config.workdir,
      env: config.env,
      adapterConfig,
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
    const handle = await this.ptyManager.get(agentId);
    if (!handle) return null;

    const uptime = handle.startedAt
      ? Math.floor((Date.now() - handle.startedAt.getTime()) / 1000)
      : undefined;

    return { uptime };
  }

  /**
   * Attach to agent terminal
   */
  attachTerminal(agentId: string) {
    return this.ptyManager.attachTerminal(agentId);
  }

  /**
   * Shutdown all agents
   */
  async shutdown(force = false): Promise<void> {
    this.logger.info({ force }, 'Shutting down agent manager');
    await this.ptyManager.shutdown();
    this.agentConfigs.clear();
  }

  /**
   * Get runtime health status
   */
  async getHealth(): Promise<{
    healthy: boolean;
    agentCount: number;
    maxAgents: number;
    adapters: string[];
  }> {
    const agents = await this.list();
    return {
      healthy: true,
      agentCount: agents.length,
      maxAgents: this.maxAgents,
      adapters: ['claude', 'gemini', 'codex', 'aider'],
    };
  }
}

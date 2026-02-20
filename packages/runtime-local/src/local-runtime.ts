/**
 * Local Runtime Provider
 *
 * RuntimeProvider implementation for local PTY-based agent sessions.
 * Delegates to pty-manager for PTY management and coding-agent-adapters for CLI adapters.
 */

import {
  BaseRuntimeProvider,
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentMetrics,
  AgentFilter,
  AgentStatus,
  StopOptions,
  SendOptions,
  LogOptions,
} from '@parallax/runtime-interface';
import {
  PTYManager,
  type SessionHandle,
  type SessionMessage,
  type PTYManagerConfig,
  type BlockingPromptInfo,
} from 'pty-manager';
import { Logger } from 'pino';
import { registerAllAdapters } from './adapters';

export interface LocalRuntimeOptions {
  maxAgents?: number;
}

export class LocalRuntime extends BaseRuntimeProvider {
  readonly name = 'local';
  readonly type = 'local' as const;

  private manager: PTYManager;
  private initialized = false;
  private maxAgents: number;
  private agentConfigs: Map<string, AgentConfig> = new Map();

  constructor(
    private logger: Logger,
    options: LocalRuntimeOptions = {}
  ) {
    super();

    this.maxAgents = options.maxAgents || 10;

    const ptyConfig: PTYManagerConfig = {
      logger: this.createPtyLogger(),
      maxLogLines: 1000,
    };

    this.manager = new PTYManager(ptyConfig);

    // Register all coding-agent-adapters + EchoAdapter
    registerAllAdapters(this.manager);

    // Forward events from manager
    this.setupEventForwarding();
  }

  /**
   * Adapter for pino Logger → pty-manager Logger interface
   */
  private createPtyLogger() {
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

  // ─────────────────────────────────────────────────────────────
  // Type Conversion (runtime-interface ↔ pty-manager)
  // ─────────────────────────────────────────────────────────────

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

  // ─────────────────────────────────────────────────────────────
  // Event Forwarding (pty-manager events → runtime-interface events)
  // ─────────────────────────────────────────────────────────────

  private setupEventForwarding(): void {
    this.manager.on('session_started', (handle: SessionHandle) => {
      this.emit('agent_started', this.toAgentHandle(handle));
    });

    this.manager.on('session_ready', (handle: SessionHandle) => {
      this.emit('agent_ready', this.toAgentHandle(handle));
    });

    this.manager.on('session_stopped', (handle: SessionHandle, reason: string) => {
      this.emit('agent_stopped', this.toAgentHandle(handle), reason);
    });

    this.manager.on('session_error', (handle: SessionHandle, error: string) => {
      this.emit('agent_error', this.toAgentHandle(handle), error);
    });

    this.manager.on('login_required', (handle: SessionHandle, instructions?: string, url?: string) => {
      this.emit('login_required', this.toAgentHandle(handle), instructions, url);
    });

    this.manager.on('blocking_prompt', (handle: SessionHandle, promptInfo: BlockingPromptInfo, autoResponded: boolean) => {
      this.emit('blocking_prompt', this.toAgentHandle(handle), promptInfo, autoResponded);
    });

    this.manager.on('message', (msg: SessionMessage) => {
      this.emit('message', this.toAgentMessage(msg));
    });

    this.manager.on('question', (handle: SessionHandle, question: string) => {
      this.emit('question', this.toAgentHandle(handle), question);
    });
  }

  // ─────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────

  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    this.logger.info('Initializing local runtime');

    // Validate that adapters have their CLIs installed
    const adapters = this.manager.adapters.all();
    for (const adapter of adapters) {
      if (adapter.validateInstallation) {
        const result = await adapter.validateInstallation();
        if (result.installed) {
          this.logger.info(
            { adapter: adapter.adapterType, version: result.version },
            'CLI adapter validated'
          );
        } else {
          this.logger.warn(
            { adapter: adapter.adapterType, error: result.error },
            'CLI not installed or not accessible'
          );
        }
      }
    }

    this.initialized = true;
    this.logger.info('Local runtime initialized');
  }

  async shutdown(stopAgents = true): Promise<void> {
    this.logger.info('Shutting down local runtime');

    if (stopAgents) {
      await this.manager.shutdown();
    }

    this.agentConfigs.clear();
    this.initialized = false;
    this.logger.info('Local runtime shut down');
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    if (!this.initialized) {
      return { healthy: false, message: 'Runtime not initialized' };
    }

    const counts = this.manager.getStatusCounts();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);

    return {
      healthy: true,
      message: `${total} agents (${counts.ready} ready, ${counts.busy} busy, ${counts.error} error)`,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Agent Management
  // ─────────────────────────────────────────────────────────────

  async spawn(config: AgentConfig): Promise<AgentHandle> {
    if (!this.initialized) {
      throw new Error('Runtime not initialized');
    }

    // Check agent limit
    const currentAgents = this.manager.list();
    if (currentAgents.length >= this.maxAgents) {
      throw new Error(`Maximum agent limit reached (${this.maxAgents})`);
    }

    // Store config for reverse lookup in toAgentHandle
    const id = config.id ?? `agent-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.agentConfigs.set(id, { ...config, id });

    // Convert AgentConfig → SpawnConfig for pty-manager
    const spawnConfig = {
      id,
      name: config.name,
      type: config.type,
      workdir: config.workdir,
      env: config.env,
    };

    const handle = await this.manager.spawn(spawnConfig);
    return this.toAgentHandle(handle);
  }

  async stop(agentId: string, options?: StopOptions): Promise<void> {
    await this.manager.stop(agentId, options);
    this.agentConfigs.delete(agentId);
  }

  async restart(agentId: string): Promise<AgentHandle> {
    const config = this.agentConfigs.get(agentId);
    if (!config) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    await this.stop(agentId, { timeout: 5000 });

    // Respawn with a new ID
    const newConfig = { ...config, id: undefined };
    return this.spawn(newConfig);
  }

  async get(agentId: string): Promise<AgentHandle | null> {
    const handle = this.manager.get(agentId);
    return handle ? this.toAgentHandle(handle) : null;
  }

  async list(filter?: AgentFilter): Promise<AgentHandle[]> {
    const sessionFilter = filter ? {
      status: filter.status,
      type: filter.type,
    } : undefined;

    const handles = this.manager.list(sessionFilter);
    let agents = handles.map(h => this.toAgentHandle(h));

    // Apply agent-specific filters not supported by pty-manager
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

  // ─────────────────────────────────────────────────────────────
  // Communication
  // ─────────────────────────────────────────────────────────────

  async send(
    agentId: string,
    message: string,
    options?: SendOptions
  ): Promise<AgentMessage | void> {
    const sessionMsg = this.manager.send(agentId, message);
    const msg = this.toAgentMessage(sessionMsg);

    if (options?.expectResponse) {
      // Wait for response with timeout
      return new Promise((resolve, reject) => {
        const timeout = options.timeout || 30000;

        const timer = setTimeout(() => {
          this.manager.off('message', handler);
          reject(new Error(`Response timeout after ${timeout}ms`));
        }, timeout);

        const handler = (response: SessionMessage) => {
          if (response.sessionId === agentId && response.direction === 'outbound') {
            clearTimeout(timer);
            this.manager.off('message', handler);
            resolve(this.toAgentMessage(response));
          }
        };

        this.manager.on('message', handler);
      });
    }

    return msg;
  }

  async *subscribe(agentId: string): AsyncIterable<AgentMessage> {
    // Create an async iterator that yields messages for this agent
    const queue: AgentMessage[] = [];
    let resolver: ((value: IteratorResult<AgentMessage>) => void) | null = null;
    let done = false;

    const handler = (msg: SessionMessage) => {
      if (msg.sessionId === agentId) {
        const agentMsg = this.toAgentMessage(msg);
        if (resolver) {
          resolver({ value: agentMsg, done: false });
          resolver = null;
        } else {
          queue.push(agentMsg);
        }
      }
    };

    const stopHandler = (handle: SessionHandle) => {
      if (handle.id === agentId) {
        done = true;
        if (resolver) {
          resolver({ value: undefined as any, done: true });
        }
      }
    };

    this.manager.on('message', handler);
    this.manager.on('session_stopped', stopHandler);

    try {
      while (!done) {
        if (queue.length > 0) {
          yield queue.shift()!;
        } else {
          yield await new Promise<AgentMessage>((resolve) => {
            resolver = (result) => {
              if (result.done) {
                done = true;
              } else {
                resolve(result.value);
              }
            };
          });
        }
      }
    } finally {
      this.manager.off('message', handler);
      this.manager.off('session_stopped', stopHandler);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Logs & Metrics
  // ─────────────────────────────────────────────────────────────

  async *logs(agentId: string, options?: LogOptions): AsyncIterable<string> {
    yield* this.manager.logs(agentId, options);
  }

  async metrics(agentId: string): Promise<AgentMetrics | null> {
    const ptyMetrics = this.manager.metrics(agentId);
    if (!ptyMetrics) return null;

    return {
      uptime: ptyMetrics.uptime,
      messageCount: ptyMetrics.messageCount,
    };
  }

  // ─────────────────────────────────────────────────────────────
  // Terminal Access
  // ─────────────────────────────────────────────────────────────

  /**
   * Attach to an agent's terminal for raw I/O streaming.
   * Used by WebSocket terminal endpoint for xterm.js integration.
   */
  attachTerminal(agentId: string): {
    onData: (callback: (data: string) => void) => () => void;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
  } | null {
    return this.manager.attachTerminal(agentId);
  }

  /**
   * Check if an agent exists
   */
  hasAgent(agentId: string): boolean {
    return this.manager.has(agentId);
  }
}

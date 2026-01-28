/**
 * Local Runtime Provider
 *
 * RuntimeProvider implementation for local PTY-based agent sessions.
 */

import {
  BaseRuntimeProvider,
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentMetrics,
  AgentFilter,
  StopOptions,
  SendOptions,
  LogOptions,
  AdapterRegistry,
} from '@parallax/runtime-interface';
import { Logger } from 'pino';
import { PTYManager } from './pty/pty-manager';
import { defaultRegistry } from './adapters';

export interface LocalRuntimeOptions {
  adapters?: AdapterRegistry;
  maxAgents?: number;
}

export class LocalRuntime extends BaseRuntimeProvider {
  readonly name = 'local';
  readonly type = 'local' as const;

  private manager: PTYManager;
  private initialized = false;
  private maxAgents: number;

  constructor(
    private logger: Logger,
    options: LocalRuntimeOptions = {}
  ) {
    super();

    const adapters = options.adapters || defaultRegistry;
    this.maxAgents = options.maxAgents || 10;
    this.manager = new PTYManager(adapters, logger);

    // Forward events from manager
    this.setupEventForwarding();
  }

  private setupEventForwarding(): void {
    this.manager.on('agent_started', (agent) => {
      this.emit('agent_started', agent);
    });

    this.manager.on('agent_ready', (agent) => {
      this.emit('agent_ready', agent);
    });

    this.manager.on('agent_stopped', (agent, reason) => {
      this.emit('agent_stopped', agent, reason);
    });

    this.manager.on('agent_error', (agent, error) => {
      this.emit('agent_error', agent, error);
    });

    this.manager.on('login_required', (agent, instructions, url) => {
      this.emit('login_required', agent, url);
    });

    this.manager.on('message', (message) => {
      this.emit('message', message);
    });

    this.manager.on('question', (agent, question) => {
      this.emit('question', agent, question);
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
    const adapters = defaultRegistry.all();
    for (const adapter of adapters) {
      if (adapter.validateInstallation) {
        const result = await adapter.validateInstallation();
        if (result.installed) {
          this.logger.info(
            { adapter: adapter.agentType, version: result.version },
            'CLI adapter validated'
          );
        } else {
          this.logger.warn(
            { adapter: adapter.agentType, error: result.error },
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
    const currentAgents = await this.manager.list();
    if (currentAgents.length >= this.maxAgents) {
      throw new Error(`Maximum agent limit reached (${this.maxAgents})`);
    }

    return this.manager.spawn(config);
  }

  async stop(agentId: string, options?: StopOptions): Promise<void> {
    await this.manager.stop(agentId, options);
  }

  async restart(agentId: string): Promise<AgentHandle> {
    return this.manager.restart(agentId);
  }

  async get(agentId: string): Promise<AgentHandle | null> {
    return this.manager.get(agentId);
  }

  async list(filter?: AgentFilter): Promise<AgentHandle[]> {
    return this.manager.list(filter);
  }

  // ─────────────────────────────────────────────────────────────
  // Communication
  // ─────────────────────────────────────────────────────────────

  async send(
    agentId: string,
    message: string,
    options?: SendOptions
  ): Promise<AgentMessage | void> {
    const msg = await this.manager.send(agentId, message);

    if (options?.expectResponse) {
      // Wait for response with timeout
      return new Promise((resolve, reject) => {
        const timeout = options.timeout || 30000;

        const timer = setTimeout(() => {
          this.manager.off('message', handler);
          reject(new Error(`Response timeout after ${timeout}ms`));
        }, timeout);

        const handler = (response: AgentMessage) => {
          if (response.agentId === agentId && response.direction === 'outbound') {
            clearTimeout(timer);
            this.manager.off('message', handler);
            resolve(response);
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

    const handler = (message: AgentMessage) => {
      if (message.agentId === agentId) {
        if (resolver) {
          resolver({ value: message, done: false });
          resolver = null;
        } else {
          queue.push(message);
        }
      }
    };

    const stopHandler = (agent: AgentHandle) => {
      if (agent.id === agentId) {
        done = true;
        if (resolver) {
          resolver({ value: undefined as any, done: true });
        }
      }
    };

    this.manager.on('message', handler);
    this.manager.on('agent_stopped', stopHandler);

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
      this.manager.off('agent_stopped', stopHandler);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Logs & Metrics
  // ─────────────────────────────────────────────────────────────

  async *logs(agentId: string, options?: LogOptions): AsyncIterable<string> {
    yield* this.manager.logs(agentId, options);

    // If follow mode, subscribe to new output
    if (options?.follow) {
      // Would need to implement streaming from PTY output
      // For now, just yield existing logs
    }
  }

  async metrics(agentId: string): Promise<AgentMetrics | null> {
    return this.manager.metrics(agentId);
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

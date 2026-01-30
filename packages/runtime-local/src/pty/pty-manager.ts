/**
 * PTY Manager
 *
 * Manages multiple PTY sessions for CLI agents.
 */

import { EventEmitter } from 'events';
import { v4 as uuid } from 'uuid';
import {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentFilter,
  AgentStatus,
  CLIAdapter,
  AdapterRegistry,
  BlockingPromptInfo,
} from '@parallax/runtime-interface';
import { Logger } from 'pino';
import { PTYSession } from './pty-session';

export interface PTYManagerEvents {
  agent_started: (agent: AgentHandle) => void;
  agent_ready: (agent: AgentHandle) => void;
  agent_stopped: (agent: AgentHandle, reason: string) => void;
  agent_error: (agent: AgentHandle, error: string) => void;
  login_required: (agent: AgentHandle, instructions?: string, url?: string) => void;
  blocking_prompt: (agent: AgentHandle, promptInfo: BlockingPromptInfo, autoResponded: boolean) => void;
  message: (message: AgentMessage) => void;
  question: (agent: AgentHandle, question: string) => void;
}

export class PTYManager extends EventEmitter {
  private sessions: Map<string, PTYSession> = new Map();
  private outputLogs: Map<string, string[]> = new Map();
  private maxLogLines: number = 1000;

  constructor(
    private adapters: AdapterRegistry,
    private logger: Logger
  ) {
    super();
  }

  /**
   * Spawn a new agent session
   */
  async spawn(config: AgentConfig): Promise<AgentHandle> {
    // Generate ID if not provided
    const id = config.id || uuid();
    config = { ...config, id };

    // Get adapter for this agent type
    const adapter = this.adapters.get(config.type);
    if (!adapter) {
      throw new Error(`No adapter found for agent type: ${config.type}`);
    }

    // Check if already exists
    if (this.sessions.has(id)) {
      throw new Error(`Agent with ID ${id} already exists`);
    }

    this.logger.info(
      { agentId: id, type: config.type, name: config.name },
      'Spawning agent'
    );

    // Create session
    const session = new PTYSession(adapter, config, this.logger);

    // Set up event forwarding
    this.setupSessionEvents(session);

    // Store session
    this.sessions.set(id, session);
    this.outputLogs.set(id, []);

    // Start the session
    await session.start();

    const handle = session.toHandle();
    this.emit('agent_started', handle);

    return handle;
  }

  /**
   * Set up event handlers for a session
   */
  private setupSessionEvents(session: PTYSession): void {
    session.on('output', (data: string) => {
      // Store in log buffer
      const logs = this.outputLogs.get(session.id) || [];
      const lines = data.split('\n');
      logs.push(...lines);

      // Trim to max lines
      while (logs.length > this.maxLogLines) {
        logs.shift();
      }
      this.outputLogs.set(session.id, logs);
    });

    session.on('ready', () => {
      this.emit('agent_ready', session.toHandle());
    });

    session.on('login_required', (instructions?: string, url?: string) => {
      this.emit('login_required', session.toHandle(), instructions, url);
    });

    session.on('blocking_prompt', (promptInfo: BlockingPromptInfo, autoResponded: boolean) => {
      this.emit('blocking_prompt', session.toHandle(), promptInfo, autoResponded);
    });

    session.on('message', (message: AgentMessage) => {
      this.emit('message', message);
    });

    session.on('question', (question: string) => {
      this.emit('question', session.toHandle(), question);
    });

    session.on('exit', (code: number) => {
      const reason = code === 0 ? 'normal exit' : `exit code ${code}`;
      this.emit('agent_stopped', session.toHandle(), reason);
    });

    session.on('error', (error: Error) => {
      this.emit('agent_error', session.toHandle(), error.message);
    });
  }

  /**
   * Stop an agent
   */
  async stop(agentId: string, options?: { force?: boolean; timeout?: number }): Promise<void> {
    const session = this.sessions.get(agentId);
    if (!session) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    this.logger.info({ agentId, force: options?.force }, 'Stopping agent');

    const timeout = options?.timeout || 5000;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        // Force kill if graceful shutdown times out
        session.kill('SIGKILL');
        resolve();
      }, timeout);

      session.once('exit', () => {
        clearTimeout(timer);
        this.sessions.delete(agentId);
        resolve();
      });

      // Send graceful signal
      session.kill(options?.force ? 'SIGKILL' : 'SIGTERM');
    });
  }

  /**
   * Restart an agent
   */
  async restart(agentId: string): Promise<AgentHandle> {
    const session = this.sessions.get(agentId);
    if (!session) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    // Get the config from the session's handle
    const handle = session.toHandle();

    // Stop the agent
    await this.stop(agentId, { timeout: 5000 });

    // Respawn with same config
    // Note: We'd need to store the original config - for now, throw
    throw new Error('Restart not yet implemented - need to store original config');
  }

  /**
   * Get an agent by ID
   */
  async get(agentId: string): Promise<AgentHandle | null> {
    const session = this.sessions.get(agentId);
    return session ? session.toHandle() : null;
  }

  /**
   * List all agents
   */
  async list(filter?: AgentFilter): Promise<AgentHandle[]> {
    const handles: AgentHandle[] = [];

    for (const session of this.sessions.values()) {
      const handle = session.toHandle();

      // Apply filters
      if (filter) {
        if (filter.status) {
          const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
          if (!statuses.includes(handle.status)) continue;
        }

        if (filter.role && handle.role !== filter.role) continue;

        if (filter.type) {
          const types = Array.isArray(filter.type) ? filter.type : [filter.type];
          if (!types.includes(handle.type)) continue;
        }

        if (filter.capabilities) {
          const hasAll = filter.capabilities.every((c) =>
            handle.capabilities.includes(c)
          );
          if (!hasAll) continue;
        }
      }

      handles.push(handle);
    }

    return handles;
  }

  /**
   * Send a message to an agent
   */
  async send(agentId: string, message: string): Promise<AgentMessage> {
    const session = this.sessions.get(agentId);
    if (!session) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    return session.send(message);
  }

  /**
   * Get logs for an agent
   */
  async *logs(agentId: string, options?: { tail?: number }): AsyncIterable<string> {
    const logBuffer = this.outputLogs.get(agentId);
    if (!logBuffer) {
      throw new Error(`Agent not found: ${agentId}`);
    }

    const lines = options?.tail
      ? logBuffer.slice(-options.tail)
      : logBuffer;

    for (const line of lines) {
      yield line;
    }
  }

  /**
   * Get metrics for an agent
   */
  async metrics(agentId: string): Promise<{ uptime?: number; messageCount?: number } | null> {
    const session = this.sessions.get(agentId);
    if (!session) {
      return null;
    }

    const handle = session.toHandle();
    const uptime = handle.startedAt
      ? Math.floor((Date.now() - handle.startedAt.getTime()) / 1000)
      : undefined;

    return {
      uptime,
      // Could track message count in session
    };
  }

  /**
   * Stop all agents and cleanup
   */
  async shutdown(): Promise<void> {
    this.logger.info({ count: this.sessions.size }, 'Shutting down all agents');

    const stopPromises = Array.from(this.sessions.keys()).map((id) =>
      this.stop(id, { timeout: 3000 }).catch((err) => {
        this.logger.warn({ agentId: id, error: err }, 'Error stopping agent during shutdown');
      })
    );

    await Promise.all(stopPromises);

    this.sessions.clear();
    this.outputLogs.clear();
  }

  /**
   * Get count of agents by status
   */
  getStatusCounts(): Record<AgentStatus, number> {
    const counts: Record<AgentStatus, number> = {
      pending: 0,
      starting: 0,
      authenticating: 0,
      ready: 0,
      busy: 0,
      stopping: 0,
      stopped: 0,
      error: 0,
    };

    for (const session of this.sessions.values()) {
      counts[session.status]++;
    }

    return counts;
  }

  // ─────────────────────────────────────────────────────────────
  // Terminal Access (for WebSocket streaming)
  // ─────────────────────────────────────────────────────────────

  /**
   * Attach to a session's terminal for raw I/O streaming.
   * Returns an object with methods to subscribe to output and write input.
   */
  attachTerminal(agentId: string): {
    onData: (callback: (data: string) => void) => () => void;
    write: (data: string) => void;
    resize: (cols: number, rows: number) => void;
    getSession: () => PTYSession | undefined;
  } | null {
    const session = this.sessions.get(agentId);
    if (!session) {
      return null;
    }

    return {
      /**
       * Subscribe to raw terminal output
       * Returns an unsubscribe function
       */
      onData: (callback: (data: string) => void) => {
        session.on('output', callback);
        return () => session.off('output', callback);
      },

      /**
       * Write raw data to terminal (no formatting applied)
       */
      write: (data: string) => {
        session.writeRaw(data);
      },

      /**
       * Resize the terminal
       */
      resize: (cols: number, rows: number) => {
        session.resize(cols, rows);
      },

      /**
       * Get the underlying session (for advanced use)
       */
      getSession: () => session,
    };
  }

  /**
   * Check if an agent exists
   */
  has(agentId: string): boolean {
    return this.sessions.has(agentId);
  }
}

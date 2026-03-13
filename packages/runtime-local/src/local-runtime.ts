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
  SpawnThreadInput,
  ThreadCompletion,
  ThreadEvent,
  ThreadFilter,
  ThreadHandle,
  ThreadInput,
  ThreadRuntimeProvider,
  ThreadStatus,
} from '@parallaxai/runtime-interface';
import {
  PTYManager,
  type SessionHandle,
  type SessionMessage,
  type PTYManagerConfig,
  type BlockingPromptInfo,
} from 'pty-manager';
import { Logger } from 'pino';
import { mkdirSync, existsSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { registerAllAdapters } from './adapters';

export interface LocalRuntimeOptions {
  maxAgents?: number;
}

interface ThreadInfo {
  handle: ThreadHandle;
  sessionId?: string;
}

export class LocalRuntime extends BaseRuntimeProvider implements ThreadRuntimeProvider {
  readonly name = 'local';
  readonly type = 'local' as const;

  private manager: PTYManager;
  private initialized = false;
  private maxAgents: number;
  private agentConfigs: Map<string, AgentConfig> = new Map();
  private sharedAuthDirs: Set<string> = new Set();
  private threads: Map<string, ThreadInfo> = new Map();
  private sessionToThread: Map<string, string> = new Map();

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

  private updateThread(
    threadId: string,
    patch: Partial<ThreadHandle>
  ): ThreadHandle | null {
    const info = this.threads.get(threadId);
    if (!info) return null;

    info.handle = {
      ...info.handle,
      ...patch,
      updatedAt: patch.updatedAt ?? new Date(),
    };
    this.threads.set(threadId, info);
    return info.handle;
  }

  private sessionStatusToThreadStatus(status: SessionHandle['status']): ThreadStatus {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'starting':
      case 'authenticating':
        return 'starting';
      case 'ready':
        return 'ready';
      case 'busy':
        return 'running';
      case 'stopping':
      case 'stopped':
        return 'stopped';
      case 'error':
        return 'failed';
      default:
        return 'running';
    }
  }

  private emitThreadEvent(
    sessionId: string,
    type: ThreadEvent['type'],
    data?: Record<string, unknown>,
    threadPatch?: Partial<ThreadHandle>
  ): void {
    const threadId = this.sessionToThread.get(sessionId);
    if (!threadId) return;

    const thread = this.updateThread(threadId, {
      ...threadPatch,
      lastActivityAt: new Date(),
    });
    if (!thread) return;

    const event: ThreadEvent = {
      threadId,
      executionId: thread.executionId,
      type,
      timestamp: new Date(),
      data,
    };

    this.emit('thread_event', thread, event);
  }

  // ─────────────────────────────────────────────────────────────
  // Event Forwarding (pty-manager events → runtime-interface events)
  // ─────────────────────────────────────────────────────────────

  private setupEventForwarding(): void {
    this.manager.on('session_started', (handle: SessionHandle) => {
      this.emit('agent_started', this.toAgentHandle(handle));
      this.emitThreadEvent(handle.id, 'thread_started', undefined, {
        status: this.sessionStatusToThreadStatus(handle.status),
      });
    });

    this.manager.on('session_ready', (handle: SessionHandle) => {
      this.emit('agent_ready', this.toAgentHandle(handle));
      this.emitThreadEvent(handle.id, 'thread_ready', undefined, {
        status: 'ready',
      });
    });

    this.manager.on('session_stopped', (handle: SessionHandle, reason: string) => {
      this.emit('agent_stopped', this.toAgentHandle(handle), reason);
      this.emitThreadEvent(handle.id, 'thread_stopped', { reason }, {
        status: 'stopped',
      });
    });

    this.manager.on('session_error', (handle: SessionHandle, error: string) => {
      this.emit('agent_error', this.toAgentHandle(handle), error);
      this.emitThreadEvent(handle.id, 'thread_failed', { error }, {
        status: 'failed',
      });
    });

    this.manager.on('login_required', (handle: SessionHandle, instructions?: string, url?: string) => {
      this.emit('login_required', this.toAgentHandle(handle), instructions, url);
    });

    this.manager.on('blocking_prompt', (handle: SessionHandle, promptInfo: BlockingPromptInfo, autoResponded: boolean) => {
      this.emit('blocking_prompt', this.toAgentHandle(handle), promptInfo, autoResponded);
      this.emitThreadEvent(handle.id, 'thread_blocked', {
        promptInfo,
        autoResponded,
      }, {
        status: 'blocked',
      });
    });

    this.manager.on('message', (msg: SessionMessage) => {
      this.emit('message', this.toAgentMessage(msg));
      this.emitThreadEvent(msg.sessionId, 'thread_output', {
        message: this.toAgentMessage(msg),
      });
    });

    this.manager.on('question', (handle: SessionHandle, question: string) => {
      this.emit('question', this.toAgentHandle(handle), question);
    });

    this.manager.on('task_complete', (handle: SessionHandle) => {
      let completion: ThreadCompletion | undefined;
      const session = this.manager.getSession(handle.id);
      if (session) {
        const output = session.getOutputBuffer().trim();
        if (output) {
          completion = {
            state: 'partial',
            summary: output.split('\n').slice(-5).join('\n').slice(-1000),
          };
        }
      }

      this.emitThreadEvent(handle.id, 'thread_turn_complete', undefined, {
        status: 'ready',
        completion,
        summary: completion?.summary,
      });
    });

    this.manager.on('tool_running', (handle: SessionHandle, info: unknown) => {
      this.emitThreadEvent(handle.id, 'thread_tool_running', {
        info: info as Record<string, unknown>,
      }, {
        status: 'running',
      });
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

    // Set up shared auth directory for agents in the same execution
    const env = { ...config.env };
    if (config.executionId) {
      const sharedAuthDir = this.ensureSharedAuthDir(config.executionId);
      // Point CLI credential directories to shared location
      env.CLAUDE_CONFIG_DIR = join(sharedAuthDir, 'claude');
      env.CODEX_CONFIG_DIR = join(sharedAuthDir, 'codex');
      env.PARALLAX_EXECUTION_ID = config.executionId;
    }

    // Convert AgentConfig → SpawnConfig for pty-manager
    const spawnConfig = {
      id,
      name: config.name,
      type: config.type,
      workdir: config.workdir,
      env,
      adapterConfig: {
        interactive: true,
      },
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
  // Thread Management
  // ─────────────────────────────────────────────────────────────

  async spawnThread(input: SpawnThreadInput): Promise<ThreadHandle> {
    const threadId =
      input.id || `thread-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const workspace = input.preparation?.workspace ?? input.workspace;
    const env = {
      ...(input.preparation?.env ?? input.env),
      PARALLAX_THREAD_ID: threadId,
      PARALLAX_THREAD_OBJECTIVE: input.objective,
      PARALLAX_THREAD_MEMORY_FILE:
        (input.preparation?.contextFiles ?? input.contextFiles)?.[0]?.path || '',
    };
    const contextFiles = input.preparation?.contextFiles ?? input.contextFiles;

    if (workspace?.path && contextFiles?.length) {
      for (const file of contextFiles) {
        const targetPath = join(workspace.path, file.path);
        const targetDir = targetPath.slice(0, targetPath.lastIndexOf('/'));
        if (targetDir) {
          mkdirSync(targetDir, { recursive: true });
        }
        writeFileSync(targetPath, file.content, 'utf-8');
      }
    }

    const agent = await this.spawn({
      name: input.name,
      type: input.agentType as AgentConfig['type'],
      capabilities: [],
      role: input.role,
      workdir: workspace?.path,
      env,
      executionId: input.executionId,
    });

    const now = new Date();
    const thread: ThreadHandle = {
      id: threadId,
      executionId: input.executionId,
      runtimeName: this.name,
      agentId: agent.id,
      agentType: input.agentType,
      role: input.role,
      status: agent.status === 'ready' ? 'ready' : 'starting',
      workspace,
      objective: input.objective,
      createdAt: now,
      updatedAt: now,
      lastActivityAt: agent.lastActivityAt,
      metadata: input.metadata,
    };

    this.threads.set(threadId, {
      handle: thread,
      sessionId: agent.id,
    });
    this.sessionToThread.set(agent.id, threadId);

    return thread;
  }

  async stopThread(threadId: string, options?: StopOptions): Promise<void> {
    const info = this.threads.get(threadId);
    if (!info?.sessionId) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    await this.stop(info.sessionId, options);
    this.updateThread(threadId, { status: 'stopped' });
  }

  async sendToThread(threadId: string, input: ThreadInput): Promise<void> {
    const info = this.threads.get(threadId);
    if (!info?.sessionId) {
      throw new Error(`Thread not found: ${threadId}`);
    }

    if (input.message) {
      await this.send(info.sessionId, input.message);
    }

    if (input.raw || input.keys) {
      const terminal = this.manager.attachTerminal(info.sessionId);
      if (!terminal) {
        throw new Error(`Terminal not available for thread: ${threadId}`);
      }

      if (input.raw) {
        terminal.write(input.raw);
      }

      if (input.keys) {
        const session = this.manager.getSession(info.sessionId);
        if (!session) {
          throw new Error(`Session not found for thread: ${threadId}`);
        }
        session.sendKeys(input.keys);
      }
    }

    this.updateThread(threadId, {
      status: 'running',
      lastActivityAt: new Date(),
    });
  }

  async getThread(threadId: string): Promise<ThreadHandle | null> {
    const info = this.threads.get(threadId);
    if (!info) return null;

    if (info.sessionId) {
      const session = this.manager.get(info.sessionId);
      if (session) {
        return this.updateThread(threadId, {
          status: this.sessionStatusToThreadStatus(session.status),
          lastActivityAt: session.lastActivityAt,
        });
      }
    }

    return info.handle;
  }

  async listThreads(filter?: ThreadFilter): Promise<ThreadHandle[]> {
    const threads = await Promise.all(
      Array.from(this.threads.keys()).map((threadId) => this.getThread(threadId))
    );

    return threads
      .filter((thread): thread is ThreadHandle => thread !== null)
      .filter((thread) => {
        if (filter?.executionId && thread.executionId !== filter.executionId) return false;
        if (filter?.role && thread.role !== filter.role) return false;
        if (filter?.agentType) {
          const agentTypes = Array.isArray(filter.agentType)
            ? filter.agentType
            : [filter.agentType];
          if (!agentTypes.includes(thread.agentType)) return false;
        }
        if (filter?.status) {
          const statuses = Array.isArray(filter.status)
            ? filter.status
            : [filter.status];
          if (!statuses.includes(thread.status)) return false;
        }
        return true;
      });
  }

  async *subscribeThread(threadId: string): AsyncIterable<ThreadEvent> {
    const queue: ThreadEvent[] = [];
    let resolver: ((value: IteratorResult<ThreadEvent>) => void) | null = null;
    let done = false;

    const handler = (thread: ThreadHandle, threadEvent: ThreadEvent) => {
      if (thread.id !== threadId) return;

      if (resolver) {
        resolver({ value: threadEvent, done: false });
        resolver = null;
      } else {
        queue.push(threadEvent);
      }

      if (
        threadEvent.type === 'thread_completed' ||
        threadEvent.type === 'thread_failed' ||
        threadEvent.type === 'thread_stopped'
      ) {
        done = true;
      }
    };

    this.on('thread_event', handler);

    try {
      while (!done || queue.length > 0) {
        if (queue.length > 0) {
          yield queue.shift()!;
          continue;
        }

        const event = await new Promise<ThreadEvent | null>((resolve) => {
          resolver = (result) => {
            if (result.done) {
              resolve(null);
            } else {
              resolve(result.value);
            }
          };
        });

        if (!event) break;
        yield event;
      }
    } finally {
      this.off('thread_event', handler);
    }
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

  /**
   * Clean up shared auth directory when an execution is fully torn down.
   */
  async cleanupExecution(executionId: string): Promise<void> {
    const dirName = `parallax-auth-${executionId.substring(0, 8)}`;
    const sharedDir = join(tmpdir(), dirName);

    try {
      if (existsSync(sharedDir)) {
        rmSync(sharedDir, { recursive: true, force: true });
        this.logger.info({ sharedDir, executionId }, 'Deleted shared auth directory');
      }
    } catch (error: any) {
      this.logger.warn({ sharedDir, error: error.message }, 'Failed to delete shared auth directory');
    }

    this.sharedAuthDirs.delete(dirName);
  }

  /**
   * Create a shared auth directory for agents in the same execution.
   * All agents with the same executionId share credential directories
   * so only one OAuth login is needed per swarm.
   */
  private ensureSharedAuthDir(executionId: string): string {
    const dirName = `parallax-auth-${executionId.substring(0, 8)}`;
    const sharedDir = join(tmpdir(), dirName);

    if (!this.sharedAuthDirs.has(dirName)) {
      const claudeDir = join(sharedDir, 'claude');
      const codexDir = join(sharedDir, 'codex');

      if (!existsSync(claudeDir)) {
        mkdirSync(claudeDir, { recursive: true });
      }
      if (!existsSync(codexDir)) {
        mkdirSync(codexDir, { recursive: true });
      }

      this.sharedAuthDirs.add(dirName);
      this.logger.info({ sharedDir, executionId }, 'Created shared auth directory');
    }

    return sharedDir;
  }
}

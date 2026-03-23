/**
 * Gateway Runtime Adapter
 *
 * Implements the RuntimeClient interface by delegating to GatewayService
 * for agents that are already connected via the gateway protocol.
 * This allows the AgentRuntimeService to dispatch threads to gateway-connected
 * agents (e.g., Raspberry Pis, remote machines) without needing a separate
 * HTTP runtime server.
 */

import { EventEmitter } from 'events';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import {
  SpawnThreadInput,
  ThreadHandle,
  ThreadInput,
  ThreadFilter,
  ThreadStatus,
  AgentConfig,
  AgentHandle,
  AgentFilter,
  AgentMessage,
  AgentMetrics,
} from '@parallaxai/runtime-interface';
import type { RuntimeHealthStatus } from './runtime-client';

/**
 * Minimal interface for the GatewayService methods we need.
 * Avoids circular dependency by not importing the full GatewayService class.
 */
export interface GatewayServiceAdapter {
  getConnectedAgents(): Map<string, {
    agentId: string;
    agentName: string;
    capabilities: string[];
    metadata: Record<string, string>;
    connectedAt: Date;
    lastHeartbeat: Date;
    status: string;
    activeThreads: Map<string, { executionId: string; status: string }>;
  }>;

  dispatchThreadSpawn(
    agentId: string,
    request: {
      threadId: string;
      adapterType: string;
      task: string;
      preparationJson?: string;
      policyJson?: string;
      timeoutMs?: number;
    },
    timeout?: number
  ): Promise<any>;

  dispatchThreadInput(
    agentId: string,
    threadId: string,
    input: string,
    inputType?: string
  ): void;

  dispatchThreadStop(
    agentId: string,
    threadId: string,
    options?: { force?: boolean }
  ): Promise<any>;

  dispatchTask(
    agentId: string,
    request: { task_id: string; task_description: string; data?: any },
    timeout?: number
  ): Promise<any>;

  subscribeThreadEvents(
    threadId: string,
    callback: (event: any) => void
  ): () => void;
}

export class GatewayRuntimeAdapter extends EventEmitter {
  private threads: Map<string, {
    handle: ThreadHandle;
    gatewayAgentId: string;
  }> = new Map();

  constructor(
    private logger: Logger,
    private gateway: GatewayServiceAdapter
  ) {
    super();
  }

  // ─── RuntimeClient-compatible interface ───

  async connect(): Promise<void> {
    // No connection needed — gateway service is in-process
  }

  disconnect(): void {
    // No-op
  }

  isConnected(): boolean {
    return true;
  }

  async healthCheck(): Promise<RuntimeHealthStatus> {
    // Always report healthy — gateway agents connect/disconnect dynamically.
    // The adapter handles "no matching agent" at spawn time, not at health check time.
    const agents = this.gateway.getConnectedAgents();
    return {
      healthy: true,
      message: `${agents.size} gateway agent(s) connected`,
    };
  }

  /**
   * Spawn a thread on a gateway-connected agent.
   * Finds the right agent by agentId or agentType match.
   */
  async spawnThread(input: SpawnThreadInput): Promise<ThreadHandle> {
    const agentId = this.findGatewayAgent(input);
    if (!agentId) {
      throw new Error(
        `No gateway-connected agent found for type=${input.agentType}` +
        (input.metadata?.agentId ? ` agentId=${input.metadata.agentId}` : '')
      );
    }

    const threadId = input.id || uuidv4();

    this.logger.info(
      { threadId, agentId, agentType: input.agentType, role: input.role },
      'Spawning thread on gateway agent'
    );

    const result = await this.gateway.dispatchThreadSpawn(agentId, {
      threadId,
      adapterType: input.agentType as string,
      task: input.objective,
      preparationJson: JSON.stringify(input.preparation || {}),
      policyJson: JSON.stringify(input.policy || {}),
      timeoutMs: 60000,
    });

    const handle: ThreadHandle = {
      id: threadId,
      executionId: input.executionId,
      runtimeName: 'gateway',
      agentId,
      agentType: input.agentType,
      role: input.role,
      status: result?.success ? 'running' as ThreadStatus : 'failed' as ThreadStatus,
      objective: input.objective,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...input.metadata,
        gatewayAgentId: agentId,
        workspaceDir: result?.workspace_dir,
      },
    };

    this.threads.set(threadId, { handle, gatewayAgentId: agentId });

    // Forward thread events from gateway
    this.gateway.subscribeThreadEvents(threadId, (event) => {
      this.emit('thread_event', { event, thread: handle });
    });

    return handle;
  }

  async stopThread(
    threadId: string,
    options?: { force?: boolean; timeout?: number }
  ): Promise<void> {
    const info = this.threads.get(threadId);
    if (!info) {
      throw new Error(`Thread ${threadId} not found in gateway runtime`);
    }

    await this.gateway.dispatchThreadStop(
      info.gatewayAgentId,
      threadId,
      { force: options?.force }
    );

    info.handle.status = 'completed' as ThreadStatus;
    info.handle.updatedAt = new Date();
  }

  async getThread(threadId: string): Promise<ThreadHandle | null> {
    const info = this.threads.get(threadId);
    return info?.handle || null;
  }

  async listThreads(filter?: ThreadFilter): Promise<ThreadHandle[]> {
    let threads = Array.from(this.threads.values()).map(t => t.handle);

    if (filter?.executionId) {
      threads = threads.filter(t => t.executionId === filter.executionId);
    }
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      threads = threads.filter(t => statuses.includes(t.status));
    }
    if (filter?.role) {
      threads = threads.filter(t => t.role === filter.role);
    }
    if (filter?.agentType) {
      const types = Array.isArray(filter.agentType) ? filter.agentType : [filter.agentType];
      threads = threads.filter(t => types.includes(t.agentType as string));
    }

    return threads;
  }

  async sendToThread(threadId: string, input: ThreadInput): Promise<void> {
    const info = this.threads.get(threadId);
    if (!info) {
      throw new Error(`Thread ${threadId} not found in gateway runtime`);
    }

    const message = input.message || input.raw || input.keys?.join('') || '';

    this.gateway.dispatchThreadInput(
      info.gatewayAgentId,
      threadId,
      message,
      input.raw ? 'raw' : 'message'
    );

    info.handle.updatedAt = new Date();
    info.handle.lastActivityAt = new Date();
  }

  subscribeThread(threadId: string, callback: (event: any) => void): () => void {
    return this.gateway.subscribeThreadEvents(threadId, callback);
  }

  async cleanupExecution(executionId: string): Promise<void> {
    for (const [threadId, info] of this.threads) {
      if (info.handle.executionId === executionId) {
        try {
          await this.gateway.dispatchThreadStop(info.gatewayAgentId, threadId);
        } catch {
          // Best effort
        }
        this.threads.delete(threadId);
      }
    }
  }

  // ─── Agent-level methods (minimal implementation) ───

  async spawn(_config: AgentConfig): Promise<AgentHandle> {
    throw new Error('Gateway runtime does not spawn agents — agents connect themselves');
  }

  async stop(_agentId: string): Promise<void> {
    // Gateway agents manage their own lifecycle
  }

  async get(agentId: string): Promise<AgentHandle | null> {
    const agents = this.gateway.getConnectedAgents();
    const session = agents.get(agentId);
    if (!session) return null;

    return {
      id: session.agentId,
      name: session.agentName,
      type: (session.metadata?.agentType as any) || 'unknown',
      status: 'running' as any,
      capabilities: session.capabilities,
    };
  }

  async list(_filter?: AgentFilter): Promise<AgentHandle[]> {
    const agents = this.gateway.getConnectedAgents();
    return Array.from(agents.values()).map(session => ({
      id: session.agentId,
      name: session.agentName,
      type: (session.metadata?.agentType as any) || 'unknown',
      status: 'running' as any,
      capabilities: session.capabilities,
    }));
  }

  async send(
    agentId: string,
    message: string,
    options?: { expectResponse?: boolean; timeout?: number }
  ): Promise<AgentMessage | void> {
    const taskId = uuidv4();
    const result = await this.gateway.dispatchTask(agentId, {
      task_id: taskId,
      task_description: message,
    }, options?.timeout);
    return result;
  }

  async logs(): Promise<string[]> {
    return [];
  }

  async metrics(): Promise<AgentMetrics | null> {
    return null;
  }

  subscribe(_agentId: string, _callback: (message: AgentMessage) => void): () => void {
    return () => {};
  }

  // ─── Private helpers ───

  /**
   * Find the best gateway-connected agent for the given spawn input.
   * Matches by explicit agentId in metadata, or by agentType/capabilities.
   */
  private findGatewayAgent(input: SpawnThreadInput): string | null {
    const agents = this.gateway.getConnectedAgents();

    // Direct match by agent ID (from pattern metadata)
    const targetAgentId = input.metadata?.agentId as string;
    if (targetAgentId) {
      // Try exact match first
      if (agents.has(targetAgentId)) return targetAgentId;
      // Try prefixed match (e.g., "swarm-echo" for metadata agentId "echo")
      for (const [id] of agents) {
        if (id.endsWith(`-${targetAgentId}`) || id === targetAgentId) {
          return id;
        }
      }
    }

    // Match by agent type
    const agentType = input.agentType as string;
    this.logger.info(
      { agentType, role: input.role, connectedAgents: Array.from(agents.entries()).map(([id, s]) => ({ id, type: s.metadata?.agentType })) },
      'Finding gateway agent for thread'
    );

    for (const [id, session] of agents) {
      const sessionType = session.metadata?.agentType;
      if (sessionType === agentType) {
        const hasThread = Array.from(this.threads.values())
          .some(t => t.gatewayAgentId === id && t.handle.executionId === input.executionId);
        if (!hasThread) return id;
      }
    }

    // Match by capabilities (agent type is often in capabilities list)
    for (const [id, session] of agents) {
      if (session.capabilities.includes(agentType)) {
        const hasThread = Array.from(this.threads.values())
          .some(t => t.gatewayAgentId === id && t.handle.executionId === input.executionId);
        if (!hasThread) return id;
      }
    }

    // No type-specific match — fall back to first available only if no type was specified
    if (!agentType) {
      for (const [id] of agents) {
        const hasThread = Array.from(this.threads.values())
          .some(t => t.gatewayAgentId === id && t.handle.executionId === input.executionId);
        if (!hasThread) return id;
      }
    }

    this.logger.warn(
      { agentType, role: input.role },
      'No matching gateway agent found for requested type'
    );
    return null;
  }
}

/**
 * Gateway service for bidirectional gRPC streaming with NAT-traversing agents.
 * Agents connect outbound to the control plane; tasks are dispatched back through
 * the established stream.
 */

import { EventEmitter } from 'node:events';
import type * as grpc from '@grpc/grpc-js';
import type { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import type { ExecutionEventBus } from '../../execution-events';
import type { IAgentRegistry } from '../../registry';

export interface GatewayAgentSession {
  agentId: string;
  agentName: string;
  capabilities: string[];
  metadata: Record<string, string>;
  stream: grpc.ServerDuplexStream<any, any>;
  connectedAt: Date;
  lastHeartbeat: Date;
  heartbeatIntervalMs: number;
  heartbeatTimer?: NodeJS.Timeout;
  status: 'healthy' | 'unhealthy' | 'dead';
  load: number;
  activeThreads: Map<string, { executionId: string; status: string }>;
}

interface PendingRequest {
  resolve: (value: any) => void;
  reject: (reason: any) => void;
  timeout: NodeJS.Timeout;
  taskId: string;
}

export interface GatewayDispatchResult {
  value?: any;
  confidence: number;
  reasoning?: string;
  metadata?: Record<string, string>;
  error?: string;
}

export class GatewayService extends EventEmitter {
  private connectedAgents: Map<string, GatewayAgentSession> = new Map();
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private threadEventListeners: Map<string, Set<(event: any) => void>> =
    new Map();

  constructor(
    private registry: IAgentRegistry,
    private logger: Logger,
    private nodeId?: string,
    private executionEvents?: ExecutionEventBus
  ) {
    super();
    this.logger = logger.child({ component: 'GatewayService' });
  }

  /**
   * Returns the gRPC service implementation for registration with the server.
   */
  getImplementation() {
    return {
      connect: this.handleConnect.bind(this),
    };
  }

  /**
   * Handle a new bidirectional stream from an agent.
   */
  private handleConnect(stream: grpc.ServerDuplexStream<any, any>): void {
    let agentId: string | null = null;

    stream.on('data', (message: any) => {
      const requestId = message.request_id || '';
      const payload = message.payload;
      // grpc-js with oneofs: true puts the chosen field name in message.<field>
      // and the oneof discriminator in message.payload

      if (message.hello || payload === 'hello') {
        this.handleHello(stream, requestId, message.hello);
        agentId = message.hello?.agent_id || null;
      } else if (message.heartbeat || payload === 'heartbeat') {
        this.handleHeartbeat(message.heartbeat);
      } else if (message.task_result || payload === 'task_result') {
        this.handleTaskResult(requestId, message.task_result);
      } else if (message.task_error || payload === 'task_error') {
        this.handleTaskError(requestId, message.task_error);
      } else if (
        message.thread_spawn_result ||
        payload === 'thread_spawn_result'
      ) {
        this.handleThreadSpawnResult(requestId, message.thread_spawn_result);
      } else if (message.thread_event || payload === 'thread_event') {
        this.handleThreadEvent(message.thread_event);
      } else if (
        message.thread_status_update ||
        payload === 'thread_status_update'
      ) {
        this.handleThreadStatusUpdate(message.thread_status_update);
      }
    });

    stream.on('error', (error: any) => {
      this.logger.warn(
        { agentId, error: error.message },
        'Gateway stream error'
      );
      if (agentId) {
        this.cleanupAgent(agentId, 'stream_error');
      }
    });

    stream.on('end', () => {
      this.logger.info({ agentId }, 'Gateway stream ended');
      if (agentId) {
        this.cleanupAgent(agentId, 'stream_end');
      }
      stream.end();
    });

    stream.on('cancelled', () => {
      this.logger.info({ agentId }, 'Gateway stream cancelled');
      if (agentId) {
        this.cleanupAgent(agentId, 'cancelled');
      }
    });
  }

  /**
   * Handle AgentHello — validate and register the session.
   */
  private async handleHello(
    stream: grpc.ServerDuplexStream<any, any>,
    requestId: string,
    hello: any
  ): Promise<void> {
    if (!hello?.agent_id) {
      stream.write({
        request_id: requestId,
        ack: { accepted: false, message: 'Missing agent_id in hello' },
      });
      stream.end();
      return;
    }

    const agentId = hello.agent_id;

    // Disconnect previous session if any
    if (this.connectedAgents.has(agentId)) {
      this.logger.warn({ agentId }, 'Agent reconnecting, closing old session');
      await this.cleanupAgent(agentId, 'reconnect');
    }

    const heartbeatIntervalMs = hello.heartbeat_interval_ms || 10000;

    const session: GatewayAgentSession = {
      agentId,
      agentName: hello.agent_name || agentId,
      capabilities: hello.capabilities || [],
      metadata: hello.metadata || {},
      stream,
      connectedAt: new Date(),
      lastHeartbeat: new Date(),
      heartbeatIntervalMs,
      status: 'healthy',
      load: 0,
      activeThreads: new Map(),
    };

    // Start heartbeat monitoring: 2x interval = unhealthy, 3x = dead
    session.heartbeatTimer = setInterval(() => {
      const elapsed = Date.now() - session.lastHeartbeat.getTime();
      if (elapsed > heartbeatIntervalMs * 3) {
        this.logger.warn(
          { agentId, elapsed },
          'Agent heartbeat dead, disconnecting'
        );
        session.status = 'dead';
        this.cleanupAgent(agentId, 'heartbeat_dead');
      } else if (elapsed > heartbeatIntervalMs * 2) {
        if (session.status !== 'unhealthy') {
          this.logger.warn({ agentId, elapsed }, 'Agent heartbeat unhealthy');
          session.status = 'unhealthy';
        }
      }
    }, heartbeatIntervalMs);

    this.connectedAgents.set(agentId, session);

    // Register in etcd with gateway:// endpoint
    try {
      await this.registry.register({
        id: agentId,
        name: hello.agent_name || agentId,
        type: 'agent',
        endpoint: `gateway://${agentId}`,
        metadata: {
          capabilities: hello.capabilities || [],
          protocol: 'gateway',
          ...hello.metadata,
        },
        health: {
          status: 'healthy',
          lastCheck: new Date(),
          checkInterval: heartbeatIntervalMs,
        },
        registeredAt: new Date(),
      });
      this.logger.info(
        { agentId, capabilities: hello.capabilities },
        'Gateway agent registered'
      );
    } catch (error) {
      this.logger.error(
        { agentId, error },
        'Failed to register gateway agent in registry'
      );
    }

    // Send ServerAck
    stream.write({
      request_id: requestId,
      ack: {
        accepted: true,
        message: 'Connected',
        assigned_node_id: this.nodeId || 'default',
      },
    });
  }

  /**
   * Handle AgentHeartbeat — update session health.
   */
  private handleHeartbeat(heartbeat: any): void {
    if (!heartbeat?.agent_id) return;
    const session = this.connectedAgents.get(heartbeat.agent_id);
    if (!session) return;

    session.lastHeartbeat = new Date();
    session.load = heartbeat.load || 0;

    if (heartbeat.status === 'draining') {
      session.status = 'unhealthy';
    } else if (session.status === 'unhealthy') {
      // Recovery
      session.status = 'healthy';
    }
  }

  /**
   * Handle TaskResult — resolve the pending request promise.
   */
  private handleTaskResult(requestId: string, result: any): void {
    const taskId = result?.task_id;
    // Look up by request_id first, then by task_id
    const pending =
      this.pendingRequests.get(requestId) || this.pendingRequests.get(taskId);
    if (!pending) {
      this.logger.warn(
        { requestId, taskId },
        'Received task result for unknown request'
      );
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    if (taskId && taskId !== requestId) {
      this.pendingRequests.delete(taskId);
    }

    const parsed = result.value_json
      ? JSON.parse(result.value_json)
      : undefined;
    pending.resolve({
      value: parsed,
      confidence: result.confidence || 0,
      reasoning: result.reasoning,
      metadata: result.metadata || {},
    });
  }

  /**
   * Handle TaskError — reject the pending request promise.
   */
  private handleTaskError(requestId: string, error: any): void {
    const taskId = error?.task_id;
    const pending =
      this.pendingRequests.get(requestId) || this.pendingRequests.get(taskId);
    if (!pending) {
      this.logger.warn(
        { requestId, taskId },
        'Received task error for unknown request'
      );
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);
    if (taskId && taskId !== requestId) {
      this.pendingRequests.delete(taskId);
    }

    pending.resolve({
      value: undefined,
      confidence: 0,
      error: error.error_message || 'Agent task failed',
    });
  }

  /**
   * Dispatch a task to a gateway-connected agent.
   * Returns a promise that resolves when the agent responds.
   */
  async dispatchTask(
    agentId: string,
    request: {
      description: string;
      data?: any;
      metadata?: Record<string, any>;
      patternName?: string;
    },
    timeout: number = 30000
  ): Promise<GatewayDispatchResult> {
    const session = this.connectedAgents.get(agentId);
    if (!session) {
      throw new Error(`Gateway agent ${agentId} not connected`);
    }

    if (session.status === 'dead') {
      throw new Error(`Gateway agent ${agentId} is dead (heartbeat timeout)`);
    }

    const requestId = uuidv4();
    const taskId = uuidv4();

    return new Promise<GatewayDispatchResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          value: undefined,
          confidence: 0,
          error: `Gateway task timed out after ${timeout}ms`,
        });
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timer,
        taskId,
      });

      // Build Struct for data
      const dataStruct = request.data
        ? this.toStruct(request.data)
        : { fields: {} };

      const taskRequest = {
        request_id: requestId,
        task_request: {
          task_id: taskId,
          task_description: request.description,
          data: dataStruct,
          context: request.metadata || {},
          timeout_ms: timeout,
          pattern_name: request.patternName || '',
        },
      };

      try {
        session.stream.write(taskRequest);
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        throw new Error(
          `Failed to write to gateway stream for agent ${agentId}: ${error}`
        );
      }
    });
  }

  /**
   * Check if an agent is connected via gateway.
   */
  isConnected(agentId: string): boolean {
    const session = this.connectedAgents.get(agentId);
    return !!session && session.status !== 'dead';
  }

  /**
   * Health check a gateway-connected agent.
   */
  healthCheck(agentId: string): boolean {
    const session = this.connectedAgents.get(agentId);
    return !!session && session.status === 'healthy';
  }

  /**
   * Get capabilities of a gateway-connected agent.
   */
  getCapabilities(agentId: string): string[] {
    const session = this.connectedAgents.get(agentId);
    return session?.capabilities || [];
  }

  /**
   * Get all connected gateway agent IDs.
   */
  getConnectedAgentIds(): string[] {
    return Array.from(this.connectedAgents.keys());
  }

  /**
   * Get all connected gateway agent sessions.
   * Used by GatewayRuntimeAdapter to find agents for thread dispatch.
   */
  getConnectedAgents(): Map<string, GatewayAgentSession> {
    return this.connectedAgents;
  }

  // ─── Thread protocol handlers ───

  /**
   * Handle ThreadSpawnResult from an agent — resolve the pending spawn promise.
   */
  private handleThreadSpawnResult(requestId: string, result: any): void {
    const pending = this.pendingRequests.get(requestId);
    if (!pending) {
      this.logger.warn(
        { requestId, threadId: result?.thread_id },
        'Received thread spawn result for unknown request'
      );
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(requestId);

    if (result.success) {
      // Track in the agent's session
      for (const session of this.connectedAgents.values()) {
        // Match by checking if this request was sent to this agent (via pending.taskId which stores threadId)
        if (pending.taskId === result.thread_id) {
          session.activeThreads.set(result.thread_id, {
            executionId: result.thread_id,
            status: 'running',
          });
          break;
        }
      }
    }

    pending.resolve({
      thread_id: result.thread_id,
      success: result.success,
      error_message: result.error_message,
      adapter_type: result.adapter_type,
      workspace_dir: result.workspace_dir,
    });
  }

  /**
   * Handle ThreadEventReport from an agent — emit to event bus and local subscribers.
   */
  private handleThreadEvent(report: any): void {
    if (!report?.thread_id) return;

    const event = {
      thread_id: report.thread_id,
      event_type: report.event_type,
      data_json: report.data_json,
      timestamp_ms: parseInt(report.timestamp_ms, 10) || Date.now(),
      sequence: report.sequence || 0,
    };

    // Emit to ExecutionEventBus
    if (this.executionEvents) {
      this.executionEvents.emitEvent({
        executionId: report.thread_id,
        type: `gateway_thread_${report.event_type}`,
        data: event,
        timestamp: new Date(),
      });
    }

    // Emit to local thread event subscribers
    const listeners = this.threadEventListeners.get(report.thread_id);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch {
          // Don't let listener errors break the handler
        }
      }
    }

    // Also emit on the service itself for general listeners
    this.emit('thread_event', event);
  }

  /**
   * Handle ThreadStatusUpdate from an agent — update session tracking and emit.
   */
  private handleThreadStatusUpdate(update: any): void {
    if (!update?.thread_id) return;

    // Update session tracking
    for (const session of this.connectedAgents.values()) {
      const tracked = session.activeThreads.get(update.thread_id);
      if (tracked) {
        tracked.status = update.status;
        if (update.status === 'completed' || update.status === 'failed') {
          session.activeThreads.delete(update.thread_id);
        }
        break;
      }
    }

    // Emit to ExecutionEventBus
    if (this.executionEvents) {
      this.executionEvents.emitEvent({
        executionId: update.thread_id,
        type: 'gateway_thread_status',
        data: {
          thread_id: update.thread_id,
          status: update.status,
          summary: update.summary,
          progress: update.progress,
          timestamp_ms: parseInt(update.timestamp_ms, 10) || Date.now(),
        },
        timestamp: new Date(),
      });
    }

    this.emit('thread_status', update);
  }

  // ─── Thread dispatch methods ───

  /**
   * Dispatch a thread spawn request to a gateway-connected agent.
   * Returns a promise that resolves with the spawn result.
   */
  async dispatchThreadSpawn(
    agentId: string,
    request: {
      threadId: string;
      adapterType: string;
      task: string;
      preparationJson?: string;
      policyJson?: string;
      timeoutMs?: number;
    },
    timeout: number = 60000
  ): Promise<any> {
    const session = this.connectedAgents.get(agentId);
    if (!session) {
      throw new Error(`Gateway agent ${agentId} not connected`);
    }
    if (session.status === 'dead') {
      throw new Error(`Gateway agent ${agentId} is dead (heartbeat timeout)`);
    }

    const requestId = uuidv4();

    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        resolve({
          thread_id: request.threadId,
          success: false,
          error_message: `Thread spawn timed out after ${timeout}ms`,
        });
      }, timeout);

      this.pendingRequests.set(requestId, {
        resolve,
        reject,
        timeout: timer,
        taskId: request.threadId,
      });

      try {
        session.stream.write({
          request_id: requestId,
          thread_spawn: {
            thread_id: request.threadId,
            adapter_type: request.adapterType,
            task: request.task,
            preparation_json: request.preparationJson || '{}',
            policy_json: request.policyJson || '{}',
            timeout_ms: request.timeoutMs || 0,
          },
        });
      } catch (error) {
        clearTimeout(timer);
        this.pendingRequests.delete(requestId);
        throw new Error(
          `Failed to write thread spawn to gateway stream for agent ${agentId}: ${error}`
        );
      }
    });
  }

  /**
   * Send input to a running thread on a gateway-connected agent (fire-and-forget).
   */
  dispatchThreadInput(
    agentId: string,
    threadId: string,
    input: string,
    inputType: string = 'text'
  ): void {
    const session = this.connectedAgents.get(agentId);
    if (!session) {
      this.logger.warn(
        { agentId, threadId },
        'Cannot dispatch thread input — agent not connected'
      );
      return; // Don't throw — let the workflow handle the missing response via timeout
    }

    try {
      session.stream.write({
        request_id: '',
        thread_input: {
          thread_id: threadId,
          input,
          input_type: inputType,
        },
      });
    } catch (error: any) {
      this.logger.warn(
        { agentId, threadId, error: error.message },
        'Failed to write thread input to gateway stream'
      );
    }
  }

  /**
   * Request a thread to stop on a gateway-connected agent.
   */
  async dispatchThreadStop(
    agentId: string,
    threadId: string,
    options?: { reason?: string; force?: boolean }
  ): Promise<void> {
    const session = this.connectedAgents.get(agentId);
    if (!session) {
      throw new Error(`Gateway agent ${agentId} not connected`);
    }

    session.stream.write({
      request_id: uuidv4(),
      thread_stop: {
        thread_id: threadId,
        reason: options?.reason || 'Requested by control plane',
        force: options?.force || false,
      },
    });
  }

  /**
   * Subscribe to thread events for a specific thread.
   * Returns an unsubscribe function.
   */
  subscribeThreadEvents(
    threadId: string,
    callback: (event: any) => void
  ): () => void {
    if (!this.threadEventListeners.has(threadId)) {
      this.threadEventListeners.set(threadId, new Set());
    }
    this.threadEventListeners.get(threadId)!.add(callback);

    return () => {
      const listeners = this.threadEventListeners.get(threadId);
      if (listeners) {
        listeners.delete(callback);
        if (listeners.size === 0) {
          this.threadEventListeners.delete(threadId);
        }
      }
    };
  }

  /**
   * Clean up an agent session — reject pending requests, unregister from etcd.
   */
  private async cleanupAgent(agentId: string, reason: string): Promise<void> {
    const session = this.connectedAgents.get(agentId);
    if (!session) return;

    // Clear heartbeat timer
    if (session.heartbeatTimer) {
      clearInterval(session.heartbeatTimer);
    }

    // Emit thread_failed for all active threads on this agent
    if (session.activeThreads.size > 0) {
      for (const [threadId] of session.activeThreads) {
        this.logger.warn(
          { agentId, threadId, reason },
          'Thread failed due to agent disconnect'
        );
        if (this.executionEvents) {
          this.executionEvents.emitEvent({
            executionId: threadId,
            type: 'gateway_thread_failed',
            data: {
              thread_id: threadId,
              event_type: 'failed',
              data_json: JSON.stringify({
                reason: `Agent disconnected: ${reason}`,
              }),
              timestamp_ms: Date.now(),
              sequence: 0,
            },
            timestamp: new Date(),
          });
        }
        this.emit('thread_event', {
          thread_id: threadId,
          event_type: 'failed',
          data_json: JSON.stringify({
            reason: `Agent disconnected: ${reason}`,
          }),
          timestamp_ms: Date.now(),
          sequence: 0,
        });
        // Clean up thread event listeners
        this.threadEventListeners.delete(threadId);
      }
      session.activeThreads.clear();
    }

    // Reject all pending requests for this agent
    for (const [reqId, pending] of this.pendingRequests) {
      if (pending.taskId) {
        clearTimeout(pending.timeout);
        pending.resolve({
          value: undefined,
          confidence: 0,
          error: `Gateway agent ${agentId} disconnected (${reason})`,
        });
        this.pendingRequests.delete(reqId);
      }
    }

    // Unregister from etcd
    try {
      await this.registry.unregister('agent', agentId);
    } catch (error) {
      this.logger.warn(
        { agentId, error },
        'Failed to unregister gateway agent'
      );
    }

    this.connectedAgents.delete(agentId);
    this.logger.info({ agentId, reason }, 'Gateway agent cleaned up');
  }

  /**
   * Shut down all gateway connections.
   */
  async shutdown(): Promise<void> {
    for (const agentId of this.connectedAgents.keys()) {
      await this.cleanupAgent(agentId, 'server_shutdown');
    }
  }

  // ── Struct helpers ──

  private toStructValue(value: any): any {
    if (value === null || value === undefined) {
      return { nullValue: 0 };
    }
    if (Array.isArray(value)) {
      return {
        listValue: { values: value.map((item) => this.toStructValue(item)) },
      };
    }
    if (typeof value === 'object') {
      const fields: Record<string, any> = {};
      for (const [key, entry] of Object.entries(value)) {
        fields[key] = this.toStructValue(entry);
      }
      return { structValue: { fields } };
    }
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return { numberValue: value };
    if (typeof value === 'boolean') return { boolValue: value };
    return { stringValue: String(value) };
  }

  private toStruct(value: any): any {
    if (value && typeof value === 'object' && 'fields' in value) return value;
    const structValue = this.toStructValue(value)?.structValue;
    return { fields: structValue?.fields || {} };
  }
}

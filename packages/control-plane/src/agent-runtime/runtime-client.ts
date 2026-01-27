/**
 * Agent Runtime Client
 *
 * HTTP/WebSocket client for communicating with runtime servers (local, docker, k8s).
 */

import { Logger } from 'pino';
import { EventEmitter } from 'events';
import WebSocket from 'ws';
import {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentFilter,
  AgentMetrics,
} from '@parallax/runtime-interface';

export interface RuntimeClientOptions {
  baseUrl: string;
  wsUrl?: string;
  timeout?: number;
  reconnectInterval?: number;
}

export interface RuntimeHealthStatus {
  healthy: boolean;
  message?: string;
  runtime?: {
    name: string;
    type: string;
    activeAgents: number;
  };
}

/**
 * Client for communicating with a runtime server
 */
export class RuntimeClient extends EventEmitter {
  private baseUrl: string;
  private wsUrl: string;
  private timeout: number;
  private reconnectInterval: number;
  private ws: WebSocket | null = null;
  private wsReconnectTimer: NodeJS.Timeout | null = null;
  private connected = false;
  private subscriptions: Map<string, Set<(message: AgentMessage) => void>> = new Map();

  constructor(
    private logger: Logger,
    private options: RuntimeClientOptions
  ) {
    super();
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.wsUrl = options.wsUrl || this.baseUrl.replace(/^http/, 'ws') + '/ws';
    this.timeout = options.timeout || 30000;
    this.reconnectInterval = options.reconnectInterval || 5000;
  }

  /**
   * Connect to the runtime server WebSocket
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.wsUrl);

        this.ws.on('open', () => {
          this.connected = true;
          this.logger.info({ url: this.wsUrl }, 'Connected to runtime WebSocket');
          this.emit('connected');
          resolve();
        });

        this.ws.on('message', (data) => {
          try {
            const msg = JSON.parse(data.toString());
            this.handleMessage(msg);
          } catch (error) {
            this.logger.error({ error }, 'Failed to parse WebSocket message');
          }
        });

        this.ws.on('close', () => {
          this.connected = false;
          this.logger.info('Runtime WebSocket closed');
          this.emit('disconnected');
          this.scheduleReconnect();
        });

        this.ws.on('error', (error) => {
          this.logger.error({ error }, 'Runtime WebSocket error');
          this.emit('error', error);
          if (!this.connected) {
            reject(error);
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Disconnect from the runtime server
   */
  disconnect(): void {
    if (this.wsReconnectTimer) {
      clearTimeout(this.wsReconnectTimer);
      this.wsReconnectTimer = null;
    }

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.connected = false;
  }

  /**
   * Check runtime health
   */
  async healthCheck(): Promise<RuntimeHealthStatus> {
    const response = await this.request<RuntimeHealthStatus>('GET', '/api/health');
    return response;
  }

  /**
   * Spawn a new agent
   */
  async spawn(config: AgentConfig): Promise<AgentHandle> {
    return this.request<AgentHandle>('POST', '/api/agents', config);
  }

  /**
   * Stop an agent
   */
  async stop(agentId: string, options?: { force?: boolean; timeout?: number }): Promise<void> {
    const query = new URLSearchParams();
    if (options?.force) query.set('force', 'true');
    if (options?.timeout) query.set('timeout', options.timeout.toString());

    const queryString = query.toString();
    await this.request('DELETE', `/api/agents/${agentId}${queryString ? '?' + queryString : ''}`);
  }

  /**
   * Get agent by ID
   */
  async get(agentId: string): Promise<AgentHandle | null> {
    try {
      return await this.request<AgentHandle>('GET', `/api/agents/${agentId}`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * List agents
   */
  async list(filter?: AgentFilter): Promise<AgentHandle[]> {
    const query = new URLSearchParams();
    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      statuses.forEach(s => query.append('status', s));
    }
    if (filter?.role) query.set('role', filter.role);
    if (filter?.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      types.forEach(t => query.append('type', t));
    }

    const queryString = query.toString();
    const response = await this.request<{ agents: AgentHandle[]; count: number }>(
      'GET',
      `/api/agents${queryString ? '?' + queryString : ''}`
    );
    return response.agents;
  }

  /**
   * Send a message to an agent
   */
  async send(
    agentId: string,
    message: string,
    options?: { expectResponse?: boolean; timeout?: number }
  ): Promise<AgentMessage | void> {
    const response = await this.request<{ sent: boolean; response?: AgentMessage }>(
      'POST',
      `/api/agents/${agentId}/send`,
      { message, ...options }
    );
    return response.response;
  }

  /**
   * Get agent logs
   */
  async logs(agentId: string, options?: { tail?: number }): Promise<string[]> {
    const query = new URLSearchParams();
    if (options?.tail) query.set('tail', options.tail.toString());

    const queryString = query.toString();
    const response = await this.request<{ logs: string[]; count: number }>(
      'GET',
      `/api/agents/${agentId}/logs${queryString ? '?' + queryString : ''}`
    );
    return response.logs;
  }

  /**
   * Get agent metrics
   */
  async metrics(agentId: string): Promise<AgentMetrics | null> {
    try {
      return await this.request<AgentMetrics>('GET', `/api/agents/${agentId}/metrics`);
    } catch (error: any) {
      if (error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  /**
   * Subscribe to agent messages via WebSocket
   */
  subscribe(agentId: string, callback: (message: AgentMessage) => void): () => void {
    if (!this.subscriptions.has(agentId)) {
      this.subscriptions.set(agentId, new Set());
    }
    this.subscriptions.get(agentId)!.add(callback);

    // Send subscribe command over WebSocket if connected
    if (this.ws && this.connected) {
      // The server handles subscriptions via query param on connect
      // For now, we track subscriptions client-side
    }

    return () => {
      this.subscriptions.get(agentId)?.delete(callback);
    };
  }

  /**
   * Check if connected to runtime
   */
  isConnected(): boolean {
    return this.connected;
  }

  private handleMessage(msg: { event: string; data: any; timestamp: string }): void {
    this.emit(msg.event, msg.data);

    // Forward messages to agent subscribers
    if (msg.event === 'message' && msg.data?.message?.agentId) {
      const agentId = msg.data.message.agentId;
      const callbacks = this.subscriptions.get(agentId);
      if (callbacks) {
        callbacks.forEach(cb => cb(msg.data.message));
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.wsReconnectTimer) return;

    this.wsReconnectTimer = setTimeout(async () => {
      this.wsReconnectTimer = null;
      try {
        await this.connect();
      } catch (error) {
        this.logger.warn({ error }, 'Failed to reconnect to runtime');
        this.scheduleReconnect();
      }
    }, this.reconnectInterval);
  }

  private async request<T>(method: string, path: string, body?: any): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      if (!response.ok) {
        const error: any = new Error(`Request failed: ${response.statusText}`);
        error.status = response.status;
        try {
          const errorBody = await response.json() as { error?: string };
          error.message = errorBody.error || error.message;
        } catch {
          // Ignore JSON parse errors
        }
        throw error;
      }

      if (response.status === 204) {
        return undefined as T;
      }

      return await response.json() as T;
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

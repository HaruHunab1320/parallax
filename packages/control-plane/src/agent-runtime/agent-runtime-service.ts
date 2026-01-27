/**
 * Agent Runtime Service
 *
 * Manages connections to multiple runtime providers (local, docker, kubernetes)
 * and provides a unified interface for spawning and managing CLI agents.
 */

import { Logger } from 'pino';
import { EventEmitter } from 'events';
import {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentFilter,
  AgentMetrics,
  AgentType,
} from '@parallax/runtime-interface';
import { RuntimeClient, RuntimeClientOptions, RuntimeHealthStatus } from './runtime-client';

export interface RuntimeRegistration {
  name: string;
  type: 'local' | 'docker' | 'kubernetes';
  client: RuntimeClient;
  priority: number; // Lower = higher priority for agent placement
  healthy: boolean;
}

export interface AgentRuntimeServiceOptions {
  defaultTimeout?: number;
  healthCheckInterval?: number;
}

/**
 * Service for managing agent runtimes
 */
export class AgentRuntimeService extends EventEmitter {
  private runtimes: Map<string, RuntimeRegistration> = new Map();
  private agentToRuntime: Map<string, string> = new Map(); // agentId -> runtimeName
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private healthCheckInterval: number;
  private defaultTimeout: number;

  constructor(
    private logger: Logger,
    private options: AgentRuntimeServiceOptions = {}
  ) {
    super();
    this.healthCheckInterval = options.healthCheckInterval || 30000;
    this.defaultTimeout = options.defaultTimeout || 30000;
  }

  /**
   * Register a runtime provider
   */
  async registerRuntime(
    name: string,
    type: 'local' | 'docker' | 'kubernetes',
    clientOptions: RuntimeClientOptions,
    priority: number = 100
  ): Promise<void> {
    const client = new RuntimeClient(this.logger.child({ runtime: name }), clientOptions);

    // Set up event forwarding
    client.on('connected', () => {
      this.logger.info({ runtime: name }, 'Runtime connected');
      this.emit('runtime_connected', name);
    });

    client.on('disconnected', () => {
      this.logger.info({ runtime: name }, 'Runtime disconnected');
      this.emit('runtime_disconnected', name);
    });

    client.on('agent_started', (data) => this.emit('agent_started', { ...data, runtime: name }));
    client.on('agent_ready', (data) => this.emit('agent_ready', { ...data, runtime: name }));
    client.on('agent_stopped', (data) => this.emit('agent_stopped', { ...data, runtime: name }));
    client.on('agent_error', (data) => this.emit('agent_error', { ...data, runtime: name }));
    client.on('message', (data) => this.emit('message', { ...data, runtime: name }));
    client.on('question', (data) => this.emit('question', { ...data, runtime: name }));

    // Try to connect
    try {
      await client.connect();
    } catch (error) {
      this.logger.warn({ runtime: name, error }, 'Failed to connect to runtime, will retry');
    }

    const registration: RuntimeRegistration = {
      name,
      type,
      client,
      priority,
      healthy: client.isConnected(),
    };

    this.runtimes.set(name, registration);
    this.logger.info({ runtime: name, type, priority }, 'Runtime registered');

    // Start health check if not already running
    if (!this.healthCheckTimer) {
      this.startHealthCheck();
    }
  }

  /**
   * Unregister a runtime provider
   */
  async unregisterRuntime(name: string): Promise<void> {
    const registration = this.runtimes.get(name);
    if (!registration) return;

    registration.client.disconnect();
    this.runtimes.delete(name);
    this.logger.info({ runtime: name }, 'Runtime unregistered');
  }

  /**
   * Get all registered runtimes
   */
  listRuntimes(): Array<{ name: string; type: string; healthy: boolean; priority: number }> {
    return Array.from(this.runtimes.values()).map(r => ({
      name: r.name,
      type: r.type,
      healthy: r.healthy,
      priority: r.priority,
    }));
  }

  /**
   * Get runtime health status
   */
  async getRuntimeHealth(name: string): Promise<RuntimeHealthStatus | null> {
    const registration = this.runtimes.get(name);
    if (!registration) return null;

    try {
      return await registration.client.healthCheck();
    } catch (error) {
      return { healthy: false, message: 'Health check failed' };
    }
  }

  /**
   * Spawn an agent on the most suitable runtime
   */
  async spawn(config: AgentConfig, preferredRuntime?: string): Promise<AgentHandle> {
    const runtime = this.selectRuntime(config, preferredRuntime);
    if (!runtime) {
      throw new Error('No healthy runtime available for agent spawn');
    }

    const agent = await runtime.client.spawn(config);
    this.agentToRuntime.set(agent.id, runtime.name);

    this.logger.info(
      { agentId: agent.id, runtime: runtime.name, type: config.type },
      'Agent spawned'
    );

    return agent;
  }

  /**
   * Stop an agent
   */
  async stop(agentId: string, options?: { force?: boolean; timeout?: number }): Promise<void> {
    const runtimeName = this.agentToRuntime.get(agentId);
    if (!runtimeName) {
      // Agent not tracked, try all runtimes
      for (const runtime of this.runtimes.values()) {
        try {
          await runtime.client.stop(agentId, options);
          return;
        } catch {
          // Continue to next runtime
        }
      }
      throw new Error(`Agent ${agentId} not found in any runtime`);
    }

    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) {
      throw new Error(`Runtime ${runtimeName} not found`);
    }

    await runtime.client.stop(agentId, options);
    this.agentToRuntime.delete(agentId);

    this.logger.info({ agentId, runtime: runtimeName }, 'Agent stopped');
  }

  /**
   * Get agent by ID
   */
  async get(agentId: string): Promise<AgentHandle | null> {
    const runtimeName = this.agentToRuntime.get(agentId);
    if (runtimeName) {
      const runtime = this.runtimes.get(runtimeName);
      if (runtime) {
        return runtime.client.get(agentId);
      }
    }

    // Search all runtimes
    for (const runtime of this.runtimes.values()) {
      const agent = await runtime.client.get(agentId);
      if (agent) {
        this.agentToRuntime.set(agentId, runtime.name);
        return agent;
      }
    }

    return null;
  }

  /**
   * List all agents across all runtimes
   */
  async list(filter?: AgentFilter): Promise<Array<AgentHandle & { runtime: string }>> {
    const results: Array<AgentHandle & { runtime: string }> = [];

    for (const runtime of this.runtimes.values()) {
      try {
        const agents = await runtime.client.list(filter);
        for (const agent of agents) {
          results.push({ ...agent, runtime: runtime.name });
          this.agentToRuntime.set(agent.id, runtime.name);
        }
      } catch (error) {
        this.logger.warn({ runtime: runtime.name, error }, 'Failed to list agents from runtime');
      }
    }

    return results;
  }

  /**
   * Send a message to an agent
   */
  async send(
    agentId: string,
    message: string,
    options?: { expectResponse?: boolean; timeout?: number }
  ): Promise<AgentMessage | void> {
    const runtimeName = this.agentToRuntime.get(agentId);
    if (!runtimeName) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) {
      throw new Error(`Runtime ${runtimeName} not found`);
    }

    return runtime.client.send(agentId, message, options);
  }

  /**
   * Get agent logs
   */
  async logs(agentId: string, options?: { tail?: number }): Promise<string[]> {
    const runtimeName = this.agentToRuntime.get(agentId);
    if (!runtimeName) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) {
      throw new Error(`Runtime ${runtimeName} not found`);
    }

    return runtime.client.logs(agentId, options);
  }

  /**
   * Get agent metrics
   */
  async metrics(agentId: string): Promise<AgentMetrics | null> {
    const runtimeName = this.agentToRuntime.get(agentId);
    if (!runtimeName) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) {
      throw new Error(`Runtime ${runtimeName} not found`);
    }

    return runtime.client.metrics(agentId);
  }

  /**
   * Subscribe to messages from an agent
   */
  subscribe(agentId: string, callback: (message: AgentMessage) => void): () => void {
    const runtimeName = this.agentToRuntime.get(agentId);
    if (!runtimeName) {
      throw new Error(`Agent ${agentId} not found`);
    }

    const runtime = this.runtimes.get(runtimeName);
    if (!runtime) {
      throw new Error(`Runtime ${runtimeName} not found`);
    }

    return runtime.client.subscribe(agentId, callback);
  }

  /**
   * Shutdown the service
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    for (const runtime of this.runtimes.values()) {
      runtime.client.disconnect();
    }

    this.runtimes.clear();
    this.agentToRuntime.clear();
  }

  /**
   * Select the best runtime for spawning an agent
   */
  private selectRuntime(config: AgentConfig, preferredRuntime?: string): RuntimeRegistration | null {
    // Use preferred runtime if specified and healthy
    if (preferredRuntime) {
      const runtime = this.runtimes.get(preferredRuntime);
      if (runtime?.healthy) {
        return runtime;
      }
    }

    // Get all healthy runtimes sorted by priority
    const healthyRuntimes = Array.from(this.runtimes.values())
      .filter(r => r.healthy)
      .sort((a, b) => a.priority - b.priority);

    if (healthyRuntimes.length === 0) {
      return null;
    }

    // For now, return highest priority runtime
    // Future: could consider agent type, load balancing, etc.
    return healthyRuntimes[0];
  }

  /**
   * Start periodic health checks
   */
  private startHealthCheck(): void {
    this.healthCheckTimer = setInterval(async () => {
      for (const runtime of this.runtimes.values()) {
        try {
          const health = await runtime.client.healthCheck();
          const wasHealthy = runtime.healthy;
          runtime.healthy = health.healthy;

          if (wasHealthy && !runtime.healthy) {
            this.logger.warn({ runtime: runtime.name }, 'Runtime became unhealthy');
            this.emit('runtime_unhealthy', runtime.name);
          } else if (!wasHealthy && runtime.healthy) {
            this.logger.info({ runtime: runtime.name }, 'Runtime became healthy');
            this.emit('runtime_healthy', runtime.name);
          }
        } catch (error) {
          runtime.healthy = false;
        }
      }
    }, this.healthCheckInterval);
  }
}

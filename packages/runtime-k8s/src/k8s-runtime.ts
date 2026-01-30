/**
 * Kubernetes Runtime Provider
 *
 * Manages CLI agents as Kubernetes pods via ParallaxAgent CRD.
 */

import * as k8s from '@kubernetes/client-node';
import { EventEmitter } from 'events';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import {
  AgentConfig,
  AgentHandle,
  AgentMessage,
  AgentStatus,
  AgentType,
  AgentFilter,
  AgentMetrics,
  BaseRuntimeProvider,
  StopOptions,
  SendOptions,
  LogOptions,
} from '@parallax/runtime-interface';

export interface K8sRuntimeOptions {
  namespace?: string;
  kubeconfigPath?: string;
  inCluster?: boolean;
  imagePrefix?: string;
  registryEndpoint?: string;
  defaultResources?: {
    cpu?: string;
    memory?: string;
  };
}

interface AgentInfo {
  config: AgentConfig;
  handle: AgentHandle;
  resourceName: string;
}

const DEFAULT_IMAGES: Record<AgentType, string> = {
  claude: 'parallax/agent-claude:latest',
  codex: 'parallax/agent-codex:latest',
  gemini: 'parallax/agent-gemini:latest',
  aider: 'parallax/agent-aider:latest',
  custom: 'parallax/agent-base:latest',
};

// Environment variable defaults for configuration
const DEFAULT_NAMESPACE = process.env.PARALLAX_NAMESPACE || 'parallax-agents';
const DEFAULT_IMAGE_PREFIX = process.env.PARALLAX_IMAGE_PREFIX || '';
const DEFAULT_REGISTRY_ENDPOINT = process.env.PARALLAX_REGISTRY || '';

const CRD_GROUP = 'parallax.ai';
const CRD_VERSION = 'v1';
const CRD_PLURAL = 'parallaxagents';

export class K8sRuntime extends BaseRuntimeProvider {
  readonly name = 'kubernetes';
  readonly type = 'kubernetes' as const;

  private kc: k8s.KubeConfig;
  private coreApi: k8s.CoreV1Api;
  private appsApi: k8s.AppsV1Api;
  private customApi: k8s.CustomObjectsApi;
  private namespace: string;
  private imagePrefix: string;
  private agents: Map<string, AgentInfo> = new Map();
  private watcher: k8s.Watch | null = null;
  private initialized = false;

  constructor(
    private logger: Logger,
    private options: K8sRuntimeOptions = {}
  ) {
    super();
    this.kc = new k8s.KubeConfig();

    if (options.inCluster) {
      this.kc.loadFromCluster();
    } else if (options.kubeconfigPath) {
      this.kc.loadFromFile(options.kubeconfigPath);
    } else {
      this.kc.loadFromDefault();
    }

    this.coreApi = this.kc.makeApiClient(k8s.CoreV1Api);
    this.appsApi = this.kc.makeApiClient(k8s.AppsV1Api);
    this.customApi = this.kc.makeApiClient(k8s.CustomObjectsApi);
    this.namespace = options.namespace || DEFAULT_NAMESPACE;
    this.imagePrefix = options.imagePrefix || DEFAULT_IMAGE_PREFIX;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info({ namespace: this.namespace }, 'Initializing Kubernetes runtime');

    // Verify cluster connection
    try {
      await this.coreApi.listNamespace();
    } catch (error) {
      throw new Error('Cannot connect to Kubernetes cluster. Check your kubeconfig.');
    }

    // Ensure namespace exists
    await this.ensureNamespace();

    // Start watching for ParallaxAgent resources
    await this.startWatcher();

    // Sync existing agents
    await this.syncAgents();

    this.initialized = true;
    this.logger.info('Kubernetes runtime initialized');
  }

  async shutdown(stopAgents = true): Promise<void> {
    this.logger.info({ stopAgents }, 'Shutting down Kubernetes runtime');

    if (this.watcher) {
      // Stop watcher
      this.watcher = null;
    }

    if (stopAgents) {
      const stopPromises = Array.from(this.agents.keys()).map((id) =>
        this.stop(id, { force: true })
      );
      await Promise.allSettled(stopPromises);
    }

    this.agents.clear();
    this.initialized = false;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.coreApi.listNamespacedPod({ namespace: this.namespace });
      const agents = await this.list();
      const ready = agents.filter((a) => a.status === 'ready').length;
      return {
        healthy: true,
        message: `K8s runtime healthy, ${ready}/${agents.length} agents ready`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'K8s unavailable',
      };
    }
  }

  async spawn(config: AgentConfig): Promise<AgentHandle> {
    if (!this.initialized) {
      await this.initialize();
    }

    const agentId = config.id || uuidv4();
    const resourceName = `agent-${agentId.substring(0, 8)}`;

    this.logger.info({ agentId, type: config.type, resourceName }, 'Spawning agent via CRD');

    // Create ParallaxAgent resource
    const agentResource = this.buildAgentResource(agentId, resourceName, config);

    await this.customApi.createNamespacedCustomObject({
      group: CRD_GROUP,
      version: CRD_VERSION,
      namespace: this.namespace,
      plural: CRD_PLURAL,
      body: agentResource,
    });

    const handle: AgentHandle = {
      id: agentId,
      name: config.name,
      type: config.type,
      status: 'pending',
      podName: resourceName,
      capabilities: config.capabilities || [],
      role: config.role,
      startedAt: new Date(),
    };

    this.agents.set(agentId, {
      config,
      handle,
      resourceName,
    });

    this.emit('agent_started', handle);

    return handle;
  }

  async stop(agentId: string, options?: StopOptions): Promise<void> {
    const info = this.agents.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.logger.info({ agentId, resourceName: info.resourceName }, 'Stopping agent');

    info.handle.status = 'stopping';

    // Delete the ParallaxAgent resource
    try {
      await this.customApi.deleteNamespacedCustomObject({
        group: CRD_GROUP,
        version: CRD_VERSION,
        namespace: this.namespace,
        plural: CRD_PLURAL,
        name: info.resourceName,
        gracePeriodSeconds: options?.force ? 0 : options?.timeout ? Math.floor(options.timeout / 1000) : 30,
      });
    } catch (error: any) {
      if (error.statusCode !== 404) {
        throw error;
      }
    }

    info.handle.status = 'stopped';
    this.emit('agent_stopped', info.handle, 'stopped');
    this.agents.delete(agentId);
  }

  async restart(agentId: string): Promise<AgentHandle> {
    const info = this.agents.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.logger.info({ agentId }, 'Restarting agent');

    // Delete and recreate
    await this.stop(agentId, { force: true });
    return this.spawn(info.config);
  }

  async get(agentId: string): Promise<AgentHandle | null> {
    const info = this.agents.get(agentId);
    if (!info) return null;

    // Update status from K8s
    try {
      const resource = await this.customApi.getNamespacedCustomObject({
        group: CRD_GROUP,
        version: CRD_VERSION,
        namespace: this.namespace,
        plural: CRD_PLURAL,
        name: info.resourceName,
      });

      const status = (resource as any).status;
      if (status?.phase) {
        info.handle.status = this.k8sPhaseToStatus(status.phase);
      }
      if (status?.endpoint) {
        info.handle.endpoint = status.endpoint;
      }
    } catch (error: any) {
      if (error.statusCode === 404) {
        this.agents.delete(agentId);
        return null;
      }
    }

    return info.handle;
  }

  async list(filter?: AgentFilter): Promise<AgentHandle[]> {
    await this.syncAgents();

    let handles = Array.from(this.agents.values()).map((info) => info.handle);

    if (filter?.status) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];
      handles = handles.filter((h) => statuses.includes(h.status));
    }

    if (filter?.type) {
      const types = Array.isArray(filter.type) ? filter.type : [filter.type];
      handles = handles.filter((h) => types.includes(h.type));
    }

    if (filter?.role) {
      handles = handles.filter((h) => h.role === filter.role);
    }

    if (filter?.capabilities) {
      handles = handles.filter((h) =>
        filter.capabilities!.every((cap) => h.capabilities.includes(cap))
      );
    }

    return handles;
  }

  async send(
    agentId: string,
    message: string,
    options?: SendOptions
  ): Promise<AgentMessage | void> {
    const info = this.agents.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Get the agent's service endpoint
    const endpoint = info.handle.endpoint;
    if (!endpoint) {
      throw new Error(`Agent ${agentId} has no endpoint`);
    }

    // Send via HTTP to the agent's endpoint
    const response = await fetch(`${endpoint}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });

    if (!response.ok) {
      throw new Error(`Failed to send message: ${response.statusText}`);
    }

    if (options?.expectResponse) {
      const data = await response.json() as { response?: AgentMessage };
      return data.response;
    }
  }

  async *subscribe(agentId: string): AsyncIterable<AgentMessage> {
    const info = this.agents.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Get the agent's service endpoint
    const endpoint = info.handle.endpoint;
    if (!endpoint) {
      throw new Error(`Agent ${agentId} has no endpoint - cannot subscribe`);
    }

    // Create an abort controller for cleanup
    const abortController = new AbortController();

    try {
      // Connect to the agent's streaming endpoint using Server-Sent Events
      const response = await fetch(`${endpoint}/stream`, {
        method: 'GET',
        headers: { 'Accept': 'text/event-stream' },
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to connect to agent stream: ${response.statusText}`);
      }

      if (!response.body) {
        throw new Error('No response body from agent stream');
      }

      // Parse SSE stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              const message: AgentMessage = {
                id: data.id || `msg-${Date.now()}`,
                agentId: agentId,
                direction: 'outbound',
                type: data.type || 'response',
                content: data.content || data.message || '',
                timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
                metadata: data.metadata,
              };
              yield message;
            } catch {
              // Skip malformed messages
              this.logger.debug({ line }, 'Skipping malformed SSE message');
            }
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        // Normal cleanup, don't log as error
        return;
      }
      this.logger.error({ agentId, error }, 'Error in agent subscription');
      throw error;
    } finally {
      abortController.abort();
    }
  }

  async *logs(agentId: string, options?: LogOptions): AsyncIterable<string> {
    const info = this.agents.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Get pod name from deployment
    const pods = await this.coreApi.listNamespacedPod({
      namespace: this.namespace,
      labelSelector: `parallax.ai/agent-id=${agentId}`,
    });

    if (!pods.items || pods.items.length === 0) {
      return;
    }

    const podName = pods.items[0].metadata?.name;
    if (!podName) return;

    const logResponse = await this.coreApi.readNamespacedPodLog({
      name: podName,
      namespace: this.namespace,
      tailLines: options?.tail || 100,
    });

    const lines = logResponse.split('\n');
    for (const line of lines) {
      if (line.trim()) {
        yield line;
      }
    }
  }

  async metrics(agentId: string): Promise<AgentMetrics | null> {
    const info = this.agents.get(agentId);
    if (!info) return null;

    // Get pod metrics (requires metrics-server)
    try {
      const pods = await this.coreApi.listNamespacedPod({
        namespace: this.namespace,
        labelSelector: `parallax.ai/agent-id=${agentId}`,
      });

      if (!pods.items || pods.items.length === 0) {
        return null;
      }

      const pod = pods.items[0];
      const uptime = pod.status?.startTime
        ? Date.now() - new Date(pod.status.startTime).getTime()
        : 0;

      return {
        uptime,
        // CPU and memory would require metrics-server
      };
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  private async ensureNamespace(): Promise<void> {
    try {
      await this.coreApi.readNamespace({ name: this.namespace });
    } catch (error: any) {
      if (error.statusCode === 404) {
        this.logger.info({ namespace: this.namespace }, 'Creating namespace');
        await this.coreApi.createNamespace({
          body: {
            metadata: {
              name: this.namespace,
              labels: {
                'parallax.ai/managed': 'true',
              },
            },
          },
        });
      } else {
        throw error;
      }
    }
  }

  private async startWatcher(): Promise<void> {
    this.watcher = new k8s.Watch(this.kc);

    const path = `/apis/${CRD_GROUP}/${CRD_VERSION}/namespaces/${this.namespace}/${CRD_PLURAL}`;

    try {
      await this.watcher.watch(
        path,
        {},
        (type, apiObj) => {
          this.handleWatchEvent(type, apiObj);
        },
        (err) => {
          if (err) {
            this.logger.error({ error: err }, 'Watch error');
          }
        }
      );
    } catch (error) {
      this.logger.warn({ error }, 'Failed to start watcher');
    }
  }

  private handleWatchEvent(type: string, obj: any): void {
    const agentId = obj.metadata?.labels?.['parallax.ai/agent-id'];
    if (!agentId) return;

    const info = this.agents.get(agentId);
    if (!info) return;

    const status = obj.status;

    switch (type) {
      case 'ADDED':
      case 'MODIFIED':
        if (status?.phase) {
          const newStatus = this.k8sPhaseToStatus(status.phase);
          if (info.handle.status !== newStatus) {
            const oldStatus = info.handle.status;
            info.handle.status = newStatus;

            if (newStatus === 'ready' && oldStatus !== 'ready') {
              this.emit('agent_ready', info.handle);
            }
          }
        }
        if (status?.endpoint) {
          info.handle.endpoint = status.endpoint;
        }
        break;

      case 'DELETED':
        info.handle.status = 'stopped';
        this.emit('agent_stopped', info.handle, 'deleted');
        this.agents.delete(agentId);
        break;
    }
  }

  private async syncAgents(): Promise<void> {
    try {
      const resources = await this.customApi.listNamespacedCustomObject({
        group: CRD_GROUP,
        version: CRD_VERSION,
        namespace: this.namespace,
        plural: CRD_PLURAL,
      });

      const items = (resources as any).items || [];

      for (const item of items) {
        const agentId = item.metadata?.labels?.['parallax.ai/agent-id'];
        if (!agentId) continue;

        if (!this.agents.has(agentId)) {
          // Found untracked agent
          const handle: AgentHandle = {
            id: agentId,
            name: item.spec?.name || 'unknown',
            type: (item.spec?.type || 'custom') as AgentType,
            status: this.k8sPhaseToStatus(item.status?.phase || 'Pending'),
            podName: item.metadata?.name,
            capabilities: item.spec?.capabilities || [],
            role: item.spec?.role,
            endpoint: item.status?.endpoint,
          };

          this.agents.set(agentId, {
            config: {
              id: agentId,
              name: handle.name,
              type: handle.type,
              capabilities: handle.capabilities,
              role: handle.role,
            },
            handle,
            resourceName: item.metadata?.name,
          });
        }
      }
    } catch (error) {
      this.logger.warn({ error }, 'Failed to sync agents');
    }
  }

  private buildAgentResource(agentId: string, resourceName: string, config: AgentConfig): any {
    const image = config.type === 'custom' && config.env?.['AGENT_IMAGE']
      ? config.env['AGENT_IMAGE']
      : this.getImageForType(config.type);

    return {
      apiVersion: `${CRD_GROUP}/${CRD_VERSION}`,
      kind: 'ParallaxAgent',
      metadata: {
        name: resourceName,
        namespace: this.namespace,
        labels: {
          'parallax.ai/managed': 'true',
          'parallax.ai/agent-id': agentId,
          'parallax.ai/agent-type': config.type,
        },
      },
      spec: {
        type: config.type,
        name: config.name,
        role: config.role,
        capabilities: config.capabilities || [],
        reportsTo: config.reportsTo,
        image,
        resources: {
          cpu: config.resources?.cpu || this.options.defaultResources?.cpu || '1',
          memory: config.resources?.memory || this.options.defaultResources?.memory || '2Gi',
        },
        env: this.buildEnvArray(config),
        autoRestart: config.autoRestart ?? true,
        idleTimeout: config.idleTimeout,
      },
    };
  }

  private getImageForType(type: AgentType): string {
    const baseImage = DEFAULT_IMAGES[type] || DEFAULT_IMAGES.custom;
    return this.imagePrefix ? `${this.imagePrefix}/${baseImage}` : baseImage;
  }

  private buildEnvArray(config: AgentConfig): Array<{ name: string; value?: string; valueFrom?: any }> {
    const env: Array<{ name: string; value?: string; valueFrom?: any }> = [
      { name: 'AGENT_ID', value: config.id },
      { name: 'AGENT_NAME', value: config.name },
      { name: 'AGENT_TYPE', value: config.type },
      { name: 'AGENT_ROLE', value: config.role || '' },
      { name: 'AGENT_CAPABILITIES', value: JSON.stringify(config.capabilities || []) },
    ];

    const registryEndpoint = this.options.registryEndpoint || DEFAULT_REGISTRY_ENDPOINT;
    if (registryEndpoint) {
      env.push({ name: 'PARALLAX_REGISTRY_ENDPOINT', value: registryEndpoint });
    }

    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        env.push({ name: key, value });
      }
    }

    return env;
  }

  private k8sPhaseToStatus(phase: string): AgentStatus {
    switch (phase) {
      case 'Ready':
        return 'ready';
      case 'Starting':
        return 'starting';
      case 'Authenticating':
        return 'authenticating';
      case 'Stopping':
        return 'stopping';
      case 'Stopped':
        return 'stopped';
      case 'Error':
        return 'error';
      default:
        return 'pending';
    }
  }
}

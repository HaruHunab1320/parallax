/**
 * Docker Runtime Provider
 *
 * Spawns and manages CLI agents as Docker containers.
 */

import Docker from 'dockerode';
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

export interface DockerRuntimeOptions {
  socketPath?: string;
  network?: string;
  imagePrefix?: string;
  registryEndpoint?: string;
  defaultResources?: {
    cpu?: string;
    memory?: string;
  };
}

interface ContainerInfo {
  container: Docker.Container;
  config: AgentConfig;
  handle: AgentHandle;
  outputBuffer: string;
  messageQueue: AgentMessage[];
}

// Default configuration values - can be overridden via environment variables
const DEFAULT_DOCKER_SOCKET = process.env.DOCKER_SOCKET || '/var/run/docker.sock';
const DEFAULT_DOCKER_NETWORK = process.env.DOCKER_NETWORK || 'parallax-agents';
const DEFAULT_REGISTRY_ENDPOINT = process.env.PARALLAX_REGISTRY || 'localhost:50051';

/**
 * Default Docker images for each agent type.
 * These images should be pre-built using: pnpm docker:build
 * Or pulled from a registry: docker pull parallax/agent-claude:latest
 */
const DEFAULT_IMAGES: Record<AgentType, string> = {
  claude: 'parallax/agent-claude:latest',
  codex: 'parallax/agent-codex:latest',
  gemini: 'parallax/agent-gemini:latest',
  aider: 'parallax/agent-aider:latest',
  custom: 'parallax/agent-base:latest',
};

export class DockerRuntime extends BaseRuntimeProvider {
  readonly name = 'docker';
  readonly type = 'docker' as const;

  private docker: Docker;
  private containers: Map<string, ContainerInfo> = new Map();
  private network: string;
  private imagePrefix: string;
  private initialized = false;

  constructor(
    private logger: Logger,
    private options: DockerRuntimeOptions = {}
  ) {
    super();
    this.docker = new Docker({
      socketPath: options.socketPath || DEFAULT_DOCKER_SOCKET,
    });
    this.network = options.network || DEFAULT_DOCKER_NETWORK;
    this.imagePrefix = options.imagePrefix || '';
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;

    this.logger.info('Initializing Docker runtime');

    // Verify Docker is accessible
    try {
      await this.docker.ping();
    } catch (error) {
      throw new Error('Cannot connect to Docker daemon. Is Docker running?');
    }

    // Ensure network exists
    await this.ensureNetwork();

    this.initialized = true;
    this.logger.info('Docker runtime initialized');
  }

  async shutdown(stopAgents = true): Promise<void> {
    this.logger.info({ stopAgents }, 'Shutting down Docker runtime');

    if (stopAgents) {
      const stopPromises = Array.from(this.containers.keys()).map((id) =>
        this.stop(id, { force: true, timeout: 5000 })
      );
      await Promise.allSettled(stopPromises);
    }

    this.containers.clear();
    this.initialized = false;
  }

  async healthCheck(): Promise<{ healthy: boolean; message?: string }> {
    try {
      await this.docker.ping();
      const containers = await this.docker.listContainers({
        filters: { label: ['parallax.managed=true'] },
      });
      return {
        healthy: true,
        message: `Docker runtime healthy, ${containers.length} containers`,
      };
    } catch (error) {
      return {
        healthy: false,
        message: error instanceof Error ? error.message : 'Docker unavailable',
      };
    }
  }

  async spawn(config: AgentConfig): Promise<AgentHandle> {
    if (!this.initialized) {
      await this.initialize();
    }

    const agentId = config.id || uuidv4();
    const image = this.getImageForType(config.type);

    this.logger.info({ agentId, type: config.type, image }, 'Spawning agent container');

    // Create container
    const container = await this.docker.createContainer({
      Image: image,
      name: `parallax-agent-${agentId}`,
      Env: this.buildEnv(config),
      Labels: {
        'parallax.managed': 'true',
        'parallax.agent.id': agentId,
        'parallax.agent.name': config.name,
        'parallax.agent.type': config.type,
        'parallax.agent.role': config.role || '',
        'parallax.agent.capabilities': JSON.stringify(config.capabilities || []),
      },
      HostConfig: {
        Memory: this.parseMemory(config.resources?.memory),
        CpuPeriod: 100000,
        CpuQuota: this.parseCpu(config.resources?.cpu),
        NetworkMode: this.network,
        AutoRemove: false,
      },
      Tty: true,
      OpenStdin: true,
      AttachStdin: true,
      AttachStdout: true,
      AttachStderr: true,
    });

    const handle: AgentHandle = {
      id: agentId,
      name: config.name,
      type: config.type,
      status: 'starting',
      containerId: container.id,
      capabilities: config.capabilities || [],
      role: config.role,
      startedAt: new Date(),
    };

    const info: ContainerInfo = {
      container,
      config,
      handle,
      outputBuffer: '',
      messageQueue: [],
    };

    this.containers.set(agentId, info);

    // Start container
    await container.start();

    // Attach to container output
    this.attachToContainer(info);

    this.emit('agent_started', handle);

    return handle;
  }

  async stop(agentId: string, options?: StopOptions): Promise<void> {
    const info = this.containers.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.logger.info({ agentId, force: options?.force }, 'Stopping agent container');

    info.handle.status = 'stopping';

    try {
      if (options?.force) {
        await info.container.kill();
      } else {
        await info.container.stop({ t: Math.floor((options?.timeout || 10000) / 1000) });
      }
    } catch (error: any) {
      // Container may already be stopped
      if (!error.message?.includes('is not running')) {
        throw error;
      }
    }

    // Remove container
    try {
      await info.container.remove();
    } catch {
      // Ignore removal errors
    }

    info.handle.status = 'stopped';
    this.emit('agent_stopped', info.handle, 'stopped');
    this.containers.delete(agentId);
  }

  async restart(agentId: string): Promise<AgentHandle> {
    const info = this.containers.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.logger.info({ agentId }, 'Restarting agent container');

    await info.container.restart();
    info.handle.status = 'starting';
    info.handle.startedAt = new Date();

    // Re-attach to output
    this.attachToContainer(info);

    return info.handle;
  }

  async get(agentId: string): Promise<AgentHandle | null> {
    const info = this.containers.get(agentId);
    if (!info) return null;

    // Update status from Docker
    try {
      const inspection = await info.container.inspect();
      info.handle.status = this.dockerStateToStatus(inspection.State);
    } catch {
      // Container may have been removed
      this.containers.delete(agentId);
      return null;
    }

    return info.handle;
  }

  async list(filter?: AgentFilter): Promise<AgentHandle[]> {
    // Sync with Docker
    await this.syncContainers();

    let handles = Array.from(this.containers.values()).map((info) => info.handle);

    // Apply filters
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
    const info = this.containers.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    this.logger.debug({ agentId, messageLength: message.length }, 'Sending message to container');

    // Execute command in container to send input
    const exec = await info.container.exec({
      Cmd: ['sh', '-c', `echo "${message.replace(/"/g, '\\"')}" >> /tmp/agent-input`],
      AttachStdout: true,
      AttachStderr: true,
    });

    await exec.start({ Detach: false });

    if (options?.expectResponse) {
      // Wait for response in message queue
      return this.waitForResponse(info, options.timeout || 30000);
    }
  }

  async *subscribe(agentId: string): AsyncIterable<AgentMessage> {
    const info = this.containers.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Yield queued messages
    while (true) {
      if (info.messageQueue.length > 0) {
        yield info.messageQueue.shift()!;
      } else {
        // Wait for new messages
        await new Promise<void>((resolve) => {
          const handler = () => {
            this.removeListener('message', handler);
            resolve();
          };
          this.once('message', handler);
        });
      }
    }
  }

  async *logs(agentId: string, options?: LogOptions): AsyncIterable<string> {
    const info = this.containers.get(agentId);
    if (!info) {
      throw new Error(`Agent ${agentId} not found`);
    }

    // Build log options without follow (gets Buffer)
    const logOptions: Docker.ContainerLogsOptions & { follow?: false } = {
      stdout: true,
      stderr: true,
      timestamps: true,
      follow: false,
    };

    if (options?.tail) {
      logOptions.tail = options.tail;
    }

    if (options?.since) {
      logOptions.since = Math.floor(options.since.getTime() / 1000);
    }

    const buffer = await info.container.logs(logOptions);

    // Parse Docker log stream
    const lines = buffer.toString().split('\n');
    for (const line of lines) {
      if (line.trim()) {
        yield line;
      }
    }
  }

  async metrics(agentId: string): Promise<AgentMetrics | null> {
    const info = this.containers.get(agentId);
    if (!info) return null;

    try {
      const stats = await info.container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta =
        stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta =
        stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent =
        systemDelta > 0 ? (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100 : 0;

      // Calculate memory usage
      const memUsage = stats.memory_stats.usage || 0;
      const memLimit = stats.memory_stats.limit || 1;
      const memPercent = (memUsage / memLimit) * 100;

      const uptime = info.handle.startedAt
        ? Date.now() - info.handle.startedAt.getTime()
        : 0;

      return {
        cpu: cpuPercent,
        memory: memUsage, // Memory in bytes as per interface
        uptime,
        messageCount: info.messageQueue.length,
      };
    } catch {
      return null;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // Private helpers
  // ─────────────────────────────────────────────────────────────

  private async ensureNetwork(): Promise<void> {
    const networks = await this.docker.listNetworks({
      filters: { name: [this.network] },
    });

    if (networks.length === 0) {
      this.logger.info({ network: this.network }, 'Creating Docker network');
      await this.docker.createNetwork({
        Name: this.network,
        Driver: 'bridge',
        Labels: {
          'parallax.managed': 'true',
        },
      });
    }
  }

  private getImageForType(type: AgentType): string {
    const baseImage = DEFAULT_IMAGES[type] || DEFAULT_IMAGES.custom;
    return this.imagePrefix ? `${this.imagePrefix}/${baseImage}` : baseImage;
  }

  private buildEnv(config: AgentConfig): string[] {
    const env: string[] = [
      `AGENT_ID=${config.id}`,
      `AGENT_NAME=${config.name}`,
      `AGENT_TYPE=${config.type}`,
      `AGENT_ROLE=${config.role || ''}`,
      `AGENT_CAPABILITIES=${JSON.stringify(config.capabilities || [])}`,
    ];

    // Add credentials
    if (config.credentials?.anthropicKey) {
      env.push(`ANTHROPIC_API_KEY=${config.credentials.anthropicKey}`);
    }
    if (config.credentials?.openaiKey) {
      env.push(`OPENAI_API_KEY=${config.credentials.openaiKey}`);
    }
    if (config.credentials?.googleKey) {
      env.push(`GOOGLE_API_KEY=${config.credentials.googleKey}`);
    }
    if (config.credentials?.githubToken) {
      env.push(`GITHUB_TOKEN=${config.credentials.githubToken}`);
    }

    // Add custom env
    if (config.env) {
      for (const [key, value] of Object.entries(config.env)) {
        env.push(`${key}=${value}`);
      }
    }

    // Add registry endpoint for auto-registration
    if (this.options.registryEndpoint) {
      env.push(`PARALLAX_REGISTRY_ENDPOINT=${this.options.registryEndpoint}`);
    }

    return env;
  }

  private parseMemory(memory?: string): number | undefined {
    if (!memory) return this.parseMemory(this.options.defaultResources?.memory);
    if (!memory) return undefined;

    const match = memory.match(/^(\d+)(Mi|Gi|M|G)?$/i);
    if (!match) return undefined;

    const value = parseInt(match[1], 10);
    const unit = (match[2] || 'M').toLowerCase();

    switch (unit) {
      case 'gi':
      case 'g':
        return value * 1024 * 1024 * 1024;
      case 'mi':
      case 'm':
      default:
        return value * 1024 * 1024;
    }
  }

  private parseCpu(cpu?: string): number | undefined {
    if (!cpu) return this.parseCpu(this.options.defaultResources?.cpu);
    if (!cpu) return undefined;

    // Convert CPU string to Docker CPU quota
    // "1" = 1 CPU = 100000 quota (with 100000 period)
    // "500m" = 0.5 CPU = 50000 quota
    const match = cpu.match(/^(\d+)(m)?$/);
    if (!match) return undefined;

    const value = parseInt(match[1], 10);
    const isMillicores = match[2] === 'm';

    return isMillicores ? value * 100 : value * 100000;
  }

  private dockerStateToStatus(state: Docker.ContainerInspectInfo['State']): AgentStatus {
    if (state.Running) return 'ready';
    if (state.Restarting) return 'starting';
    if (state.Paused) return 'busy';
    if (state.Dead || state.OOMKilled) return 'error';
    return 'stopped';
  }

  private async syncContainers(): Promise<void> {
    const dockerContainers = await this.docker.listContainers({
      all: true,
      filters: { label: ['parallax.managed=true'] },
    });

    // Update tracked containers
    for (const dc of dockerContainers) {
      const agentId = dc.Labels['parallax.agent.id'];
      if (!agentId) continue;

      if (!this.containers.has(agentId)) {
        // Found untracked container, add it
        const container = this.docker.getContainer(dc.Id);
        const handle: AgentHandle = {
          id: agentId,
          name: dc.Labels['parallax.agent.name'] || 'unknown',
          type: (dc.Labels['parallax.agent.type'] || 'custom') as AgentType,
          status: dc.State === 'running' ? 'ready' : 'stopped',
          containerId: dc.Id,
          capabilities: JSON.parse(dc.Labels['parallax.agent.capabilities'] || '[]'),
          role: dc.Labels['parallax.agent.role'] || undefined,
        };

        this.containers.set(agentId, {
          container,
          config: {
            id: agentId,
            name: handle.name,
            type: handle.type,
            capabilities: handle.capabilities,
            role: handle.role,
          },
          handle,
          outputBuffer: '',
          messageQueue: [],
        });
      }
    }

    // Remove containers that no longer exist
    const dockerIds = new Set(dockerContainers.map((dc) => dc.Labels['parallax.agent.id']));
    for (const [agentId] of this.containers) {
      if (!dockerIds.has(agentId)) {
        this.containers.delete(agentId);
      }
    }
  }

  private attachToContainer(info: ContainerInfo): void {
    info.container.attach(
      { stream: true, stdout: true, stderr: true },
      (err, stream) => {
        if (err || !stream) {
          this.logger.error({ error: err, agentId: info.handle.id }, 'Failed to attach to container');
          return;
        }

        stream.on('data', (data: Buffer) => {
          const output = data.toString();
          info.outputBuffer += output;

          // Check for ready state
          if (this.detectReady(output, info.config.type)) {
            if (info.handle.status !== 'ready') {
              info.handle.status = 'ready';
              this.emit('agent_ready', info.handle);
            }
          }

          // Check for login required
          if (this.detectLoginRequired(output, info.config.type)) {
            this.emit('login_required', info.handle);
          }

          // Try to parse messages
          const message = this.parseMessage(info.outputBuffer, info.handle.id);
          if (message) {
            info.messageQueue.push(message);
            this.emit('message', message);
            info.outputBuffer = '';
          }
        });

        stream.on('end', () => {
          info.handle.status = 'stopped';
          this.emit('agent_stopped', info.handle, 'container exited');
        });
      }
    );
  }

  private detectReady(output: string, type: AgentType): boolean {
    switch (type) {
      case 'claude':
        return output.includes('Claude Code') || output.includes('ready');
      case 'codex':
        return output.includes('Codex') || output.includes('ready');
      case 'gemini':
        return output.includes('Gemini') || output.includes('ready');
      default:
        return output.includes('ready');
    }
  }

  private detectLoginRequired(output: string, type: AgentType): boolean {
    const patterns = [
      'Please sign in',
      'API key not found',
      'authentication required',
      'login required',
      'unauthorized',
    ];
    return patterns.some((p) => output.toLowerCase().includes(p.toLowerCase()));
  }

  private parseMessage(buffer: string, agentId: string): AgentMessage | null {
    // Simple parsing - look for JSON-like responses
    const jsonMatch = buffer.match(/\{[\s\S]*"type"[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          id: uuidv4(),
          agentId,
          direction: 'outbound',
          type: parsed.type || 'response',
          content: parsed.content || parsed.message || jsonMatch[0],
          metadata: parsed.metadata,
          timestamp: new Date(),
        };
      } catch {
        // Not valid JSON
      }
    }

    // Check for complete response markers
    if (buffer.includes('[DONE]') || buffer.includes('```\n\n')) {
      return {
        id: uuidv4(),
        agentId,
        direction: 'outbound',
        type: 'response',
        content: buffer.replace('[DONE]', '').trim(),
        timestamp: new Date(),
      };
    }

    return null;
  }

  private async waitForResponse(info: ContainerInfo, timeout: number): Promise<AgentMessage> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Response timeout'));
      }, timeout);

      const checkQueue = () => {
        if (info.messageQueue.length > 0) {
          clearTimeout(timer);
          resolve(info.messageQueue.shift()!);
        } else {
          setTimeout(checkQueue, 100);
        }
      };

      checkQueue();
    });
  }
}

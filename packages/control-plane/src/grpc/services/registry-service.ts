/**
 * gRPC Registry Service implementation
 */

import * as grpc from '@grpc/grpc-js';
import type { IAgentRegistry, ServiceRegistration } from '../../registry';
import { Logger } from 'pino';

export class RegistryServiceImpl {
  constructor(
    private agentRegistry: IAgentRegistry,
    private logger: Logger
  ) {}

  getImplementation() {
    return {
      register: this.register.bind(this),
      unregister: this.unregister.bind(this),
      renew: this.renew.bind(this),
      listAgents: this.listAgents.bind(this),
      getAgent: this.getAgent.bind(this),
      watch: this.watch.bind(this)
    };
  }

  async register(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { agent } = call.request;
      
      if (!agent?.id) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Missing agent registration'
        });
        return;
      }

      this.logger.info({ agentId: agent.id }, 'Registering agent via gRPC');

      const serviceRegistration: ServiceRegistration = {
        id: agent.id,
        name: agent.name || agent.id,
        endpoint: agent.endpoint || agent.address || '',
        type: 'agent',
        metadata: {
          capabilities: agent.capabilities || [],
          ...(agent.metadata || {}),
        },
        health: {
          status: 'healthy',
          lastCheck: new Date(),
          checkInterval: 30000
        },
        registeredAt: new Date(),
        ttl: agent.ttl?.seconds ? Number(agent.ttl.seconds) : 60
      };

      await this.registerAgent(serviceRegistration);

      callback(null, {
        success: true,
        message: 'Agent registered',
        lease_id: `lease-${agent.id}`
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to register agent');
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async unregister(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const agentId = call.request?.agent_id || call.request?.id;
      
      if (!agentId) {
        callback({
          code: grpc.status.INVALID_ARGUMENT,
          details: 'Missing agent id'
        });
        return;
      }

      this.logger.info({ agentId }, 'Unregistering agent via gRPC');
      
      await this.unregisterAgent(agentId);
      
      callback(null, { success: true, message: 'Agent unregistered' });
    } catch (error) {
      this.logger.error({ error }, 'Failed to unregister agent');
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async renew(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { lease_id } = call.request;
      const agentId = lease_id.replace('lease-', '');
      
      this.logger.debug({ agentId }, 'Renewing agent lease via gRPC');
      
      // Update last seen time
      const agent = await this.getAgentInternal(agentId);
      if (!agent) {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'Agent not found'
        });
        return;
      }
      
      const updated: ServiceRegistration = {
        ...agent,
        health: {
          status: 'healthy',
          lastCheck: new Date(),
          checkInterval: agent.health?.checkInterval || 30000
        }
      };
      await this.registerAgent(updated);
      
      callback(null, {
        success: true,
        message: 'Lease renewed',
        lease_id
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to renew lease');
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async listAgents(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const agents = await this.listAgentsInternal();
      
      // Convert to proto format
      const protoAgents = agents
        .filter(agent => this.matchesCapabilities(agent, call.request?.capabilities))
        .map(agent => this.toAgentRegistration(agent));
      
      callback(null, { agents: protoAgents, total_count: protoAgents.length });
    } catch (error) {
      this.logger.error({ error }, 'Failed to list agents');
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async getAgent(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { agent_id } = call.request;
      const agent = await this.getAgentInternal(agent_id);
      
      if (!agent) {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'Agent not found'
        });
        return;
      }
      
      const protoAgent = this.toAgentRegistration(agent);
      
      callback(null, protoAgent);
    } catch (error) {
      this.logger.error({ error }, 'Failed to get agent');
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async watch(call: grpc.ServerWritableStream<any, any>) {
    const { include_initial, capabilities } = call.request || {};
    let active = true;
    let previous = new Map<string, { agent: ServiceRegistration; hash: string }>();

    let interval: NodeJS.Timeout | null = null;
    const stop = () => {
      active = false;
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    call.on('cancelled', stop);
    call.on('close', stop);
    call.on('error', stop);

    const emitEvent = (type: string, agent: any) => {
      call.write({
        type,
        agent: this.toAgentRegistration(agent),
        timestamp: this.toTimestamp(new Date())
      });
    };

    const poll = async () => {
      if (!active) return;
      const agents = (await this.listAgentsInternal())
        .filter(agent => this.matchesCapabilities(agent, capabilities));

      const current = new Map<string, { agent: ServiceRegistration; hash: string }>();
      for (const agent of agents) {
        const hash = JSON.stringify({
          name: agent.name,
          endpoint: agent.endpoint,
          capabilities: agent.metadata?.capabilities || [],
          metadata: agent.metadata || {}
        });
        current.set(agent.id, { agent, hash });
      }

      if (include_initial && previous.size === 0) {
        for (const entry of current.values()) {
          emitEvent('ADDED', entry.agent);
        }
      } else {
        for (const [id, entry] of current.entries()) {
          const prev = previous.get(id);
          if (!prev) {
            emitEvent('ADDED', entry.agent);
          } else if (prev.hash !== entry.hash) {
            emitEvent('MODIFIED', entry.agent);
          }
        }

        for (const [id, entry] of previous.entries()) {
          if (!current.has(id)) {
            emitEvent('DELETED', entry.agent);
          }
        }
      }

      previous = current;
    };

    await poll();

    interval = setInterval(poll, 2000);
    call.on('end', stop);
  }

  private async listAgentsInternal(): Promise<ServiceRegistration[]> {
    // Use listServices which filters by type
    return this.agentRegistry.listServices('agent');
  }

  private async getAgentInternal(agentId: string): Promise<ServiceRegistration | null> {
    return this.agentRegistry.get(agentId);
  }

  private async registerAgent(agent: ServiceRegistration): Promise<void> {
    await this.agentRegistry.register(agent);
  }

  private async unregisterAgent(agentId: string): Promise<void> {
    await this.agentRegistry.unregister('agent', agentId);
  }

  private matchesCapabilities(agent: ServiceRegistration, capabilities?: string[]): boolean {
    if (!capabilities || capabilities.length === 0) return true;
    const agentCaps = agent.metadata?.capabilities || [];
    return capabilities.every(cap => agentCaps.includes(cap));
  }

  private toAgentRegistration(agent: ServiceRegistration): {
    id: string;
    name: string;
    endpoint: string;
    capabilities: string[];
    metadata: Record<string, unknown>;
    registered_at: { seconds: number; nanos: number };
    ttl?: { seconds: number; nanos: number };
  } {
    const metadata = agent.metadata || {};
    return {
      id: agent.id,
      name: agent.name || agent.id,
      endpoint: agent.endpoint || '',
      capabilities: metadata.capabilities || [],
      metadata: {
        version: metadata.version || '',
        region: metadata.region || '',
        labels: metadata.labels || {},
        default_confidence: metadata.default_confidence || 0
      },
      registered_at: this.toTimestamp(agent.registeredAt || new Date()),
      ttl: agent.ttl ? { seconds: agent.ttl, nanos: 0 } : undefined
    };
  }

  private toTimestamp(date: Date): { seconds: number; nanos: number } {
    return {
      seconds: Math.floor(date.getTime() / 1000),
      nanos: 0
    };
  }
}

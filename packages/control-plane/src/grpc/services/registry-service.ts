/**
 * gRPC Registry Service implementation
 */

import * as grpc from '@grpc/grpc-js';
import type { IAgentRegistry } from '../../registry';
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
      
      this.logger.info({ agentId: agent.id }, 'Registering agent via gRPC');
      
      // Register the agent
      await this.agentRegistry.register({
        id: agent.id,
        name: agent.name,
        address: agent.address,
        capabilities: agent.capabilities || [],
        metadata: agent.metadata || {},
        lastSeen: new Date()
      });
      
      // Create registration response
      const registration = {
        id: `reg-${agent.id}`,
        agent_id: agent.id,
        lease_id: `lease-${agent.id}`,
        ttl: 60, // 60 seconds TTL
        registered_at: {
          seconds: Math.floor(Date.now() / 1000),
          nanos: 0
        }
      };
      
      callback(null, { registration });
    } catch (error) {
      this.logger.error({ error }, 'Failed to register agent');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async unregister(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { agent_id } = call.request;
      
      this.logger.info({ agentId: agent_id }, 'Unregistering agent via gRPC');
      
      await this.agentRegistry.unregister(agent_id);
      
      callback(null, {});
    } catch (error) {
      this.logger.error({ error }, 'Failed to unregister agent');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
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
      const agent = await this.agentRegistry.get(agentId);
      if (!agent) {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'Agent not found'
        });
        return;
      }
      
      await this.agentRegistry.register({
        ...agent,
        lastSeen: new Date()
      });
      
      callback(null, {
        renewed: true,
        ttl: 60
      });
    } catch (error) {
      this.logger.error({ error }, 'Failed to renew lease');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async listAgents(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const agents = await this.agentRegistry.list();
      
      // Convert to proto format
      const protoAgents = agents.map(agent => ({
        id: agent.id,
        name: agent.name,
        address: agent.address,
        capabilities: agent.capabilities,
        metadata: agent.metadata,
        status: this.getAgentStatus(agent),
        last_seen: {
          seconds: Math.floor(agent.lastSeen.getTime() / 1000),
          nanos: 0
        }
      }));
      
      callback(null, { agents: protoAgents });
    } catch (error) {
      this.logger.error({ error }, 'Failed to list agents');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async getAgent(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const { agent_id } = call.request;
      const agent = await this.agentRegistry.get(agent_id);
      
      if (!agent) {
        callback({
          code: grpc.status.NOT_FOUND,
          details: 'Agent not found'
        });
        return;
      }
      
      const protoAgent = {
        id: agent.id,
        name: agent.name,
        address: agent.address,
        capabilities: agent.capabilities,
        metadata: agent.metadata,
        status: this.getAgentStatus(agent),
        last_seen: {
          seconds: Math.floor(agent.lastSeen.getTime() / 1000),
          nanos: 0
        }
      };
      
      callback(null, { agent: protoAgent });
    } catch (error) {
      this.logger.error({ error }, 'Failed to get agent');
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  async watch(call: grpc.ServerWritableStream<any, any>) {
    // For now, return UNIMPLEMENTED
    // TODO: Implement agent watch functionality
    call.emit('error', {
      code: grpc.status.UNIMPLEMENTED,
      details: 'Watch not yet implemented'
    });
  }

  private getAgentStatus(agent: any): string {
    const now = Date.now();
    const lastSeenMs = agent.lastSeen.getTime();
    const elapsed = now - lastSeenMs;
    
    if (elapsed < 30000) return 'HEALTHY';
    if (elapsed < 60000) return 'DEGRADED';
    return 'UNHEALTHY';
  }
}
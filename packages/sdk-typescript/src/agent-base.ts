import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { AgentResponse, ensureConfidence } from './types/agent-response';

const PROTO_DIR = path.join(__dirname, '../../../proto');

/**
 * Base class for Parallax agents in TypeScript.
 * Agents are standalone services that communicate via gRPC.
 */
interface GrpcProto {
  parallax: {
    confidence: any;
    registry: any;
  };
}

export abstract class ParallaxAgent {
  private server: grpc.Server;
  private registryClient: any;
  private confidenceProto: any;
  private registryProto: any;
  private leaseId?: string;
  private renewInterval?: NodeJS.Timeout;
  
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly capabilities: string[],
    public readonly metadata: Record<string, any> = {}
  ) {
    this.server = new grpc.Server();
    this.loadProtos();
  }

  /**
   * Main analysis method that must be implemented by subclasses.
   * Returns a standardized AgentResponse with automatic confidence.
   */
  abstract analyze(task: string, data?: any): Promise<AgentResponse>;

  /**
   * Optional: Override to provide custom health checking
   */
  async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy' | 'degraded', message?: string }> {
    return { status: 'healthy' };
  }

  /**
   * Helper method to create standardized agent results
   */
  protected createResult<T>(value: T, confidence: number, reasoning?: string, uncertainties?: string[]): AgentResponse<T> {
    return ensureConfidence({
      value,
      confidence,
      agent: this.id,
      reasoning,
      uncertainties,
      metadata: {
        timestamp: Date.now()
      }
    });
  }

  private loadProtos() {
    // Load confidence proto
    const confidencePath = path.join(PROTO_DIR, 'confidence.proto');
    const confidenceDefinition = protoLoader.loadSync(confidencePath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR]
    });
    
    const confidenceDescriptor = grpc.loadPackageDefinition(confidenceDefinition) as unknown as GrpcProto;
    this.confidenceProto = confidenceDescriptor.parallax.confidence;

    // Load registry proto
    const registryPath = path.join(PROTO_DIR, 'registry.proto');
    const registryDefinition = protoLoader.loadSync(registryPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR]
    });
    
    const registryDescriptor = grpc.loadPackageDefinition(registryDefinition) as unknown as GrpcProto;
    this.registryProto = registryDescriptor.parallax.registry;
  }

  /**
   * Start the gRPC server and register with the control plane
   */
  async serve(port: number = 0): Promise<number> {
    // Add ConfidenceAgent service implementation
    this.server.addService(this.confidenceProto.ConfidenceAgent.service, {
      execute: this.handleExecute.bind(this),
      streamExecute: this.handleStreamExecute.bind(this),
      getCapabilities: this.handleGetCapabilities.bind(this),
      healthCheck: this.handleHealthCheck.bind(this)
    });

    // Start the server
    return new Promise((resolve, reject) => {
      const bindAddr = `0.0.0.0:${port}`;
      
      this.server.bindAsync(
        bindAddr,
        grpc.ServerCredentials.createInsecure(),
        async (error, actualPort) => {
          if (error) {
            reject(error);
            return;
          }
          
          console.log(`Agent ${this.name} (${this.id}) listening on port ${actualPort}`);
          
          // Register with control plane
          try {
            await this.register(`localhost:${actualPort}`);
            resolve(actualPort);
          } catch (regError) {
            console.error('Failed to register with control plane:', regError);
            // Still resolve - agent can work without registration
            resolve(actualPort);
          }
        }
      );
    });
  }

  /**
   * Register with the control plane
   */
  private async register(agentAddress: string): Promise<void> {
    const registryEndpoint = process.env.PARALLAX_REGISTRY || 'localhost:50051';
    
    this.registryClient = new this.registryProto.Registry(
      registryEndpoint,
      grpc.credentials.createInsecure()
    );

    const request = {
      agent: {
        id: this.id,
        name: this.name,
        address: agentAddress,
        capabilities: this.capabilities,
        metadata: this.metadata,
        status: 'HEALTHY'
      }
    };

    return new Promise((resolve, reject) => {
      this.registryClient.register(request, (error: any, response: any) => {
        if (error) {
          reject(error);
          return;
        }
        
        console.log(`Agent ${this.name} registered with control plane`);
        this.leaseId = response.registration?.lease_id;
        
        // Start lease renewal
        this.startLeaseRenewal();
        resolve();
      });
    });
  }

  /**
   * Start periodic lease renewal
   */
  private startLeaseRenewal() {
    if (!this.leaseId) return;
    
    // Renew lease every 30 seconds
    this.renewInterval = setInterval(async () => {
      try {
        await this.renewLease();
      } catch (error) {
        console.error('Failed to renew lease:', error);
      }
    }, 30000);
  }

  /**
   * Renew lease with registry
   */
  private async renewLease(): Promise<void> {
    if (!this.registryClient || !this.leaseId) return;
    
    return new Promise((resolve, reject) => {
      this.registryClient.renew({ lease_id: this.leaseId }, (error: any, _response: any) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Handle execute requests
   */
  private async handleExecute(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const request = call.request;
      const task = request.task;
      
      // Call the agent's analyze method
      const result = await this.analyze(
        task?.description || '',
        task?.data ? JSON.parse(task.data) : undefined
      );
      
      // Build response
      const response = {
        result: {
          value_json: JSON.stringify(result.value),
          confidence: result.confidence,
          agent_id: this.id,
          timestamp: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: 0
          },
          reasoning: result.reasoning || '',
          metadata: result.metadata || {}
        }
      };
      
      callback(null, response);
    } catch (error: any) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  /**
   * Handle streaming execute requests
   */
  private async handleStreamExecute(call: grpc.ServerWritableStream<any, any>) {
    try {
      const request = call.request;
      const task = request.task;
      
      // For now, just execute once and return
      // TODO: Implement proper streaming
      const result = await this.analyze(
        task?.description || '',
        task?.data ? JSON.parse(task.data) : undefined
      );
      
      // Send result
      call.write({
        result: {
          value_json: JSON.stringify(result.value),
          confidence: result.confidence,
          agent_id: this.id,
          timestamp: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: 0
          },
          reasoning: result.reasoning || '',
          metadata: result.metadata || {}
        }
      });
      
      call.end();
    } catch (error: any) {
      call.emit('error', {
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  /**
   * Handle get capabilities requests
   */
  private async handleGetCapabilities(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    callback(null, {
      capabilities: this.capabilities,
      expertise_level: 'EXPERT',
      capability_scores: {}
    });
  }

  /**
   * Handle health check requests
   */
  private async handleHealthCheck(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    const health = await this.checkHealth();
    callback(null, {
      status: health.status.toUpperCase(),
      message: health.message
    });
  }

  /**
   * Shutdown the agent
   */
  async shutdown(): Promise<void> {
    // Stop lease renewal
    if (this.renewInterval) {
      clearInterval(this.renewInterval);
    }
    
    // Unregister from control plane
    if (this.registryClient && this.id) {
      try {
        await new Promise<void>((resolve) => {
          this.registryClient.unregister({ agent_id: this.id }, () => {
            resolve();
          });
        });
      } catch (error) {
        console.error('Failed to unregister:', error);
      }
    }
    
    // Stop gRPC server
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        resolve();
      });
    });
  }
}
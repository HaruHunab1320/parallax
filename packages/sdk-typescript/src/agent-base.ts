import * as grpc from '@grpc/grpc-js';
import { 
  ConfidenceAgentService,
  IConfidenceAgentServer 
} from '@parallax/proto';
import {
  AgentRequest,
  ConfidenceResult,
  Capabilities,
  Health,
  Empty
} from '@parallax/proto';

/**
 * Base class for Parallax agents in TypeScript.
 * Agents are standalone services that communicate via gRPC.
 */
export abstract class ParallaxAgent implements IConfidenceAgentServer {
  private server: grpc.Server;
  private registryEndpoint: string;
  
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly capabilities: string[],
    public readonly metadata: Record<string, any> = {}
  ) {
    this.server = new grpc.Server();
    this.registryEndpoint = process.env.PARALLAX_REGISTRY || 'localhost:50051';
  }

  /**
   * Main analysis method that must be implemented by subclasses.
   * Returns a tuple of [result, confidence].
   */
  abstract analyze(task: string, data?: any): Promise<[any, number]>;

  /**
   * Optional: Override to provide custom health checking
   */
  async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy' | 'degraded', message?: string }> {
    return { status: 'healthy' };
  }

  // gRPC service implementation
  async Analyze(
    call: grpc.ServerUnaryCall<AgentRequest, ConfidenceResult>,
    callback: grpc.sendUnaryData<ConfidenceResult>
  ): Promise<void> {
    try {
      const request = call.request;
      const data = request.getData()?.toJavaScript();
      
      // Call the agent's analyze method
      const [result, confidence] = await this.analyze(
        request.getTaskDescription(),
        data
      );

      // Build response
      const response = new ConfidenceResult();
      response.setValueJson(JSON.stringify(result));
      response.setConfidence(confidence);
      response.setAgentId(this.id);
      response.setTimestamp(new Date().toISOString());
      
      // Add reasoning if provided
      if (result.reasoning) {
        response.setReasoning(result.reasoning);
      }
      
      // Add uncertainties if provided
      if (result.uncertainties) {
        response.setUncertaintiesList(result.uncertainties);
      }

      callback(null, response);
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async GetCapabilities(
    call: grpc.ServerUnaryCall<Empty, Capabilities>,
    callback: grpc.sendUnaryData<Capabilities>
  ): Promise<void> {
    try {
      const response = new Capabilities();
      response.setAgentId(this.id);
      response.setName(this.name);
      response.setCapabilitiesList(this.capabilities);
      response.setExpertiseLevel(this.metadata.expertise || 0.5);
      
      // Add capability scores if provided
      if (this.metadata.capabilityScores) {
        const scores = response.getCapabilityScoresMap();
        Object.entries(this.metadata.capabilityScores).forEach(([cap, score]) => {
          scores.set(cap, score as number);
        });
      }

      callback(null, response);
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async HealthCheck(
    call: grpc.ServerUnaryCall<Empty, Health>,
    callback: grpc.sendUnaryData<Health>
  ): Promise<void> {
    try {
      const health = await this.checkHealth();
      const response = new Health();
      
      const statusMap = {
        'healthy': Health.Status.HEALTHY,
        'unhealthy': Health.Status.UNHEALTHY,
        'degraded': Health.Status.DEGRADED
      };
      
      response.setStatus(statusMap[health.status]);
      response.setMessage(health.message || 'OK');
      response.setLastCheck(new Date().toISOString());

      callback(null, response);
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Start the gRPC server
   */
  async serve(port: number = 0): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.addService(ConfidenceAgentService, this);
      
      this.server.bindAsync(
        `0.0.0.0:${port}`,
        grpc.ServerCredentials.createInsecure(),
        (err, actualPort) => {
          if (err) {
            reject(err);
            return;
          }
          
          this.server.start();
          console.log(`Agent ${this.name} (${this.id}) listening on port ${actualPort}`);
          
          // Register with the platform
          this.registerWithPlatform(actualPort).catch(console.error);
          
          resolve(actualPort);
        }
      );
    });
  }

  /**
   * Register this agent with the Parallax platform
   */
  private async registerWithPlatform(port: number): Promise<void> {
    // In production, this would make a gRPC call to the registry service
    console.log(`Registering agent ${this.id} with platform at ${this.registryEndpoint}`);
    
    // TODO: Implement actual registration via gRPC
    // For now, we'll just log
    console.log({
      id: this.id,
      name: this.name,
      endpoint: `localhost:${port}`,
      capabilities: this.capabilities,
      metadata: this.metadata
    });
  }

  /**
   * Gracefully shutdown the agent
   */
  async shutdown(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        console.log(`Agent ${this.name} shut down gracefully`);
        resolve();
      });
    });
  }
}
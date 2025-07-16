import * as grpc from '@grpc/grpc-js';

// Temporarily define types here until proto generation is fixed
export interface AgentRequest {
  taskDescription: string;
  data?: any;
}

export interface ConfidenceResult {
  valueJson: string;
  confidence: number;
  agentId: string;
  timestamp: number;
  reasoning?: string;
  uncertainties?: string[];
}

export interface Capabilities {
  capabilities: string[];
  expertiseLevel: string;
  capabilityScores: Record<string, number>;
}

export interface Health {
  status: string;
  message?: string;
}

export interface Empty {}

/**
 * Base class for Parallax agents in TypeScript.
 * Agents are standalone services that communicate via gRPC.
 */
export abstract class ParallaxAgent {
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

  /**
   * Helper method to create standardized agent results
   */
  protected createResult<T>(value: T, confidence: number, reasoning?: string, uncertainties?: string[]): any {
    return {
      value,
      confidence,
      agent: this.id,
      reasoning,
      uncertainties,
      timestamp: Date.now(),
    };
  }

  // gRPC service implementation
  async Analyze(
    _call: grpc.ServerUnaryCall<AgentRequest, ConfidenceResult>,
    callback: grpc.sendUnaryData<ConfidenceResult>
  ): Promise<void> {
    try {
      // Placeholder until proto generation is fixed
      // const request = _call.request as any;
      const data = undefined; // request.getData()?.toJavaScript();
      const task = ''; // request.getTaskDescription();
      
      // Call the agent's analyze method
      const [result, confidence] = await this.analyze(
        task,
        data
      );

      // Build response - placeholder until proto generation is fixed
      const response: ConfidenceResult = {
        valueJson: JSON.stringify(result),
        confidence: confidence,
        agentId: this.id,
        timestamp: Date.now(),
        reasoning: result.reasoning || '',
        uncertainties: result.uncertainties || []
      };

      callback(null, response as any);
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async GetCapabilities(
    _call: grpc.ServerUnaryCall<Empty, Capabilities>,
    callback: grpc.sendUnaryData<Capabilities>
  ): Promise<void> {
    try {
      // Placeholder until proto generation is fixed
      const response: Capabilities = {
        capabilities: this.capabilities,
        expertiseLevel: this.metadata.expertise || 'general',
        capabilityScores: this.metadata.capabilityScores || {}
      };
      
      // Add capability scores if provided
      if (this.metadata.capabilityScores) {
        // Scores already set above
      }

      callback(null, response as any);
    } catch (error) {
      callback({
        code: grpc.status.INTERNAL,
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  async HealthCheck(
    _call: grpc.ServerUnaryCall<Empty, Health>,
    callback: grpc.sendUnaryData<Health>
  ): Promise<void> {
    try {
      const health = await this.checkHealth();
      
      const statusMap = {
        'healthy': 'HEALTHY',
        'unhealthy': 'UNHEALTHY',
        'degraded': 'DEGRADED'
      };
      
      // Placeholder until proto generation is fixed
      const response: Health = {
        status: statusMap[health.status],
        message: health.message || 'OK'
      };

      callback(null, response as any);
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
      // Placeholder until proto generation is fixed
      // this.server.addService(ConfidenceAgentService, this as any);
      console.log('Note: Service registration disabled until proto generation is fixed');
      
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
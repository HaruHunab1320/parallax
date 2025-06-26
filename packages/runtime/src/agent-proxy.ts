import * as grpc from '@grpc/grpc-js';
import { 
  ConfidenceAgentClient,
  AgentRequest,
  ConfidenceResult,
  Empty,
  Capabilities,
  Health
} from '@parallax/proto';
import { Agent, AgentResult } from './types';

/**
 * Proxy class that represents a remote agent connected via gRPC.
 * This allows the core runtime to communicate with agents written in any language.
 */
export class GrpcAgentProxy implements Agent {
  private client: ConfidenceAgentClient;
  private _capabilities: string[] = [];
  private _metadata: Record<string, any> = {};
  
  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly endpoint: string
  ) {
    // Create gRPC client
    this.client = new ConfidenceAgentClient(
      endpoint,
      grpc.credentials.createInsecure()
    );
    
    // Load capabilities on creation
    this.loadCapabilities().catch(console.error);
  }
  
  get capabilities(): string[] {
    return this._capabilities;
  }
  
  private async loadCapabilities(): Promise<void> {
    try {
      const response = await new Promise<Capabilities>((resolve, reject) => {
        this.client.getCapabilities(new Empty(), (err, response) => {
          if (err) reject(err);
          else resolve(response!);
        });
      });
      
      this._capabilities = response.getCapabilitiesList();
      this._metadata = {
        expertise: response.getExpertiseLevel(),
        capabilityScores: Object.fromEntries(
          response.getCapabilityScoresMap().entries()
        )
      };
    } catch (error) {
      console.error(`Failed to load capabilities for agent ${this.id}:`, error);
    }
  }
  
  async isAvailable(): Promise<boolean> {
    try {
      const response = await new Promise<Health>((resolve, reject) => {
        const deadline = new Date();
        deadline.setSeconds(deadline.getSeconds() + 5); // 5 second timeout
        
        this.client.healthCheck(
          new Empty(),
          { deadline },
          (err, response) => {
            if (err) reject(err);
            else resolve(response!);
          }
        );
      });
      
      return response.getStatus() === Health.Status.HEALTHY;
    } catch (error) {
      return false;
    }
  }
  
  async analyze<T>(task: string, data?: any): Promise<AgentResult<T>> {
    try {
      // Build request
      const request = new AgentRequest();
      request.setTaskDescription(task);
      
      if (data !== undefined) {
        const { Struct } = require('google-protobuf/google/protobuf/struct_pb');
        request.setData(Struct.fromJavaScript(data));
      }
      
      // Make gRPC call
      const response = await new Promise<ConfidenceResult>((resolve, reject) => {
        this.client.analyze(request, (err, response) => {
          if (err) reject(err);
          else resolve(response!);
        });
      });
      
      // Parse response
      const value = JSON.parse(response.getValueJson()) as T;
      
      return {
        value,
        confidence: response.getConfidence(),
        agent: this.name,
        reasoning: response.getReasoning() || undefined,
        uncertainties: response.getUncertaintiesList().length > 0 
          ? response.getUncertaintiesList() 
          : undefined,
        timestamp: Date.now()
      };
    } catch (error) {
      throw new Error(`Agent ${this.name} failed to analyze: ${error}`);
    }
  }
  
  /**
   * Static factory method to create a proxy from agent metadata
   */
  static fromMetadata(metadata: {
    id: string;
    name: string;
    endpoint: string;
  }): GrpcAgentProxy {
    return new GrpcAgentProxy(metadata.id, metadata.name, metadata.endpoint);
  }
}
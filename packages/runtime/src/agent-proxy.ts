import * as grpc from '@grpc/grpc-js';
import {
  ConfidenceAgentClient,
  AgentRequest,
  ConfidenceResult,
  Capabilities,
  Health,
  Health_Status,
  GoogleEmpty,
} from '@parallax/sdk-typescript';
import { Agent, AgentResult } from './types';

/**
 * Proxy class that represents a remote agent connected via gRPC.
 * This allows the core runtime to communicate with agents written in any language.
 *
 * Uses the SDK's generated ConfidenceAgentClient for type-safe gRPC communication.
 */
export class GrpcAgentProxy implements Agent {
  private _client: ConfidenceAgentClient;
  private _capabilities: string[] = [];
  private _expertiseLevel: number = 0.7;
  private _capabilityScores: Record<string, number> = {};
  private _initialized: boolean = false;
  private _initPromise: Promise<void>;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly endpoint: string,
    credentials?: grpc.ChannelCredentials
  ) {
    // Create gRPC client with proper credentials
    this._client = new ConfidenceAgentClient(
      endpoint,
      credentials || grpc.credentials.createInsecure()
    );

    // Load capabilities on creation
    this._initPromise = this.loadCapabilities().catch(() => {
      // Capabilities loading failed - agent will use defaults
      // This is non-fatal as agent may not be available yet
      this._capabilities = ['analyze', 'process'];
    });
  }

  get capabilities(): string[] {
    return this._capabilities;
  }

  get expertise(): number {
    return this._expertiseLevel;
  }

  get capabilityScores(): Record<string, number> {
    return this._capabilityScores;
  }

  /**
   * Wait for initialization to complete
   */
  async waitForInit(): Promise<void> {
    await this._initPromise;
  }

  private async loadCapabilities(): Promise<void> {
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 10); // 10 second timeout

    const response = await new Promise<Capabilities>((resolve, reject) => {
      this._client.getCapabilities(
        GoogleEmpty.create({}),
        new grpc.Metadata(),
        { deadline },
        (err: grpc.ServiceError | null, response?: Capabilities) => {
          if (err) reject(err);
          else if (response) resolve(response);
          else reject(new Error('No response received'));
        }
      );
    });

    this._capabilities = response.capabilities;
    this._expertiseLevel = response.expertiseLevel;
    this._capabilityScores = response.capabilityScores;
    this._initialized = true;
  }

  async isAvailable(): Promise<boolean> {
    try {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5); // 5 second timeout

      const response = await new Promise<Health>((resolve, reject) => {
        this._client.healthCheck(
          GoogleEmpty.create({}),
          new grpc.Metadata(),
          { deadline },
          (err: grpc.ServiceError | null, response?: Health) => {
            if (err) reject(err);
            else if (response) resolve(response);
            else reject(new Error('No response received'));
          }
        );
      });

      return response.status === Health_Status.HEALTHY;
    } catch {
      return false;
    }
  }

  async analyze<T>(task: string, data?: any): Promise<AgentResult<T>> {
    // Ensure initialization is complete
    if (!this._initialized) {
      await this._initPromise;
    }

    const request: AgentRequest = {
      taskId: `task-${Date.now()}`,
      taskDescription: task,
      data: data,
      context: {},
      timeoutMs: 30000,
      patternName: '',
    };

    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 30); // 30 second timeout

    const response = await new Promise<ConfidenceResult>((resolve, reject) => {
      this._client.analyze(
        request,
        new grpc.Metadata(),
        { deadline },
        (err: grpc.ServiceError | null, response?: ConfidenceResult) => {
          if (err) reject(err);
          else if (response) resolve(response);
          else reject(new Error('No response received'));
        }
      );
    });

    // Parse the JSON value from the response
    let value: T;
    try {
      value = JSON.parse(response.valueJson) as T;
    } catch {
      // If parsing fails, use the raw string as value
      value = response.valueJson as unknown as T;
    }

    return {
      value,
      confidence: response.confidence,
      agent: response.agentId || this.name,
      reasoning: response.reasoning,
      uncertainties: response.uncertainties.length > 0 ? response.uncertainties : undefined,
      timestamp: response.timestamp?.getTime() || Date.now(),
    };
  }

  /**
   * Stream analysis for long-running tasks
   * Returns an async generator that yields results as they arrive
   */
  async *streamAnalyze<T>(task: string, data?: any): AsyncGenerator<AgentResult<T>> {
    const request: AgentRequest = {
      taskId: `task-${Date.now()}`,
      taskDescription: task,
      data: data,
      context: {},
      timeoutMs: 300000, // 5 minute timeout for streaming
      patternName: '',
    };

    const stream = this._client.streamAnalyze(request);

    for await (const response of stream) {
      let value: T;
      try {
        value = JSON.parse(response.valueJson) as T;
      } catch {
        value = response.valueJson as unknown as T;
      }

      yield {
        value,
        confidence: response.confidence,
        agent: response.agentId || this.name,
        reasoning: response.reasoning,
        uncertainties: response.uncertainties.length > 0 ? response.uncertainties : undefined,
        timestamp: response.timestamp?.getTime() || Date.now(),
      };
    }
  }

  /**
   * Close the gRPC connection
   */
  close(): void {
    this._client.close();
  }

  /**
   * Static factory method to create a proxy from agent metadata
   */
  static fromMetadata(
    metadata: {
      id: string;
      name: string;
      endpoint: string;
    },
    credentials?: grpc.ChannelCredentials
  ): GrpcAgentProxy {
    return new GrpcAgentProxy(metadata.id, metadata.name, metadata.endpoint, credentials);
  }
}

import * as grpc from '@grpc/grpc-js';
import * as fs from 'fs';
import * as path from 'path';
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
import type { Logger } from 'pino';

/**
 * mTLS configuration for secure agent communication
 */
export interface MTLSConfig {
  enabled: boolean;
  certsDir: string;
  caFile?: string;
  certFile?: string;
  keyFile?: string;
  checkClientCertificate?: boolean;
  allowInsecure?: boolean;
}

/**
 * Credentials provider for mTLS authentication
 */
export class MTLSCredentialsProvider {
  private cachedCredentials?: grpc.ChannelCredentials;
  private lastLoad: number = 0;
  private readonly cacheDuration = 60000; // 1 minute cache

  constructor(
    private config: MTLSConfig,
    private logger: Logger
  ) {}

  /**
   * Get channel credentials for connecting to a target service
   */
  async getChannelCredentials(
    _targetService: string,
    _clientName: string
  ): Promise<grpc.ChannelCredentials> {
    // Check cache
    if (this.cachedCredentials && Date.now() - this.lastLoad < this.cacheDuration) {
      return this.cachedCredentials;
    }

    if (!this.config.enabled || this.config.allowInsecure) {
      return grpc.credentials.createInsecure();
    }

    try {
      const caFile = this.config.caFile || path.join(this.config.certsDir, 'ca.crt');
      const certFile = this.config.certFile || path.join(this.config.certsDir, 'client.crt');
      const keyFile = this.config.keyFile || path.join(this.config.certsDir, 'client.key');

      const rootCert = fs.readFileSync(caFile);
      const clientCert = fs.readFileSync(certFile);
      const clientKey = fs.readFileSync(keyFile);

      this.cachedCredentials = grpc.credentials.createSsl(
        rootCert,
        clientKey,
        clientCert,
        this.config.checkClientCertificate
          ? undefined
          : { checkServerIdentity: () => undefined }
      );
      this.lastLoad = Date.now();

      return this.cachedCredentials;
    } catch (error) {
      this.logger.error({ error }, 'Failed to load mTLS certificates');
      throw error;
    }
  }

  /**
   * Create authentication metadata for requests
   */
  createAuthMetadata(agentId: string): grpc.Metadata {
    const metadata = new grpc.Metadata();
    metadata.set('agent-id', agentId);
    metadata.set('timestamp', new Date().toISOString());

    // Add auth token if available from environment
    if (process.env.PARALLAX_AUTH_TOKEN) {
      metadata.set('authorization', `Bearer ${process.env.PARALLAX_AUTH_TOKEN}`);
    }

    return metadata;
  }

  /**
   * Rotate certificates for a service
   * Note: Full implementation requires integration with a CA
   */
  async rotateCertificates(serviceName: string): Promise<void> {
    this.logger.warn(
      { serviceName, certsDir: this.config.certsDir },
      'Certificate rotation not yet implemented - requires CA integration'
    );
    throw new Error('Certificate rotation not yet implemented');
  }

  /**
   * Clear cached credentials (e.g., after certificate rotation)
   */
  clearCache(): void {
    this.cachedCredentials = undefined;
    this.lastLoad = 0;
  }
}

/**
 * Secure proxy class that represents a remote agent connected via gRPC with mTLS.
 * Uses the SDK's generated ConfidenceAgentClient for type-safe communication.
 */
export class SecureGrpcAgentProxy implements Agent {
  private _client!: ConfidenceAgentClient;
  private _capabilities: string[] = [];
  private _expertiseLevel: number = 0.7;
  private _capabilityScores: Record<string, number> = {};
  private _initialized: boolean = false;
  private _initPromise: Promise<void>;
  private credentialsProvider?: MTLSCredentialsProvider;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly endpoint: string,
    private mtlsConfig?: MTLSConfig,
    private logger?: Logger
  ) {
    // Initialize client with secure credentials
    this._initPromise = this.initializeSecureClient().catch(error => {
      this.logger?.error({ error, agentId: id }, 'Failed to initialize secure client');
      // Set defaults on failure
      this._capabilities = ['analyze', 'process'];
    });
  }

  private async initializeSecureClient(): Promise<void> {
    let credentials: grpc.ChannelCredentials;

    if (this.mtlsConfig?.enabled && this.logger) {
      // Use mTLS credentials
      this.credentialsProvider = new MTLSCredentialsProvider(
        this.mtlsConfig,
        this.logger
      );

      credentials = await this.credentialsProvider.getChannelCredentials(
        this.endpoint,
        `control-plane-${this.id}`
      );
    } else {
      // Fall back to insecure for development
      credentials = grpc.credentials.createInsecure();
    }

    // Create gRPC client with credentials
    this._client = new ConfidenceAgentClient(this.endpoint, credentials);

    // Load capabilities on creation
    await this.loadCapabilities();
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

  private createAuthMetadata(): grpc.Metadata {
    if (this.credentialsProvider) {
      return this.credentialsProvider.createAuthMetadata(this.id);
    }

    // Basic metadata without mTLS
    const metadata = new grpc.Metadata();
    metadata.set('agent-id', this.id);
    metadata.set('agent-name', this.name);
    metadata.set('timestamp', new Date().toISOString());

    if (process.env.PARALLAX_AUTH_TOKEN) {
      metadata.set('authorization', `Bearer ${process.env.PARALLAX_AUTH_TOKEN}`);
    }

    return metadata;
  }

  private async loadCapabilities(): Promise<void> {
    try {
      const metadata = this.createAuthMetadata();
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 10);

      const response = await new Promise<Capabilities>((resolve, reject) => {
        this._client.getCapabilities(
          GoogleEmpty.create({}),
          metadata,
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
    } catch (error) {
      this.logger?.error({ error, agentId: this.id }, 'Failed to load capabilities');
      throw error;
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const metadata = this.createAuthMetadata();
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + 5);

      const response = await new Promise<Health>((resolve, reject) => {
        this._client.healthCheck(
          GoogleEmpty.create({}),
          metadata,
          { deadline },
          (err: grpc.ServiceError | null, response?: Health) => {
            if (err) reject(err);
            else if (response) resolve(response);
            else reject(new Error('No response received'));
          }
        );
      });

      return response.status === Health_Status.HEALTHY;
    } catch (error) {
      this.logger?.warn({ error, agentId: this.id }, 'Health check failed');
      return false;
    }
  }

  async analyze<T>(task: string, data?: any): Promise<AgentResult<T>> {
    // Ensure initialization is complete
    if (!this._initialized) {
      await this._initPromise;
    }

    const metadata = this.createAuthMetadata();
    const deadline = new Date();
    deadline.setSeconds(deadline.getSeconds() + 30);

    const request: AgentRequest = {
      taskId: `task-${Date.now()}`,
      taskDescription: task,
      data: data,
      context: {},
      timeoutMs: 30000,
      patternName: '',
    };

    const response = await new Promise<ConfidenceResult>((resolve, reject) => {
      this._client.analyze(
        request,
        metadata,
        { deadline },
        (err: grpc.ServiceError | null, response?: ConfidenceResult) => {
          if (err) {
            this.logger?.error({
              error: err,
              agentId: this.id,
              task,
            }, 'Agent analysis failed');
            reject(err);
          } else if (response) {
            resolve(response);
          } else {
            reject(new Error('No response received'));
          }
        }
      );
    });

    // Parse the JSON value from the response
    let value: T;
    try {
      value = JSON.parse(response.valueJson) as T;
    } catch {
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
   * Stream analysis for long-running tasks with mTLS
   */
  async *streamAnalyze<T>(task: string, data?: any): AsyncGenerator<AgentResult<T>> {
    const metadata = this.createAuthMetadata();

    const request: AgentRequest = {
      taskId: `task-${Date.now()}`,
      taskDescription: task,
      data: data,
      context: {},
      timeoutMs: 300000,
      patternName: '',
    };

    const stream = this._client.streamAnalyze(request, metadata);

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
   * Rotate certificates for this agent connection
   */
  async rotateCertificates(): Promise<void> {
    if (!this.credentialsProvider || !this.mtlsConfig?.enabled) {
      throw new Error('mTLS not enabled');
    }

    this.logger?.info({ agentId: this.id }, 'Rotating agent certificates');

    await this.credentialsProvider.rotateCertificates(`control-plane-${this.id}`);

    // Clear cached credentials
    this.credentialsProvider.clearCache();

    // Reinitialize client with new certificates
    await this.initializeSecureClient();
  }

  /**
   * Close the connection
   */
  close(): void {
    this._client?.close();
  }

  /**
   * Static factory method to create a secure proxy
   */
  static async fromMetadata(
    metadata: {
      id: string;
      name: string;
      endpoint: string;
    },
    mtlsConfig?: MTLSConfig,
    logger?: Logger
  ): Promise<SecureGrpcAgentProxy> {
    const proxy = new SecureGrpcAgentProxy(
      metadata.id,
      metadata.name,
      metadata.endpoint,
      mtlsConfig,
      logger
    );

    // Wait for initialization to complete
    await proxy.waitForInit();

    return proxy;
  }
}

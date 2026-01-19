import * as grpc from '@grpc/grpc-js';
import { promises as fs } from 'fs';
import path from 'path';
import { ParallaxAgent } from './agent-base';

// Temporarily define types here until packages are fixed
export interface MTLSConfig {
  enabled: boolean;
  certsDir: string;
  caFile?: string;
  certFile?: string;
  keyFile?: string;
  clientCertFile?: string;
  clientKeyFile?: string;
  checkClientCertificate?: boolean;
  allowedClientIds?: string[];
  allowInsecure?: boolean;
}

export interface Logger {
  info(msg: string | object, ...args: any[]): void;
  error(msg: string | object, ...args: any[]): void;
  warn(msg: string | object, ...args: any[]): void;
  debug(msg: string | object, ...args: any[]): void;
}

export class MTLSCredentialsProvider {
  private ca?: Buffer;
  private serverCert?: Buffer;
  private serverKey?: Buffer;
  private clientCert?: Buffer;
  private clientKey?: Buffer;

  constructor(private config: MTLSConfig, private logger: Logger) {}

  private resolvePath(file?: string, fallback?: string): string | undefined {
    if (file) return path.isAbsolute(file) ? file : path.join(this.config.certsDir, file);
    if (fallback) return path.join(this.config.certsDir, fallback);
    return undefined;
  }

  private async loadMaterial(): Promise<void> {
    const caPath = this.resolvePath(this.config.caFile, 'ca.pem');
    const certPath = this.resolvePath(this.config.certFile, 'server.pem');
    const keyPath = this.resolvePath(this.config.keyFile, 'server-key.pem');
    const clientCertPath = this.resolvePath(this.config.clientCertFile, this.config.certFile || 'client.pem');
    const clientKeyPath = this.resolvePath(this.config.clientKeyFile, this.config.keyFile || 'client-key.pem');

    if (caPath) {
      this.ca = await fs.readFile(caPath);
    }
    if (certPath) {
      this.serverCert = await fs.readFile(certPath);
    }
    if (keyPath) {
      this.serverKey = await fs.readFile(keyPath);
    }
    if (clientCertPath) {
      this.clientCert = await fs.readFile(clientCertPath);
    }
    if (clientKeyPath) {
      this.clientKey = await fs.readFile(clientKeyPath);
    }
  }
  
  async getServerCredentials(serviceName: string): Promise<grpc.ServerCredentials> {
    await this.loadMaterial();
    if (!this.ca || !this.serverCert || !this.serverKey) {
      if (this.config.allowInsecure) {
        this.logger.warn({ serviceName }, 'mTLS files missing; falling back to insecure server credentials');
        return grpc.ServerCredentials.createInsecure();
      }
      throw new Error('mTLS server credentials missing (ca, cert, or key)');
    }

    return grpc.ServerCredentials.createSsl(
      this.ca,
      [
        {
          private_key: this.serverKey,
          cert_chain: this.serverCert,
        },
      ],
      this.config.checkClientCertificate ?? true
    );
  }

  async getClientCredentials(): Promise<grpc.ChannelCredentials> {
    await this.loadMaterial();
    if (!this.ca) {
      if (this.config.allowInsecure) {
        this.logger.warn('mTLS CA missing; falling back to insecure client credentials');
        return grpc.credentials.createInsecure();
      }
      throw new Error('mTLS client credentials missing CA');
    }

    if (this.clientCert && this.clientKey) {
      return grpc.credentials.createSsl(this.ca, this.clientKey, this.clientCert);
    }

    return grpc.credentials.createSsl(this.ca);
  }
  
  createVerificationInterceptor(): any {
    return null;
  }
  
  async verifyClientCertificate(_call: grpc.ServerUnaryCall<any, any>): Promise<{ verified: boolean; clientId?: string; error?: string }> {
    // TLS verification is handled by grpc-js when checkClientCertificate is true.
    return { verified: true };
  }
  
  async rotateCertificates(_serviceName: string): Promise<void> {
    await this.loadMaterial();
  }
}

/**
 * Secure agent base class with mTLS support
 */
export abstract class SecureParallaxAgent extends ParallaxAgent {
  protected mtlsConfig?: MTLSConfig;
  protected logger?: Logger;
  protected credentialsProvider?: MTLSCredentialsProvider;
  
  constructor(
    id: string,
    name: string,
    capabilities: string[],
    metadata?: Record<string, any>,
    mtlsConfig?: MTLSConfig,
    logger?: Logger
  ) {
    super(id, name, capabilities, metadata);
    this.mtlsConfig = mtlsConfig;
    this.logger = logger || console;
    
    if (mtlsConfig?.enabled) {
      this.credentialsProvider = new MTLSCredentialsProvider(mtlsConfig, this.logger!);
    }
  }
  
  /**
   * Start the agent server with mTLS
   */
  async serveSecure(port: number = 0, registryEndpoint?: string): Promise<number> {
    // Get credentials
    let credentials: grpc.ServerCredentials;
    
    if (this.mtlsConfig?.enabled && this.credentialsProvider) {
      this.logger?.info('Starting agent with mTLS enabled');
      credentials = await this.credentialsProvider.getServerCredentials(this.id);
    } else {
      this.logger?.warn('Starting agent with insecure credentials');
      credentials = grpc.ServerCredentials.createInsecure();
    }
    
    return this.serve(port, {
      serverCredentials: credentials,
      registryEndpoint: registryEndpoint || process.env.PARALLAX_REGISTRY,
      registryCredentials: this.mtlsConfig?.enabled && this.credentialsProvider
        ? await this.credentialsProvider.getClientCredentials()
        : undefined,
      verifyRequest: this.verifyRequest.bind(this),
    });
  }
  
  /**
   * Register with the control plane using secure connection
   */
  async registerSecure(registryEndpoint: string, agentAddress: string): Promise<void> {
    this.logger?.info({ 
      agentId: this.id, 
      registry: registryEndpoint 
    }, 'Registering agent with control plane');
    
    // In a real implementation, this would:
    // 1. Connect to the registry with mTLS
    // 2. Register the agent with its certificate
    // 3. Periodically renew registration
    
    // For now, we'll use environment variables or service discovery
    const credentials = this.mtlsConfig?.enabled && this.credentialsProvider
      ? await this.credentialsProvider.getClientCredentials()
      : undefined;
    await this.register(agentAddress, registryEndpoint, credentials);
    this.logger?.info('Agent registered successfully');
  }
  
  /**
   * Verify incoming request
   */
  protected async verifyRequest(
    call: grpc.ServerUnaryCall<any, any> | grpc.ServerWritableStream<any, any>
  ): Promise<{ verified: boolean; error?: string }> {
    if (!this.mtlsConfig?.checkClientCertificate) {
      return { verified: true };
    }
    
    // Extract and verify client information from metadata
    const metadata = call.metadata;
    const clientId = metadata.get('verified-client-id')?.[0]?.toString()
      || metadata.get('x-parallax-client-id')?.[0]?.toString();
    
    if (!clientId) {
      if (this.mtlsConfig?.allowedClientIds?.length) {
        return {
          verified: false,
          error: 'No verified client ID'
        };
      }
      return { verified: true };
    }

    if (this.mtlsConfig?.allowedClientIds?.length) {
      if (!this.mtlsConfig.allowedClientIds.includes(clientId)) {
        return { verified: false, error: 'Client not allowed' };
      }
    }
    
    // Additional verification logic could go here
    // - Check if client is authorized
    // - Verify against allowlist
    // - Check rate limits
    
    return { verified: true };
  }
  
  /**
   * Secure analyze method for gRPC calls
   */
  async analyzeSecure(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ): Promise<void> {
    try {
      // Verify the request first
      const verification = await this.verifyRequest(call);
      if (!verification.verified) {
        const error = new Error(verification.error || 'Unauthorized');
        (error as any).code = grpc.status.UNAUTHENTICATED;
        return callback(error);
      }

      await this.handleAnalyze(call, callback);
    } catch (error) {
      this.logger?.error({ error }, 'Error in secure analyze');
      callback(error as any);
    }
  }
  
  /**
   * Rotate agent certificates
   */
  async rotateCertificates(): Promise<void> {
    if (!this.credentialsProvider || !this.mtlsConfig?.enabled) {
      throw new Error('mTLS not enabled');
    }
    
    this.logger?.info({ agentId: this.id }, 'Rotating agent certificates');
    
    await this.credentialsProvider.rotateCertificates(this.id);
    
    // In production, you would gracefully restart the server
    // with the new certificates
  }
}

/**
 * Helper function to create and serve a secure agent
 */
export async function serveSecureAgent(
  agent: SecureParallaxAgent,
  port: number = 0,
  registryEndpoint?: string
): Promise<number> {
  return agent.serveSecure(port, registryEndpoint);
}

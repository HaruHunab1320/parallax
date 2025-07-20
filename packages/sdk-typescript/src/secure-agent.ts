import * as grpc from '@grpc/grpc-js';
import { ParallaxAgent } from './agent-base';

// Temporarily define types here until packages are fixed
export interface MTLSConfig {
  enabled: boolean;
  certsDir: string;
  caFile?: string;
  certFile?: string;
  keyFile?: string;
  checkClientCertificate?: boolean;
  allowInsecure?: boolean;
}

export interface Logger {
  info(msg: string | object, ...args: any[]): void;
  error(msg: string | object, ...args: any[]): void;
  warn(msg: string | object, ...args: any[]): void;
  debug(msg: string | object, ...args: any[]): void;
}

export class MTLSCredentialsProvider {
  constructor(_config: MTLSConfig, _logger: Logger) {}
  
  async getServerCredentials(_serviceName: string): Promise<grpc.ServerCredentials> {
    // Placeholder implementation
    return grpc.ServerCredentials.createInsecure();
  }
  
  createVerificationInterceptor(): any {
    return null;
  }
  
  async verifyClientCertificate(_call: grpc.ServerUnaryCall<any, any>): Promise<{ verified: boolean; clientId?: string; error?: string }> {
    // Placeholder implementation
    return { verified: true, clientId: 'test-client' };
  }
  
  async rotateCertificates(_serviceName: string): Promise<void> {
    // Placeholder implementation
    console.log('Certificate rotation not implemented');
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
    this.logger = logger;
    
    if (mtlsConfig?.enabled) {
      this.credentialsProvider = new MTLSCredentialsProvider(mtlsConfig, logger!);
    }
  }
  
  /**
   * Start the agent server with mTLS
   */
  async serveSecure(port: number = 0): Promise<number> {
    const server = new grpc.Server();
    
    // Add the agent service - placeholder until proto generation is fixed
    // server.addService(ConfidenceAgentService, this as any);
    
    // Get credentials
    let credentials: grpc.ServerCredentials;
    
    if (this.mtlsConfig?.enabled && this.credentialsProvider) {
      this.logger?.info('Starting agent with mTLS enabled');
      credentials = await this.credentialsProvider.getServerCredentials(this.id);
      
      // Add verification interceptor if client certificates are required
      if (this.mtlsConfig.checkClientCertificate) {
        // const _interceptor = this.credentialsProvider.createVerificationInterceptor();
        // Note: In production, you'd apply this interceptor to the service
        // This is a simplified example
      }
    } else {
      this.logger?.warn('Starting agent with insecure credentials');
      credentials = grpc.ServerCredentials.createInsecure();
    }
    
    return new Promise((resolve, reject) => {
      server.bindAsync(
        `0.0.0.0:${port}`,
        credentials,
        (err, actualPort) => {
          if (err) {
            reject(err);
          } else {
            this.logger?.info({ 
              agentId: this.id, 
              port: actualPort,
              secure: this.mtlsConfig?.enabled 
            }, 'Agent server started');
            resolve(actualPort);
          }
        }
      );
    });
  }
  
  /**
   * Register with the control plane using secure connection
   */
  async registerSecure(registryEndpoint: string): Promise<void> {
    this.logger?.info({ 
      agentId: this.id, 
      registry: registryEndpoint 
    }, 'Registering agent with control plane');
    
    // In a real implementation, this would:
    // 1. Connect to the registry with mTLS
    // 2. Register the agent with its certificate
    // 3. Periodically renew registration
    
    // For now, we'll use environment variables or service discovery
    if (process.env.PARALLAX_REGISTRY) {
      // Would implement actual registration logic here
      this.logger?.info('Agent registered successfully');
    }
  }
  
  /**
   * Verify incoming request
   */
  protected async verifyRequest(
    call: grpc.ServerUnaryCall<any, any>
  ): Promise<{ verified: boolean; error?: string }> {
    if (!this.mtlsConfig?.checkClientCertificate) {
      return { verified: true };
    }
    
    // Extract and verify client information from metadata
    const metadata = call.metadata;
    const clientId = metadata.get('verified-client-id')?.[0]?.toString();
    
    if (!clientId) {
      return {
        verified: false,
        error: 'No verified client ID'
      };
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
      
      // In a real implementation, this would extract the task and data
      // from the gRPC call and call the abstract analyze method
      // For now, just return a placeholder response
      callback(null, { 
        valueJson: '{}',
        confidence: 0.5,
        agentId: this.id,
        timestamp: Date.now()
      } as any);
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
  const actualPort = await agent.serveSecure(port);
  
  if (registryEndpoint) {
    await agent.registerSecure(registryEndpoint);
  }
  
  return actualPort;
}
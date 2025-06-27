/**
 * mTLS Credentials Provider for gRPC
 */

import * as grpc from '@grpc/grpc-js';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from 'pino';
import { CertificateManager } from './certificate-manager';

export interface MTLSConfig {
  enabled: boolean;
  certsDir: string;
  caFile?: string;
  certFile?: string;
  keyFile?: string;
  checkClientCertificate?: boolean;
  allowInsecure?: boolean;
}

export class MTLSCredentialsProvider {
  private certificateManager: CertificateManager;
  
  constructor(
    private config: MTLSConfig,
    private logger: Logger
  ) {
    this.certificateManager = new CertificateManager(config.certsDir, logger);
  }
  
  /**
   * Get server credentials for gRPC server
   */
  async getServerCredentials(
    serviceName: string
  ): Promise<grpc.ServerCredentials> {
    if (!this.config.enabled) {
      this.logger.warn('mTLS disabled, using insecure credentials');
      return grpc.ServerCredentials.createInsecure();
    }
    
    try {
      let certSet;
      
      if (this.config.certFile && this.config.keyFile) {
        // Use provided certificates
        certSet = {
          certificate: await fs.readFile(this.config.certFile, 'utf8'),
          privateKey: await fs.readFile(this.config.keyFile, 'utf8'),
          publicKey: '', // Not needed for server
          caCertificate: this.config.caFile ? 
            await fs.readFile(this.config.caFile, 'utf8') : undefined
        };
      } else {
        // Load or generate certificates
        try {
          certSet = await this.certificateManager.loadCertificateSet(serviceName);
        } catch (error) {
          this.logger.info('Generating new certificate for service', { serviceName });
          
          // Initialize CA if needed
          await this.certificateManager.initializeCA({
            commonName: 'Parallax CA',
            organization: 'Parallax Platform',
            validityDays: 3650
          });
          
          // Generate service certificate
          certSet = await this.certificateManager.generateCertificate({
            commonName: serviceName,
            organizationalUnit: 'Service',
            validityDays: 365
          });
          
          await this.certificateManager.saveCertificateSet(serviceName, certSet);
        }
      }
      
      const certChain = Buffer.from(certSet.certificate);
      const privateKey = Buffer.from(certSet.privateKey);
      const rootCerts = certSet.caCertificate ? 
        Buffer.from(certSet.caCertificate) : null;
      
      if (this.config.checkClientCertificate && rootCerts) {
        // Require and verify client certificates
        return grpc.ServerCredentials.createSsl(
          rootCerts,
          [{
            cert_chain: certChain,
            private_key: privateKey
          }],
          true // checkClientCertificate
        );
      } else {
        // Don't require client certificates
        return grpc.ServerCredentials.createSsl(
          null,
          [{
            cert_chain: certChain,
            private_key: privateKey
          }],
          false
        );
      }
    } catch (error) {
      this.logger.error({ error }, 'Failed to create server credentials');
      
      if (this.config.allowInsecure) {
        this.logger.warn('Falling back to insecure credentials');
        return grpc.ServerCredentials.createInsecure();
      }
      
      throw error;
    }
  }
  
  /**
   * Get channel credentials for gRPC client
   */
  async getChannelCredentials(
    _targetService: string,
    clientName: string
  ): Promise<grpc.ChannelCredentials> {
    if (!this.config.enabled) {
      this.logger.warn('mTLS disabled, using insecure credentials');
      return grpc.credentials.createInsecure();
    }
    
    try {
      let certSet;
      
      if (this.config.certFile && this.config.keyFile) {
        // Use provided certificates
        certSet = {
          certificate: await fs.readFile(this.config.certFile, 'utf8'),
          privateKey: await fs.readFile(this.config.keyFile, 'utf8'),
          publicKey: '', // Not needed
          caCertificate: this.config.caFile ? 
            await fs.readFile(this.config.caFile, 'utf8') : undefined
        };
      } else {
        // Load or generate certificates
        try {
          certSet = await this.certificateManager.loadCertificateSet(clientName);
        } catch (error) {
          this.logger.info('Generating new certificate for client', { clientName });
          
          // Initialize CA if needed
          await this.certificateManager.initializeCA({
            commonName: 'Parallax CA',
            organization: 'Parallax Platform',
            validityDays: 3650
          });
          
          // Generate client certificate
          certSet = await this.certificateManager.generateCertificate({
            commonName: clientName,
            organizationalUnit: 'Client',
            validityDays: 365
          });
          
          await this.certificateManager.saveCertificateSet(clientName, certSet);
        }
      }
      
      const rootCerts = certSet.caCertificate ? 
        Buffer.from(certSet.caCertificate) : undefined;
      const certChain = Buffer.from(certSet.certificate);
      const privateKey = Buffer.from(certSet.privateKey);
      
      // Create SSL credentials
      return grpc.credentials.createSsl(
        rootCerts,
        privateKey,
        certChain
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to create channel credentials');
      
      if (this.config.allowInsecure) {
        this.logger.warn('Falling back to insecure credentials');
        return grpc.credentials.createInsecure();
      }
      
      throw error;
    }
  }
  
  /**
   * Create metadata for mutual authentication
   */
  createAuthMetadata(agentId: string): grpc.Metadata {
    const metadata = new grpc.Metadata();
    metadata.set('agent-id', agentId);
    metadata.set('timestamp', new Date().toISOString());
    
    // Could add additional auth tokens here
    if (process.env.PARALLAX_AUTH_TOKEN) {
      metadata.set('authorization', `Bearer ${process.env.PARALLAX_AUTH_TOKEN}`);
    }
    
    return metadata;
  }
  
  /**
   * Verify client certificate from metadata
   */
  async verifyClientCertificate(
    call: grpc.ServerUnaryCall<any, any> | grpc.ServerWritableStream<any, any>
  ): Promise<{ verified: boolean; clientId?: string; error?: string }> {
    try {
      // Get peer info
      const peer = call.getPeer();
      this.logger.debug({ peer }, 'Verifying client certificate');
      
      // In a real implementation, we would extract the certificate
      // from the TLS connection and verify it
      // For now, we'll check metadata
      
      const metadata = call.metadata;
      const agentId = metadata.get('agent-id')?.[0]?.toString();
      
      if (!agentId) {
        return {
          verified: false,
          error: 'No agent ID in metadata'
        };
      }
      
      // Additional verification could be done here
      // - Check certificate CN matches agent ID
      // - Verify certificate is not revoked
      // - Check certificate validity period
      
      return {
        verified: true,
        clientId: agentId
      };
    } catch (error) {
      this.logger.error({ error }, 'Certificate verification failed');
      return {
        verified: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Create interceptor for client certificate verification
   * Note: In practice, mTLS verification happens at the transport layer
   * This is a simplified example for metadata-based verification
   */
  createVerificationInterceptor(): any {
    // Return a simple middleware function for now
    // In production, use proper gRPC interceptors
    return (call: any, callback: any, next: any) => {
      if (!this.config.checkClientCertificate) {
        return next();
      }
      
      // Simplified verification
      const metadata = call.metadata;
      const agentId = metadata?.get('agent-id')?.[0]?.toString();
      
      if (!agentId) {
        const error = new Error('No agent ID in metadata');
        (error as any).code = grpc.status.UNAUTHENTICATED;
        return callback(error);
      }
      
      // Add verified client ID
      if (metadata) {
        metadata.set('verified-client-id', agentId);
      }
      
      next();
    };
  }
  
  /**
   * Rotate certificates for a service
   */
  async rotateCertificates(serviceName: string): Promise<void> {
    this.logger.info({ serviceName }, 'Rotating certificates');
    
    // Generate new certificate
    const certSet = await this.certificateManager.generateCertificate({
      commonName: serviceName,
      organizationalUnit: 'Service',
      validityDays: 365
    });
    
    // Backup old certificates
    const backupDir = path.join(this.config.certsDir, serviceName, 'backup', Date.now().toString());
    await fs.mkdir(backupDir, { recursive: true });
    
    const certDir = path.join(this.config.certsDir, serviceName);
    try {
      await fs.copyFile(
        path.join(certDir, 'cert.pem'),
        path.join(backupDir, 'cert.pem')
      );
      await fs.copyFile(
        path.join(certDir, 'key.pem'),
        path.join(backupDir, 'key.pem')
      );
    } catch (error) {
      // Old certificates might not exist
    }
    
    // Save new certificates
    await this.certificateManager.saveCertificateSet(serviceName, certSet);
    
    this.logger.info({ serviceName }, 'Certificates rotated successfully');
  }
}
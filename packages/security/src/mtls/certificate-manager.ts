/**
 * Certificate Manager for mTLS authentication
 */

import * as forge from 'node-forge';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from 'pino';

export interface CertificateConfig {
  commonName: string;
  organization?: string;
  organizationalUnit?: string;
  country?: string;
  state?: string;
  locality?: string;
  validityDays?: number;
  keySize?: number;
}

export interface CertificateSet {
  certificate: string;
  privateKey: string;
  publicKey: string;
  caCertificate?: string;
}

export class CertificateManager {
  private caKey?: forge.pki.rsa.PrivateKey;
  private caCert?: forge.pki.Certificate;
  
  constructor(
    private certsDir: string,
    private logger: Logger
  ) {}
  
  /**
   * Initialize the Certificate Authority
   */
  async initializeCA(config: CertificateConfig): Promise<void> {
    try {
      // Try to load existing CA
      await this.loadCA();
      this.logger.info('Loaded existing Certificate Authority');
    } catch (error) {
      // Generate new CA
      this.logger.info('Generating new Certificate Authority');
      await this.generateCA(config);
      await this.saveCA();
    }
  }
  
  /**
   * Generate a new Certificate Authority
   */
  private async generateCA(config: CertificateConfig): Promise<void> {
    const keySize = config.keySize || 4096;
    const validityDays = config.validityDays || 3650; // 10 years
    
    // Generate key pair
    this.logger.debug('Generating CA key pair');
    const keys = forge.pki.rsa.generateKeyPair(keySize);
    this.caKey = keys.privateKey;
    
    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = '01';
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);
    
    // Set subject
    const attrs = [
      { name: 'commonName', value: config.commonName },
      { name: 'countryName', value: config.country || 'US' },
      { name: 'stateOrProvinceName', value: config.state || 'CA' },
      { name: 'localityName', value: config.locality || 'San Francisco' },
      { name: 'organizationName', value: config.organization || 'Parallax' },
      { name: 'organizationalUnitName', value: config.organizationalUnit || 'Platform' }
    ];
    
    cert.setSubject(attrs);
    cert.setIssuer(attrs); // Self-signed
    
    // Set extensions
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: true,
        critical: true
      },
      {
        name: 'keyUsage',
        keyCertSign: true,
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
        critical: true
      },
      {
        name: 'subjectKeyIdentifier'
      },
      {
        name: 'authorityKeyIdentifier',
        authorityCertIssuer: true,
        serialNumber: cert.serialNumber
      }
    ]);
    
    // Sign certificate
    cert.sign(this.caKey, forge.md.sha256.create());
    this.caCert = cert;
    
    this.logger.info('Certificate Authority generated successfully');
  }
  
  /**
   * Generate a certificate signed by the CA
   */
  async generateCertificate(config: CertificateConfig): Promise<CertificateSet> {
    if (!this.caKey || !this.caCert) {
      throw new Error('CA not initialized');
    }
    
    const keySize = config.keySize || 2048;
    const validityDays = config.validityDays || 365;
    
    // Generate key pair
    this.logger.debug({ commonName: config.commonName }, 'Generating certificate');
    const keys = forge.pki.rsa.generateKeyPair(keySize);
    
    // Create certificate
    const cert = forge.pki.createCertificate();
    cert.publicKey = keys.publicKey;
    cert.serialNumber = this.generateSerialNumber();
    cert.validity.notBefore = new Date();
    cert.validity.notAfter = new Date();
    cert.validity.notAfter.setDate(cert.validity.notBefore.getDate() + validityDays);
    
    // Set subject
    const attrs = [
      { name: 'commonName', value: config.commonName },
      { name: 'countryName', value: config.country || 'US' },
      { name: 'stateOrProvinceName', value: config.state || 'CA' },
      { name: 'localityName', value: config.locality || 'San Francisco' },
      { name: 'organizationName', value: config.organization || 'Parallax' },
      { name: 'organizationalUnitName', value: config.organizationalUnit || 'Agent' }
    ];
    
    cert.setSubject(attrs);
    cert.setIssuer(this.caCert.subject.attributes);
    
    // Set extensions
    cert.setExtensions([
      {
        name: 'basicConstraints',
        cA: false,
        critical: true
      },
      {
        name: 'keyUsage',
        digitalSignature: true,
        nonRepudiation: true,
        keyEncipherment: true,
        dataEncipherment: true,
        critical: true
      },
      {
        name: 'extKeyUsage',
        serverAuth: true,
        clientAuth: true,
        critical: true
      },
      {
        name: 'subjectKeyIdentifier'
      },
      {
        name: 'authorityKeyIdentifier',
        authorityCertIssuer: true,
        serialNumber: this.caCert.serialNumber
      },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: config.commonName }, // DNS
          { type: 2, value: `*.${config.commonName}` }, // Wildcard
          { type: 7, ip: '127.0.0.1' }, // IP
          { type: 7, ip: '::1' } // IPv6
        ]
      }
    ]);
    
    // Sign certificate
    cert.sign(this.caKey, forge.md.sha256.create());
    
    // Convert to PEM
    const certificatePem = forge.pki.certificateToPem(cert);
    const privateKeyPem = forge.pki.privateKeyToPem(keys.privateKey);
    const publicKeyPem = forge.pki.publicKeyToPem(keys.publicKey);
    const caCertificatePem = forge.pki.certificateToPem(this.caCert);
    
    return {
      certificate: certificatePem,
      privateKey: privateKeyPem,
      publicKey: publicKeyPem,
      caCertificate: caCertificatePem
    };
  }
  
  /**
   * Save certificate set to files
   */
  async saveCertificateSet(
    name: string,
    certSet: CertificateSet
  ): Promise<void> {
    const certDir = path.join(this.certsDir, name);
    await fs.mkdir(certDir, { recursive: true });
    
    await fs.writeFile(
      path.join(certDir, 'cert.pem'),
      certSet.certificate,
      'utf8'
    );
    
    await fs.writeFile(
      path.join(certDir, 'key.pem'),
      certSet.privateKey,
      { mode: 0o600, encoding: 'utf8' }
    );
    
    if (certSet.caCertificate) {
      await fs.writeFile(
        path.join(certDir, 'ca.pem'),
        certSet.caCertificate,
        'utf8'
      );
    }
    
    this.logger.info({ name }, 'Certificate set saved');
  }
  
  /**
   * Load certificate set from files
   */
  async loadCertificateSet(name: string): Promise<CertificateSet> {
    const certDir = path.join(this.certsDir, name);
    
    const certificate = await fs.readFile(
      path.join(certDir, 'cert.pem'),
      'utf8'
    );
    
    const privateKey = await fs.readFile(
      path.join(certDir, 'key.pem'),
      'utf8'
    );
    
    let caCertificate: string | undefined;
    try {
      caCertificate = await fs.readFile(
        path.join(certDir, 'ca.pem'),
        'utf8'
      );
    } catch (error) {
      // CA certificate is optional
    }
    
    // Extract public key from certificate
    const cert = forge.pki.certificateFromPem(certificate);
    const publicKey = forge.pki.publicKeyToPem(cert.publicKey);
    
    return {
      certificate,
      privateKey,
      publicKey,
      caCertificate
    };
  }
  
  /**
   * Verify a certificate against the CA
   */
  async verifyCertificate(certificatePem: string): Promise<boolean> {
    if (!this.caCert) {
      throw new Error('CA not initialized');
    }
    
    try {
      const cert = forge.pki.certificateFromPem(certificatePem);
      
      // Create CA store
      const caStore = forge.pki.createCaStore([this.caCert]);
      
      // Verify certificate
      forge.pki.verifyCertificateChain(caStore, [cert]);
      
      // Check validity period
      const now = new Date();
      if (now < cert.validity.notBefore || now > cert.validity.notAfter) {
        return false;
      }
      
      return true;
    } catch (error) {
      this.logger.warn({ error }, 'Certificate verification failed');
      return false;
    }
  }
  
  /**
   * Extract certificate information
   */
  getCertificateInfo(certificatePem: string): {
    commonName: string;
    serialNumber: string;
    validFrom: Date;
    validTo: Date;
    issuer: string;
  } {
    const cert = forge.pki.certificateFromPem(certificatePem);
    
    const commonName = cert.subject.getField('CN')?.value || '';
    const issuerCN = cert.issuer.getField('CN')?.value || '';
    
    return {
      commonName,
      serialNumber: cert.serialNumber,
      validFrom: cert.validity.notBefore,
      validTo: cert.validity.notAfter,
      issuer: issuerCN
    };
  }
  
  /**
   * Load CA from disk
   */
  private async loadCA(): Promise<void> {
    const caPath = path.join(this.certsDir, 'ca');
    
    const certPem = await fs.readFile(
      path.join(caPath, 'cert.pem'),
      'utf8'
    );
    
    const keyPem = await fs.readFile(
      path.join(caPath, 'key.pem'),
      'utf8'
    );
    
    this.caCert = forge.pki.certificateFromPem(certPem);
    this.caKey = forge.pki.privateKeyFromPem(keyPem);
  }
  
  /**
   * Save CA to disk
   */
  private async saveCA(): Promise<void> {
    if (!this.caKey || !this.caCert) {
      throw new Error('CA not generated');
    }
    
    const caPath = path.join(this.certsDir, 'ca');
    await fs.mkdir(caPath, { recursive: true });
    
    await fs.writeFile(
      path.join(caPath, 'cert.pem'),
      forge.pki.certificateToPem(this.caCert),
      'utf8'
    );
    
    await fs.writeFile(
      path.join(caPath, 'key.pem'),
      forge.pki.privateKeyToPem(this.caKey),
      { mode: 0o600, encoding: 'utf8' }
    );
  }
  
  /**
   * Generate a unique serial number
   */
  private generateSerialNumber(): string {
    return Date.now().toString(16);
  }
}
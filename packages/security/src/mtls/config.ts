/**
 * mTLS configuration utilities
 */

import { MTLSConfig } from './credentials-provider';
import * as path from 'path';

/**
 * Get mTLS configuration from environment
 */
export function getMTLSConfig(): MTLSConfig {
  const enabled = process.env.PARALLAX_TLS_ENABLED === 'true';
  
  if (!enabled) {
    return {
      enabled: false,
      certsDir: '',
      allowInsecure: true
    };
  }
  
  return {
    enabled: true,
    certsDir: process.env.PARALLAX_CERTS_DIR || path.join(process.cwd(), 'certs'),
    caFile: process.env.PARALLAX_TLS_CA_FILE,
    certFile: process.env.PARALLAX_TLS_CERT_FILE,
    keyFile: process.env.PARALLAX_TLS_KEY_FILE,
    checkClientCertificate: process.env.PARALLAX_TLS_VERIFY_CLIENT === 'true',
    allowInsecure: process.env.PARALLAX_TLS_ALLOW_INSECURE === 'true'
  };
}

/**
 * Validate mTLS configuration
 */
export function validateMTLSConfig(config: MTLSConfig): void {
  if (!config.enabled) {
    return;
  }
  
  if (!config.certsDir && (!config.certFile || !config.keyFile)) {
    throw new Error('Either certsDir or certFile/keyFile must be provided');
  }
  
  if (config.checkClientCertificate && !config.caFile && !config.certsDir) {
    throw new Error('CA certificate required for client verification');
  }
}

/**
 * Get service-specific mTLS config
 */
export function getServiceMTLSConfig(serviceName: string): MTLSConfig {
  const baseConfig = getMTLSConfig();
  
  // Override with service-specific config if available
  const servicePrefix = `PARALLAX_${serviceName.toUpperCase().replace(/-/g, '_')}_`;
  
  return {
    ...baseConfig,
    certFile: process.env[`${servicePrefix}CERT_FILE`] || baseConfig.certFile,
    keyFile: process.env[`${servicePrefix}KEY_FILE`] || baseConfig.keyFile,
    checkClientCertificate: process.env[`${servicePrefix}VERIFY_CLIENT`] === 'true' || baseConfig.checkClientCertificate
  };
}
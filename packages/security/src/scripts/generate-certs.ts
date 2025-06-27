#!/usr/bin/env tsx

/**
 * Script to generate certificates for Parallax platform
 */

import { CertificateManager } from '../mtls/certificate-manager';
import * as path from 'path';
import * as fs from 'fs/promises';
import pino from 'pino';

const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

async function main() {
  const certsDir = process.env.PARALLAX_CERTS_DIR || path.join(__dirname, '../../certs');
  
  logger.info({ certsDir }, 'Generating certificates');
  
  // Ensure certs directory exists
  await fs.mkdir(certsDir, { recursive: true });
  
  const certManager = new CertificateManager(certsDir, logger);
  
  // Initialize CA
  logger.info('Initializing Certificate Authority');
  await certManager.initializeCA({
    commonName: 'Parallax Root CA',
    organization: 'Parallax Platform',
    organizationalUnit: 'Security',
    country: 'US',
    state: 'California',
    locality: 'San Francisco',
    validityDays: 3650, // 10 years
    keySize: 4096
  });
  
  // Generate certificates for core services
  const services = [
    {
      name: 'control-plane',
      config: {
        commonName: 'control-plane.parallax.local',
        organizationalUnit: 'Control Plane',
        validityDays: 365
      }
    },
    {
      name: 'agent-proxy',
      config: {
        commonName: 'agent-proxy.parallax.local',
        organizationalUnit: 'Agent Proxy',
        validityDays: 365
      }
    }
  ];
  
  for (const service of services) {
    logger.info({ service: service.name }, 'Generating service certificate');
    
    const certSet = await certManager.generateCertificate(service.config);
    await certManager.saveCertificateSet(service.name, certSet);
  }
  
  // Generate certificates for example agents
  const agents = [
    {
      name: 'sentiment-agent-1',
      config: {
        commonName: 'sentiment-1.agents.parallax.local',
        organizationalUnit: 'Agent',
        validityDays: 365
      }
    },
    {
      name: 'weather-agent-1',
      config: {
        commonName: 'weather-1.agents.parallax.local',
        organizationalUnit: 'Agent',
        validityDays: 365
      }
    }
  ];
  
  for (const agent of agents) {
    logger.info({ agent: agent.name }, 'Generating agent certificate');
    
    const certSet = await certManager.generateCertificate(agent.config);
    await certManager.saveCertificateSet(agent.name, certSet);
  }
  
  // Generate client certificates
  const clients = [
    {
      name: 'cli',
      config: {
        commonName: 'cli.clients.parallax.local',
        organizationalUnit: 'Client',
        validityDays: 365
      }
    },
    {
      name: 'admin',
      config: {
        commonName: 'admin.clients.parallax.local',
        organizationalUnit: 'Admin',
        validityDays: 365
      }
    }
  ];
  
  for (const client of clients) {
    logger.info({ client: client.name }, 'Generating client certificate');
    
    const certSet = await certManager.generateCertificate(client.config);
    await certManager.saveCertificateSet(client.name, certSet);
  }
  
  logger.info('Certificate generation complete');
  
  // Print summary
  console.log('\n=== Certificate Summary ===\n');
  console.log(`CA Certificate: ${path.join(certsDir, 'ca/cert.pem')}`);
  console.log('\nService Certificates:');
  for (const service of services) {
    console.log(`  ${service.name}: ${path.join(certsDir, service.name, 'cert.pem')}`);
  }
  console.log('\nAgent Certificates:');
  for (const agent of agents) {
    console.log(`  ${agent.name}: ${path.join(certsDir, agent.name, 'cert.pem')}`);
  }
  console.log('\nClient Certificates:');
  for (const client of clients) {
    console.log(`  ${client.name}: ${path.join(certsDir, client.name, 'cert.pem')}`);
  }
  console.log('\n=========================\n');
}

main().catch(error => {
  logger.error({ error }, 'Certificate generation failed');
  process.exit(1);
});
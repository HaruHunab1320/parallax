/**
 * Example secure agent with mTLS authentication
 */

import { SecureParallaxAgent, serveSecureAgent } from '@parallax/sdk-typescript';
import { getMTLSConfig } from '@parallax/security';
import pino from 'pino';

// Create logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Define a secure financial analysis agent
class SecureFinancialAgent extends SecureParallaxAgent {
  constructor() {
    const mtlsConfig = getMTLSConfig();
    
    super(
      'financial-1',
      'Secure Financial Analyzer',
      ['financial', 'risk-assessment', 'compliance'],
      {
        expertise: 0.9,
        capabilityScores: {
          'financial': 0.95,
          'risk-assessment': 0.88,
          'compliance': 0.92
        },
        certifications: ['SOC2', 'PCI-DSS']
      },
      mtlsConfig,
      logger
    );
  }
  
  async analyze(task: string, data?: any): Promise<[any, number]> {
    logger.info({ task, hasData: !!data }, 'Analyzing financial data');
    
    // Simulate financial analysis
    if (task.includes('risk')) {
      const riskScore = Math.random() * 100;
      const confidence = 0.85 + Math.random() * 0.1;
      
      return [{
        risk_score: riskScore,
        risk_level: riskScore > 70 ? 'HIGH' : riskScore > 40 ? 'MEDIUM' : 'LOW',
        factors: [
          'Market volatility',
          'Credit exposure',
          'Regulatory compliance'
        ],
        recommendations: [
          'Diversify portfolio',
          'Review compliance procedures'
        ]
      }, confidence];
    } else if (task.includes('compliance')) {
      const compliant = Math.random() > 0.2;
      const confidence = 0.9 + Math.random() * 0.08;
      
      return [{
        compliant,
        issues: compliant ? [] : [
          'Missing audit trail',
          'Incomplete KYC documentation'
        ],
        next_review: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()
      }, confidence];
    } else {
      // General financial analysis
      const revenue = data?.revenue || 1000000;
      const growth = (Math.random() - 0.3) * 0.2;
      const confidence = 0.75 + Math.random() * 0.15;
      
      return [{
        revenue,
        projected_revenue: revenue * (1 + growth),
        growth_rate: growth,
        health_score: 75 + Math.random() * 20,
        analysis: 'Financial health is stable with moderate growth potential'
      }, confidence];
    }
  }
}

// Main function
async function main() {
  const agent = new SecureFinancialAgent();
  
  // Get configuration
  const port = parseInt(process.env.AGENT_PORT || '50061');
  const registryEndpoint = process.env.PARALLAX_REGISTRY;
  
  logger.info({
    agentId: agent.id,
    secure: getMTLSConfig().enabled,
    port
  }, 'Starting secure financial agent');
  
  try {
    const actualPort = await serveSecureAgent(agent, port, registryEndpoint);
    
    logger.info(`
===========================================
Secure Financial Agent Started
===========================================
ID: ${agent.id}
Port: ${actualPort}
mTLS: ${getMTLSConfig().enabled ? 'ENABLED' : 'DISABLED'}
Capabilities: ${agent.capabilities.join(', ')}

Security Features:
- mTLS authentication ${getMTLSConfig().enabled ? '✓' : '✗'}
- Client verification ${getMTLSConfig().checkClientCertificate ? '✓' : '✗'}
- Certificate rotation support ✓
- Secure metadata exchange ✓

Example usage:
{
  "task": "Analyze financial risk",
  "data": {
    "revenue": 5000000,
    "debt": 1000000,
    "assets": 8000000
  }
}
===========================================
    `);
    
    // Handle shutdown gracefully
    process.on('SIGTERM', () => {
      logger.info('Shutting down agent...');
      process.exit(0);
    });
    
    process.on('SIGINT', () => {
      logger.info('Shutting down agent...');
      process.exit(0);
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start agent');
    process.exit(1);
  }
}

// Run if main module
if (require.main === module) {
  main().catch(error => {
    logger.error({ error }, 'Agent crashed');
    process.exit(1);
  });
}

export { SecureFinancialAgent };
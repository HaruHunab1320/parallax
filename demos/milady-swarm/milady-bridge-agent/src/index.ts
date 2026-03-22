/**
 * Milady Bridge Agent Entry Point
 *
 * Wraps a Milady instance's HTTP API as a ParallaxAgent and connects
 * to the control plane via gateway for orchestrated social campaigns.
 *
 * Environment variables:
 *   AGENT_ID           — unique agent identifier (e.g., "mila", "nova")
 *   AGENT_NAME         — human-readable name (defaults to AGENT_ID)
 *   AGENT_ROLE         — agent role: "strategist", "poster", "engager", "amplifier"
 *   MILADY_URL         — Milady instance base URL (e.g., "http://localhost:2138")
 *   MILADY_TOKEN       — API token for Milady instance
 *   PARALLAX_GATEWAY   — gateway endpoint (default: "34.58.31.212:8081")
 *   LOG_LEVEL          — pino log level (default: "info")
 */

import { MiladyBridgeAgent } from './milady-bridge-agent';
import { MiladyClient } from './milady-client';
import type { BridgeAgentConfig } from './types';
import pino from 'pino';

function loadConfig(): BridgeAgentConfig {
  const id = process.env.AGENT_ID;
  if (!id) throw new Error('AGENT_ID is required');

  const role = process.env.AGENT_ROLE;
  if (!role) throw new Error('AGENT_ROLE is required');

  const miladyUrl = process.env.MILADY_URL;
  if (!miladyUrl) throw new Error('MILADY_URL is required');

  const miladyToken = process.env.MILADY_TOKEN;
  if (!miladyToken) throw new Error('MILADY_TOKEN is required');

  return {
    id,
    name: process.env.AGENT_NAME || id,
    role,
    miladyUrl,
    miladyToken,
    gatewayEndpoint:
      process.env.PARALLAX_GATEWAY || '34.58.31.212:8081',
    logLevel: process.env.LOG_LEVEL || 'info',
  };
}

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: { colorize: true },
  },
});

async function main() {
  const config = loadConfig();

  logger.info(
    {
      id: config.id,
      name: config.name,
      role: config.role,
      miladyUrl: config.miladyUrl,
      gateway: config.gatewayEndpoint,
    },
    'Starting Milady Bridge agent'
  );

  const client = new MiladyClient(config.miladyUrl, config.miladyToken);

  // Verify Milady is reachable
  const healthy = await client.healthCheck();
  if (!healthy) {
    logger.warn(
      { miladyUrl: config.miladyUrl },
      'Milady instance not responding — starting anyway (will retry on task)'
    );
  }

  const agent = new MiladyBridgeAgent(
    config.id,
    config.name,
    config.role,
    client
  );

  // Connect via gateway (outbound connection — works behind NAT)
  try {
    await agent.connectViaGateway(config.gatewayEndpoint, {
      autoReconnect: true,
      heartbeatIntervalMs: 10000,
      maxReconnectAttempts: Infinity,
      initialReconnectDelayMs: 2000,
      maxReconnectDelayMs: 30000,
    });

    logger.info(
      { id: config.id, gateway: config.gatewayEndpoint },
      'Connected to control plane via gateway'
    );
  } catch (error: any) {
    logger.error({ error: error.message }, 'Failed to connect to gateway');
    process.exit(1);
  }

  // Graceful shutdown
  const shutdown = async () => {
    logger.info('Shutting down Milady Bridge agent...');
    await agent.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  logger.info('Milady Bridge agent running. Press Ctrl+C to stop.');
}

main().catch((error) => {
  logger.error({ error: error.message }, 'Fatal error');
  process.exit(1);
});

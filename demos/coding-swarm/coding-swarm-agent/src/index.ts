/**
 * Coding Swarm Agent Entry Point
 *
 * Loads configuration from environment, creates a SwarmAgent,
 * and connects via gateway to the Parallax control plane.
 *
 * Environment variables:
 *   AGENT_ID          — unique agent identifier (e.g., "vero", "sable")
 *   AGENT_NAME        — human-readable name (defaults to AGENT_ID)
 *   AGENT_TYPE        — coding agent type: "claude", "codex", "gemini" (default: "claude")
 *   PARALLAX_GATEWAY  — gateway endpoint (default: "localhost:50051")
 *   LOG_LEVEL         — pino log level (default: "info")
 *   TMUX_PREFIX       — tmux session prefix (default: "swarm")
 *   TERMINAL_COLS     — terminal width (default: 100)
 *   TERMINAL_ROWS     — terminal height (default: 28)
 */

import { SwarmAgent } from './swarm-agent';
import { loadConfig } from './config';
import pino from 'pino';

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
      agentType: config.agentType,
      gateway: config.gatewayEndpoint,
    },
    'Starting Coding Swarm agent'
  );

  const agent = new SwarmAgent(config);

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
    logger.info('Shutting down swarm agent...');
    await agent.shutdown();
    process.exit(0);
  };

  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  // Keep alive
  logger.info('Swarm agent running. Press Ctrl+C to stop.');
}

main().catch((error) => {
  logger.error({ error: error.message }, 'Fatal error');
  process.exit(1);
});

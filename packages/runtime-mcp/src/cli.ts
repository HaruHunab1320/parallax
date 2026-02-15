#!/usr/bin/env node
/**
 * Parallax MCP Server CLI
 *
 * Standalone entry point for running the MCP server.
 * Primarily used with Claude Desktop configuration.
 *
 * Usage:
 *   npx @parallax/runtime-mcp
 *   parallax-mcp
 */

import pino from 'pino';
import { ParallaxMcpServer } from './mcp-server.js';
import { StdioServerTransport } from './transports/index.js';

// Parse command line arguments
const args = process.argv.slice(2);
const logLevel = args.includes('--debug') ? 'debug' : 'info';
const maxAgents = parseInt(
  args.find((a) => a.startsWith('--max-agents='))?.split('=')[1] ?? '10',
  10
);

// Configure logger to stderr (stdout is used for MCP protocol)
const logger = pino({
  level: logLevel,
  transport: {
    target: 'pino-pretty',
    options: {
      destination: 2, // stderr
      colorize: true,
    },
  },
});

async function main() {
  logger.info({ version: '0.1.0', maxAgents }, 'Starting Parallax MCP server');

  // Create server
  const server = new ParallaxMcpServer({
    logger,
    maxAgents,
  });

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle shutdown signals
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');
    await server.disconnect();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    process.exit(1);
  });

  try {
    // Connect and start serving
    await server.connect(transport);
    logger.info('MCP server ready, waiting for connections...');
  } catch (error) {
    logger.error({ error }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});

#!/usr/bin/env node

/**
 * Parallax Local Runtime CLI
 *
 * Daemon for managing local CLI agent sessions.
 */

import pino from 'pino';
import { LocalRuntime } from './local-runtime';
import { RuntimeServer } from './server';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

async function main(): Promise<void> {
  const port = parseInt(process.env.RUNTIME_PORT || '9876', 10);
  const host = process.env.RUNTIME_HOST || '0.0.0.0';

  logger.info('Starting Parallax Local Runtime');

  // Create runtime
  const runtime = new LocalRuntime(logger, {
    maxAgents: parseInt(process.env.MAX_AGENTS || '10', 10),
  });

  // Initialize runtime
  await runtime.initialize();

  // Create and start server
  const server = new RuntimeServer(runtime, logger, { port, host });
  await server.start();

  logger.info(`
╔══════════════════════════════════════════════════════════════════╗
║  Parallax Local Runtime                                          ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  HTTP API:    http://${host}:${port}                               ║
║  WebSocket:   ws://${host}:${port}/ws                              ║
║                                                                  ║
║  Endpoints:                                                      ║
║    GET  /api/health          Health check                        ║
║    GET  /api/agents          List agents                         ║
║    POST /api/agents          Spawn agent                         ║
║    GET  /api/agents/:id      Get agent                           ║
║    DELETE /api/agents/:id    Stop agent                          ║
║    POST /api/agents/:id/send Send message                        ║
║    GET  /api/agents/:id/logs Get logs                            ║
║                                                                  ║
║  Press Ctrl+C to stop                                            ║
╚══════════════════════════════════════════════════════════════════╝
  `);

  // Handle shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutting down...');

    await server.stop();
    await runtime.shutdown();

    logger.info('Goodbye!');
    process.exit(0);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});

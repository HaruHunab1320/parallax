#!/usr/bin/env node

/**
 * Parallax Kubernetes Runtime CLI
 *
 * Operator for managing K8s-based CLI agent pods.
 */

import * as k8s from '@kubernetes/client-node';
import pino from 'pino';
import { K8sRuntime } from './k8s-runtime';
import { AgentController } from './controllers/agent-controller';
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
  const port = parseInt(process.env.RUNTIME_PORT || '9878', 10);
  const host = process.env.RUNTIME_HOST || '0.0.0.0';
  const namespace = process.env.PARALLAX_NAMESPACE || 'parallax-agents';
  const inCluster = process.env.KUBERNETES_SERVICE_HOST !== undefined;

  logger.info({ namespace, inCluster }, 'Starting Parallax Kubernetes Runtime');

  // Load kubeconfig
  const kc = new k8s.KubeConfig();
  if (inCluster) {
    kc.loadFromCluster();
    logger.info('Loaded in-cluster kubeconfig');
  } else {
    kc.loadFromDefault();
    logger.info('Loaded default kubeconfig');
  }

  // Create runtime
  const runtime = new K8sRuntime(logger, {
    namespace,
    inCluster,
    imagePrefix: process.env.IMAGE_PREFIX,
    registryEndpoint: process.env.PARALLAX_REGISTRY_ENDPOINT,
    defaultResources: {
      cpu: process.env.DEFAULT_CPU || '1',
      memory: process.env.DEFAULT_MEMORY || '2Gi',
    },
  });

  // Initialize runtime
  await runtime.initialize();

  // Create and start controller
  const controller = new AgentController(kc, logger, {
    namespace,
    imagePrefix: process.env.IMAGE_PREFIX,
    defaultCpu: process.env.DEFAULT_CPU || '1',
    defaultMemory: process.env.DEFAULT_MEMORY || '2Gi',
  });
  await controller.start();

  // Create and start server
  const server = new RuntimeServer(runtime, logger, { port, host });
  await server.start();

  logger.info(`
╔══════════════════════════════════════════════════════════════════╗
║  Parallax Kubernetes Runtime                                     ║
╠══════════════════════════════════════════════════════════════════╣
║                                                                  ║
║  HTTP API:    http://${host}:${port}                               ║
║  WebSocket:   ws://${host}:${port}/ws                              ║
║  Namespace:   ${namespace.padEnd(40)}             ║
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

    controller.stop();
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

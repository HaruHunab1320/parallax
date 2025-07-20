/**
 * HTTP server for Parallax Control Plane
 */

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { PatternEngine } from './pattern-engine';
import { TracedPatternEngine } from './pattern-engine/pattern-engine-traced';
import { IPatternEngine } from './pattern-engine/interfaces';
import { RuntimeManager } from './runtime-manager';
import { RuntimeConfig } from './runtime-manager/types';
import { EtcdRegistry } from './registry';
import { HealthCheckService, createHealthRouter } from './health/health-check';
import { MetricsCollector } from './metrics/metrics-collector';
import { initializeTracing, getTracingConfig } from '@parallax/telemetry';
import { createPatternsRouter, createAgentsRouter, createExecutionsRouter, createExecutionWebSocketHandler } from './api';
import { DatabaseService } from './db/database.service';
import { GrpcServer } from './grpc';
import path from 'path';
import { createServer as createHttpServer } from 'http';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

export async function createServer(): Promise<express.Application> {
  // Initialize tracing
  const tracingConfig = getTracingConfig('parallax-control-plane');
  const tracer = await initializeTracing(tracingConfig, logger);
  
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Initialize database
  const database = new DatabaseService(logger);
  await database.initialize();
  
  // Initialize services
  const etcdEndpoints = (process.env.PARALLAX_ETCD_ENDPOINTS || 'localhost:2379').split(',');
  const registry = new EtcdRegistry(etcdEndpoints, 'parallax', logger);
  
  const runtimeConfig: RuntimeConfig = {
    maxInstances: parseInt(process.env.PARALLAX_RUNTIME_MAX_INSTANCES || '10'),
    instanceTimeout: parseInt(process.env.PARALLAX_RUNTIME_TIMEOUT || '30000'),
    warmupInstances: parseInt(process.env.PARALLAX_RUNTIME_WARMUP || '2'),
    metricsEnabled: process.env.PARALLAX_METRICS_ENABLED === 'true'
  };
  const runtimeManager = new RuntimeManager(runtimeConfig, logger);
  
  const patternsDir = process.env.PARALLAX_PATTERNS_DIR || path.join(process.cwd(), 'patterns');
  
  // Use traced pattern engine if tracing is enabled
  const patternEngine: IPatternEngine = tracingConfig.exporterType !== 'none' 
    ? new TracedPatternEngine(
        runtimeManager,
        registry,
        patternsDir,
        logger,
        database
      )
    : new PatternEngine(
        runtimeManager,
        registry,
        patternsDir,
        logger,
        database
      );
  await patternEngine.initialize();
  
  // Initialize metrics
  const metrics = new MetricsCollector();
  
  // Health checks
  const healthService = new HealthCheckService(
    patternEngine as PatternEngine,
    runtimeManager,
    registry,
    logger
  );
  
  app.use(createHealthRouter(healthService, logger));
  
  // Metrics endpoint
  app.get('/metrics', metrics.metricsHandler());
  
  // API Routes
  const patternsRouter = createPatternsRouter(patternEngine as PatternEngine, metrics, logger);
  const agentsRouter = createAgentsRouter(registry, metrics, logger, database);
  const executionsRouter = createExecutionsRouter(patternEngine as PatternEngine, logger, database);
  
  app.use('/api/patterns', patternsRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/executions', executionsRouter);
  
  // Default route
  app.get('/', (_req, res) => {
    res.json({
      service: 'Parallax Control Plane',
      version: process.env.npm_package_version || '0.1.0',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        patterns: '/api/patterns',
        agents: '/api/agents',
        executions: '/api/executions'
      }
    });
  });
  
  const port = parseInt(process.env.PORT || '3000');
  
  // Store gRPC server instance for shutdown
  let grpcServerInstance: GrpcServer | null = null;
  
  // Graceful shutdown handler
  const shutdown = async () => {
    logger.info('Shutting down control plane...');
    if (grpcServerInstance) {
      await grpcServerInstance.stop();
    }
    await database.disconnect();
    await tracer.shutdown();
    process.exit(0);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  // Initialize gRPC server
  const grpcServer = new GrpcServer(patternEngine, registry, database, logger);
  grpcServerInstance = grpcServer;
  const grpcPort = parseInt(process.env.GRPC_PORT || '50051');
  
  const start = async () => {
    const server = createHttpServer(app);
    
    // Set up WebSocket handler for execution streaming
    const wsHandler = createExecutionWebSocketHandler(executionsRouter);
    
    // TODO: Add WebSocket server setup here when needed
    // This would typically involve using the 'ws' package to create a WebSocket server
    // that uses the wsHandler for incoming connections
    
    // Start gRPC server
    await grpcServer.start(grpcPort);
    logger.info(`gRPC server listening on port ${grpcPort}`);
    
    server.listen(port, () => {
      logger.info(`Control Plane HTTP listening on port ${port}`);
      logger.info(`Health check: http://localhost:${port}/health`);
      logger.info(`API: http://localhost:${port}/api`);
      logger.info(`gRPC: 0.0.0.0:${grpcPort}`);
      logger.info(`WebSocket: ws://localhost:${port}/api/executions/stream`);
      logger.info(`Tracing: ${tracingConfig.exporterType === 'none' ? 'Disabled' : 'Enabled'}`);
    });
    
    return { httpServer: server, grpcServer };
  };
  
  return Object.assign(app, { start });
}

// Start server if run directly
if (require.main === module) {
  createServer()
    .then(server => (server as any).start())
    .catch(error => {
      logger.error({ error }, 'Failed to start server');
      process.exit(1);
    });
}
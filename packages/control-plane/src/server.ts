/**
 * HTTP server for Parallax Control Plane
 */

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { PatternEngine } from './pattern-engine';
import { TracedPatternEngine } from './pattern-engine/pattern-engine-traced';
import { RuntimeManager } from './runtime-manager';
import { RuntimeConfig } from './runtime-manager/types';
import { EtcdRegistry } from './registry';
import { HealthCheckService, createHealthRouter } from './health/health-check';
import { MetricsCollector } from './metrics/metrics-collector';
import { initializeTracing, getTracingConfig } from '@parallax/telemetry';
import path from 'path';

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
  const patternEngine: PatternEngine | TracedPatternEngine = tracingConfig.exporterType !== 'none' 
    ? new TracedPatternEngine(
        runtimeManager,
        registry,
        patternsDir,
        logger
      )
    : new PatternEngine(
        runtimeManager,
        registry,
        patternsDir,
        logger
      );
  await patternEngine.initialize();
  
  // Initialize metrics
  const metrics = new MetricsCollector();
  
  // Health checks
  const healthService = new HealthCheckService(
    patternEngine,
    runtimeManager,
    registry,
    logger
  );
  
  app.use(createHealthRouter(healthService, logger));
  
  // Metrics endpoint
  app.get('/metrics', metrics.metricsHandler());
  
  // API Routes
  app.get('/api/patterns', (_req, res) => {
    const patterns = patternEngine.getPatterns();
    res.json({
      patterns: patterns.map(p => ({
        name: p.name,
        version: p.version,
        description: p.description,
        minAgents: p.minAgents
      }))
    });
  });
  
  app.post('/api/patterns/:name/execute', async (req, res) => {
    const { name } = req.params;
    const endTimer = metrics.recordPatternStart(name);
    
    try {
      const input = req.body;
      
      const result = await patternEngine.executePattern(name, input);
      
      // Record metrics
      endTimer();
      metrics.recordPatternResult(name, true, result.confidence);
      
      res.json(result);
    } catch (error) {
      endTimer();
      metrics.recordPatternResult(name, false);
      metrics.recordPatternError(name, error instanceof Error ? error.constructor.name : 'UnknownError');
      
      logger.error({ error }, 'Pattern execution failed');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Pattern execution failed'
      });
    }
  });
  
  app.get('/api/agents', async (_req, res) => {
    try {
      const agents = await registry.listServices('agent');
      
      // Update metrics
      metrics.updateActiveAgents('all', agents.length);
      
      res.json({ agents });
    } catch (error) {
      logger.error({ error }, 'Failed to list agents');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to list agents'
      });
    }
  });
  
  // Default route
  app.get('/', (_req, res) => {
    res.json({
      service: 'Parallax Control Plane',
      version: process.env.npm_package_version || '0.1.0',
      endpoints: {
        health: '/health',
        metrics: '/metrics',
        patterns: '/api/patterns',
        agents: '/api/agents'
      }
    });
  });
  
  const port = parseInt(process.env.PORT || '3000');
  
  // Graceful shutdown handler
  const shutdown = async () => {
    logger.info('Shutting down control plane...');
    await tracer.shutdown();
    process.exit(0);
  };
  
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
  
  const start = () => {
    app.listen(port, () => {
      logger.info(`Control Plane listening on port ${port}`);
      logger.info(`Health check: http://localhost:${port}/health`);
      logger.info(`API: http://localhost:${port}/api`);
      logger.info(`Tracing: ${tracingConfig.exporterType === 'none' ? 'Disabled' : 'Enabled'}`);
    });
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
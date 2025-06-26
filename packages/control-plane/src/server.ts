/**
 * HTTP server for Parallax Control Plane
 */

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { PatternEngine } from './pattern-engine';
import { RuntimeManager } from './runtime-manager';
import { EtcdRegistry } from './registry';
import { HealthCheckService, createHealthRouter } from './health/health-check';
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

export async function createServer() {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(express.json());
  
  // Initialize services
  const etcdEndpoints = (process.env.PARALLAX_ETCD_ENDPOINTS || 'localhost:2379').split(',');
  const registry = new EtcdRegistry(etcdEndpoints, logger);
  
  const runtimeManager = new RuntimeManager(logger);
  await runtimeManager.initialize();
  
  const patternsDir = process.env.PARALLAX_PATTERNS_DIR || path.join(process.cwd(), 'patterns');
  const patternEngine = new PatternEngine(
    runtimeManager,
    registry,
    patternsDir,
    logger
  );
  await patternEngine.initialize();
  
  // Health checks
  const healthService = new HealthCheckService(
    patternEngine,
    runtimeManager,
    registry,
    logger
  );
  
  app.use(createHealthRouter(healthService, logger));
  
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
    try {
      const { name } = req.params;
      const input = req.body;
      
      const result = await patternEngine.executePattern(name, input);
      res.json(result);
    } catch (error) {
      logger.error({ error }, 'Pattern execution failed');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Pattern execution failed'
      });
    }
  });
  
  app.get('/api/agents', async (_req, res) => {
    try {
      const agents = await registry.listServices('agent');
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
        patterns: '/api/patterns',
        agents: '/api/agents'
      }
    });
  });
  
  const port = parseInt(process.env.PORT || '3000');
  
  return {
    app,
    start: () => {
      app.listen(port, () => {
        logger.info(`Control Plane listening on port ${port}`);
        logger.info(`Health check: http://localhost:${port}/health`);
        logger.info(`API: http://localhost:${port}/api`);
      });
    }
  };
}

// Start server if run directly
if (require.main === module) {
  createServer()
    .then(server => server.start())
    .catch(error => {
      logger.error({ error }, 'Failed to start server');
      process.exit(1);
    });
}
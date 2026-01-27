/**
 * HTTP server for Parallax Control Plane
 */

import express from 'express';
import cors from 'cors';
import pino from 'pino';
import { PatternEngine } from './pattern-engine';
import { TracedPatternEngine } from './pattern-engine/pattern-engine-traced';
import { IPatternEngine } from './pattern-engine/interfaces';
import { DatabasePatternService } from './pattern-engine/database-pattern-service';
import { RuntimeManager } from './runtime-manager';
import { RuntimeConfig } from './runtime-manager/types';
import { EtcdRegistry } from './registry';
import { HealthCheckService, createHealthRouter } from './health/health-check';
import { MetricsCollector } from './metrics/metrics-collector';
import { initializeTracing, getTracingConfig } from '@parallax/telemetry';
import {
  createPatternsRouter,
  createAgentsRouter,
  createExecutionsRouter,
  createExecutionWebSocketHandler,
  createLicenseRouter,
  createSchedulesRouter,
  createTriggersRouter,
  createUsersRouter,
  createAuthRouter,
  createAuditRouter,
  createBackupRouter,
  createManagedAgentsRouter,
} from './api';
import { AgentRuntimeService } from './agent-runtime';
import { AuthService, requireAuth, optionalAuth } from './auth';
import { AuditService } from './audit';
import { LicenseEnforcer } from './licensing/license-enforcer';
import { DatabaseService } from './db/database.service';
import { GrpcServer } from './grpc';
import path from 'path';
import { createServer as createHttpServer } from 'http';
import { WebSocketServer } from 'ws';
import { URL } from 'url';
import { ExecutionEventBus } from './execution-events';

// High Availability imports
import {
  initializeHA,
  shutdownHA,
  HAServices,
} from './ha';

// Scheduler imports
import {
  SchedulerService,
  TriggerService,
  createSchedulerService,
  createTriggerService,
  EventTypes,
} from './scheduler';

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

  // Initialize license enforcer
  const licenseEnforcer = new LicenseEnforcer(logger);

  // Initialize auth service (for multi_user enterprise feature)
  let authService: AuthService | undefined;
  if (licenseEnforcer.hasFeature('multi_user')) {
    authService = new AuthService(database.getPrismaClient(), logger);
    logger.info('Authentication service initialized (Enterprise)');
  }

  // Initialize audit service (for audit_logging enterprise feature)
  let auditService: AuditService | undefined;
  if (licenseEnforcer.hasFeature('audit_logging')) {
    auditService = new AuditService(database.getPrismaClient(), logger);
    logger.info('Audit logging service initialized (Enterprise)');
  }

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
  const executionEvents = new ExecutionEventBus();

  // Initialize database pattern service (Enterprise feature)
  let databasePatterns: DatabasePatternService | undefined;
  if (licenseEnforcer.hasFeature('pattern_management')) {
    databasePatterns = new DatabasePatternService(database.patterns, logger);
    logger.info('Database pattern management enabled (Enterprise)');
  }

  // Use traced pattern engine if tracing is enabled
  const patternEngine: IPatternEngine = tracingConfig.exporterType !== 'none'
    ? new TracedPatternEngine(
        runtimeManager,
        registry,
        patternsDir,
        logger,
        database,
        executionEvents,
        databasePatterns
      )
    : new PatternEngine(
        runtimeManager,
        registry,
        patternsDir,
        logger,
        database,
        executionEvents,
        databasePatterns
      );
  await patternEngine.initialize();

  // Initialize metrics
  const metrics = new MetricsCollector();

  // Initialize High Availability services (Enterprise feature)
  let haServices: HAServices | null = null;
  const haEnabled = licenseEnforcer.hasFeature('high_availability') &&
                    process.env.PARALLAX_HA_ENABLED === 'true';

  if (haEnabled) {
    const redisUrl = process.env.PARALLAX_REDIS_URL || 'redis://localhost:6379';
    try {
      haServices = await initializeHA({
        enabled: true,
        etcdEndpoints,
        redisUrl,
        hostname: process.env.HOSTNAME || 'localhost',
        port: parseInt(process.env.PORT || '3000'),
      }, logger);
      logger.info('High Availability services initialized');
    } catch (error) {
      logger.error({ error }, 'Failed to initialize HA services - continuing without HA');
    }
  }

  // Initialize Scheduler service (Enterprise feature)
  let schedulerService: SchedulerService | null = null;
  let triggerService: TriggerService | null = null;

  if (licenseEnforcer.hasFeature('scheduled_patterns')) {
    const prisma = database.getPrismaClient();

    // Create scheduler service
    schedulerService = createSchedulerService(
      prisma,
      patternEngine,
      logger,
      {
        leaderElection: haServices?.leaderElection,
        lock: haServices?.lock,
        pollFrequencyMs: parseInt(process.env.PARALLAX_SCHEDULER_POLL_MS || '1000'),
      }
    );

    // Create trigger service
    triggerService = createTriggerService(prisma, patternEngine, logger);

    // Start services
    await schedulerService.start();
    await triggerService.initialize();

    // Wire execution events to trigger service
    executionEvents.on('execution:completed', (execution) => {
      triggerService?.emitEvent(EventTypes.EXECUTION_COMPLETED, execution);
    });

    executionEvents.on('execution:failed', (execution) => {
      triggerService?.emitEvent(EventTypes.EXECUTION_FAILED, execution);
    });

    logger.info('Scheduler and Trigger services initialized');
  }

  // Initialize Agent Runtime Service (for managed agents)
  let agentRuntimeService: AgentRuntimeService | null = null;
  const localRuntimeUrl = process.env.PARALLAX_LOCAL_RUNTIME_URL;
  const dockerRuntimeUrl = process.env.PARALLAX_DOCKER_RUNTIME_URL;
  const k8sRuntimeUrl = process.env.PARALLAX_K8S_RUNTIME_URL;

  if (localRuntimeUrl || dockerRuntimeUrl || k8sRuntimeUrl) {
    agentRuntimeService = new AgentRuntimeService(logger);

    // Register local runtime if configured
    if (localRuntimeUrl) {
      try {
        await agentRuntimeService.registerRuntime(
          'local',
          'local',
          { baseUrl: localRuntimeUrl },
          10 // High priority for local dev
        );
        logger.info({ url: localRuntimeUrl }, 'Local runtime registered');
      } catch (error) {
        logger.warn({ error, url: localRuntimeUrl }, 'Failed to connect to local runtime');
      }
    }

    // Register Docker runtime if configured
    if (dockerRuntimeUrl) {
      try {
        await agentRuntimeService.registerRuntime(
          'docker',
          'docker',
          { baseUrl: dockerRuntimeUrl },
          20 // Lower priority than local
        );
        logger.info({ url: dockerRuntimeUrl }, 'Docker runtime registered');
      } catch (error) {
        logger.warn({ error, url: dockerRuntimeUrl }, 'Failed to connect to Docker runtime');
      }
    }

    // Register Kubernetes runtime if configured
    if (k8sRuntimeUrl) {
      try {
        await agentRuntimeService.registerRuntime(
          'kubernetes',
          'kubernetes',
          { baseUrl: k8sRuntimeUrl },
          30 // Lower priority than Docker (used for production)
        );
        logger.info({ url: k8sRuntimeUrl }, 'Kubernetes runtime registered');
      } catch (error) {
        logger.warn({ error, url: k8sRuntimeUrl }, 'Failed to connect to Kubernetes runtime');
      }
    }

    // Forward runtime events to execution events
    agentRuntimeService.on('agent_ready', (data) => {
      executionEvents.emitEvent({
        executionId: 'runtime',
        type: 'managed_agent_ready',
        data,
        timestamp: new Date(),
      });
    });

    agentRuntimeService.on('agent_stopped', (data) => {
      executionEvents.emitEvent({
        executionId: 'runtime',
        type: 'managed_agent_stopped',
        data,
        timestamp: new Date(),
      });
    });

    agentRuntimeService.on('message', (data) => {
      executionEvents.emitEvent({
        executionId: 'runtime',
        type: 'managed_agent_message',
        data,
        timestamp: new Date(),
      });
    });
  }

  // Health checks
  const healthService = new HealthCheckService(
    patternEngine as PatternEngine,
    runtimeManager,
    registry,
    logger
  );

  app.use(createHealthRouter(healthService, logger));

  // Cluster health endpoint (if HA enabled)
  if (haServices) {
    app.get('/health/cluster', async (_req, res) => {
      try {
        const clusterHealth = await haServices!.clusterHealth.getClusterHealth();
        res.json(clusterHealth);
      } catch (error) {
        res.status(500).json({ error: 'Failed to get cluster health' });
      }
    });
  }

  // Metrics endpoint
  app.get('/metrics', metrics.metricsHandler());

  // API Routes
  const patternsRouter = createPatternsRouter(patternEngine as PatternEngine, metrics, logger, licenseEnforcer);
  const agentsRouter = createAgentsRouter(registry, metrics, logger, database);
  const executionsRouter = createExecutionsRouter(
    patternEngine as PatternEngine,
    logger,
    database,
    executionEvents
  );

  // License router
  const licenseRouter = createLicenseRouter(licenseEnforcer, logger);
  app.use('/api/license', licenseRouter);

  app.use('/api/patterns', patternsRouter);
  app.use('/api/agents', agentsRouter);
  app.use('/api/executions', executionsRouter);

  // Schedules and Triggers routers (Enterprise features)
  if (schedulerService) {
    const schedulesRouter = createSchedulesRouter(schedulerService, licenseEnforcer, logger);
    app.use('/api/schedules', schedulesRouter);
  }

  if (triggerService) {
    const baseUrl = process.env.PARALLAX_BASE_URL || `http://localhost:${process.env.PORT || '3000'}`;
    const triggersRouter = createTriggersRouter(triggerService, licenseEnforcer, logger, baseUrl);
    app.use('/api/triggers', triggersRouter);
  }

  // Users router (Enterprise feature)
  if (licenseEnforcer.hasFeature('multi_user')) {
    const prisma = database.getPrismaClient();
    const usersRouter = createUsersRouter(prisma, licenseEnforcer, logger);
    app.use('/api/users', usersRouter);
  }

  // Auth router (Enterprise feature)
  if (authService) {
    const authRouter = createAuthRouter(authService, licenseEnforcer, logger);
    app.use('/api/auth', authRouter);
  }

  // Audit router (Enterprise feature)
  if (auditService && authService) {
    const auditRouter = createAuditRouter(auditService, authService, licenseEnforcer, logger);
    app.use('/api/audit', auditRouter);
  }

  // Backup router (Enterprise feature)
  if (authService) {
    const backupRouter = createBackupRouter(
      database.getPrismaClient(),
      authService,
      auditService,
      licenseEnforcer,
      logger
    );
    app.use('/api/backup', backupRouter);
  }

  // Managed agents router (for spawning CLI agents)
  if (agentRuntimeService) {
    const managedAgentsRouter = createManagedAgentsRouter(agentRuntimeService, logger);
    app.use('/api/managed-agents', managedAgentsRouter);
    logger.info('Managed agents API enabled');
  }

  // Default route
  app.get('/', (_req, res) => {
    const endpoints: Record<string, string> = {
      health: '/health',
      metrics: '/metrics',
      license: '/api/license',
      patterns: '/api/patterns',
      agents: '/api/agents',
      executions: '/api/executions',
    };

    // Add enterprise endpoints if available
    if (schedulerService) {
      endpoints.schedules = '/api/schedules';
    }
    if (triggerService) {
      endpoints.triggers = '/api/triggers';
    }
    if (licenseEnforcer.hasFeature('multi_user')) {
      endpoints.users = '/api/users';
      endpoints.auth = '/api/auth';
      endpoints.backup = '/api/backup';
    }
    if (licenseEnforcer.hasFeature('audit_logging')) {
      endpoints.audit = '/api/audit';
    }
    if (haServices) {
      endpoints.clusterHealth = '/health/cluster';
    }
    if (agentRuntimeService) {
      endpoints.managedAgents = '/api/managed-agents';
    }

    res.json({
      service: 'Parallax Control Plane',
      version: process.env.npm_package_version || '0.1.0',
      license: licenseEnforcer.getLicenseType(),
      ha: haEnabled ? 'enabled' : 'disabled',
      endpoints,
    });
  });

  const port = parseInt(process.env.PORT || '3000');

  // Store gRPC server instance for shutdown
  let grpcServerInstance: GrpcServer | null = null;

  // Graceful shutdown handler
  const shutdown = async () => {
    logger.info('Shutting down control plane...');

    // Stop scheduler
    if (schedulerService) {
      await schedulerService.stop();
    }

    // Stop agent runtime service
    if (agentRuntimeService) {
      await agentRuntimeService.shutdown();
    }

    // Stop HA services
    if (haServices) {
      await shutdownHA(haServices);
    }

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
  const grpcServer = new GrpcServer(patternEngine, registry, database, logger, executionEvents);
  grpcServerInstance = grpcServer;
  const grpcPort = parseInt(process.env.GRPC_PORT || '50051');

  const start = async () => {
    const server = createHttpServer(app);

    // Set up WebSocket handler for execution streaming
    const wsHandler = createExecutionWebSocketHandler(executionsRouter);
    const wsServer = new WebSocketServer({ noServer: true });

    server.on('upgrade', (req, socket, head) => {
      if (!req.url) {
        socket.destroy();
        return;
      }

      const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
      let executionId: string | null = null;

      const pathMatch = url.pathname.match(/^\/api\/executions\/([^/]+)\/stream$/);
      if (pathMatch) {
        executionId = pathMatch[1];
      } else if (url.pathname === '/api/executions/stream') {
        executionId = url.searchParams.get('executionId');
      }

      if (!executionId) {
        socket.destroy();
        return;
      }

      wsServer.handleUpgrade(req, socket, head, (ws) => {
        (req as any).params = { id: executionId };
        wsHandler(ws, req);
      });
    });

    // Start gRPC server
    try {
      await grpcServer.start(grpcPort);
      logger.info(`gRPC server listening on port ${grpcPort}`);
    } catch (grpcError: any) {
      logger.error({ error: grpcError.message || grpcError }, `Failed to start gRPC server on port ${grpcPort}`);
      // Continue without gRPC for now
      logger.warn('Continuing without gRPC server - HTTP API will still work');
    }

    server.listen(port, () => {
      logger.info(`Control Plane HTTP listening on port ${port}`);
      logger.info(`Health check: http://localhost:${port}/health`);
      logger.info(`API: http://localhost:${port}/api`);
      logger.info(`gRPC: 0.0.0.0:${grpcPort}`);
      logger.info(`WebSocket: ws://localhost:${port}/api/executions/:id/stream`);
      logger.info(`Tracing: ${tracingConfig.exporterType === 'none' ? 'Disabled' : 'Enabled'}`);
      logger.info(`License: ${licenseEnforcer.getLicenseType()}`);
      if (haEnabled) {
        logger.info(`HA: Enabled (Leader: ${haServices?.leaderElection.isLeader() ? 'Yes' : 'No'})`);
      }
      if (schedulerService) {
        logger.info(`Scheduler: Enabled`);
      }
    });

    return { httpServer: server, grpcServer, haServices, schedulerService, triggerService };
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

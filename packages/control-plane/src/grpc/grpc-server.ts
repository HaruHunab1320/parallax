/**
 * gRPC server implementation for Parallax Control Plane
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { IPatternEngine } from '../pattern-engine/interfaces';
import { DatabaseService } from '../db/database.service';
import { Logger } from 'pino';
import fs from 'fs';

// Use interface from registry module
import type { IAgentRegistry } from '../registry';

// Import service implementations
import { RegistryServiceImpl } from './services/registry-service';
import { PatternServiceImpl } from './services/pattern-service';
import { CoordinatorServiceImpl } from './services/coordinator-service';
import { ExecutionServiceImpl } from './services/execution-service';
import { ExecutionEventBus } from '../execution-events';

// Proto paths (using generated files from sdk-typescript)
const PROTO_DIR = path.join(__dirname, '../../../../proto');

export class GrpcServer {
  private server: grpc.Server;
  private registryService: RegistryServiceImpl;
  private patternService: PatternServiceImpl;
  private coordinatorService: CoordinatorServiceImpl;
  private executionService: ExecutionServiceImpl;

  constructor(
    private patternEngine: IPatternEngine,
    private agentRegistry: IAgentRegistry,
    private database: DatabaseService,
    private logger: Logger,
    private executionEvents?: ExecutionEventBus
  ) {
    this.server = new grpc.Server();
    
    // Initialize service implementations
    this.registryService = new RegistryServiceImpl(agentRegistry, logger);
    this.patternService = new PatternServiceImpl(patternEngine, database, logger);
    this.coordinatorService = new CoordinatorServiceImpl(patternEngine, agentRegistry, logger);
    this.executionService = new ExecutionServiceImpl(
      patternEngine,
      database,
      logger,
      executionEvents
    );
  }

  private setupServices() {
    // Load proto definitions
    const registryProto = this.loadProto('registry.proto');
    const patternsProto = this.loadProto('patterns.proto');
    const coordinatorProto = this.loadProto('coordinator.proto');
    const executionsProto = this.loadProto('executions.proto');

    // Add Registry Service
    this.server.addService(
      registryProto.parallax.registry.Registry.service,
      this.registryService.getImplementation()
    );

    // Add Pattern Service
    this.server.addService(
      patternsProto.parallax.patterns.PatternService.service,
      this.patternService.getImplementation()
    );

    // Add Coordinator Service
    this.server.addService(
      coordinatorProto.parallax.coordinator.Coordinator.service,
      this.coordinatorService.getImplementation()
    );

    // Add Execution Service
    this.server.addService(
      executionsProto.parallax.executions.ExecutionService.service,
      this.executionService.getImplementation()
    );

    this.logger.info('gRPC services registered');
  }

  private loadProto(filename: string): any {
    const protoPath = path.join(PROTO_DIR, filename);
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR]
    });
    
    return grpc.loadPackageDefinition(packageDefinition);
  }

  async start(port: number = 50051): Promise<void> {
    // Setup services before binding
    this.setupServices();
    
    return new Promise((resolve, reject) => {
      const bindAddr = `0.0.0.0:${port}`;

      const credentials = this.buildServerCredentials();
      this.server.bindAsync(
        bindAddr,
        credentials,
        (error, actualPort) => {
          if (error) {
            this.logger.error({ error: error.message || error }, 'Failed to bind gRPC server');
            reject(error);
            return;
          }
          
          this.logger.info({ port: actualPort }, 'gRPC server started');
          resolve();
        }
      );
    });
  }

  private buildServerCredentials(): grpc.ServerCredentials {
    const enabled = process.env.PARALLAX_GRPC_TLS_ENABLED === 'true';
    if (!enabled) {
      return grpc.ServerCredentials.createInsecure();
    }

    const caPath = process.env.PARALLAX_GRPC_TLS_CA;
    const certPath = process.env.PARALLAX_GRPC_TLS_CERT;
    const keyPath = process.env.PARALLAX_GRPC_TLS_KEY;
    const requireClientCert = process.env.PARALLAX_GRPC_TLS_REQUIRE_CLIENT_CERT === 'true';

    try {
      if (!caPath || !certPath || !keyPath) {
        this.logger.warn('gRPC TLS env vars missing; falling back to insecure credentials');
        return grpc.ServerCredentials.createInsecure();
      }

      const ca = fs.readFileSync(caPath);
      const cert = fs.readFileSync(certPath);
      const key = fs.readFileSync(keyPath);

      return grpc.ServerCredentials.createSsl(
        ca,
        [{ private_key: key, cert_chain: cert }],
        requireClientCert
      );
    } catch (error) {
      this.logger.warn({ error }, 'Failed to load gRPC TLS credentials; falling back to insecure');
      return grpc.ServerCredentials.createInsecure();
    }
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        this.logger.info('gRPC server stopped gracefully');
        resolve();
      });
    });
  }
}

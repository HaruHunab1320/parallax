/**
 * gRPC server implementation for Parallax Control Plane
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { IPatternEngine } from '../pattern-engine/interfaces';
import { DatabaseService } from '../db/database.service';
import { Logger } from 'pino';

// Use interface from registry module
import type { IAgentRegistry } from '../registry';

// Import service implementations
import { RegistryServiceImpl } from './services/registry-service';
import { PatternServiceImpl } from './services/pattern-service';
import { CoordinatorServiceImpl } from './services/coordinator-service';

// Proto paths (using generated files from sdk-typescript)
const PROTO_DIR = path.join(__dirname, '../../../../proto');

export class GrpcServer {
  private server: grpc.Server;
  private registryService: RegistryServiceImpl;
  private patternService: PatternServiceImpl;
  private coordinatorService: CoordinatorServiceImpl;

  constructor(
    private patternEngine: IPatternEngine,
    private agentRegistry: IAgentRegistry,
    private database: DatabaseService,
    private logger: Logger
  ) {
    this.server = new grpc.Server();
    
    // Initialize service implementations
    this.registryService = new RegistryServiceImpl(agentRegistry, logger);
    this.patternService = new PatternServiceImpl(patternEngine, database, logger);
    this.coordinatorService = new CoordinatorServiceImpl(patternEngine, agentRegistry, logger);
  }

  private setupServices() {
    // Load proto definitions
    const registryProto = this.loadProto('registry.proto');
    const patternsProto = this.loadProto('patterns.proto');
    const coordinatorProto = this.loadProto('coordinator.proto');

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
      
      this.server.bindAsync(
        bindAddr,
        grpc.ServerCredentials.createInsecure(), // Insecure for local/dev; configure TLS in production.
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

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        this.logger.info('gRPC server stopped gracefully');
        resolve();
      });
    });
  }
}

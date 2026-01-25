import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';
import { getPrismaClient, disconnectPrisma } from './prisma-client';
import { setupTimescaleDB, setupTimescaleDBJobs } from './timescaledb-setup';
import {
  PatternRepository,
  AgentRepository,
  ExecutionRepository,
} from './repositories';

export class DatabaseService {
  private prisma: PrismaClient;
  private logger: Logger;
  
  public patterns: PatternRepository;
  public agents: AgentRepository;
  public executions: ExecutionRepository;

  constructor(logger: Logger) {
    this.logger = logger.child({ component: 'DatabaseService' });
    this.prisma = getPrismaClient(this.logger);
    
    // Initialize repositories
    this.patterns = new PatternRepository(this.prisma, this.logger);
    this.agents = new AgentRepository(this.prisma, this.logger);
    this.executions = new ExecutionRepository(this.prisma, this.logger);
  }

  async initialize(): Promise<void> {
    try {
      // Test connection
      await this.prisma.$connect();
      this.logger.info('Database connected successfully');
      
      // Set up TimescaleDB features
      await setupTimescaleDB(this.prisma, this.logger);
      await setupTimescaleDBJobs(this.prisma, this.logger);
      
      // Start background tasks
      this.startBackgroundTasks();
      
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize database');
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    await disconnectPrisma();
    this.logger.info('Database disconnected');
  }

  private startBackgroundTasks(): void {
    // Mark inactive agents every minute
    setInterval(async () => {
      try {
        const threshold = new Date(Date.now() - 2 * 60 * 1000); // 2 minutes
        const count = await this.agents.markInactive(threshold);
        if (count > 0) {
          this.logger.info({ count }, 'Marked agents as inactive');
        }
      } catch (error) {
        this.logger.error({ error }, 'Failed to mark inactive agents');
      }
    }, 60 * 1000); // Every minute

    // Clean up old executions daily
    setInterval(async () => {
      try {
        const olderThan = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days
        const count = await this.executions.cleanup(olderThan);
        if (count > 0) {
          this.logger.info({ count }, 'Cleaned up old executions');
        }
      } catch (error) {
        this.logger.error({ error }, 'Failed to clean up executions');
      }
    }, 24 * 60 * 60 * 1000); // Daily
  }

  // Transaction support
  async transaction<T>(
    fn: (prisma: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>
  ): Promise<T> {
    return this.prisma.$transaction(fn);
  }

  // Direct access to Prisma for complex queries
  get client(): PrismaClient {
    return this.prisma;
  }

  // Get Prisma client (alias for compatibility)
  getPrismaClient(): PrismaClient {
    return this.prisma;
  }
}
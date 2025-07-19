import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';

export abstract class BaseRepository {
  protected prisma: PrismaClient;
  protected logger: Logger;

  constructor(prisma: PrismaClient, logger: Logger) {
    this.prisma = prisma;
    this.logger = logger;
  }

  /**
   * Wraps database operations with error handling and logging
   */
  protected async executeQuery<T>(
    operation: () => Promise<T>,
    context: string
  ): Promise<T> {
    try {
      const start = Date.now();
      const result = await operation();
      const duration = Date.now() - start;
      
      this.logger.debug({
        context,
        duration,
      }, 'Database query completed');
      
      return result;
    } catch (error) {
      this.logger.error({
        context,
        error,
      }, 'Database query failed');
      
      throw error;
    }
  }
}
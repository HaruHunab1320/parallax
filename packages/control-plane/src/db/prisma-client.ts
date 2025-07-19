import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';

// Singleton instance
let prisma: PrismaClient | undefined;

export function getPrismaClient(logger?: Logger): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: ['error', 'warn'],
    });

    if (logger) {
      // Log database events
      prisma.$on('query' as never, (e: any) => {
        logger.debug({
          query: e.query,
          params: e.params,
          duration: e.duration,
        }, 'Database query');
      });
    }

    // Handle connection errors
    prisma.$connect()
      .then(() => {
        logger?.info('Database connected successfully');
      })
      .catch((error) => {
        logger?.error({ error }, 'Failed to connect to database');
        throw error;
      });
  }

  return prisma;
}

// Graceful shutdown
export async function disconnectPrisma() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
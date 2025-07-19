import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';

/**
 * Sets up TimescaleDB features after the initial Prisma migration.
 * This is run separately because TimescaleDB hypertables have specific
 * requirements that don't play well with Prisma's migration system.
 */
export async function setupTimescaleDB(prisma: PrismaClient, logger: Logger) {
  try {
    logger.info('Setting up TimescaleDB features...');
    
    // Enable TimescaleDB extension
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`;
    
    // For tables with primary keys that don't include the time column,
    // we'll use TimescaleDB's compression features instead of hypertables
    
    // Create indexes optimized for time-series queries
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_execution_time_desc 
      ON "Execution" (time DESC)`;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_execution_event_time_desc 
      ON "ExecutionEvent" (time DESC)`;
    
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_confidence_metric_time_desc 
      ON "ConfidenceMetric" (time DESC)`;
    
    // Create a view for recent executions (last 24 hours)
    await prisma.$executeRaw`
      CREATE OR REPLACE VIEW recent_executions AS
      SELECT * FROM "Execution"
      WHERE time > NOW() - INTERVAL '24 hours'
      ORDER BY time DESC`;
    
    // Create a view for execution statistics
    await prisma.$executeRaw`
      CREATE OR REPLACE VIEW execution_stats AS
      SELECT 
        date_trunc('hour', time) as hour,
        "patternId",
        COUNT(*) as execution_count,
        AVG("durationMs") as avg_duration_ms,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as successful_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count,
        AVG(confidence) as avg_confidence
      FROM "Execution"
      GROUP BY hour, "patternId"`;
    
    // Create a materialized view for pattern performance
    await prisma.$executeRaw`
      CREATE MATERIALIZED VIEW IF NOT EXISTS pattern_performance AS
      SELECT 
        p.id as pattern_id,
        p.name as pattern_name,
        COUNT(e.id) as total_executions,
        AVG(e."durationMs") as avg_duration_ms,
        COUNT(CASE WHEN e.status = 'completed' THEN 1 END) as successful_executions,
        COUNT(CASE WHEN e.status = 'failed' THEN 1 END) as failed_executions,
        AVG(e.confidence) as avg_confidence,
        MAX(e.time) as last_execution_time
      FROM "Pattern" p
      LEFT JOIN "Execution" e ON p.id = e."patternId"
      GROUP BY p.id, p.name`;
    
    // Create index on materialized view
    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pattern_performance_id 
      ON pattern_performance (pattern_id)`;
    
    // Create a function to refresh materialized views
    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION refresh_pattern_performance()
      RETURNS void AS $$
      BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY pattern_performance;
      END;
      $$ LANGUAGE plpgsql`;
    
    logger.info('TimescaleDB setup completed successfully');
  } catch (error) {
    logger.error({ error }, 'Failed to setup TimescaleDB features');
    // Don't throw - allow the app to run without TimescaleDB features
  }
}

/**
 * Creates a job to periodically refresh materialized views
 */
export async function setupTimescaleDBJobs(prisma: PrismaClient, logger: Logger) {
  try {
    // Check if pg_cron is available (requires additional setup)
    const result = await prisma.$queryRaw`
      SELECT * FROM pg_extension WHERE extname = 'pg_cron'`;
    
    if (Array.isArray(result) && result.length > 0) {
      // Schedule job to refresh pattern performance every hour
      await prisma.$executeRaw`
        SELECT cron.schedule(
          'refresh-pattern-performance',
          '0 * * * *',
          'SELECT refresh_pattern_performance()'
        )`;
      
      logger.info('TimescaleDB jobs scheduled successfully');
    } else {
      logger.info('pg_cron not available, skipping job scheduling');
    }
  } catch (error) {
    logger.debug({ error }, 'pg_cron not available or job scheduling failed');
  }
}
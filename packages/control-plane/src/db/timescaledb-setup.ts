import type { PrismaClient } from '@prisma/client';
import type { Logger } from 'pino';

/**
 * Sets up database features for time-series data.
 * Creates indexes, views, and functions that work on standard PostgreSQL.
 * Optionally enables TimescaleDB if available.
 */
export async function setupTimescaleDB(prisma: PrismaClient, logger: Logger) {
  // Try to enable TimescaleDB extension (optional — not available on Cloud SQL)
  try {
    await prisma.$executeRaw`CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE`;
    logger.info('TimescaleDB extension enabled');
  } catch {
    logger.info(
      'TimescaleDB extension not available — using standard PostgreSQL (this is fine for Cloud SQL)'
    );
  }

  // Create indexes optimized for time-series queries (standard PostgreSQL)
  try {
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_execution_time_desc
      ON "Execution" (time DESC)`;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_execution_event_time_desc
      ON "ExecutionEvent" (time DESC)`;

    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_confidence_metric_time_desc
      ON "ConfidenceMetric" (time DESC)`;

    logger.info('Time-series indexes created');
  } catch (error) {
    logger.warn(
      { error },
      'Failed to create time-series indexes (tables may not exist yet)'
    );
  }

  // Create views for analytics (standard PostgreSQL)
  try {
    await prisma.$executeRaw`
      CREATE OR REPLACE VIEW recent_executions AS
      SELECT * FROM "Execution"
      WHERE time > NOW() - INTERVAL '24 hours'
      ORDER BY time DESC`;

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

    logger.info('Analytics views created');
  } catch (error) {
    logger.warn({ error }, 'Failed to create analytics views');
  }

  // Create materialized view for pattern performance (standard PostgreSQL)
  try {
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

    await prisma.$executeRaw`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_pattern_performance_id
      ON pattern_performance (pattern_id)`;

    await prisma.$executeRaw`
      CREATE OR REPLACE FUNCTION refresh_pattern_performance()
      RETURNS void AS $$
      BEGIN
        REFRESH MATERIALIZED VIEW CONCURRENTLY pattern_performance;
      END;
      $$ LANGUAGE plpgsql`;

    logger.info('Pattern performance materialized view created');
  } catch (error) {
    logger.warn({ error }, 'Failed to create materialized views');
  }

  logger.info('Database time-series setup completed');
}

/**
 * Creates a job to periodically refresh materialized views
 */
export async function setupTimescaleDBJobs(
  prisma: PrismaClient,
  logger: Logger
) {
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

      logger.info('pg_cron jobs scheduled successfully');
    } else {
      logger.info('pg_cron not available, skipping job scheduling');
    }
  } catch {
    logger.debug('pg_cron not available or job scheduling failed');
  }
}

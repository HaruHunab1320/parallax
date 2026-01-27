/**
 * Backup & Restore API Router
 *
 * REST API endpoints for database backup and restore operations.
 */

import { Router } from 'express';
import { PrismaClient } from '@prisma/client';
import { Logger } from 'pino';
import { LicenseEnforcer } from '../licensing/license-enforcer';
import { AuthService } from '../auth/auth-service';
import { AuditService } from '../audit/audit-service';
import { createAuthMiddleware } from '../auth/auth-middleware';
import { requireAdmin } from '../auth/rbac';

export interface BackupData {
  version: string;
  timestamp: string;
  tables: {
    patterns: any[];
    agents: any[];
    users: any[];
    schedules: any[];
    triggers: any[];
    licenses: any[];
  };
  metadata: {
    totalRecords: number;
    exportedBy?: string;
  };
}

export function createBackupRouter(
  prisma: PrismaClient,
  authService: AuthService,
  auditService: AuditService | undefined,
  licenseEnforcer: LicenseEnforcer,
  logger: Logger
): Router {
  const router = Router();
  const log = logger.child({ component: 'BackupAPI' });

  // Middleware to check enterprise license
  const requireBackupFeature = (_req: any, res: any, next: any) => {
    try {
      licenseEnforcer.requireFeature('backup_restore', 'Backup & Restore');
      next();
    } catch (error: any) {
      log.warn('Backup/restore feature not available');
      res.status(403).json({
        error: error.message,
        code: 'FEATURE_NOT_AVAILABLE',
        upgradeUrl: error.upgradeUrl || 'https://parallax.ai/enterprise',
      });
    }
  };

  // Apply license check and auth to all routes
  router.use(requireBackupFeature);
  router.use(createAuthMiddleware(authService, logger));
  router.use(requireAdmin(logger)); // Only admins can backup/restore

  /**
   * GET /backup
   * Export database backup as JSON
   */
  router.get('/', async (req: any, res: any) => {
    try {
      log.info({ userId: req.user?.sub }, 'Starting database backup');

      // Fetch all data (excluding sensitive fields)
      const [patterns, agents, users, schedules, triggers, licenses] = await Promise.all([
        prisma.pattern.findMany({
          select: {
            id: true,
            name: true,
            version: true,
            description: true,
            script: true,
            metadata: true,
            input: true,
            minAgents: true,
            maxAgents: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.agent.findMany({
          select: {
            id: true,
            name: true,
            endpoint: true,
            capabilities: true,
            status: true,
            expertise: true,
            metadata: true,
            lastSeen: true,
            createdAt: true,
            updatedAt: true,
          },
        }),
        prisma.user.findMany({
          select: {
            id: true,
            email: true,
            name: true,
            role: true,
            status: true,
            ssoProvider: true,
            ssoSubject: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            // Exclude passwordHash for security
          },
        }),
        prisma.schedule.findMany(),
        prisma.trigger.findMany(),
        prisma.license.findMany({
          select: {
            id: true,
            type: true,
            validFrom: true,
            validUntil: true,
            features: true,
            metadata: true,
            createdAt: true,
            updatedAt: true,
            // Exclude key for security
          },
        }),
      ]);

      const backup: BackupData = {
        version: '1.0',
        timestamp: new Date().toISOString(),
        tables: {
          patterns,
          agents,
          users,
          schedules,
          triggers,
          licenses,
        },
        metadata: {
          totalRecords:
            patterns.length +
            agents.length +
            users.length +
            schedules.length +
            triggers.length +
            licenses.length,
          exportedBy: req.user?.email,
        },
      };

      // Log the backup action
      if (auditService) {
        await auditService.logFromRequest(req, 'create', 'backup', undefined, 'success', {
          totalRecords: backup.metadata.totalRecords,
          tables: Object.keys(backup.tables),
        });
      }

      log.info(
        { userId: req.user?.sub, totalRecords: backup.metadata.totalRecords },
        'Database backup completed'
      );

      // Set headers for file download
      const filename = `parallax-backup-${new Date().toISOString().split('T')[0]}.json`;
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

      res.json(backup);
    } catch (error) {
      log.error({ error }, 'Failed to create backup');

      if (auditService) {
        await auditService.logFromRequest(req, 'create', 'backup', undefined, 'failure', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      res.status(500).json({
        error: 'Failed to create backup',
        code: 'BACKUP_ERROR',
      });
    }
  });

  /**
   * GET /backup/info
   * Get backup information without downloading
   */
  router.get('/info', async (req: any, res: any) => {
    try {
      const [
        patternCount,
        agentCount,
        userCount,
        scheduleCount,
        triggerCount,
        executionCount,
      ] = await Promise.all([
        prisma.pattern.count(),
        prisma.agent.count(),
        prisma.user.count(),
        prisma.schedule.count(),
        prisma.trigger.count(),
        prisma.execution.count(),
      ]);

      res.json({
        tables: {
          patterns: patternCount,
          agents: agentCount,
          users: userCount,
          schedules: scheduleCount,
          triggers: triggerCount,
          executions: executionCount,
        },
        totalRecords:
          patternCount + agentCount + userCount + scheduleCount + triggerCount,
        executionsExcluded: true,
        executionCount,
        note: 'Executions are not included in backups due to size. Use time-series export for execution data.',
      });
    } catch (error) {
      log.error({ error }, 'Failed to get backup info');
      res.status(500).json({
        error: 'Failed to get backup info',
        code: 'BACKUP_INFO_ERROR',
      });
    }
  });

  /**
   * POST /backup/restore
   * Restore database from backup JSON
   */
  router.post('/restore', async (req: any, res: any) => {
    try {
      const backup: BackupData = req.body;

      // Validate backup format
      if (!backup.version || !backup.tables) {
        res.status(400).json({
          error: 'Invalid backup format',
          code: 'INVALID_BACKUP',
        });
        return;
      }

      if (backup.version !== '1.0') {
        res.status(400).json({
          error: `Unsupported backup version: ${backup.version}`,
          code: 'UNSUPPORTED_VERSION',
        });
        return;
      }

      log.info(
        { userId: req.user?.sub, backupTimestamp: backup.timestamp },
        'Starting database restore'
      );

      const mode = req.query.mode || 'merge'; // 'merge' or 'replace'
      const results: Record<string, { created: number; updated: number; skipped: number }> = {};

      // Restore in transaction
      await prisma.$transaction(async (tx) => {
        // Restore patterns
        if (backup.tables.patterns?.length) {
          results.patterns = { created: 0, updated: 0, skipped: 0 };
          for (const pattern of backup.tables.patterns) {
            try {
              if (mode === 'replace') {
                await tx.pattern.upsert({
                  where: { name: pattern.name },
                  create: pattern,
                  update: pattern,
                });
                results.patterns.updated++;
              } else {
                // Merge mode: only create if doesn't exist
                const existing = await tx.pattern.findUnique({
                  where: { name: pattern.name },
                });
                if (!existing) {
                  await tx.pattern.create({ data: pattern });
                  results.patterns.created++;
                } else {
                  results.patterns.skipped++;
                }
              }
            } catch (e) {
              log.warn({ pattern: pattern.name, error: e }, 'Failed to restore pattern');
              results.patterns.skipped++;
            }
          }
        }

        // Restore agents
        if (backup.tables.agents?.length) {
          results.agents = { created: 0, updated: 0, skipped: 0 };
          for (const agent of backup.tables.agents) {
            try {
              if (mode === 'replace') {
                await tx.agent.upsert({
                  where: { id: agent.id },
                  create: agent,
                  update: agent,
                });
                results.agents.updated++;
              } else {
                const existing = await tx.agent.findUnique({
                  where: { id: agent.id },
                });
                if (!existing) {
                  await tx.agent.create({ data: agent });
                  results.agents.created++;
                } else {
                  results.agents.skipped++;
                }
              }
            } catch (e) {
              log.warn({ agentId: agent.id, error: e }, 'Failed to restore agent');
              results.agents.skipped++;
            }
          }
        }

        // Restore users (without passwords - they'll need to reset)
        if (backup.tables.users?.length) {
          results.users = { created: 0, updated: 0, skipped: 0 };
          for (const user of backup.tables.users) {
            try {
              if (mode === 'replace') {
                await tx.user.upsert({
                  where: { email: user.email },
                  create: { ...user, status: 'pending' }, // Force password reset
                  update: user,
                });
                results.users.updated++;
              } else {
                const existing = await tx.user.findUnique({
                  where: { email: user.email },
                });
                if (!existing) {
                  await tx.user.create({ data: { ...user, status: 'pending' } });
                  results.users.created++;
                } else {
                  results.users.skipped++;
                }
              }
            } catch (e) {
              log.warn({ userEmail: user.email, error: e }, 'Failed to restore user');
              results.users.skipped++;
            }
          }
        }

        // Restore schedules
        if (backup.tables.schedules?.length) {
          results.schedules = { created: 0, updated: 0, skipped: 0 };
          for (const schedule of backup.tables.schedules) {
            try {
              if (mode === 'replace') {
                await tx.schedule.upsert({
                  where: { id: schedule.id },
                  create: schedule,
                  update: schedule,
                });
                results.schedules.updated++;
              } else {
                const existing = await tx.schedule.findUnique({
                  where: { id: schedule.id },
                });
                if (!existing) {
                  await tx.schedule.create({ data: schedule });
                  results.schedules.created++;
                } else {
                  results.schedules.skipped++;
                }
              }
            } catch (e) {
              log.warn({ scheduleId: schedule.id, error: e }, 'Failed to restore schedule');
              results.schedules.skipped++;
            }
          }
        }

        // Restore triggers
        if (backup.tables.triggers?.length) {
          results.triggers = { created: 0, updated: 0, skipped: 0 };
          for (const trigger of backup.tables.triggers) {
            try {
              if (mode === 'replace') {
                await tx.trigger.upsert({
                  where: { id: trigger.id },
                  create: trigger,
                  update: trigger,
                });
                results.triggers.updated++;
              } else {
                const existing = await tx.trigger.findUnique({
                  where: { id: trigger.id },
                });
                if (!existing) {
                  await tx.trigger.create({ data: trigger });
                  results.triggers.created++;
                } else {
                  results.triggers.skipped++;
                }
              }
            } catch (e) {
              log.warn({ triggerId: trigger.id, error: e }, 'Failed to restore trigger');
              results.triggers.skipped++;
            }
          }
        }
      });

      // Log the restore action
      if (auditService) {
        await auditService.logFromRequest(req, 'update', 'backup', undefined, 'success', {
          mode,
          backupTimestamp: backup.timestamp,
          results,
        });
      }

      log.info(
        { userId: req.user?.sub, mode, results },
        'Database restore completed'
      );

      res.json({
        message: 'Restore completed',
        mode,
        backupTimestamp: backup.timestamp,
        results,
      });
    } catch (error) {
      log.error({ error }, 'Failed to restore backup');

      if (auditService) {
        await auditService.logFromRequest(req, 'update', 'backup', undefined, 'failure', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }

      res.status(500).json({
        error: 'Failed to restore backup',
        code: 'RESTORE_ERROR',
      });
    }
  });

  /**
   * POST /backup/validate
   * Validate a backup file without restoring
   */
  router.post('/validate', async (req: any, res: any) => {
    try {
      const backup: BackupData = req.body;

      const issues: string[] = [];

      // Check version
      if (!backup.version) {
        issues.push('Missing version field');
      } else if (backup.version !== '1.0') {
        issues.push(`Unsupported version: ${backup.version}`);
      }

      // Check tables
      if (!backup.tables) {
        issues.push('Missing tables field');
      } else {
        const expectedTables = ['patterns', 'agents', 'users', 'schedules', 'triggers'];
        for (const table of expectedTables) {
          if (!backup.tables[table as keyof typeof backup.tables]) {
            issues.push(`Missing table: ${table}`);
          }
        }
      }

      // Check timestamp
      if (!backup.timestamp) {
        issues.push('Missing timestamp');
      } else {
        const date = new Date(backup.timestamp);
        if (isNaN(date.getTime())) {
          issues.push('Invalid timestamp format');
        }
      }

      const valid = issues.length === 0;

      res.json({
        valid,
        issues,
        backup: valid
          ? {
              version: backup.version,
              timestamp: backup.timestamp,
              records: backup.metadata?.totalRecords,
              tables: Object.fromEntries(
                Object.entries(backup.tables || {}).map(([k, v]) => [k, Array.isArray(v) ? v.length : 0])
              ),
            }
          : undefined,
      });
    } catch (error) {
      res.status(400).json({
        valid: false,
        issues: ['Failed to parse backup file'],
        error: error instanceof Error ? error.message : 'Parse error',
      });
    }
  });

  return router;
}

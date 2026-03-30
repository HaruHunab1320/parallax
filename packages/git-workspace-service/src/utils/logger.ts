/**
 * Shared Pino logger for git-workspace-service
 *
 * Provides a default structured logger used as fallback when
 * consumers don't inject their own logger instance.
 */

import pino from 'pino';

export const logger = pino({
  name: 'git-workspace-service',
  level: process.env.LOG_LEVEL || 'info',
});

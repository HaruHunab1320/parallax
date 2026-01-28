/**
 * GitHub Webhook Handler
 *
 * Handles GitHub App webhook events for installation management.
 */

import { Router, Request, Response } from 'express';
import { Logger } from 'pino';
import { createHmac, timingSafeEqual } from 'crypto';
import { GitHubProvider } from './providers/github-provider';

export interface GitHubWebhookConfig {
  webhookSecret: string;
  githubProvider: GitHubProvider;
  logger: Logger;
}

/**
 * Verify GitHub webhook signature
 */
function verifySignature(
  payload: string,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac('sha256', secret)
    .update(payload)
    .digest('hex')}`;

  try {
    return timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

export function createGitHubWebhookRouter(config: GitHubWebhookConfig): Router {
  const router = Router();
  const { webhookSecret, githubProvider, logger } = config;

  // Raw body parser for signature verification
  router.use((req: Request, res: Response, next) => {
    // Store raw body for signature verification
    let rawBody = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      rawBody += chunk;
    });
    req.on('end', () => {
      (req as any).rawBody = rawBody;
      try {
        req.body = JSON.parse(rawBody);
      } catch {
        req.body = {};
      }
      next();
    });
  });

  /**
   * POST /api/webhooks/github
   * Handle GitHub App webhook events
   */
  router.post('/', async (req: Request, res: Response) => {
    const signature = req.headers['x-hub-signature-256'] as string | undefined;
    const event = req.headers['x-github-event'] as string;
    const deliveryId = req.headers['x-github-delivery'] as string;

    // Verify signature
    if (!verifySignature((req as any).rawBody, signature, webhookSecret)) {
      logger.warn({ deliveryId }, 'Invalid webhook signature');
      res.status(401).json({ error: 'Invalid signature' });
      return;
    }

    logger.info({ event, deliveryId }, 'GitHub webhook received');

    try {
      switch (event) {
        case 'installation':
          await handleInstallationEvent(req.body, githubProvider, logger);
          break;

        case 'installation_repositories':
          await handleInstallationRepositoriesEvent(req.body, githubProvider, logger);
          break;

        case 'ping':
          logger.info({ zen: req.body.zen }, 'GitHub ping received');
          break;

        default:
          logger.debug({ event }, 'Unhandled webhook event');
      }

      res.status(200).json({ received: true });
    } catch (error) {
      logger.error({ event, deliveryId, error }, 'Failed to process webhook');
      res.status(500).json({ error: 'Failed to process webhook' });
    }
  });

  return router;
}

/**
 * Handle installation events (created, deleted, suspend, unsuspend)
 */
async function handleInstallationEvent(
  payload: any,
  githubProvider: GitHubProvider,
  logger: Logger
): Promise<void> {
  const action = payload.action;
  const installationId = payload.installation?.id;
  const account = payload.installation?.account?.login;

  logger.info({ action, installationId, account }, 'Installation event');

  switch (action) {
    case 'created':
    case 'new_permissions_accepted':
      // Register the new installation
      await githubProvider.registerInstallation(installationId);
      logger.info({ installationId, account }, 'GitHub App installed');
      break;

    case 'deleted':
      // Handle uninstall - credentials will be invalidated automatically
      // since installation tokens won't work anymore
      logger.info({ installationId, account }, 'GitHub App uninstalled');
      break;

    case 'suspend':
      logger.warn({ installationId, account }, 'GitHub App suspended');
      break;

    case 'unsuspend':
      // Re-register the installation
      await githubProvider.registerInstallation(installationId);
      logger.info({ installationId, account }, 'GitHub App unsuspended');
      break;
  }
}

/**
 * Handle installation_repositories events (added, removed)
 */
async function handleInstallationRepositoriesEvent(
  payload: any,
  githubProvider: GitHubProvider,
  logger: Logger
): Promise<void> {
  const action = payload.action;
  const installationId = payload.installation?.id;
  const repositoriesAdded = payload.repositories_added || [];
  const repositoriesRemoved = payload.repositories_removed || [];

  logger.info(
    {
      action,
      installationId,
      added: repositoriesAdded.map((r: any) => r.full_name),
      removed: repositoriesRemoved.map((r: any) => r.full_name),
    },
    'Installation repositories event'
  );

  // Re-register installation to refresh repository list
  await githubProvider.registerInstallation(installationId);
}

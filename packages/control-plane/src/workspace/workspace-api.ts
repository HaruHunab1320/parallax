/**
 * Workspace API Routes
 *
 * REST API for workspace and credential management.
 */

import { Router, Request, Response } from 'express';
import { Logger } from 'pino';
import { WorkspaceService } from './workspace-service';
import { CredentialService } from './credential-service';
import { WorkspaceConfig, WorkspaceFinalization } from './types';

export interface WorkspaceApiConfig {
  workspaceService: WorkspaceService;
  credentialService: CredentialService;
  logger: Logger;
}

export function createWorkspaceRouter(config: WorkspaceApiConfig): Router {
  const router = Router();
  const { workspaceService, credentialService, logger } = config;

  // ─────────────────────────────────────────────────────────────
  // Workspace Endpoints
  // ─────────────────────────────────────────────────────────────

  /**
   * POST /api/workspaces
   * Provision a new workspace
   */
  router.post('/workspaces', async (req: Request, res: Response) => {
    try {
      const workspaceConfig: WorkspaceConfig = {
        repo: req.body.repo,
        provider: req.body.provider,
        branchStrategy: req.body.branchStrategy || 'feature_branch',
        baseBranch: req.body.baseBranch || 'main',
        execution: {
          id: req.body.executionId,
          patternName: req.body.patternName || 'manual',
        },
        task: {
          id: req.body.taskId || `task-${Date.now()}`,
          role: req.body.role || 'agent',
          slug: req.body.slug,
        },
        user: req.body.userId ? { id: req.body.userId } : undefined,
      };

      if (!workspaceConfig.repo) {
        res.status(400).json({ error: 'repo is required' });
        return;
      }

      if (!workspaceConfig.execution.id) {
        res.status(400).json({ error: 'executionId is required' });
        return;
      }

      const workspace = await workspaceService.provision(workspaceConfig);

      res.status(201).json({
        id: workspace.id,
        path: workspace.path,
        repo: workspace.repo,
        branch: workspace.branch.name,
        baseBranch: workspace.branch.baseBranch,
        status: workspace.status,
        provisionedAt: workspace.provisionedAt,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to provision workspace');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to provision workspace',
      });
    }
  });

  /**
   * GET /api/workspaces/:id
   * Get workspace details
   */
  router.get('/workspaces/:id', async (req: Request, res: Response) => {
    const workspace = workspaceService.get(req.params.id);

    if (!workspace) {
      res.status(404).json({ error: 'Workspace not found' });
      return;
    }

    res.json({
      id: workspace.id,
      path: workspace.path,
      repo: workspace.repo,
      branch: workspace.branch,
      status: workspace.status,
      provisionedAt: workspace.provisionedAt,
    });
  });

  /**
   * GET /api/workspaces?executionId=xxx
   * List workspaces for an execution
   */
  router.get('/workspaces', async (req: Request, res: Response) => {
    const executionId = req.query.executionId as string;

    if (!executionId) {
      res.status(400).json({ error: 'executionId query parameter required' });
      return;
    }

    const workspaces = workspaceService.getForExecution(executionId);

    res.json({
      workspaces: workspaces.map((w) => ({
        id: w.id,
        path: w.path,
        repo: w.repo,
        branch: w.branch.name,
        status: w.status,
        pullRequest: w.branch.pullRequest,
      })),
      count: workspaces.length,
    });
  });

  /**
   * POST /api/workspaces/:id/finalize
   * Finalize a workspace (push, create PR, cleanup)
   */
  router.post('/workspaces/:id/finalize', async (req: Request, res: Response) => {
    try {
      const finalization: WorkspaceFinalization = {
        push: req.body.push !== false,
        createPr: req.body.createPr === true,
        pr: req.body.pr,
        cleanup: req.body.cleanup !== false,
      };

      const pr = await workspaceService.finalize(req.params.id, finalization);

      res.json({
        success: true,
        pullRequest: pr || null,
      });
    } catch (error) {
      logger.error({ workspaceId: req.params.id, error }, 'Failed to finalize workspace');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to finalize workspace',
      });
    }
  });

  /**
   * DELETE /api/workspaces/:id
   * Clean up a workspace
   */
  router.delete('/workspaces/:id', async (req: Request, res: Response) => {
    try {
      await workspaceService.cleanup(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error({ workspaceId: req.params.id, error }, 'Failed to cleanup workspace');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to cleanup workspace',
      });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Credential Endpoints (for external agents)
  // ─────────────────────────────────────────────────────────────

  /**
   * POST /api/credentials/git
   * Request credentials for a repository
   */
  router.post('/credentials/git', async (req: Request, res: Response) => {
    try {
      const { repo, access, executionId, taskId, agentId, reason, ttlSeconds } = req.body;

      if (!repo) {
        res.status(400).json({ error: 'repo is required' });
        return;
      }

      if (!executionId) {
        res.status(400).json({ error: 'executionId is required' });
        return;
      }

      const credential = await credentialService.getCredentials({
        repo,
        access: access || 'read',
        context: {
          executionId,
          taskId,
          agentId,
          reason,
        },
        ttlSeconds,
      });

      res.status(201).json({
        id: credential.id,
        token: credential.token,
        type: credential.type,
        provider: credential.provider,
        permissions: credential.permissions,
        expiresAt: credential.expiresAt,
      });
    } catch (error) {
      logger.error({ error }, 'Failed to get credentials');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to get credentials',
      });
    }
  });

  /**
   * DELETE /api/credentials/:id
   * Revoke a credential
   */
  router.delete('/credentials/:id', async (req: Request, res: Response) => {
    try {
      await credentialService.revokeCredential(req.params.id);
      res.status(204).send();
    } catch (error) {
      logger.error({ credentialId: req.params.id, error }, 'Failed to revoke credential');
      res.status(500).json({
        error: error instanceof Error ? error.message : 'Failed to revoke credential',
      });
    }
  });

  /**
   * GET /api/credentials/:id
   * Get credential grant info (for audit)
   */
  router.get('/credentials/:id', async (req: Request, res: Response) => {
    const grant = await credentialService.getGrant(req.params.id);

    if (!grant) {
      res.status(404).json({ error: 'Credential grant not found' });
      return;
    }

    res.json({
      id: grant.id,
      type: grant.type,
      repo: grant.repo,
      provider: grant.provider,
      grantedTo: grant.grantedTo,
      permissions: grant.permissions,
      createdAt: grant.createdAt,
      expiresAt: grant.expiresAt,
      revokedAt: grant.revokedAt,
      valid: credentialService.isValid(grant.id),
    });
  });

  return router;
}

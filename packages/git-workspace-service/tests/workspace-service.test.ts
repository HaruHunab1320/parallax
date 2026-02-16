/**
 * Workspace Service Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { WorkspaceService } from '../src/workspace-service';
import { CredentialService } from '../src/credential-service';
import type {
  WorkspaceConfig,
  GitProviderAdapter,
  GitCredential,
  WorkspaceEvent,
} from '../src/types';

// Mock child_process
vi.mock('child_process', () => ({
  exec: vi.fn((cmd, opts, cb) => {
    if (typeof opts === 'function') {
      cb = opts;
    }
    // Simulate successful git commands
    if (cb) {
      cb(null, { stdout: '', stderr: '' });
    }
    return { stdout: '', stderr: '' };
  }),
}));

// Create a mock provider
function createMockProvider(): GitProviderAdapter {
  return {
    name: 'github',
    getCredentials: vi.fn().mockResolvedValue({
      id: 'cred-123',
      type: 'github_app',
      token: 'test-token',
      repo: 'owner/repo',
      permissions: ['contents:read', 'contents:write'],
      expiresAt: new Date(Date.now() + 3600000),
      provider: 'github',
    } as GitCredential),
    revokeCredential: vi.fn().mockResolvedValue(undefined),
    createPullRequest: vi.fn().mockResolvedValue({
      number: 1,
      url: 'https://github.com/owner/repo/pull/1',
      state: 'open' as const,
      sourceBranch: 'parallax/exec-123/engineer',
      targetBranch: 'main',
      title: 'Test PR',
      executionId: '',
      createdAt: new Date(),
    }),
    branchExists: vi.fn().mockResolvedValue(true),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
  };
}

describe('WorkspaceService', () => {
  let service: WorkspaceService;
  let credentialService: CredentialService;
  let mockProvider: GitProviderAdapter;
  let tempDir: string;

  beforeEach(async () => {
    // Create temp directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workspace-test-'));

    // Set up credential service with mock provider
    mockProvider = createMockProvider();
    credentialService = new CredentialService({
      defaultTtlSeconds: 3600,
    });
    credentialService.registerProvider(mockProvider);

    // Create workspace service
    service = new WorkspaceService({
      config: {
        baseDir: tempDir,
      },
      credentialService,
    });

    await service.initialize();
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe('provision', () => {
    it('provisions a workspace', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);

      expect(workspace).toBeDefined();
      expect(workspace.id).toBeDefined();
      expect(workspace.repo).toBe('https://github.com/owner/repo');
      expect(workspace.branch.name).toBe('parallax/exec-123/engineer');
      expect(workspace.status).toBe('ready');
      expect(workspace.credential).toBeDefined();
    });

    it('generates branch with slug', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
          slug: 'auth-feature',
        },
      };

      const workspace = await service.provision(config);

      expect(workspace.branch.name).toBe('parallax/exec-123/engineer-auth-feature');
    });

    it('uses user-provided credentials', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
        userCredentials: {
          type: 'pat',
          token: 'user-pat-token',
        },
      };

      const workspace = await service.provision(config);

      expect(workspace.credential.token).toBe('user-pat-token');
      expect(workspace.credential.type).toBe('pat');
    });

    it('emits events during provisioning', async () => {
      const events: WorkspaceEvent[] = [];
      service.onEvent((event) => {
        events.push(event);
      });

      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      await service.provision(config);

      expect(events.some((e) => e.type === 'workspace:provisioning')).toBe(true);
      expect(events.some((e) => e.type === 'credential:granted')).toBe(true);
      expect(events.some((e) => e.type === 'workspace:ready')).toBe(true);
    });

    it('can unsubscribe from events', async () => {
      const events: WorkspaceEvent[] = [];
      const unsubscribe = service.onEvent((event) => {
        events.push(event);
      });

      unsubscribe();

      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      await service.provision(config);

      expect(events).toHaveLength(0);
    });
  });

  describe('get', () => {
    it('returns workspace by ID', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);
      const retrieved = service.get(workspace.id);

      expect(retrieved).toEqual(workspace);
    });

    it('returns null for non-existent workspace', () => {
      const workspace = service.get('non-existent');
      expect(workspace).toBeNull();
    });
  });

  describe('getForExecution', () => {
    it('returns all workspaces for an execution', async () => {
      const config1: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo1',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-1',
          role: 'engineer',
        },
      };

      const config2: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo2',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-2',
          role: 'reviewer',
        },
      };

      await service.provision(config1);
      await service.provision(config2);

      const workspaces = service.getForExecution('exec-123');

      expect(workspaces).toHaveLength(2);
    });

    it('returns empty array for non-existent execution', () => {
      const workspaces = service.getForExecution('non-existent');
      expect(workspaces).toHaveLength(0);
    });
  });

  describe('cleanup', () => {
    it('cleans up a workspace', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);
      await service.cleanup(workspace.id);

      const retrieved = service.get(workspace.id);
      expect(retrieved?.status).toBe('cleaned_up');
    });

    it('emits credential revoked event', async () => {
      const events: WorkspaceEvent[] = [];
      service.onEvent((event) => {
        events.push(event);
      });

      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);
      await service.cleanup(workspace.id);

      expect(events.some((e) => e.type === 'credential:revoked')).toBe(true);
      expect(events.some((e) => e.type === 'workspace:cleaned_up')).toBe(true);
    });

    it('handles cleaning up non-existent workspace', async () => {
      // Should not throw
      await expect(service.cleanup('non-existent')).resolves.not.toThrow();
    });
  });

  describe('cleanupForExecution', () => {
    it('cleans up all workspaces for an execution', async () => {
      const config1: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo1',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-1',
          role: 'engineer',
        },
      };

      const config2: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo2',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-2',
          role: 'reviewer',
        },
      };

      const ws1 = await service.provision(config1);
      const ws2 = await service.provision(config2);

      await service.cleanupForExecution('exec-123');

      expect(service.get(ws1.id)?.status).toBe('cleaned_up');
      expect(service.get(ws2.id)?.status).toBe('cleaned_up');
    });
  });

  describe('finalize', () => {
    it('finalizes workspace without cleanup', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);

      await service.finalize(workspace.id, {
        push: true,
        createPr: false,
        cleanup: false,
      });

      const retrieved = service.get(workspace.id);
      expect(retrieved?.status).toBe('ready');
    });

    it('creates PR when requested', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);

      const result = await service.finalize(workspace.id, {
        push: true,
        createPr: true,
        pr: {
          title: 'Test PR',
          body: 'PR description',
          targetBranch: 'main',
        },
        cleanup: false,
      });

      expect(result).toBeDefined();
      expect(result?.number).toBe(1);
      expect(result?.url).toBe('https://github.com/owner/repo/pull/1');
      expect(mockProvider.createPullRequest).toHaveBeenCalled();
    });

    it('emits PR created event', async () => {
      const events: WorkspaceEvent[] = [];
      service.onEvent((event) => {
        events.push(event);
      });

      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);

      await service.finalize(workspace.id, {
        push: true,
        createPr: true,
        pr: {
          title: 'Test PR',
          body: 'PR description',
          targetBranch: 'main',
        },
        cleanup: false,
      });

      expect(events.some((e) => e.type === 'pr:created')).toBe(true);
    });

    it('throws for non-existent workspace', async () => {
      await expect(
        service.finalize('non-existent', {
          push: false,
          createPr: false,
          cleanup: false,
        })
      ).rejects.toThrow('Workspace not found');
    });
  });

  describe('worktree support', () => {
    it('provisions a clone workspace with strategy field', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);

      expect(workspace.strategy).toBe('clone');
      expect(workspace.parentWorkspaceId).toBeUndefined();
    });

    it('defaults to clone strategy when not specified', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      const workspace = await service.provision(config);

      expect(workspace.strategy).toBe('clone');
    });

    it('provisions a worktree from a parent clone', async () => {
      // First create a clone workspace
      const parentConfig: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-parent',
          role: 'engineer',
        },
      };

      const parentWorkspace = await service.provision(parentConfig);

      // Now create a worktree
      const worktreeConfig: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        parentWorkspace: parentWorkspace.id,
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-worktree',
          role: 'reviewer',
        },
      };

      const worktree = await service.provision(worktreeConfig);

      expect(worktree.strategy).toBe('worktree');
      expect(worktree.parentWorkspaceId).toBe(parentWorkspace.id);

      // Parent should track the worktree
      const updatedParent = service.get(parentWorkspace.id);
      expect(updatedParent?.worktreeIds).toContain(worktree.id);
    });

    it('throws when worktree is missing parentWorkspace', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        // Missing parentWorkspace
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      await expect(service.provision(config)).rejects.toThrow(
        'parentWorkspace is required when strategy is "worktree"'
      );
    });

    it('throws when parent workspace does not exist', async () => {
      const config: WorkspaceConfig = {
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        parentWorkspace: 'non-existent-parent',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: {
          id: 'exec-123',
          patternName: 'test-pattern',
        },
        task: {
          id: 'task-456',
          role: 'engineer',
        },
      };

      await expect(service.provision(config)).rejects.toThrow('Parent workspace not found');
    });

    it('lists worktrees for a parent workspace', async () => {
      // Create parent
      const parent = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      });

      // Create worktrees
      const wt1 = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        parentWorkspace: parent.id,
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-2', role: 'reviewer' },
      });

      const wt2 = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        parentWorkspace: parent.id,
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-3', role: 'tester' },
      });

      const worktrees = service.listWorktrees(parent.id);

      expect(worktrees).toHaveLength(2);
      expect(worktrees.map((w) => w.id)).toContain(wt1.id);
      expect(worktrees.map((w) => w.id)).toContain(wt2.id);
    });

    it('returns empty array for listWorktrees with no worktrees', async () => {
      const parent = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      });

      const worktrees = service.listWorktrees(parent.id);

      expect(worktrees).toHaveLength(0);
    });

    it('emits worktree:added event when creating worktree', async () => {
      const events: WorkspaceEvent[] = [];
      service.onEvent((event) => events.push(event));

      const parent = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      });

      await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        parentWorkspace: parent.id,
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-2', role: 'reviewer' },
      });

      expect(events.some((e) => e.type === 'worktree:added')).toBe(true);
    });

    it('worktree shares credential with parent', async () => {
      const parent = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      });

      const worktree = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        parentWorkspace: parent.id,
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-2', role: 'reviewer' },
      });

      // Worktree should share the same credential as parent
      expect(worktree.credential.id).toBe(parent.credential.id);
    });

    it('addWorktree convenience method works', async () => {
      const parent = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      });

      const worktree = await service.addWorktree(parent.id, {
        branch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-2', role: 'reviewer' },
      });

      expect(worktree.strategy).toBe('worktree');
      expect(worktree.parentWorkspaceId).toBe(parent.id);
    });

    it('removeWorktree removes a worktree', async () => {
      const events: WorkspaceEvent[] = [];
      service.onEvent((event) => events.push(event));

      const parent = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      });

      const worktree = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        parentWorkspace: parent.id,
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-2', role: 'reviewer' },
      });

      await service.removeWorktree(worktree.id);

      expect(service.get(worktree.id)?.status).toBe('cleaned_up');
      expect(events.some((e) => e.type === 'worktree:removed')).toBe(true);

      // Parent should no longer track the worktree
      const updatedParent = service.get(parent.id);
      expect(updatedParent?.worktreeIds).not.toContain(worktree.id);
    });

    it('removeWorktree throws for non-worktree workspace', async () => {
      const clone = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      });

      await expect(service.removeWorktree(clone.id)).rejects.toThrow(
        'Workspace is not a worktree'
      );
    });

    it('cleanup of parent also cleans up worktrees', async () => {
      const parent = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'clone',
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      });

      const worktree = await service.provision({
        repo: 'https://github.com/owner/repo',
        strategy: 'worktree',
        parentWorkspace: parent.id,
        branchStrategy: 'feature_branch',
        baseBranch: 'main',
        execution: { id: 'exec-123', patternName: 'test' },
        task: { id: 'task-2', role: 'reviewer' },
      });

      // Cleanup parent should also cleanup worktree
      await service.cleanup(parent.id);

      expect(service.get(parent.id)?.status).toBe('cleaned_up');
      expect(service.get(worktree.id)?.status).toBe('cleaned_up');
    });
  });
});

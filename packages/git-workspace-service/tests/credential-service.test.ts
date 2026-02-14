/**
 * Credential Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CredentialService } from '../src/credential-service';
import type { GitProviderAdapter, GitCredential, GitCredentialRequest } from '../src/types';

// Mock provider with unique IDs
let credentialCounter = 0;

function createMockProvider(name: 'github' | 'gitlab' = 'github'): GitProviderAdapter {
  return {
    name,
    getCredentials: vi.fn().mockImplementation(() => {
      credentialCounter++;
      return Promise.resolve({
        id: `cred-${credentialCounter}`,
        type: 'github_app',
        token: 'test-token',
        repo: 'owner/repo',
        permissions: ['contents:read', 'contents:write'],
        expiresAt: new Date(Date.now() + 3600000),
        provider: name,
      } as GitCredential);
    }),
    revokeCredential: vi.fn().mockResolvedValue(undefined),
    createPullRequest: vi.fn().mockResolvedValue({
      number: 1,
      url: 'https://github.com/owner/repo/pull/1',
      state: 'open',
      sourceBranch: 'feature',
      targetBranch: 'main',
      title: 'Test PR',
      executionId: 'exec-123',
      createdAt: new Date(),
    }),
    branchExists: vi.fn().mockResolvedValue(true),
    getDefaultBranch: vi.fn().mockResolvedValue('main'),
  };
}

describe('CredentialService', () => {
  let service: CredentialService;
  let mockProvider: GitProviderAdapter;

  beforeEach(() => {
    credentialCounter = 0; // Reset counter
    mockProvider = createMockProvider();
    service = new CredentialService({
      defaultTtlSeconds: 3600,
      maxTtlSeconds: 7200,
    });
    service.registerProvider(mockProvider);
  });

  describe('getCredentials', () => {
    it('returns credentials from provider', async () => {
      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'write',
        context: {
          executionId: 'exec-123',
          taskId: 'task-456',
        },
      };

      const credential = await service.getCredentials(request);

      expect(credential).toBeDefined();
      expect(credential.id).toBeDefined();
      expect(credential.token).toBe('test-token');
      expect(mockProvider.getCredentials).toHaveBeenCalledWith(request);
    });

    it('uses user-provided credentials when available', async () => {
      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'write',
        context: {
          executionId: 'exec-123',
        },
        userProvided: {
          type: 'pat',
          token: 'user-pat-token',
        },
      };

      const credential = await service.getCredentials(request);

      expect(credential).toBeDefined();
      expect(credential.token).toBe('user-pat-token');
      expect(credential.type).toBe('pat');
      // Provider should not be called when user-provided credentials are used
      expect(mockProvider.getCredentials).not.toHaveBeenCalled();
    });

    it('throws error when no credentials available', async () => {
      service = new CredentialService({}); // No providers

      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'read',
        context: {
          executionId: 'exec-123',
        },
      };

      await expect(service.getCredentials(request)).rejects.toThrow(
        'No credentials available for repository'
      );
    });

    it('detects GitHub provider from URL', async () => {
      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'read',
        context: {
          executionId: 'exec-123',
        },
      };

      await service.getCredentials(request);

      expect(mockProvider.getCredentials).toHaveBeenCalled();
    });

    it('respects max TTL', async () => {
      service = new CredentialService({
        maxTtlSeconds: 1800, // 30 minutes
      });
      service.registerProvider(mockProvider);

      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'read',
        context: {
          executionId: 'exec-123',
        },
        ttlSeconds: 7200, // Request 2 hours
        userProvided: {
          type: 'pat',
          token: 'test',
        },
      };

      const credential = await service.getCredentials(request);

      // Credential should expire within maxTtl
      const maxExpiry = Date.now() + 1800 * 1000 + 1000; // +1s buffer
      expect(credential.expiresAt.getTime()).toBeLessThanOrEqual(maxExpiry);
    });
  });

  describe('revokeCredential', () => {
    it('revokes a credential', async () => {
      // First grant a credential
      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'read',
        context: {
          executionId: 'exec-123',
        },
      };
      const credential = await service.getCredentials(request);

      // Verify it's valid
      expect(service.isValid(credential.id)).toBe(true);

      // Revoke it
      await service.revokeCredential(credential.id);

      // Verify it's no longer valid
      expect(service.isValid(credential.id)).toBe(false);
    });

    it('handles revoking non-existent credential', async () => {
      // Should not throw
      await expect(service.revokeCredential('non-existent')).resolves.not.toThrow();
    });
  });

  describe('revokeForExecution', () => {
    it('revokes all credentials for an execution', async () => {
      // Grant multiple credentials for same execution
      const request1: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo1',
        access: 'read',
        context: {
          executionId: 'exec-123',
          taskId: 'task-1',
        },
      };
      const request2: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo2',
        access: 'read',
        context: {
          executionId: 'exec-123',
          taskId: 'task-2',
        },
      };

      const cred1 = await service.getCredentials(request1);
      const cred2 = await service.getCredentials(request2);

      expect(service.isValid(cred1.id)).toBe(true);
      expect(service.isValid(cred2.id)).toBe(true);

      // Revoke all for execution
      const count = await service.revokeForExecution('exec-123');

      expect(count).toBe(2);
      expect(service.isValid(cred1.id)).toBe(false);
      expect(service.isValid(cred2.id)).toBe(false);
    });
  });

  describe('isValid', () => {
    it('returns false for non-existent credential', () => {
      expect(service.isValid('non-existent')).toBe(false);
    });

    it('returns false for expired credential', async () => {
      // Create a credential that expires in the past by directly manipulating
      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'read',
        context: {
          executionId: 'exec-123',
        },
        userProvided: {
          type: 'pat',
          token: 'test',
        },
        ttlSeconds: 1, // 1 second TTL
      };

      // Override maxTtlSeconds to allow 1 second TTL
      service = new CredentialService({
        maxTtlSeconds: 1,
      });

      const credential = await service.getCredentials(request);

      // Wait for expiry
      await new Promise((resolve) => setTimeout(resolve, 1100));

      expect(service.isValid(credential.id)).toBe(false);
    });
  });

  describe('getGrant', () => {
    it('returns grant for valid ID', async () => {
      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'write',
        context: {
          executionId: 'exec-123',
          taskId: 'task-456',
        },
      };

      const credential = await service.getCredentials(request);
      const grant = await service.getGrant(credential.id);

      expect(grant).toBeDefined();
      expect(grant?.id).toBe(credential.id);
      expect(grant?.grantedTo.executionId).toBe('exec-123');
      expect(grant?.grantedTo.taskId).toBe('task-456');
    });

    it('returns null for non-existent grant', async () => {
      const grant = await service.getGrant('non-existent');
      expect(grant).toBeNull();
    });
  });

  describe('getGrantsForExecution', () => {
    it('returns all grants for an execution', async () => {
      const request1: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo1',
        access: 'read',
        context: {
          executionId: 'exec-123',
          taskId: 'task-1',
        },
      };
      const request2: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo2',
        access: 'write',
        context: {
          executionId: 'exec-123',
          taskId: 'task-2',
        },
      };

      await service.getCredentials(request1);
      await service.getCredentials(request2);

      const grants = await service.getGrantsForExecution('exec-123');

      expect(grants).toHaveLength(2);
      expect(grants[0].grantedTo.executionId).toBe('exec-123');
      expect(grants[1].grantedTo.executionId).toBe('exec-123');
    });
  });

  describe('registerProvider', () => {
    it('registers a provider', () => {
      const gitlabProvider = createMockProvider('gitlab');
      service.registerProvider(gitlabProvider);

      expect(service.getProvider('gitlab')).toBe(gitlabProvider);
    });
  });

  describe('provider detection', () => {
    it('detects GitHub from URL', async () => {
      const request: GitCredentialRequest = {
        repo: 'https://github.com/owner/repo',
        access: 'read',
        context: { executionId: 'exec-123' },
      };

      await service.getCredentials(request);
      expect(mockProvider.getCredentials).toHaveBeenCalled();
    });

    it('detects GitLab from URL', async () => {
      const gitlabProvider = createMockProvider('gitlab');
      service.registerProvider(gitlabProvider);

      const request: GitCredentialRequest = {
        repo: 'https://gitlab.com/owner/repo',
        access: 'read',
        context: { executionId: 'exec-123' },
      };

      await service.getCredentials(request);
      expect(gitlabProvider.getCredentials).toHaveBeenCalled();
    });
  });
});

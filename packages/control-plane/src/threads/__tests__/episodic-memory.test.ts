import { describe, it, expect, vi, beforeEach } from 'vitest';
import pino from 'pino';
import { EpisodicExperienceService } from '../episodic-experience.service';
import { MemoryContextService } from '../memory-context.service';
import { ThreadPreparationService } from '../thread-preparation.service';
import { ThreadEvent, ThreadHandle } from '@parallaxai/runtime-interface';

const logger = pino({ level: 'silent' });

describe('EpisodicExperienceService', () => {
  const repository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findLatestForThread: vi.fn(),
  };

  const thread: ThreadHandle = {
    id: 'thread-2',
    executionId: 'exec-2',
    runtimeName: 'local',
    agentType: 'codex',
    role: 'engineer',
    status: 'failed',
    objective: 'Refactor auth controller',
    workspace: {
      repo: 'acme/auth-service',
      branch: 'feature/auth-refactor',
      workspaceId: 'ws-1',
      path: '/tmp/ws-1',
    },
    createdAt: new Date('2026-03-12T00:00:00Z'),
    updatedAt: new Date('2026-03-12T00:00:00Z'),
    summary: 'Refactor reached merge conflict during controller extraction.',
    completion: {
      state: 'failed',
      summary: 'Stopped on merge conflict while extracting controller.',
      artifacts: [{ type: 'file', value: 'src/auth/controller.ts' }],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository.create.mockResolvedValue({});
    repository.findLatestForThread.mockResolvedValue(null);
  });

  it('captures failed experiences with normalized outcome context', async () => {
    const service = new EpisodicExperienceService(repository as any, logger);
    const event: ThreadEvent = {
      threadId: thread.id,
      executionId: thread.executionId,
      type: 'thread_failed',
      timestamp: new Date(),
      data: { error: 'Merge conflict in auth/controller.ts' },
    };

    await service.projectThreadEvent(thread, event);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: 'failed',
        repo: 'acme/auth-service',
        summary: expect.stringContaining('Failed on objective: Refactor auth controller.'),
      })
    );
  });

  it('deduplicates equivalent summaries by fingerprint', async () => {
    const service = new EpisodicExperienceService(repository as any, logger);
    repository.findLatestForThread.mockResolvedValue({
      id: 'exp-1',
      executionId: thread.executionId,
      threadId: thread.id,
      role: thread.role ?? null,
      repo: thread.workspace?.repo ?? null,
      objective: thread.objective,
      summary:
        'Failed on objective: Refactor auth controller. Stopped on merge conflict while extracting controller. Artifacts: file:src/auth/controller.ts.',
      outcome: 'failed',
      details: null,
      createdAt: new Date(),
    });

    const event: ThreadEvent = {
      threadId: thread.id,
      executionId: thread.executionId,
      type: 'thread_failed',
      timestamp: new Date(),
      data: { summary: 'Stopped on merge conflict while extracting controller.' },
    };

    await service.projectThreadEvent(thread, event);

    expect(repository.create).not.toHaveBeenCalled();
  });
});

describe('MemoryContextService', () => {
  const sharedDecisions = {
    findAll: vi.fn(),
  };

  const episodicExperiences = {
    findAll: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ranks experiences by repo, role, objective overlap, and outcome', async () => {
    sharedDecisions.findAll.mockResolvedValue([
      {
        id: 'decision-1',
        executionId: 'exec-1',
        threadId: 'thread-1',
        category: 'failure_recovery',
        summary: 'Avoid rewriting the session middleware until the conflict is resolved.',
        details: null,
        createdAt: new Date('2026-03-12T01:00:00Z'),
      },
    ]);

    episodicExperiences.findAll.mockResolvedValue([
      {
        id: 'exp-1',
        executionId: 'old-1',
        threadId: 'old-thread-1',
        role: 'engineer',
        repo: 'acme/auth-service',
        objective: 'Refactor auth controller and callback handling',
        summary: 'Succeeded on auth controller refactor with callback coverage.',
        outcome: 'successful',
        details: null,
        createdAt: new Date('2026-03-12T10:00:00Z'),
      },
      {
        id: 'exp-2',
        executionId: 'old-2',
        threadId: 'old-thread-2',
        role: 'engineer',
        repo: 'acme/other-service',
        objective: 'Update billing UI',
        summary: 'Succeeded on billing change.',
        outcome: 'successful',
        details: null,
        createdAt: new Date('2026-03-12T11:00:00Z'),
      },
      {
        id: 'exp-3',
        executionId: 'old-3',
        threadId: 'old-thread-3',
        role: 'engineer',
        repo: 'acme/auth-service',
        objective: 'Refactor auth controller and callback handling',
        summary: 'Succeeded on auth controller refactor with callback coverage.',
        outcome: 'successful',
        details: null,
        createdAt: new Date('2026-03-12T12:00:00Z'),
      },
      {
        id: 'exp-4',
        executionId: 'old-4',
        threadId: 'old-thread-4',
        role: 'engineer',
        repo: 'acme/auth-service',
        objective: 'Refactor auth controller',
        summary: 'Failed on auth controller refactor because of merge conflict.',
        outcome: 'failed',
        details: null,
        createdAt: new Date('2026-03-12T13:00:00Z'),
      },
    ]);

    const service = new MemoryContextService(
      sharedDecisions as any,
      episodicExperiences as any,
      logger
    );

    const result = await service.buildThreadMemory({
      executionId: 'exec-1',
      role: 'engineer',
      objective: 'Refactor auth controller and callback handling',
      workspace: { repo: 'acme/auth-service' },
    });

    const content = result.preparation?.contextFiles?.[0]?.content ?? '';
    expect(content).toContain('Avoid rewriting the session middleware');
    expect(content).toContain('Succeeded on auth controller refactor with callback coverage.');
    expect(content.indexOf('Succeeded on auth controller refactor with callback coverage.')).toBeLessThan(
      content.indexOf('Succeeded on billing change.')
    );
    expect(content.match(/Succeeded on auth controller refactor with callback coverage\./g)?.length).toBe(1);
  });
});

describe('ThreadPreparationService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('merges memory context into spawn preparation', async () => {
    const memoryContextService = {
      buildThreadMemory: vi.fn().mockResolvedValue({
        preparation: {
          workspace: { repo: 'acme/auth-service' },
          contextFiles: [{ path: '.parallax/thread-memory.md', content: 'memory' }],
        },
        metadata: {
          memoryContext: { sharedDecisionCount: 1 },
        },
      }),
    };

    const service = new ThreadPreparationService(memoryContextService as any, logger);
    const prepared = await service.prepareSpawnInput({
      executionId: 'exec-1',
      name: 'auth-thread',
      agentType: 'claude',
      objective: 'Refactor auth controller',
      role: 'engineer',
      preparation: {
        env: { FOO: 'bar' },
        approvalPreset: 'standard',
      },
      metadata: { source: 'test' },
    });

    expect(prepared.preparation?.contextFiles).toEqual([
      { path: '.parallax/thread-memory.md', content: 'memory' },
    ]);
    expect(prepared.preparation?.env).toEqual({ FOO: 'bar' });
    expect(prepared.metadata).toEqual({
      source: 'test',
      memoryContext: { sharedDecisionCount: 1 },
    });
  });

  it('provisions a workspace when only repo metadata is provided', async () => {
    const memoryContextService = {
      buildThreadMemory: vi.fn().mockResolvedValue({}),
    };

    const workspaceService = {
      provision: vi.fn().mockResolvedValue({
        id: 'ws-123',
        path: '/tmp/ws-123',
        repo: 'acme/auth-service',
        branch: { name: 'feature/auth-thread' },
      }),
    };

    const service = new ThreadPreparationService(memoryContextService as any, logger);
    service.setWorkspaceService(workspaceService as any);

    const prepared = await service.prepare({
      executionId: 'exec-1',
      name: 'auth-thread',
      agentType: 'claude',
      objective: 'Refactor auth controller',
      role: 'engineer',
      preparation: {
        workspace: { repo: 'acme/auth-service', branch: 'feature/auth-thread' },
      },
    });

    expect(workspaceService.provision).toHaveBeenCalledTimes(1);
    expect(prepared.preparation?.workspace).toEqual({
      workspaceId: 'ws-123',
      path: '/tmp/ws-123',
      repo: 'acme/auth-service',
      branch: 'feature/auth-thread',
    });
  });
});

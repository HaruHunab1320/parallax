import type { ThreadEvent, ThreadHandle } from '@parallaxai/runtime-interface';
import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SharedDecisionService } from '../shared-decision.service';

const logger = pino({ level: 'silent' });

describe('SharedDecisionService', () => {
  const repository = {
    create: vi.fn(),
    findAll: vi.fn(),
    findLatestForThreadCategory: vi.fn(),
  };

  const thread: ThreadHandle = {
    id: 'thread-1',
    executionId: 'exec-1',
    runtimeName: 'local',
    agentType: 'claude',
    role: 'engineer',
    status: 'completed',
    objective: 'Implement auth flow',
    createdAt: new Date('2026-03-12T00:00:00Z'),
    updatedAt: new Date('2026-03-12T00:00:00Z'),
    summary: 'Implemented login form and callbacks.',
    completion: {
      state: 'complete',
      summary: 'Implemented login flow and opened PR.',
      artifacts: [{ type: 'pr', value: 'https://example.com/pr/1' }],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    repository.create.mockResolvedValue({});
    repository.findLatestForThreadCategory.mockResolvedValue(null);
  });

  it('captures completion outcomes with artifact context', async () => {
    const service = new SharedDecisionService(repository as any, logger);
    const event: ThreadEvent = {
      threadId: thread.id,
      executionId: thread.executionId,
      type: 'thread_completed',
      timestamp: new Date(),
      data: { summary: 'Implemented login flow and opened PR.' },
    };

    await service.projectThreadEvent(thread, event);

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'completion_outcome',
        summary: expect.stringContaining(
          'Artifacts: pr:https://example.com/pr/1'
        ),
      })
    );
  });

  it('deduplicates semantically equivalent summaries', async () => {
    const service = new SharedDecisionService(repository as any, logger);
    repository.findLatestForThreadCategory.mockResolvedValue({
      id: 'decision-1',
      executionId: thread.executionId,
      threadId: thread.id,
      category: 'failure_recovery',
      summary: 'Agent failed due to merge conflict while updating auth files',
      details: null,
      createdAt: new Date(),
    });

    const event: ThreadEvent = {
      threadId: thread.id,
      executionId: thread.executionId,
      type: 'thread_failed',
      timestamp: new Date(),
      data: {
        error: 'Agent failed due to merge conflict while updating auth files.',
      },
    };

    await service.projectThreadEvent(thread, event);

    expect(repository.create).not.toHaveBeenCalled();
  });

  it('records turn summaries separately from completion outcomes', async () => {
    const service = new SharedDecisionService(repository as any, logger);
    const event: ThreadEvent = {
      threadId: thread.id,
      executionId: thread.executionId,
      type: 'thread_turn_complete',
      timestamp: new Date(),
      data: { summary: 'Auth callback handler wired and validated.' },
    };

    await service.projectThreadEvent(thread, event);

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'thread_summary',
        summary: 'Auth callback handler wired and validated.',
      })
    );
  });
});

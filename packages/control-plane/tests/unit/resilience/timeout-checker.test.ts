import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionRepository } from '@/db/repositories/execution.repository';
import { TimeoutChecker } from '@/resilience/timeout-checker';

const logger = pino({ level: 'silent' });

function createMockRepo(): ExecutionRepository {
  return {
    findTimedOutExecutions: vi.fn().mockResolvedValue([]),
    updateStatus: vi.fn().mockResolvedValue({}),
    addEvent: vi.fn().mockResolvedValue({}),
  } as unknown as ExecutionRepository;
}

function makeTimedOutExecution(overrides: Record<string, any> = {}) {
  return {
    id: `exec-${Math.random().toString(36).slice(2, 8)}`,
    status: 'running',
    startedAt: new Date(Date.now() - 600000),
    timeoutMs: 300000,
    ...overrides,
  };
}

describe('TimeoutChecker', () => {
  let checker: TimeoutChecker;
  let repo: ExecutionRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = createMockRepo();
  });

  afterEach(() => {
    checker?.stop();
    vi.useRealTimers();
  });

  describe('start/stop', () => {
    it('start() creates interval, stop() clears it', () => {
      checker = new TimeoutChecker(repo, logger, { checkIntervalMs: 5000 });

      checker.start();
      // Advance timer and verify check was called
      vi.advanceTimersByTime(5000);
      expect(repo.findTimedOutExecutions).toHaveBeenCalled();

      checker.stop();
      vi.mocked(repo.findTimedOutExecutions).mockClear();

      // Advance again - no more calls
      vi.advanceTimersByTime(10000);
      expect(repo.findTimedOutExecutions).not.toHaveBeenCalled();
    });
  });

  describe('check', () => {
    it('finds timed-out executions and marks them as failed', async () => {
      const timedOut = [
        makeTimedOutExecution({ id: 'exec-1', timeoutMs: 300000 }),
        makeTimedOutExecution({ id: 'exec-2', timeoutMs: null }),
      ];
      vi.mocked(repo.findTimedOutExecutions).mockResolvedValue(timedOut);

      checker = new TimeoutChecker(repo, logger, { defaultTimeoutMs: 300000 });

      const count = await checker.check();

      expect(count).toBe(2);
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'exec-1',
        'failed',
        expect.objectContaining({
          error: expect.stringContaining('timed out'),
        })
      );
      expect(repo.addEvent).toHaveBeenCalledWith(
        'exec-1',
        expect.objectContaining({
          type: 'timeout',
          data: expect.objectContaining({ timeoutMs: 300000 }),
        })
      );
    });

    it('returns 0 when no timed-out executions found', async () => {
      vi.mocked(repo.findTimedOutExecutions).mockResolvedValue([]);
      checker = new TimeoutChecker(repo, logger);

      const count = await checker.check();
      expect(count).toBe(0);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('skips check entirely when isLeader() returns false', async () => {
      checker = new TimeoutChecker(repo, logger, { isLeader: () => false });

      const count = await checker.check();

      expect(count).toBe(0);
      expect(repo.findTimedOutExecutions).not.toHaveBeenCalled();
    });

    it('logs and returns 0 on error', async () => {
      vi.mocked(repo.findTimedOutExecutions).mockRejectedValue(
        new Error('DB down')
      );
      checker = new TimeoutChecker(repo, logger);

      const count = await checker.check();
      expect(count).toBe(0);
    });
  });
});

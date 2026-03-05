import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import pino from 'pino';
import { GracefulShutdownHandler } from '@/resilience/graceful-shutdown';
import type { ExecutionRepository } from '@/db/repositories/execution.repository';

const logger = pino({ level: 'silent' });

function createMockRepo(): ExecutionRepository {
  return {
    updateStatus: vi.fn().mockResolvedValue({}),
    addEvent: vi.fn().mockResolvedValue({}),
    findOrphanedExecutions: vi.fn().mockResolvedValue([]),
    markOrphaned: vi.fn().mockResolvedValue({}),
  } as unknown as ExecutionRepository;
}

function createMockPatternEngine(inFlightIds: string[] = []) {
  let ids = [...inFlightIds];
  return {
    setShuttingDown: vi.fn(),
    getInFlightExecutionIds: vi.fn(() => ids),
    // Helper to simulate executions completing
    _completeAll: () => {
      ids = [];
    },
    _completeOne: (id: string) => {
      ids = ids.filter((i) => i !== id);
    },
  };
}

describe('GracefulShutdownHandler', () => {
  let handler: GracefulShutdownHandler;
  let repo: ExecutionRepository;

  beforeEach(() => {
    vi.useFakeTimers();
    repo = createMockRepo();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('shutdown', () => {
    it('completes immediately when no in-flight executions', async () => {
      const engine = createMockPatternEngine([]);
      handler = new GracefulShutdownHandler(repo, 'node-1', logger, engine);

      await handler.shutdown();

      expect(engine.setShuttingDown).toHaveBeenCalledWith(true);
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('waits for in-flight executions to complete before timeout', async () => {
      const engine = createMockPatternEngine(['exec-1', 'exec-2']);
      handler = new GracefulShutdownHandler(repo, 'node-1', logger, engine, {
        drainTimeoutMs: 5000,
        pollIntervalMs: 100,
      });

      const shutdownPromise = handler.shutdown();

      // Simulate executions completing after some polls
      await vi.advanceTimersByTimeAsync(200);
      engine._completeAll();
      await vi.advanceTimersByTimeAsync(200);

      await shutdownPromise;

      expect(engine.setShuttingDown).toHaveBeenCalledWith(true);
      // No force-fail since executions completed in time
      expect(repo.updateStatus).not.toHaveBeenCalled();
    });

    it('force-fails remaining executions after drain timeout', async () => {
      const engine = createMockPatternEngine(['exec-1', 'exec-2']);
      // Never complete the executions
      handler = new GracefulShutdownHandler(repo, 'node-1', logger, engine, {
        drainTimeoutMs: 1000,
        pollIntervalMs: 100,
      });

      const shutdownPromise = handler.shutdown();

      // Advance past drain timeout
      await vi.advanceTimersByTimeAsync(1500);

      await shutdownPromise;

      expect(engine.setShuttingDown).toHaveBeenCalledWith(true);
      expect(repo.updateStatus).toHaveBeenCalledTimes(2);
      expect(repo.updateStatus).toHaveBeenCalledWith(
        'exec-1',
        'failed',
        expect.objectContaining({
          error: expect.stringContaining('shutdown'),
        })
      );
      expect(repo.addEvent).toHaveBeenCalledWith(
        'exec-1',
        expect.objectContaining({
          type: 'force_failed',
          data: expect.objectContaining({
            reason: 'graceful_shutdown',
            nodeId: 'node-1',
          }),
        })
      );
    });

    it('calls setShuttingDown(true) at start', async () => {
      const engine = createMockPatternEngine([]);
      handler = new GracefulShutdownHandler(repo, 'node-1', logger, engine);

      await handler.shutdown();

      expect(engine.setShuttingDown).toHaveBeenCalledWith(true);
      // Should be the first call
      expect(engine.setShuttingDown.mock.invocationCallOrder[0]).toBeLessThan(
        engine.getInFlightExecutionIds.mock.invocationCallOrder[0]
      );
    });

    it('cleans up DB-level stuck executions', async () => {
      // Must have in-flight executions to reach the DB cleanup code path
      // (no in-flight → early return before DB cleanup)
      const engine = createMockPatternEngine(['exec-inflight']);
      const stuckExecs = [
        { id: 'stuck-1', status: 'running' },
        { id: 'stuck-2', status: 'pending' },
      ];
      vi.mocked(repo.findOrphanedExecutions).mockResolvedValue(stuckExecs);

      handler = new GracefulShutdownHandler(repo, 'node-1', logger, engine, {
        drainTimeoutMs: 500,
        pollIntervalMs: 100,
      });

      const shutdownPromise = handler.shutdown();

      // Let the in-flight execution complete so we reach DB cleanup
      await vi.advanceTimersByTimeAsync(100);
      engine._completeAll();
      await vi.advanceTimersByTimeAsync(200);

      await shutdownPromise;

      expect(repo.findOrphanedExecutions).toHaveBeenCalledWith('node-1');
      expect(repo.markOrphaned).toHaveBeenCalledTimes(2);
      expect(repo.markOrphaned).toHaveBeenCalledWith(
        'stuck-1',
        expect.stringContaining('node-1')
      );
    });
  });
});

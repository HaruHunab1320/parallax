import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';
import { StartupRecoveryService } from '@/resilience/startup-recovery';
import type { ExecutionRepository } from '@/db/repositories/execution.repository';

const logger = pino({ level: 'silent' });

function createMockRepo(): ExecutionRepository {
  return {
    findOrphanedExecutions: vi.fn().mockResolvedValue([]),
    markOrphaned: vi.fn().mockResolvedValue({}),
    addEvent: vi.fn().mockResolvedValue({}),
  } as unknown as ExecutionRepository;
}

function makeExecution(overrides: Record<string, any> = {}) {
  return {
    id: `exec-${Math.random().toString(36).slice(2, 8)}`,
    status: 'running',
    nodeId: 'node-1',
    ...overrides,
  };
}

describe('StartupRecoveryService', () => {
  let service: StartupRecoveryService;
  let repo: ExecutionRepository;

  beforeEach(() => {
    repo = createMockRepo();
    service = new StartupRecoveryService(repo, 'node-1', logger);
  });

  describe('recoverOrphanedExecutions', () => {
    it('returns 0 when no orphans found', async () => {
      vi.mocked(repo.findOrphanedExecutions).mockResolvedValue([]);

      const result = await service.recoverOrphanedExecutions();

      expect(result).toBe(0);
      expect(repo.findOrphanedExecutions).toHaveBeenCalledWith('node-1');
      expect(repo.markOrphaned).not.toHaveBeenCalled();
    });

    it('marks each orphan as failed and adds orphan_recovered event', async () => {
      const orphans = [
        makeExecution({ id: 'exec-1', status: 'running' }),
        makeExecution({ id: 'exec-2', status: 'pending' }),
      ];
      vi.mocked(repo.findOrphanedExecutions).mockResolvedValue(orphans);

      const result = await service.recoverOrphanedExecutions();

      expect(result).toBe(2);
      expect(repo.markOrphaned).toHaveBeenCalledTimes(2);
      expect(repo.markOrphaned).toHaveBeenCalledWith(
        'exec-1',
        expect.stringContaining('node-1')
      );

      expect(repo.addEvent).toHaveBeenCalledTimes(2);
      expect(repo.addEvent).toHaveBeenCalledWith(
        'exec-1',
        expect.objectContaining({
          type: 'orphan_recovered',
          data: expect.objectContaining({
            previousStatus: 'running',
            nodeId: 'node-1',
          }),
        })
      );
    });

    it('continues recovering others when one execution fails', async () => {
      const orphans = [
        makeExecution({ id: 'exec-ok' }),
        makeExecution({ id: 'exec-fail' }),
        makeExecution({ id: 'exec-ok2' }),
      ];
      vi.mocked(repo.findOrphanedExecutions).mockResolvedValue(orphans);
      vi.mocked(repo.markOrphaned)
        .mockResolvedValueOnce({} as any) // exec-ok succeeds
        .mockRejectedValueOnce(new Error('DB error')) // exec-fail errors
        .mockResolvedValueOnce({} as any); // exec-ok2 succeeds

      const result = await service.recoverOrphanedExecutions();

      expect(result).toBe(2); // Two succeeded
      expect(repo.markOrphaned).toHaveBeenCalledTimes(3);
    });
  });

  describe('recoverAllOrphanedExecutions', () => {
    it('calls findOrphanedExecutions without nodeId', async () => {
      vi.mocked(repo.findOrphanedExecutions).mockResolvedValue([]);

      await service.recoverAllOrphanedExecutions();

      expect(repo.findOrphanedExecutions).toHaveBeenCalledWith();
    });

    it('recovers orphans from all nodes', async () => {
      const orphans = [
        makeExecution({ id: 'exec-a', nodeId: 'node-2' }),
        makeExecution({ id: 'exec-b', nodeId: null }),
      ];
      vi.mocked(repo.findOrphanedExecutions).mockResolvedValue(orphans);

      const result = await service.recoverAllOrphanedExecutions();

      expect(result).toBe(2);
      expect(repo.markOrphaned).toHaveBeenCalledTimes(2);
      expect(repo.addEvent).toHaveBeenCalledWith(
        'exec-a',
        expect.objectContaining({
          type: 'orphan_recovered',
          data: expect.objectContaining({
            originalNodeId: 'node-2',
            recoveredByNodeId: 'node-1',
          }),
        })
      );
    });
  });
});

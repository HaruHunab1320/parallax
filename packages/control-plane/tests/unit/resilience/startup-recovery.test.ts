import pino from 'pino';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionRepository } from '@/db/repositories/execution.repository';
import { StartupRecoveryService } from '@/resilience/startup-recovery';

const logger = pino({ level: 'silent' });

function createMockRepo(): ExecutionRepository {
  return {
    findOrphanedExecutions: vi.fn().mockResolvedValue([]),
    markOrphaned: vi.fn().mockResolvedValue(true),
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
        .mockResolvedValueOnce(true) // exec-ok succeeds
        .mockRejectedValueOnce(new Error('DB error')) // exec-fail errors
        .mockResolvedValueOnce(true); // exec-ok2 succeeds

      const result = await service.recoverOrphanedExecutions();

      expect(result).toBe(2); // Two succeeded
      expect(repo.markOrphaned).toHaveBeenCalledTimes(3);
    });
  });

  it('does not record recovery after a concurrent completion', async () => {
    vi.mocked(repo.findOrphanedExecutions).mockResolvedValue([makeExecution()]);
    vi.mocked(repo.markOrphaned).mockResolvedValue(false);
    expect(await service.recoverOrphanedExecutions()).toBe(0);
    expect(repo.addEvent).not.toHaveBeenCalled();
  });

  describe('recoverAllOrphanedExecutions', () => {
    it('does nothing on leadership change without proof of dead owners', async () => {
      vi.mocked(repo.findOrphanedExecutions).mockResolvedValue([]);

      await service.recoverAllOrphanedExecutions();

      expect(repo.findOrphanedExecutions).not.toHaveBeenCalled();
    });

    it('recovers only confirmed dead owners and ignores healthy/unowned records', async () => {
      const orphans = [
        makeExecution({ id: 'exec-a', nodeId: 'node-2' }),
        makeExecution({ id: 'exec-b', nodeId: null }),
        makeExecution({ id: 'exec-healthy', nodeId: 'node-3' }),
      ];
      vi.mocked(repo.findOrphanedExecutions).mockResolvedValue(orphans);

      const result = await service.recoverAllOrphanedExecutions(['node-2']);

      expect(result).toBe(1);
      expect(repo.markOrphaned).toHaveBeenCalledTimes(1);
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

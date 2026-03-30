/**
 * Unit tests for K8sRuntime thread operations
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock @kubernetes/client-node ────────────────────────────────────────

const {
  mockCoreApi,
  mockCustomApi,
  mockKubeConfig,
  MockCoreV1Api,
  MockCustomObjectsApi,
  uuidState,
} = vi.hoisted(() => {
  const mockCoreApi = {
    listNamespace: vi.fn(),
    readNamespace: vi.fn(),
    createNamespace: vi.fn(),
    listNamespacedPod: vi.fn(),
    readNamespacedPodLog: vi.fn(),
    readNamespacedPersistentVolumeClaim: vi.fn(),
    createNamespacedPersistentVolumeClaim: vi.fn(),
    deleteNamespacedPersistentVolumeClaim: vi.fn(),
  };

  const mockCustomApi = {
    createNamespacedCustomObject: vi.fn(),
    deleteNamespacedCustomObject: vi.fn(),
    getNamespacedCustomObject: vi.fn(),
    listNamespacedCustomObject: vi.fn(),
  };

  class MockCoreV1Api {}
  class MockCustomObjectsApi {}

  const mockKubeConfig = {
    loadFromDefault: vi.fn(),
    loadFromCluster: vi.fn(),
    loadFromFile: vi.fn(),
    makeApiClient: vi.fn((ApiClass: any) => {
      if (ApiClass === MockCoreV1Api) return mockCoreApi;
      if (ApiClass === MockCustomObjectsApi) return mockCustomApi;
      return {};
    }),
  };

  const uuidState = { counter: 0 };

  return { mockCoreApi, mockCustomApi, mockKubeConfig, MockCoreV1Api, MockCustomObjectsApi, uuidState };
});

vi.mock('@kubernetes/client-node', () => {
  class MockWatch {
    watch = vi.fn().mockResolvedValue(undefined);
  }
  return {
    KubeConfig: vi.fn(() => mockKubeConfig),
    CoreV1Api: MockCoreV1Api,
    CustomObjectsApi: MockCustomObjectsApi,
    Watch: MockWatch,
  };
});

vi.mock('uuid', () => ({
  v4: vi.fn(() => `thread-uuid-${++uuidState.counter}`),
}));

// ── Imports ─────────────────────────────────────────────────────────────

import { K8sRuntime } from '../k8s-runtime';
import type { SpawnThreadInput } from '@parallaxai/runtime-interface';
import type { Logger } from 'pino';

// ── Helpers ─────────────────────────────────────────────────────────────

function createMockLogger(): Logger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    trace: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function createRuntime(): K8sRuntime {
  return new K8sRuntime(createMockLogger());
}

function threadInput(overrides: Partial<SpawnThreadInput> = {}): SpawnThreadInput {
  return {
    executionId: 'exec-001',
    name: 'test-thread',
    agentType: 'claude',
    objective: 'Write tests',
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('K8sRuntime — Thread Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uuidState.counter = 0;
    mockCoreApi.listNamespace.mockResolvedValue({ items: [] });
    mockCoreApi.readNamespace.mockResolvedValue({});
    mockCoreApi.listNamespacedPod.mockResolvedValue({ items: [] });
    mockCustomApi.listNamespacedCustomObject.mockResolvedValue({ items: [] });
    mockCustomApi.createNamespacedCustomObject.mockResolvedValue({});
    mockCoreApi.readNamespacedPersistentVolumeClaim.mockResolvedValue({});
  });

  // ── spawnThread ────────────────────────────────────────────────────

  describe('spawnThread', () => {
    it('should return a ThreadHandle with correct fields', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawnThread(
        threadInput({ role: 'engineer' })
      );

      expect(handle.id).toBeTruthy();
      expect(handle.executionId).toBe('exec-001');
      expect(handle.runtimeName).toBe('kubernetes');
      expect(handle.agentType).toBe('claude');
      expect(handle.role).toBe('engineer');
      expect(handle.status).toBe('pending');
      expect(handle.objective).toBe('Write tests');
      expect(handle.createdAt).toBeInstanceOf(Date);
      expect(handle.updatedAt).toBeInstanceOf(Date);
    });

    it('should use provided thread id if set', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawnThread(
        threadInput({ id: 'my-thread-id' })
      );
      expect(handle.id).toBe('my-thread-id');
    });

    it('should spawn an underlying agent with PARALLAX env vars', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawnThread(threadInput());

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      const env = callArgs.body.spec.env as Array<{
        name: string;
        value: string;
      }>;
      const envMap = Object.fromEntries(env.map((e) => [e.name, e.value]));

      expect(envMap.PARALLAX_THREAD_ID).toBeTruthy();
      expect(envMap.PARALLAX_EXECUTION_ID).toBe('exec-001');
      expect(envMap.PARALLAX_OBJECTIVE).toBe('Write tests');
    });

    it('should set PARALLAX_ROLE env when role is provided', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawnThread(threadInput({ role: 'architect' }));

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      const env = callArgs.body.spec.env as Array<{
        name: string;
        value: string;
      }>;
      const envMap = Object.fromEntries(env.map((e) => [e.name, e.value]));

      expect(envMap.PARALLAX_ROLE).toBe('architect');
    });

    it('should merge custom env vars', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawnThread(
        threadInput({ env: { MY_VAR: 'custom' } })
      );

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      const env = callArgs.body.spec.env as Array<{
        name: string;
        value: string;
      }>;
      const envMap = Object.fromEntries(env.map((e) => [e.name, e.value]));

      expect(envMap.MY_VAR).toBe('custom');
    });

    it('should resolve agent type aliases', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawnThread(
        threadInput({ agentType: 'claude-code' })
      );

      // The thread should still say 'claude-code' for agentType
      expect(handle.agentType).toBe('claude-code');

      // But the underlying agent should be 'claude'
      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      expect(callArgs.body.spec.type).toBe('claude');
    });

    it('should map unknown agent types to custom', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawnThread(
        threadInput({ agentType: 'some-unknown-type' })
      );

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      expect(callArgs.body.spec.type).toBe('custom');
    });
  });

  // ── getThread ──────────────────────────────────────────────────────

  describe('getThread', () => {
    it('should return null for unknown thread with no agent', async () => {
      mockCustomApi.getNamespacedCustomObject.mockRejectedValue({
        statusCode: 404,
      });

      const runtime = createRuntime();
      await runtime.initialize();
      const result = await runtime.getThread('nonexistent');
      expect(result).toBeNull();
    });

    it('should return thread with updated status from agent', async () => {
      mockCustomApi.getNamespacedCustomObject.mockResolvedValue({
        status: { phase: 'Ready' },
      });

      const runtime = createRuntime();
      await runtime.initialize();
      const thread = await runtime.spawnThread(threadInput());

      const result = await runtime.getThread(thread.id);
      expect(result?.status).toBe('ready');
    });

    it('should mark thread as completed when agent is gone', async () => {
      mockCustomApi.getNamespacedCustomObject.mockRejectedValue({
        statusCode: 404,
      });

      const runtime = createRuntime();
      await runtime.initialize();
      const thread = await runtime.spawnThread(threadInput());

      const result = await runtime.getThread(thread.id);
      expect(result?.status).toBe('completed');
    });
  });

  // ── listThreads ────────────────────────────────────────────────────

  describe('listThreads', () => {
    it('should return all threads when no filter', async () => {
      mockCustomApi.getNamespacedCustomObject.mockResolvedValue({
        status: { phase: 'Ready' },
      });

      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawnThread(threadInput({ name: 't1' }));
      await runtime.spawnThread(threadInput({ name: 't2' }));

      const threads = await runtime.listThreads();
      expect(threads).toHaveLength(2);
    });

    it('should filter by executionId', async () => {
      mockCustomApi.getNamespacedCustomObject.mockResolvedValue({
        status: { phase: 'Ready' },
      });

      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawnThread(
        threadInput({ executionId: 'exec-A', name: 't1' })
      );
      await runtime.spawnThread(
        threadInput({ executionId: 'exec-B', name: 't2' })
      );

      const threads = await runtime.listThreads({ executionId: 'exec-A' });
      expect(threads).toHaveLength(1);
    });

    it('should filter by role', async () => {
      mockCustomApi.getNamespacedCustomObject.mockResolvedValue({
        status: { phase: 'Ready' },
      });

      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawnThread(threadInput({ role: 'engineer', name: 't1' }));
      await runtime.spawnThread(threadInput({ role: 'qa', name: 't2' }));

      const threads = await runtime.listThreads({ role: 'qa' });
      expect(threads).toHaveLength(1);
    });

    it('should filter by status', async () => {
      mockCustomApi.getNamespacedCustomObject.mockResolvedValue({
        status: { phase: 'Ready' },
      });

      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawnThread(threadInput({ name: 't1' }));
      await runtime.spawnThread(threadInput({ name: 't2' }));

      const threads = await runtime.listThreads({ status: 'ready' });
      expect(threads).toHaveLength(2);
    });
  });

  // ── stopThread ─────────────────────────────────────────────────────

  describe('stopThread', () => {
    it('should stop the underlying agent', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const thread = await runtime.spawnThread(threadInput());

      await runtime.stopThread(thread.id);

      expect(
        mockCustomApi.deleteNamespacedCustomObject
      ).toHaveBeenCalled();
    });

    it('should mark thread as completed', async () => {
      mockCustomApi.getNamespacedCustomObject.mockRejectedValue({
        statusCode: 404,
      });

      const runtime = createRuntime();
      await runtime.initialize();
      const thread = await runtime.spawnThread(threadInput());

      await runtime.stopThread(thread.id);

      // Thread should be removed from internal map
      const threads = await runtime.listThreads();
      expect(threads).toHaveLength(0);
    });

    it('should not throw even if agent stop fails', async () => {
      mockCustomApi.deleteNamespacedCustomObject.mockRejectedValue(
        new Error('internal error')
      );

      const runtime = createRuntime();
      await runtime.initialize();
      const thread = await runtime.spawnThread(threadInput());

      await expect(
        runtime.stopThread(thread.id)
      ).resolves.not.toThrow();
    });
  });

  // ── agentStatusToThreadStatus mapping ──────────────────────────────

  describe('agentStatusToThreadStatus (via getThread)', () => {
    const mappings: Array<{ phase: string; expected: string }> = [
      { phase: 'Pending', expected: 'pending' },
      { phase: 'Starting', expected: 'starting' },
      { phase: 'Authenticating', expected: 'preparing' },
      { phase: 'Ready', expected: 'ready' },
      { phase: 'Stopping', expected: 'completed' },
      { phase: 'Stopped', expected: 'completed' },
      { phase: 'Error', expected: 'completed' },
    ];

    for (const { phase, expected } of mappings) {
      it(`should map agent phase "${phase}" to thread status "${expected}"`, async () => {
        mockCustomApi.getNamespacedCustomObject.mockResolvedValue({
          status: { phase },
        });

        const runtime = createRuntime();
        await runtime.initialize();
        const thread = await runtime.spawnThread(threadInput());
        const result = await runtime.getThread(thread.id);
        expect(result?.status).toBe(expected);
      });
    }
  });
});

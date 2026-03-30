/**
 * Unit tests for K8sRuntime
 */

import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mock @kubernetes/client-node before any imports ─────────────────────

// These must be declared with vi.hoisted so they're available inside vi.mock factories
const {
  mockCoreApi,
  mockCustomApi,
  mockKubeConfig,
  MockCoreV1Api,
  MockCustomObjectsApi,
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

  return { mockCoreApi, mockCustomApi, mockKubeConfig, MockCoreV1Api, MockCustomObjectsApi };
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
  v4: vi.fn(() => 'test-uuid-1234-5678-abcd-ef0123456789'),
}));

// ── Now import the runtime ──────────────────────────────────────────────

import { K8sRuntime, type K8sRuntimeOptions } from '../k8s-runtime';
import type { AgentConfig } from '@parallaxai/runtime-interface';
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

function createRuntime(options: K8sRuntimeOptions = {}): K8sRuntime {
  return new K8sRuntime(createMockLogger(), options);
}

function baseConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    name: 'test-agent',
    type: 'claude',
    capabilities: ['code'],
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('K8sRuntime', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: cluster connection succeeds
    mockCoreApi.listNamespace.mockResolvedValue({ items: [] });
    // Default: namespace exists
    mockCoreApi.readNamespace.mockResolvedValue({});
    // Default: list pods returns empty
    mockCoreApi.listNamespacedPod.mockResolvedValue({ items: [] });
    // Default: list custom objects returns empty
    mockCustomApi.listNamespacedCustomObject.mockResolvedValue({ items: [] });
    // Default: create custom object succeeds
    mockCustomApi.createNamespacedCustomObject.mockResolvedValue({});
  });

  // ── Construction & Configuration ───────────────────────────────────

  describe('construction', () => {
    it('should set name and type', () => {
      const runtime = createRuntime();
      expect(runtime.name).toBe('kubernetes');
      expect(runtime.type).toBe('kubernetes');
    });

    it('should load kubeconfig from default when no options', () => {
      createRuntime();
      expect(mockKubeConfig.loadFromDefault).toHaveBeenCalled();
    });

    it('should load kubeconfig from cluster when inCluster is true', () => {
      createRuntime({ inCluster: true });
      expect(mockKubeConfig.loadFromCluster).toHaveBeenCalled();
      expect(mockKubeConfig.loadFromDefault).not.toHaveBeenCalled();
    });

    it('should load kubeconfig from file when kubeconfigPath is provided', () => {
      createRuntime({ kubeconfigPath: '/path/to/kubeconfig' });
      expect(mockKubeConfig.loadFromFile).toHaveBeenCalledWith(
        '/path/to/kubeconfig'
      );
    });

    it('should create CoreV1Api and CustomObjectsApi clients', () => {
      createRuntime();
      expect(mockKubeConfig.makeApiClient).toHaveBeenCalledWith(
        MockCoreV1Api
      );
      expect(mockKubeConfig.makeApiClient).toHaveBeenCalledWith(
        MockCustomObjectsApi
      );
    });
  });

  // ── Initialization ─────────────────────────────────────────────────

  describe('initialize', () => {
    it('should verify cluster connection', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      expect(mockCoreApi.listNamespace).toHaveBeenCalled();
    });

    it('should throw if cluster is unreachable', async () => {
      mockCoreApi.listNamespace.mockRejectedValue(
        new Error('connect ECONNREFUSED')
      );
      const runtime = createRuntime();
      await expect(runtime.initialize()).rejects.toThrow(
        'Cannot connect to Kubernetes cluster'
      );
    });

    it('should ensure namespace exists', async () => {
      const runtime = createRuntime({ namespace: 'my-ns' });
      await runtime.initialize();
      expect(mockCoreApi.readNamespace).toHaveBeenCalledWith({
        name: 'my-ns',
      });
    });

    it('should create namespace if it does not exist', async () => {
      mockCoreApi.readNamespace.mockRejectedValue({ statusCode: 404 });
      const runtime = createRuntime({ namespace: 'new-ns' });
      await runtime.initialize();
      expect(mockCoreApi.createNamespace).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            metadata: expect.objectContaining({
              name: 'new-ns',
              labels: { 'parallax.ai/managed': 'true' },
            }),
          }),
        })
      );
    });

    it('should be idempotent (no-op on second call)', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.initialize();
      expect(mockCoreApi.listNamespace).toHaveBeenCalledTimes(1);
    });
  });

  // ── Spawn ──────────────────────────────────────────────────────────

  describe('spawn', () => {
    it('should auto-initialize if not yet initialized', async () => {
      const runtime = createRuntime();
      await runtime.spawn(baseConfig());
      expect(mockCoreApi.listNamespace).toHaveBeenCalled();
    });

    it('should create a CRD resource via customApi', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig());
      expect(
        mockCustomApi.createNamespacedCustomObject
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'parallax.ai',
          version: 'v1',
          plural: 'parallaxagents',
        })
      );
    });

    it('should return an AgentHandle with correct fields', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(
        baseConfig({ name: 'my-agent', type: 'gemini', capabilities: ['test'] })
      );

      expect(handle.id).toBe('test-uuid-1234-5678-abcd-ef0123456789');
      expect(handle.name).toBe('my-agent');
      expect(handle.type).toBe('gemini');
      expect(handle.status).toBe('pending');
      expect(handle.capabilities).toEqual(['test']);
      expect(handle.podName).toBe('agent-test-uui');
      expect(handle.startedAt).toBeInstanceOf(Date);
    });

    it('should use provided id if present in config', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(
        baseConfig({ id: 'custom-id-abc' })
      );
      expect(handle.id).toBe('custom-id-abc');
      expect(handle.podName).toBe('agent-custom-i');
    });

    it('should emit agent_started event', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const listener = vi.fn();
      runtime.on('agent_started', listener);

      await runtime.spawn(baseConfig());
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'pending' })
      );
    });

    it('should include image prefix in resource when configured', async () => {
      const runtime = createRuntime({ imagePrefix: 'gcr.io/my-project' });
      await runtime.initialize();
      await runtime.spawn(baseConfig({ type: 'claude' }));

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      const body = callArgs.body;
      expect(body.spec.image).toBe(
        'gcr.io/my-project/parallax/agent-claude:latest'
      );
    });

    it('should set default resource limits', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig());

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      expect(callArgs.body.spec.resources).toEqual({
        cpu: '1',
        memory: '2Gi',
      });
    });

    it('should use custom resource limits from options', async () => {
      const runtime = createRuntime({
        defaultResources: { cpu: '500m', memory: '1Gi' },
      });
      await runtime.initialize();
      await runtime.spawn(baseConfig());

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      expect(callArgs.body.spec.resources).toEqual({
        cpu: '500m',
        memory: '1Gi',
      });
    });

    it('should use per-agent resource limits over defaults', async () => {
      const runtime = createRuntime({
        defaultResources: { cpu: '500m', memory: '1Gi' },
      });
      await runtime.initialize();
      await runtime.spawn(
        baseConfig({ resources: { cpu: '2', memory: '4Gi' } })
      );

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      expect(callArgs.body.spec.resources).toEqual({
        cpu: '2',
        memory: '4Gi',
      });
    });

    it('should set execution-id label and env when executionId provided', async () => {
      mockCoreApi.readNamespacedPersistentVolumeClaim.mockResolvedValue({});
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig({ executionId: 'exec-123' }));

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      expect(
        callArgs.body.metadata.labels['parallax.ai/execution-id']
      ).toBe('exec-123');
      const envNames = callArgs.body.spec.env.map(
        (e: { name: string }) => e.name
      );
      expect(envNames).toContain('PARALLAX_EXECUTION_ID');
    });

    it('should ensure shared auth PVC when executionId is provided', async () => {
      mockCoreApi.readNamespacedPersistentVolumeClaim.mockResolvedValue({});
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig({ executionId: 'exec-abc' }));

      expect(
        mockCoreApi.readNamespacedPersistentVolumeClaim
      ).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'parallax-auth-exec-abc' })
      );
    });

    it('should create shared auth PVC if it does not exist', async () => {
      mockCoreApi.readNamespacedPersistentVolumeClaim.mockRejectedValue({
        statusCode: 404,
      });
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig({ executionId: 'exec-new' }));

      expect(
        mockCoreApi.createNamespacedPersistentVolumeClaim
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          body: expect.objectContaining({
            metadata: expect.objectContaining({
              name: 'parallax-auth-exec-new',
            }),
          }),
        })
      );
    });

    it('should build correct env array with all standard vars', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(
        baseConfig({
          id: 'a1',
          name: 'bot',
          type: 'codex',
          role: 'engineer',
          capabilities: ['debug'],
          env: { CUSTOM_VAR: 'hello' },
        })
      );

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      const env = callArgs.body.spec.env as Array<{
        name: string;
        value: string;
      }>;
      const envMap = Object.fromEntries(env.map((e) => [e.name, e.value]));

      expect(envMap.AGENT_ID).toBe('a1');
      expect(envMap.AGENT_NAME).toBe('bot');
      expect(envMap.AGENT_TYPE).toBe('codex');
      expect(envMap.AGENT_ROLE).toBe('engineer');
      expect(envMap.AGENT_CAPABILITIES).toBe('["debug"]');
      expect(envMap.CUSTOM_VAR).toBe('hello');
    });

    it('should use custom image for custom type with AGENT_IMAGE env', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(
        baseConfig({
          type: 'custom',
          env: { AGENT_IMAGE: 'my-registry/my-agent:v1' },
        })
      );

      const callArgs =
        mockCustomApi.createNamespacedCustomObject.mock.calls[0][0];
      expect(callArgs.body.spec.image).toBe('my-registry/my-agent:v1');
    });
  });

  // ── Stop ───────────────────────────────────────────────────────────

  describe('stop', () => {
    it('should delete the CRD resource', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      await runtime.stop(handle.id);

      expect(
        mockCustomApi.deleteNamespacedCustomObject
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          group: 'parallax.ai',
          version: 'v1',
          plural: 'parallaxagents',
          name: handle.podName,
        })
      );
    });

    it('should throw if agent not found', async () => {
      const runtime = createRuntime();
      await expect(runtime.stop('nonexistent')).rejects.toThrow(
        'Agent nonexistent not found'
      );
    });

    it('should use gracePeriodSeconds=0 for force stop', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      await runtime.stop(handle.id, { force: true });

      expect(
        mockCustomApi.deleteNamespacedCustomObject
      ).toHaveBeenCalledWith(
        expect.objectContaining({ gracePeriodSeconds: 0 })
      );
    });

    it('should convert timeout ms to seconds for gracePeriodSeconds', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      await runtime.stop(handle.id, { timeout: 60000 });

      expect(
        mockCustomApi.deleteNamespacedCustomObject
      ).toHaveBeenCalledWith(
        expect.objectContaining({ gracePeriodSeconds: 60 })
      );
    });

    it('should emit agent_stopped event', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());
      const listener = vi.fn();
      runtime.on('agent_stopped', listener);

      await runtime.stop(handle.id);
      expect(listener).toHaveBeenCalledWith(
        expect.objectContaining({ id: handle.id, status: 'stopped' }),
        'stopped'
      );
    });

    it('should remove agent from internal map after stop', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());
      await runtime.stop(handle.id);

      const result = await runtime.get(handle.id);
      expect(result).toBeNull();
    });

    it('should ignore 404 errors (already deleted)', async () => {
      mockCustomApi.deleteNamespacedCustomObject.mockRejectedValue({
        statusCode: 404,
      });
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      await expect(runtime.stop(handle.id)).resolves.not.toThrow();
    });
  });

  // ── Restart ────────────────────────────────────────────────────────

  describe('restart', () => {
    it('should stop and then re-spawn with same config', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const config = baseConfig({ name: 'restartable' });
      const handle = await runtime.spawn(config);

      // Need a fresh uuid for the re-spawned agent
      const { v4 } = await import('uuid');
      (v4 as any).mockReturnValueOnce('new-uuid-after-restart-1234567890');

      const newHandle = await runtime.restart(handle.id);
      expect(newHandle.name).toBe('restartable');
      expect(newHandle.id).toBe('new-uuid-after-restart-1234567890');
    });

    it('should throw if agent not found', async () => {
      const runtime = createRuntime();
      await expect(runtime.restart('nonexistent')).rejects.toThrow(
        'Agent nonexistent not found'
      );
    });
  });

  // ── Get ────────────────────────────────────────────────────────────

  describe('get', () => {
    it('should return null for unknown agent', async () => {
      const runtime = createRuntime();
      const result = await runtime.get('unknown');
      expect(result).toBeNull();
    });

    it('should fetch and update status from K8s', async () => {
      mockCustomApi.getNamespacedCustomObject.mockResolvedValue({
        status: { phase: 'Ready', endpoint: 'http://svc:8080' },
      });

      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      const result = await runtime.get(handle.id);
      expect(result?.status).toBe('ready');
      expect(result?.endpoint).toBe('http://svc:8080');
    });

    it('should return null and cleanup if K8s resource is 404', async () => {
      mockCustomApi.getNamespacedCustomObject.mockRejectedValue({
        statusCode: 404,
      });

      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      const result = await runtime.get(handle.id);
      expect(result).toBeNull();
    });
  });

  // ── List ───────────────────────────────────────────────────────────

  describe('list', () => {
    it('should return all agents when no filter', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig({ id: 'id-a1', name: 'a1' }));
      await runtime.spawn(baseConfig({ id: 'id-a2', name: 'a2' }));

      const agents = await runtime.list();
      expect(agents).toHaveLength(2);
    });

    it('should filter by status', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const h1 = await runtime.spawn(baseConfig({ id: 'id-a1', name: 'a1' }));
      await runtime.spawn(baseConfig({ id: 'id-a2', name: 'a2' }));

      // Manually set one to ready for test
      h1.status = 'ready';

      const agents = await runtime.list({ status: 'ready' });
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('a1');
    });

    it('should filter by type', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig({ id: 'id-c1', name: 'c1', type: 'claude' }));
      await runtime.spawn(baseConfig({ id: 'id-g1', name: 'g1', type: 'gemini' }));

      const agents = await runtime.list({ type: 'gemini' });
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('g1');
    });

    it('should filter by role', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig({ id: 'id-eng', name: 'eng', role: 'engineer' }));
      await runtime.spawn(baseConfig({ id: 'id-qa', name: 'qa', role: 'qa' }));

      const agents = await runtime.list({ role: 'engineer' });
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('eng');
    });

    it('should filter by capabilities', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(
        baseConfig({ id: 'id-full', name: 'full', capabilities: ['code', 'debug'] })
      );
      await runtime.spawn(
        baseConfig({ id: 'id-basic', name: 'basic', capabilities: ['code'] })
      );

      const agents = await runtime.list({
        capabilities: ['code', 'debug'],
      });
      expect(agents).toHaveLength(1);
      expect(agents[0].name).toBe('full');
    });
  });

  // ── Send ───────────────────────────────────────────────────────────

  describe('send', () => {
    it('should throw if agent not found', async () => {
      const runtime = createRuntime();
      await expect(runtime.send('missing', 'hello')).rejects.toThrow(
        'Agent missing not found'
      );
    });

    it('should throw if agent has no endpoint', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      await expect(runtime.send(handle.id, 'hello')).rejects.toThrow(
        'has no endpoint'
      );
    });
  });

  // ── Health Check ───────────────────────────────────────────────────

  describe('healthCheck', () => {
    it('should return healthy when K8s is reachable', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      mockCoreApi.listNamespacedPod.mockResolvedValue({ items: [] });

      const result = await runtime.healthCheck();
      expect(result.healthy).toBe(true);
      expect(result.message).toContain('K8s runtime healthy');
    });

    it('should count ready agents in message', async () => {
      const runtime = createRuntime();
      await runtime.initialize();

      const h1 = await runtime.spawn(baseConfig({ id: 'id-h1', name: 'a1' }));
      await runtime.spawn(baseConfig({ id: 'id-h2', name: 'a2' }));
      h1.status = 'ready';

      const result = await runtime.healthCheck();
      expect(result.message).toContain('1/2 agents ready');
    });

    it('should return unhealthy when K8s is unreachable', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      mockCoreApi.listNamespacedPod.mockRejectedValue(
        new Error('connection refused')
      );

      const result = await runtime.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toBe('connection refused');
    });

    it('should return generic message for non-Error throws', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      mockCoreApi.listNamespacedPod.mockRejectedValue('boom');

      const result = await runtime.healthCheck();
      expect(result.healthy).toBe(false);
      expect(result.message).toBe('K8s unavailable');
    });
  });

  // ── Shutdown ───────────────────────────────────────────────────────

  describe('shutdown', () => {
    it('should stop all agents when stopAgents=true', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig({ id: 'id-s1', name: 'a1' }));
      await runtime.spawn(baseConfig({ id: 'id-s2', name: 'a2' }));

      await runtime.shutdown(true);

      expect(
        mockCustomApi.deleteNamespacedCustomObject
      ).toHaveBeenCalledTimes(2);
    });

    it('should not stop agents when stopAgents=false', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig());

      await runtime.shutdown(false);

      expect(
        mockCustomApi.deleteNamespacedCustomObject
      ).not.toHaveBeenCalled();
    });

    it('should clear internal state', async () => {
      const runtime = createRuntime();
      await runtime.initialize();
      await runtime.spawn(baseConfig());
      await runtime.shutdown(false);

      const agents = await runtime.list();
      expect(agents).toHaveLength(0);
    });
  });

  // ── Pod Status Mapping ─────────────────────────────────────────────

  describe('k8sPhaseToStatus (via get)', () => {
    const phases: Array<{ phase: string; expected: string }> = [
      { phase: 'Ready', expected: 'ready' },
      { phase: 'Starting', expected: 'starting' },
      { phase: 'Authenticating', expected: 'authenticating' },
      { phase: 'Stopping', expected: 'stopping' },
      { phase: 'Stopped', expected: 'stopped' },
      { phase: 'Error', expected: 'error' },
      { phase: 'Unknown', expected: 'pending' },
      { phase: 'SomethingRandom', expected: 'pending' },
    ];

    for (const { phase, expected } of phases) {
      it(`should map K8s phase "${phase}" to status "${expected}"`, async () => {
        mockCustomApi.getNamespacedCustomObject.mockResolvedValue({
          status: { phase },
        });

        const runtime = createRuntime();
        await runtime.initialize();
        const handle = await runtime.spawn(baseConfig());
        const result = await runtime.get(handle.id);
        expect(result?.status).toBe(expected);
      });
    }
  });

  // ── Logs ───────────────────────────────────────────────────────────

  describe('logs', () => {
    it('should throw if agent not found', async () => {
      const runtime = createRuntime();
      const iter = runtime.logs('missing');
      await expect(
        (async () => {
          for await (const _line of iter) {
            /* drain */
          }
        })()
      ).rejects.toThrow('Agent missing not found');
    });

    it('should return lines from pod logs', async () => {
      mockCoreApi.listNamespacedPod.mockResolvedValue({
        items: [{ metadata: { name: 'pod-abc' } }],
      });
      mockCoreApi.readNamespacedPodLog.mockResolvedValue(
        'line 1\nline 2\nline 3\n'
      );

      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      const lines: string[] = [];
      for await (const line of runtime.logs(handle.id)) {
        lines.push(line);
      }

      expect(lines).toEqual(['line 1', 'line 2', 'line 3']);
    });

    it('should yield nothing if no pods found', async () => {
      mockCoreApi.listNamespacedPod.mockResolvedValue({ items: [] });

      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      const lines: string[] = [];
      for await (const line of runtime.logs(handle.id)) {
        lines.push(line);
      }

      expect(lines).toEqual([]);
    });
  });

  // ── Metrics ────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('should return null for unknown agent', async () => {
      const runtime = createRuntime();
      const result = await runtime.metrics('unknown');
      expect(result).toBeNull();
    });

    it('should return uptime from pod startTime', async () => {
      const startTime = new Date(Date.now() - 60_000).toISOString();
      mockCoreApi.listNamespacedPod.mockResolvedValue({
        items: [{ status: { startTime } }],
      });

      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      const result = await runtime.metrics(handle.id);
      expect(result).not.toBeNull();
      // Uptime should be roughly 60 seconds (in ms)
      expect(result!.uptime).toBeGreaterThan(50_000);
      expect(result!.uptime).toBeLessThan(70_000);
    });

    it('should return null if no pods found', async () => {
      mockCoreApi.listNamespacedPod.mockResolvedValue({ items: [] });

      const runtime = createRuntime();
      await runtime.initialize();
      const handle = await runtime.spawn(baseConfig());

      const result = await runtime.metrics(handle.id);
      expect(result).toBeNull();
    });
  });

  // ── cleanupExecution ───────────────────────────────────────────────

  describe('cleanupExecution', () => {
    it('should delete the shared auth PVC', async () => {
      mockCoreApi.deleteNamespacedPersistentVolumeClaim.mockResolvedValue({});
      const runtime = createRuntime();
      await runtime.initialize();

      await runtime.cleanupExecution('exec-1234');

      expect(
        mockCoreApi.deleteNamespacedPersistentVolumeClaim
      ).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'parallax-auth-exec-123' })
      );
    });

    it('should silently ignore 404 on PVC deletion', async () => {
      mockCoreApi.deleteNamespacedPersistentVolumeClaim.mockRejectedValue({
        statusCode: 404,
      });
      const runtime = createRuntime();
      await runtime.initialize();

      await expect(
        runtime.cleanupExecution('exec-gone')
      ).resolves.not.toThrow();
    });
  });
});

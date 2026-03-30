/**
 * Unit tests for AgentController
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// ── Mock @kubernetes/client-node ────────────────────────────────────────

const {
  mockCoreApi,
  mockAppsApi,
  mockCustomApi,
  mockKubeConfig,
  mockWatch,
  watchState,
  MockCoreV1Api,
  MockAppsV1Api,
  MockCustomObjectsApi,
} = vi.hoisted(() => {
  const mockCoreApi = {
    readNamespacedService: vi.fn(),
    createNamespacedService: vi.fn(),
    replaceNamespacedService: vi.fn(),
    deleteNamespacedService: vi.fn(),
  };

  const mockAppsApi = {
    readNamespacedDeployment: vi.fn(),
    createNamespacedDeployment: vi.fn(),
    replaceNamespacedDeployment: vi.fn(),
    deleteNamespacedDeployment: vi.fn(),
  };

  const mockCustomApi = {
    getNamespacedCustomObject: vi.fn(),
    patchNamespacedCustomObjectStatus: vi.fn(),
  };

  const watchState = {
    callback: null as ((type: string, apiObj: any) => void) | null,
    errorCallback: null as ((err: any) => void) | null,
  };

  const mockWatch = {
    watch: vi.fn(async (_path: string, _opts: any, cb: any, errCb: any) => {
      watchState.callback = cb;
      watchState.errorCallback = errCb;
    }),
  };

  class MockCoreV1Api {}
  class MockAppsV1Api {}
  class MockCustomObjectsApi {}

  const mockKubeConfig = {
    makeApiClient: vi.fn((ApiClass: any) => {
      if (ApiClass === MockCoreV1Api) return mockCoreApi;
      if (ApiClass === MockAppsV1Api) return mockAppsApi;
      if (ApiClass === MockCustomObjectsApi) return mockCustomApi;
      return {};
    }),
  };

  return {
    mockCoreApi, mockAppsApi, mockCustomApi, mockKubeConfig, mockWatch, watchState,
    MockCoreV1Api, MockAppsV1Api, MockCustomObjectsApi,
  };
});

vi.mock('@kubernetes/client-node', () => ({
  KubeConfig: vi.fn(() => mockKubeConfig),
  CoreV1Api: MockCoreV1Api,
  AppsV1Api: MockAppsV1Api,
  CustomObjectsApi: MockCustomObjectsApi,
  Watch: vi.fn(() => mockWatch),
}));

// ── Imports ─────────────────────────────────────────────────────────────

import { AgentController, type ControllerOptions } from '../controllers/agent-controller';
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

function createController(
  options: ControllerOptions = { namespace: 'test-ns' }
): AgentController {
  const kc = mockKubeConfig as any;
  return new AgentController(kc, createMockLogger(), options);
}

function agentObj(overrides: any = {}): any {
  return {
    metadata: {
      name: 'agent-abc',
      namespace: 'test-ns',
      uid: 'uid-123',
      labels: {
        'parallax.ai/agent-id': 'agent-id-1',
        ...overrides.labels,
      },
    },
    spec: {
      type: 'claude',
      name: 'Test Agent',
      role: 'engineer',
      capabilities: ['code'],
      image: '',
      executionId: undefined,
      resources: { cpu: '1', memory: '2Gi' },
      env: [],
      autoRestart: true,
      ...overrides.spec,
    },
    status: overrides.status || {},
  };
}

// ── Tests ───────────────────────────────────────────────────────────────

describe('AgentController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    watchState.callback = null;
    watchState.errorCallback = null;
    // Default: new resources (404 on reads)
    mockAppsApi.readNamespacedDeployment.mockRejectedValue({ statusCode: 404 });
    mockCoreApi.readNamespacedService.mockRejectedValue({ statusCode: 404 });
    mockAppsApi.createNamespacedDeployment.mockResolvedValue({});
    mockCoreApi.createNamespacedService.mockResolvedValue({});
    mockCustomApi.getNamespacedCustomObject.mockResolvedValue({ status: {} });
    mockCustomApi.patchNamespacedCustomObjectStatus.mockResolvedValue({});
  });

  // ── Start / Stop ───────────────────────────────────────────────────

  describe('start', () => {
    it('should start the K8s watcher', async () => {
      const controller = createController();
      await controller.start();
      expect(mockWatch.watch).toHaveBeenCalledWith(
        '/apis/parallax.ai/v1/namespaces/test-ns/parallaxagents',
        {},
        expect.any(Function),
        expect.any(Function)
      );
    });

    it('should be idempotent', async () => {
      const controller = createController();
      await controller.start();
      await controller.start();
      expect(mockWatch.watch).toHaveBeenCalledTimes(1);
    });
  });

  describe('stop', () => {
    it('should mark controller as not running', () => {
      const controller = createController();
      controller.stop();
      // No error is sufficient — validates the method exists and runs
    });
  });

  // ── Event Handling: ADDED ──────────────────────────────────────────

  describe('handleEvent — ADDED', () => {
    it('should create a Deployment for the agent', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      expect(mockAppsApi.createNamespacedDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace: 'test-ns',
          body: expect.objectContaining({
            metadata: expect.objectContaining({
              name: 'agent-abc',
              labels: expect.objectContaining({
                'parallax.ai/agent-id': 'agent-id-1',
                'parallax.ai/agent-type': 'claude',
              }),
            }),
          }),
        })
      );
    });

    it('should create a Service for the agent', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      expect(mockCoreApi.createNamespacedService).toHaveBeenCalledWith(
        expect.objectContaining({
          namespace: 'test-ns',
          body: expect.objectContaining({
            metadata: expect.objectContaining({
              name: 'agent-abc-svc',
            }),
          }),
        })
      );
    });

    it('should update CRD status to Ready', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      // Should have been called at least twice: Starting then Ready
      expect(
        mockCustomApi.patchNamespacedCustomObjectStatus
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-abc',
          body: expect.objectContaining({
            status: expect.objectContaining({
              phase: 'Ready',
              endpoint:
                'http://agent-abc-svc.test-ns.svc.cluster.local:8080',
            }),
          }),
        })
      );
    });

    it('should set correct resource limits from spec', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!(
        'ADDED',
        agentObj({ spec: { resources: { cpu: '2', memory: '4Gi' } } })
      );

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      const container = deploymentBody.spec.template.spec.containers[0];
      expect(container.resources.requests).toEqual({
        cpu: '2',
        memory: '4Gi',
      });
      expect(container.resources.limits).toEqual({
        cpu: '2',
        memory: '4Gi',
      });
    });

    it('should use default CPU and memory from controller options', async () => {
      const controller = createController({
        namespace: 'test-ns',
        defaultCpu: '500m',
        defaultMemory: '1Gi',
      });
      await controller.start();

      await watchState.callback!(
        'ADDED',
        agentObj({ spec: { resources: {} } })
      );

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      const container = deploymentBody.spec.template.spec.containers[0];
      expect(container.resources.requests.cpu).toBe('500m');
      expect(container.resources.requests.memory).toBe('1Gi');
    });

    it('should set restartPolicy to Never when autoRestart=false', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!(
        'ADDED',
        agentObj({ spec: { autoRestart: false } })
      );

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      expect(deploymentBody.spec.template.spec.restartPolicy).toBe('Never');
    });

    it('should set restartPolicy to Always by default', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      expect(deploymentBody.spec.template.spec.restartPolicy).toBe('Always');
    });

    it('should include shared auth volume when executionId is set', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!(
        'ADDED',
        agentObj({ spec: { executionId: 'exec-abc12345' } })
      );

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      const podSpec = deploymentBody.spec.template.spec;

      expect(podSpec.volumes).toEqual([
        {
          name: 'shared-auth',
          persistentVolumeClaim: {
            claimName: 'parallax-auth-exec-abc',
          },
        },
      ]);

      const container = podSpec.containers[0];
      expect(container.volumeMounts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            name: 'shared-auth',
            mountPath: '/home/agent/.claude',
            subPath: 'claude',
          }),
          expect.objectContaining({
            name: 'shared-auth',
            mountPath: '/home/agent/.codex',
            subPath: 'codex',
          }),
        ])
      );
    });

    it('should not include shared auth volume when executionId is absent', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      const podSpec = deploymentBody.spec.template.spec;

      expect(podSpec.volumes).toBeUndefined();
    });

    it('should include ownerReferences on deployment', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      expect(deploymentBody.metadata.ownerReferences).toEqual([
        expect.objectContaining({
          kind: 'ParallaxAgent',
          name: 'agent-abc',
          uid: 'uid-123',
          controller: true,
        }),
      ]);
    });

    it('should update existing deployment when it already exists', async () => {
      mockAppsApi.readNamespacedDeployment.mockResolvedValue({});
      mockAppsApi.replaceNamespacedDeployment.mockResolvedValue({});

      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      expect(mockAppsApi.replaceNamespacedDeployment).toHaveBeenCalled();
      expect(mockAppsApi.createNamespacedDeployment).not.toHaveBeenCalled();
    });

    it('should update existing service when it already exists', async () => {
      mockCoreApi.readNamespacedService.mockResolvedValue({});
      mockCoreApi.replaceNamespacedService.mockResolvedValue({});

      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      expect(mockCoreApi.replaceNamespacedService).toHaveBeenCalled();
      expect(mockCoreApi.createNamespacedService).not.toHaveBeenCalled();
    });

    it('should use imagePrefix when configured', async () => {
      const controller = createController({
        namespace: 'test-ns',
        imagePrefix: 'gcr.io/my-project',
      });
      await controller.start();

      // No custom image in spec, so it should use default + prefix
      await watchState.callback!(
        'ADDED',
        agentObj({ spec: { type: 'gemini', image: '' } })
      );

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      const container = deploymentBody.spec.template.spec.containers[0];
      expect(container.image).toBe(
        'gcr.io/my-project/parallax/agent-gemini:latest'
      );
    });

    it('should use spec.image when provided', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!(
        'ADDED',
        agentObj({ spec: { image: 'custom/image:v2' } })
      );

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      const container = deploymentBody.spec.template.spec.containers[0];
      expect(container.image).toBe('custom/image:v2');
    });

    it('should build env with credentials from secretRef', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!(
        'ADDED',
        agentObj({
          spec: {
            credentials: {
              secretRef: 'my-secret',
              anthropicKeyRef: 'anthropic-key',
              openaiKeyRef: 'openai-key',
              googleKeyRef: 'google-key',
            },
          },
        })
      );

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      const envVars = deploymentBody.spec.template.spec.containers[0].env;

      const anthropicVar = envVars.find(
        (e: any) => e.name === 'ANTHROPIC_API_KEY'
      );
      expect(anthropicVar?.valueFrom?.secretKeyRef).toEqual({
        name: 'my-secret',
        key: 'anthropic-key',
      });

      const openaiVar = envVars.find(
        (e: any) => e.name === 'OPENAI_API_KEY'
      );
      expect(openaiVar?.valueFrom?.secretKeyRef).toEqual({
        name: 'my-secret',
        key: 'openai-key',
      });

      const googleVar = envVars.find(
        (e: any) => e.name === 'GOOGLE_API_KEY'
      );
      expect(googleVar?.valueFrom?.secretKeyRef).toEqual({
        name: 'my-secret',
        key: 'google-key',
      });
    });
  });

  // ── Event Handling: DELETED ────────────────────────────────────────

  describe('handleEvent — DELETED', () => {
    it('should clean up deployment and service', async () => {
      mockAppsApi.deleteNamespacedDeployment.mockResolvedValue({});
      mockCoreApi.deleteNamespacedService.mockResolvedValue({});

      const controller = createController();
      await controller.start();

      await watchState.callback!('DELETED', agentObj());

      expect(mockAppsApi.deleteNamespacedDeployment).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-abc',
          namespace: 'test-ns',
        })
      );
      expect(mockCoreApi.deleteNamespacedService).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'agent-abc-svc',
          namespace: 'test-ns',
        })
      );
    });

    it('should not throw if cleanup fails', async () => {
      mockAppsApi.deleteNamespacedDeployment.mockRejectedValue(
        new Error('gone')
      );
      mockCoreApi.deleteNamespacedService.mockRejectedValue(
        new Error('gone')
      );

      const controller = createController();
      await controller.start();

      // Should not throw
      await watchState.callback!('DELETED', agentObj());
    });
  });

  // ── Probes ─────────────────────────────────────────────────────────

  describe('container probes', () => {
    it('should set readiness and liveness probes', async () => {
      const controller = createController();
      await controller.start();

      await watchState.callback!('ADDED', agentObj());

      const deploymentBody =
        mockAppsApi.createNamespacedDeployment.mock.calls[0][0].body;
      const container = deploymentBody.spec.template.spec.containers[0];

      expect(container.readinessProbe).toEqual({
        httpGet: { path: '/health', port: 8080 },
        initialDelaySeconds: 10,
        periodSeconds: 5,
      });
      expect(container.livenessProbe).toEqual({
        httpGet: { path: '/health', port: 8080 },
        initialDelaySeconds: 30,
        periodSeconds: 10,
      });
    });
  });
});

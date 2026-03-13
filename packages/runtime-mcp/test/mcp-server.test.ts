import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';
import { ParallaxMcpServer } from '../src/mcp-server.js';
import { McpAuthError } from '../src/auth/index.js';

// Mock LocalRuntime
vi.mock('@parallaxai/runtime-local', () => ({
  LocalRuntime: vi.fn().mockImplementation(() => ({
    initialize: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
    spawn: vi.fn().mockResolvedValue({
      id: 'mock-agent-123',
      name: 'test-agent',
      type: 'claude',
      status: 'ready',
      capabilities: ['testing'],
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue([
      { id: 'agent-1', name: 'Agent 1', type: 'claude', status: 'ready', capabilities: [] },
      { id: 'agent-2', name: 'Agent 2', type: 'codex', status: 'busy', capabilities: [] },
    ]),
    get: vi.fn().mockImplementation((id: string) => {
      if (id === 'agent-1') {
        return Promise.resolve({
          id: 'agent-1',
          name: 'Agent 1',
          type: 'claude',
          status: 'ready',
          capabilities: [],
        });
      }
      return Promise.resolve(null);
    }),
    send: vi.fn().mockResolvedValue({ id: 'msg-1', content: 'Response' }),
    logs: vi.fn().mockImplementation(async function* () {
      yield 'Log line 1';
      yield 'Log line 2';
    }),
    metrics: vi.fn().mockResolvedValue({
      cpu: 25,
      memory: 512000000,
      uptime: 3600,
    }),
    spawnThread: vi.fn().mockResolvedValue({
      id: 'thread-123',
      executionId: 'exec-1',
      runtimeName: 'local',
      agentType: 'claude',
      role: 'engineer',
      status: 'ready',
      objective: 'Implement auth flow',
      createdAt: new Date('2026-03-12T00:00:00Z'),
      updatedAt: new Date('2026-03-12T00:00:00Z'),
    }),
    stopThread: vi.fn().mockResolvedValue(undefined),
    listThreads: vi.fn().mockResolvedValue([
      {
        id: 'thread-1',
        executionId: 'exec-1',
        runtimeName: 'local',
        agentType: 'claude',
        role: 'engineer',
        status: 'ready',
        objective: 'Implement auth flow',
        createdAt: new Date('2026-03-12T00:00:00Z'),
        updatedAt: new Date('2026-03-12T00:00:00Z'),
      },
    ]),
    getThread: vi.fn().mockImplementation((id: string) => {
      if (id === 'thread-1') {
        return Promise.resolve({
          id: 'thread-1',
          executionId: 'exec-1',
          runtimeName: 'local',
          agentType: 'claude',
          role: 'engineer',
          status: 'ready',
          objective: 'Implement auth flow',
          createdAt: new Date('2026-03-12T00:00:00Z'),
          updatedAt: new Date('2026-03-12T00:00:00Z'),
        });
      }
      return Promise.resolve(null);
    }),
    sendToThread: vi.fn().mockResolvedValue(undefined),
    healthCheck: vi.fn().mockResolvedValue({ healthy: true }),
    name: 'local',
  })),
}));

describe('ParallaxMcpServer', () => {
  const logger = pino({ level: 'silent' });

  describe('Basic Server Operations', () => {
    let server: ParallaxMcpServer;

    beforeEach(() => {
      server = new ParallaxMcpServer({ logger });
    });

    it('should create server instance', () => {
      expect(server).toBeDefined();
      expect(server.isConnected()).toBe(false);
    });

    it('should report not connected initially', () => {
      expect(server.isConnected()).toBe(false);
    });

    it('should return null auth context when not authenticated', () => {
      expect(server.getAuthContext()).toBeNull();
    });

    it('should get runtime instance', () => {
      const runtime = server.getRuntime();
      expect(runtime).toBeDefined();
    });
  });

  describe('Authentication', () => {
    it('should return permissive context when auth is disabled', async () => {
      const server = new ParallaxMcpServer({ logger });
      const context = await server.authenticate('any-token');

      expect(context.permissions).toContain('*');
    });

    it('should authenticate with valid API key', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          enabled: true,
          apiKeys: new Map([
            ['plx_test_key', { name: 'test', permissions: ['agents:list'] }],
          ]),
        },
      });

      const context = await server.authenticate('plx_test_key');

      expect(context.type).toBe('apiKey');
      expect(context.userId).toBe('test');
    });

    it('should reject invalid token when auth is enabled', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          enabled: true,
          apiKeys: new Map(),
        },
      });

      await expect(server.authenticate('invalid')).rejects.toThrow(McpAuthError);
    });

    it('should authenticate from Authorization header', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          enabled: true,
          apiKeys: new Map([
            ['plx_header_key', { name: 'header-test', permissions: ['*'] }],
          ]),
        },
      });

      const context = await server.authenticateFromHeader('Bearer plx_header_key');

      expect(context.userId).toBe('header-test');
    });

    it('should throw when header is missing', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          enabled: true,
          apiKeys: new Map(),
        },
      });

      await expect(server.authenticateFromHeader(undefined)).rejects.toThrow(McpAuthError);
    });
  });

  describe('Permission Checking', () => {
    it('should allow all permissions when auth is disabled', () => {
      const server = new ParallaxMcpServer({ logger });

      expect(server.hasPermission('agents:spawn')).toBe(true);
      expect(server.hasPermission('anything:else')).toBe(true);
    });

    it('should check permissions after authentication', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          enabled: true,
          apiKeys: new Map([
            ['plx_limited', { name: 'limited', permissions: ['agents:list'] }],
          ]),
        },
      });

      await server.authenticate('plx_limited');

      expect(server.hasPermission('agents:list')).toBe(true);
      expect(server.hasPermission('agents:spawn')).toBe(false);
    });
  });

  describe('Server Options', () => {
    it('should accept maxAgents option', () => {
      const server = new ParallaxMcpServer({
        logger,
        maxAgents: 5,
      });

      expect(server).toBeDefined();
    });

    it('should accept auth config', () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          enabled: true,
          jwt: {
            secret: 'test-secret',
            algorithm: 'HS256',
          },
        },
      });

      expect(server).toBeDefined();
    });
  });
});

describe('Tool Executors', () => {
  // These tests verify the tool executor functions work correctly
  // The actual runtime is mocked

  const logger = pino({ level: 'silent' });

  describe('executeSpawn', () => {
    it('should spawn agent and return handle', async () => {
      const { executeSpawn } = await import('../src/tools/spawn-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});

      const result = await executeSpawn(runtime, {
        name: 'test-agent',
        type: 'claude',
        capabilities: ['testing'],
        waitForReady: false,
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.agent).toBeDefined();
        expect(result.agent.id).toBe('mock-agent-123');
      }
    });
  });

  describe('executeList', () => {
    it('should list agents', async () => {
      const { executeList } = await import('../src/tools/list-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});

      const result = await executeList(runtime, {});

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.agents).toHaveLength(2);
      }
    });
  });

  describe('executeGet', () => {
    it('should get existing agent', async () => {
      const { executeGet } = await import('../src/tools/get-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});

      const result = await executeGet(runtime, { agentId: 'agent-1' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.agent.id).toBe('agent-1');
      }
    });

    it('should return error for non-existent agent', async () => {
      const { executeGet } = await import('../src/tools/get-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});

      const result = await executeGet(runtime, { agentId: 'non-existent' });

      expect(result.success).toBe(false);
    });
  });

  describe('executeHealth', () => {
    it('should return health status', async () => {
      const { executeHealth } = await import('../src/tools/health-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});

      const result = await executeHealth(runtime);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.health.healthy).toBe(true);
        expect(result.health.runtime).toBe('local');
      }
    });
  });

  describe('thread tool executors', () => {
    it('should spawn a managed thread', async () => {
      const { executeSpawnThread } = await import('../src/tools/spawn-thread-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});
      const result = await executeSpawnThread(runtime, {
        executionId: 'exec-1',
        name: 'worker-thread',
        agentType: 'claude',
        objective: 'Implement auth flow',
        role: 'engineer',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.thread.id).toBe('thread-123');
      }
    });

    it('should list managed threads', async () => {
      const { executeListThreads } = await import('../src/tools/list-threads-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});
      const result = await executeListThreads(runtime, { executionId: 'exec-1' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.threads).toHaveLength(1);
        expect(result.threads[0].id).toBe('thread-1');
      }
    });

    it('should get a managed thread', async () => {
      const { executeGetThread } = await import('../src/tools/get-thread-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});
      const result = await executeGetThread(runtime, { threadId: 'thread-1' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.thread.role).toBe('engineer');
      }
    });

    it('should send input to a managed thread', async () => {
      const { executeSendThreadInput } = await import('../src/tools/send-thread-input-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});
      const result = await executeSendThreadInput(runtime, {
        threadId: 'thread-1',
        message: 'Continue with the auth refactor',
      });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.sent).toBe(true);
      }
    });

    it('should stop a managed thread', async () => {
      const { executeStopThread } = await import('../src/tools/stop-thread-tool.js');
      const { LocalRuntime } = await import('@parallaxai/runtime-local');

      const runtime = new LocalRuntime(logger, {});
      const result = await executeStopThread(runtime, { threadId: 'thread-1' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.threadId).toBe('thread-1');
      }
    });
  });
});

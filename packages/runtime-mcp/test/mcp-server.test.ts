import { describe, it, expect, beforeEach, vi } from 'vitest';
import pino from 'pino';
import { ParallaxMcpServer } from '../src/mcp-server.js';
import { McpAuthError } from '../src/auth/index.js';

// Mock LocalRuntime
vi.mock('@parallax/runtime-local', () => ({
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
      const { LocalRuntime } = await import('@parallax/runtime-local');

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
      const { LocalRuntime } = await import('@parallax/runtime-local');

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
      const { LocalRuntime } = await import('@parallax/runtime-local');

      const runtime = new LocalRuntime(logger, {});

      const result = await executeGet(runtime, { agentId: 'agent-1' });

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.agent.id).toBe('agent-1');
      }
    });

    it('should return error for non-existent agent', async () => {
      const { executeGet } = await import('../src/tools/get-tool.js');
      const { LocalRuntime } = await import('@parallax/runtime-local');

      const runtime = new LocalRuntime(logger, {});

      const result = await executeGet(runtime, { agentId: 'non-existent' });

      expect(result.success).toBe(false);
    });
  });

  describe('executeHealth', () => {
    it('should return health status', async () => {
      const { executeHealth } = await import('../src/tools/health-tool.js');
      const { LocalRuntime } = await import('@parallax/runtime-local');

      const runtime = new LocalRuntime(logger, {});

      const result = await executeHealth(runtime);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.health.healthy).toBe(true);
        expect(result.health.runtime).toBe('local');
      }
    });
  });
});

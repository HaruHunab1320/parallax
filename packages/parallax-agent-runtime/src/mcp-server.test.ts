import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParallaxMcpServer } from './mcp-server.js';
import { McpAuthError } from './auth/index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Capture the CallTool handler so we can invoke it directly
let callToolHandler: ((request: { params: { name: string; arguments?: Record<string, unknown> } }) => Promise<unknown>) | null = null;
let listToolsHandler: (() => Promise<unknown>) | null = null;

vi.mock('@modelcontextprotocol/sdk/server/index.js', () => ({
  Server: vi.fn().mockImplementation(() => ({
    setRequestHandler: vi.fn().mockImplementation((schema: { method?: string }, handler: Function) => {
      // Capture the handlers by checking the schema method name
      if (schema?.method === 'tools/call') {
        callToolHandler = handler as typeof callToolHandler;
      }
      if (schema?.method === 'tools/list') {
        listToolsHandler = handler as typeof listToolsHandler;
      }
    }),
    connect: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
  })),
}));

vi.mock('@modelcontextprotocol/sdk/server/stdio.js', () => ({
  StdioServerTransport: vi.fn(),
}));

vi.mock('@modelcontextprotocol/sdk/types.js', () => ({
  CallToolRequestSchema: { method: 'tools/call' },
  ListToolsRequestSchema: { method: 'tools/list' },
  ListResourcesRequestSchema: { method: 'resources/list' },
  ReadResourceRequestSchema: { method: 'resources/read' },
  ListPromptsRequestSchema: { method: 'prompts/list' },
  GetPromptRequestSchema: { method: 'prompts/get' },
}));

// Mock the AgentManager
const mockSpawn = vi.fn().mockResolvedValue({
  id: 'agent-1', name: 'test', type: 'claude', status: 'starting',
  capabilities: ['code'], role: 'engineer',
});
const mockStop = vi.fn().mockResolvedValue(undefined);
const mockList = vi.fn().mockResolvedValue([]);
const mockGet = vi.fn().mockResolvedValue({
  id: 'agent-1', name: 'test', type: 'claude', status: 'ready',
  capabilities: ['code'], role: 'engineer',
});
const mockSend = vi.fn().mockResolvedValue({
  id: 'msg-1', agentId: 'agent-1', direction: 'inbound', type: 'task',
  timestamp: new Date(),
});
const mockLogs = vi.fn().mockImplementation(async function* () { yield 'line 1'; });
const mockMetricsFn = vi.fn().mockReturnValue({ uptime: 60, messageCount: 3 });
const mockGetHealth = vi.fn().mockResolvedValue({
  healthy: true, agentCount: 0, maxAgents: 10, adapters: [],
  workspaceServiceEnabled: false, stallDetectionEnabled: true,
});
const mockProvisionWorkspace = vi.fn().mockResolvedValue({
  id: 'ws-1', path: '/tmp/ws-1', repo: 'https://github.com/test/repo',
  branch: { name: 'parallax/exec-1/engineer-test' }, status: 'ready', strategy: 'clone',
});
const mockFinalizeWorkspace = vi.fn().mockResolvedValue({
  number: 42, url: 'https://github.com/test/repo/pull/42',
});
const mockCleanupWorkspace = vi.fn().mockResolvedValue(undefined);
const mockHasWorkspaceService = vi.fn().mockReturnValue(false);
const mockInitialize = vi.fn().mockResolvedValue(undefined);
const mockShutdown = vi.fn().mockResolvedValue(undefined);
const mockAttachTerminal = vi.fn();

vi.mock('./agent-manager.js', () => ({
  AgentManager: vi.fn().mockImplementation(() => ({
    spawn: mockSpawn,
    stop: mockStop,
    list: mockList,
    get: mockGet,
    send: mockSend,
    logs: mockLogs,
    metrics: mockMetricsFn,
    getHealth: mockGetHealth,
    provisionWorkspace: mockProvisionWorkspace,
    finalizeWorkspace: mockFinalizeWorkspace,
    cleanupWorkspace: mockCleanupWorkspace,
    hasWorkspaceService: mockHasWorkspaceService,
    initialize: mockInitialize,
    shutdown: mockShutdown,
    attachTerminal: mockAttachTerminal,
  })),
}));

// Mock resources
vi.mock('./resources/index.js', () => ({
  listAgentResources: vi.fn().mockResolvedValue([]),
  readAgentResource: vi.fn().mockResolvedValue(null),
  listLogsResources: vi.fn().mockResolvedValue([]),
  readLogsResource: vi.fn().mockResolvedValue(null),
}));

// Mock prompts
vi.mock('./prompts/index.js', () => ({
  PROMPTS: [{ name: 'spawn_review_team' }, { name: 'spawn_dev_agent' }],
  generateSpawnReviewTeamPrompt: vi.fn().mockReturnValue({ messages: [] }),
  generateSpawnDevAgentPrompt: vi.fn().mockReturnValue({ messages: [] }),
}));

const logger = {
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  child: vi.fn().mockReturnThis(),
  level: 'silent',
} as never;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe('ParallaxMcpServer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    callToolHandler = null;
    listToolsHandler = null;
  });

  describe('constructor', () => {
    it('creates server without auth', () => {
      const server = new ParallaxMcpServer({ logger });
      expect(server).toBeDefined();
      expect(server.isConnected()).toBe(false);
    });

    it('creates server with auth config', () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          apiKeys: [{ key: 'test-key', permissions: ['*'], name: 'test' }],
        },
      });
      expect(server).toBeDefined();
    });
  });

  describe('authentication', () => {
    it('returns wildcard auth when no auth configured', async () => {
      const server = new ParallaxMcpServer({ logger });
      const ctx = await server.authenticate('anything');
      expect(ctx.permissions).toEqual(['*']);
    });

    it('authenticates with valid API key', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          apiKeys: [{ key: 'valid-key', permissions: ['agents:*'], name: 'admin' }],
        },
      });

      const ctx = await server.authenticate('valid-key');
      expect(ctx.type).toBe('api_key');
      expect(ctx.permissions).toEqual(['agents:*']);
    });

    it('rejects invalid credentials', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          apiKeys: [{ key: 'valid-key', permissions: ['*'], name: 'admin' }],
        },
      });

      await expect(server.authenticate('bad-key')).rejects.toThrow(McpAuthError);
    });

    it('authenticateFromHeader extracts Bearer token', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          apiKeys: [{ key: 'my-token', permissions: ['*'], name: 'admin' }],
        },
      });

      const ctx = await server.authenticateFromHeader('Bearer my-token');
      expect(ctx.type).toBe('api_key');
    });

    it('authenticateFromHeader throws on missing header', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          apiKeys: [{ key: 'key', permissions: ['*'] }],
        },
      });

      await expect(server.authenticateFromHeader(undefined)).rejects.toThrow('No credentials provided');
    });
  });

  describe('permission checking', () => {
    it('always permits when no auth configured', () => {
      const server = new ParallaxMcpServer({ logger });
      expect(server.hasPermission('agents:spawn')).toBe(true);
      expect(server.hasPermission('workspace:provision')).toBe(true);
    });

    it('checks permissions when auth configured and authenticated', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          apiKeys: [{ key: 'limited', permissions: ['agents:spawn', 'agents:list'], name: 'limited' }],
        },
      });

      await server.authenticate('limited');
      expect(server.hasPermission('agents:spawn')).toBe(true);
      expect(server.hasPermission('agents:list')).toBe(true);
      expect(server.hasPermission('workspace:provision')).toBe(false);
    });

    it('wildcard permission matches all prefix patterns', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          apiKeys: [{ key: 'admin', permissions: ['agents:*'], name: 'admin' }],
        },
      });

      await server.authenticate('admin');
      expect(server.hasPermission('agents:spawn')).toBe(true);
      expect(server.hasPermission('agents:stop')).toBe(true);
      expect(server.hasPermission('workspace:provision')).toBe(false);
    });
  });

  describe('tool routing', () => {
    it('lists all 11 tools', async () => {
      new ParallaxMcpServer({ logger });

      expect(listToolsHandler).not.toBeNull();
      const result = await listToolsHandler!();
      expect((result as { tools: unknown[] }).tools).toHaveLength(11);
    });

    it('routes spawn tool', async () => {
      new ParallaxMcpServer({ logger });
      expect(callToolHandler).not.toBeNull();

      const result = await callToolHandler!({
        params: {
          name: 'spawn',
          arguments: { name: 'test', type: 'claude', capabilities: ['code'], waitForReady: true },
        },
      });

      expect(mockSpawn).toHaveBeenCalled();
      expect(result).toHaveProperty('content');
      const content = (result as { content: { text: string }[] }).content[0].text;
      expect(JSON.parse(content).success).toBe(true);
    });

    it('routes stop tool', async () => {
      new ParallaxMcpServer({ logger });

      await callToolHandler!({
        params: { name: 'stop', arguments: { agentId: 'agent-1' } },
      });

      expect(mockStop).toHaveBeenCalled();
    });

    it('routes list tool', async () => {
      new ParallaxMcpServer({ logger });

      await callToolHandler!({
        params: { name: 'list', arguments: {} },
      });

      expect(mockList).toHaveBeenCalled();
    });

    it('routes get tool', async () => {
      new ParallaxMcpServer({ logger });

      await callToolHandler!({
        params: { name: 'get', arguments: { agentId: 'agent-1' } },
      });

      expect(mockGet).toHaveBeenCalled();
    });

    it('routes send tool', async () => {
      new ParallaxMcpServer({ logger });

      await callToolHandler!({
        params: { name: 'send', arguments: { agentId: 'agent-1', message: 'hello', expectResponse: false } },
      });

      expect(mockSend).toHaveBeenCalled();
    });

    it('routes health tool', async () => {
      new ParallaxMcpServer({ logger });

      const result = await callToolHandler!({
        params: { name: 'health' },
      });

      expect(mockGetHealth).toHaveBeenCalled();
      const content = (result as { content: { text: string }[] }).content[0].text;
      expect(JSON.parse(content).success).toBe(true);
    });

    it('routes provision_workspace tool', async () => {
      new ParallaxMcpServer({ logger });

      await callToolHandler!({
        params: {
          name: 'provision_workspace',
          arguments: {
            repo: 'https://github.com/test/repo',
            baseBranch: 'main',
            provider: 'github',
            strategy: 'clone',
            executionId: 'exec-1',
            role: 'engineer',
            branchStrategy: 'feature_branch',
          },
        },
      });

      expect(mockProvisionWorkspace).toHaveBeenCalled();
    });

    it('routes finalize_workspace tool', async () => {
      new ParallaxMcpServer({ logger });

      await callToolHandler!({
        params: {
          name: 'finalize_workspace',
          arguments: {
            workspaceId: 'ws-1',
            push: true,
            createPr: true,
            pr: { title: 'test', body: 'body', targetBranch: 'main' },
            cleanup: false,
          },
        },
      });

      expect(mockFinalizeWorkspace).toHaveBeenCalled();
    });

    it('routes cleanup_workspace tool', async () => {
      new ParallaxMcpServer({ logger });

      await callToolHandler!({
        params: {
          name: 'cleanup_workspace',
          arguments: { workspaceId: 'ws-1' },
        },
      });

      expect(mockCleanupWorkspace).toHaveBeenCalled();
    });

    it('returns error for unknown tool', async () => {
      new ParallaxMcpServer({ logger });

      const result = await callToolHandler!({
        params: { name: 'nonexistent_tool', arguments: {} },
      });

      expect((result as { isError: boolean }).isError).toBe(true);
      const content = (result as { content: { text: string }[] }).content[0].text;
      expect(JSON.parse(content).error).toContain('Unknown tool');
    });

    it('returns auth error when permission denied', async () => {
      const server = new ParallaxMcpServer({
        logger,
        auth: {
          apiKeys: [{ key: 'limited', permissions: ['agents:spawn'], name: 'limited' }],
        },
      });

      await server.authenticate('limited');

      const result = await callToolHandler!({
        params: {
          name: 'provision_workspace',
          arguments: { repo: 'https://github.com/test/repo', executionId: 'exec-1' },
        },
      });

      expect((result as { isError: boolean }).isError).toBe(true);
      const content = (result as { content: { text: string }[] }).content[0].text;
      expect(JSON.parse(content).code).toBe('INSUFFICIENT_PERMISSIONS');
    });
  });

  describe('connect / disconnect', () => {
    it('connects to transport', async () => {
      const server = new ParallaxMcpServer({ logger });
      const transport = { start: vi.fn(), close: vi.fn(), send: vi.fn() } as never;

      await server.connect(transport);
      expect(server.isConnected()).toBe(true);
      expect(mockInitialize).toHaveBeenCalled();
    });

    it('rejects double connect', async () => {
      const server = new ParallaxMcpServer({ logger });
      const transport = { start: vi.fn(), close: vi.fn(), send: vi.fn() } as never;

      await server.connect(transport);
      await expect(server.connect(transport)).rejects.toThrow('Already connected');
    });

    it('disconnects and shuts down manager', async () => {
      const server = new ParallaxMcpServer({ logger });
      const transport = { start: vi.fn(), close: vi.fn(), send: vi.fn() } as never;

      await server.connect(transport);
      await server.disconnect();

      expect(server.isConnected()).toBe(false);
      expect(mockShutdown).toHaveBeenCalledWith(true);
    });

    it('disconnect is no-op when not connected', async () => {
      const server = new ParallaxMcpServer({ logger });
      await server.disconnect(); // should not throw
      expect(mockShutdown).not.toHaveBeenCalled();
    });
  });

  describe('getManager', () => {
    it('returns the agent manager instance', () => {
      const server = new ParallaxMcpServer({ logger });
      expect(server.getManager()).toBeDefined();
    });
  });
});

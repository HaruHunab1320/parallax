import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentManager } from './agent-manager.js';
import type { AgentConfig } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mocks
// ─────────────────────────────────────────────────────────────────────────────

// Mock PTYManager
const mockSpawn = vi.fn();
const mockStop = vi.fn();
const mockGet = vi.fn();
const mockList = vi.fn().mockResolvedValue([]);
const mockSend = vi.fn();
const mockLogs = vi.fn();
const mockMetricsFn = vi.fn();
const mockAttachTerminal = vi.fn();
const mockShutdown = vi.fn();
const mockRegisterAdapter = vi.fn();
const mockOn = vi.fn();
const mockGetSession = vi.fn();
const mockAddAutoResponseRule = vi.fn();
const mockRemoveAutoResponseRule = vi.fn();
const mockSetAutoResponseRules = vi.fn();
const mockGetAutoResponseRules = vi.fn().mockReturnValue([]);
const mockClearAutoResponseRules = vi.fn();

vi.mock('pty-manager', () => ({
  PTYManager: vi.fn().mockImplementation(() => ({
    spawn: mockSpawn,
    stop: mockStop,
    get: mockGet,
    list: mockList,
    send: mockSend,
    logs: mockLogs,
    metrics: mockMetricsFn,
    attachTerminal: mockAttachTerminal,
    shutdown: mockShutdown,
    registerAdapter: mockRegisterAdapter,
    on: mockOn,
    getSession: mockGetSession,
    addAutoResponseRule: mockAddAutoResponseRule,
    removeAutoResponseRule: mockRemoveAutoResponseRule,
    setAutoResponseRules: mockSetAutoResponseRules,
    getAutoResponseRules: mockGetAutoResponseRules,
    clearAutoResponseRules: mockClearAutoResponseRules,
  })),
}));

// Mock coding-agent-adapters
const mockCheckAdapters = vi.fn().mockResolvedValue([
  { adapter: 'Claude Code', installed: true, version: '2.1.0', installCommand: 'npm i -g @anthropic-ai/claude-code', docsUrl: '' },
  { adapter: 'Gemini CLI', installed: false, error: 'not found', installCommand: 'npm i -g @google/gemini-cli', docsUrl: '' },
  { adapter: 'Codex', installed: true, version: '1.0.0', installCommand: 'npm i -g codex', docsUrl: '' },
  { adapter: 'Aider', installed: false, error: 'not found', installCommand: 'pip install aider', docsUrl: '' },
]);

const mockGetWorkspaceFiles = vi.fn();
const mockWriteMemoryFile = vi.fn();
const mockMemoryFilePath = 'CLAUDE.md';
const mockCreateAdapter = vi.fn().mockReturnValue({
  getWorkspaceFiles: mockGetWorkspaceFiles,
  writeMemoryFile: mockWriteMemoryFile,
  memoryFilePath: mockMemoryFilePath,
});

const mockGenerateApprovalConfig = vi.fn().mockReturnValue({
  preset: 'standard',
  cliFlags: [],
  workspaceFiles: [
    { relativePath: '.claude/settings.json', content: '{}', format: 'json' },
  ],
  envVars: {},
  summary: 'Claude Code: Standard dev',
});

vi.mock('coding-agent-adapters', () => ({
  ClaudeAdapter: vi.fn(),
  GeminiAdapter: vi.fn(),
  CodexAdapter: vi.fn(),
  AiderAdapter: vi.fn(),
  checkAdapters: (...args: unknown[]) => mockCheckAdapters(...args),
  createAdapter: (...args: unknown[]) => mockCreateAdapter(...args),
  generateApprovalConfig: (...args: unknown[]) => mockGenerateApprovalConfig(...args),
}));

// Mock git-workspace-service
const mockProvision = vi.fn();
const mockFinalize = vi.fn();
const mockCleanup = vi.fn();

vi.mock('git-workspace-service', () => ({
  WorkspaceService: vi.fn().mockImplementation(() => ({
    provision: mockProvision,
    finalize: mockFinalize,
    cleanup: mockCleanup,
  })),
}));

// Silent logger
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

describe('AgentManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue([]);
  });

  describe('constructor', () => {
    it('registers all 4 adapters', () => {
      new AgentManager(logger);
      expect(mockRegisterAdapter).toHaveBeenCalledTimes(4);
    });

    it('sets up event forwarding for all events including stall_detected', () => {
      new AgentManager(logger);
      const events = mockOn.mock.calls.map((c: unknown[]) => c[0]);
      expect(events).toContain('session_started');
      expect(events).toContain('session_ready');
      expect(events).toContain('session_stopped');
      expect(events).toContain('session_error');
      expect(events).toContain('login_required');
      expect(events).toContain('auth_required');
      expect(events).toContain('blocking_prompt');
      expect(events).toContain('message');
      expect(events).toContain('question');
      expect(events).toContain('stall_detected');
    });

    it('does not create workspace service when no workspace options provided', () => {
      const manager = new AgentManager(logger);
      expect(manager.hasWorkspaceService()).toBe(false);
    });

    it('creates workspace service when workspace options provided', () => {
      const manager = new AgentManager(logger, {
        workspace: { baseDir: '/tmp/workspaces' } as never,
      });
      expect(manager.hasWorkspaceService()).toBe(true);
    });
  });

  describe('spawn', () => {
    it('passes ruleOverrides through to pty-manager spawn config', async () => {
      const manager = new AgentManager(logger);
      mockSpawn.mockResolvedValue({
        id: 'agent-1',
        name: 'test',
        type: 'claude',
        status: 'starting',
      });

      const ruleOverrides = {
        'update available.*\\[y\\/n\\]': { response: 'y' },
        'trust.*folder': null,
      };

      await manager.spawn({
        name: 'test',
        type: 'claude',
        capabilities: ['code'],
        ruleOverrides,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleOverrides,
        })
      );
    });

    it('passes stallTimeoutMs through to pty-manager spawn config', async () => {
      const manager = new AgentManager(logger);
      mockSpawn.mockResolvedValue({
        id: 'agent-1',
        name: 'test',
        type: 'claude',
        status: 'starting',
      });

      await manager.spawn({
        name: 'test',
        type: 'claude',
        capabilities: ['code'],
        stallTimeoutMs: 15000,
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.objectContaining({
          stallTimeoutMs: 15000,
        })
      );
    });

    it('passes credentials as adapterConfig', async () => {
      const manager = new AgentManager(logger);
      mockSpawn.mockResolvedValue({
        id: 'agent-1',
        name: 'test',
        type: 'claude',
        status: 'starting',
      });

      await manager.spawn({
        name: 'test',
        type: 'claude',
        capabilities: ['code'],
        credentials: { anthropicKey: 'sk-test' },
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.objectContaining({
          adapterConfig: { anthropicKey: 'sk-test', interactive: true },
        })
      );
    });

    it('enforces max agents limit', async () => {
      const manager = new AgentManager(logger, { maxAgents: 2 });
      mockList.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      await expect(
        manager.spawn({ name: 'test', type: 'claude', capabilities: [] })
      ).rejects.toThrow('Maximum agents (2) reached');
    });

    it('passes approvalPreset through to adapterConfig', async () => {
      const manager = new AgentManager(logger);
      mockSpawn.mockResolvedValue({
        id: 'agent-1',
        name: 'test',
        type: 'claude',
        status: 'starting',
      });

      await manager.spawn({
        name: 'test',
        type: 'claude',
        capabilities: ['code'],
        approvalPreset: 'permissive',
      });

      expect(mockSpawn).toHaveBeenCalledWith(
        expect.objectContaining({
          adapterConfig: expect.objectContaining({
            approvalPreset: 'permissive',
          }),
        })
      );
    });

    it('writes approval config files to workspace before spawn', async () => {
      const manager = new AgentManager(logger);
      mockSpawn.mockResolvedValue({
        id: 'agent-1',
        name: 'test',
        type: 'claude',
        status: 'starting',
      });

      await manager.spawn({
        name: 'test',
        type: 'claude',
        capabilities: ['code'],
        workdir: '/tmp/test-workspace',
        approvalPreset: 'standard',
      });

      expect(mockGenerateApprovalConfig).toHaveBeenCalledWith('claude', 'standard');
    });

    it('does not write approval config files when no preset is set', async () => {
      const manager = new AgentManager(logger);
      mockSpawn.mockResolvedValue({
        id: 'agent-1',
        name: 'test',
        type: 'claude',
        status: 'starting',
      });

      await manager.spawn({
        name: 'test',
        type: 'claude',
        capabilities: ['code'],
        workdir: '/tmp/test-workspace',
      });

      expect(mockGenerateApprovalConfig).not.toHaveBeenCalled();
    });

    it('does not write approval config files for custom agent type', async () => {
      const manager = new AgentManager(logger);
      mockSpawn.mockResolvedValue({
        id: 'agent-1',
        name: 'test',
        type: 'custom',
        status: 'starting',
      });

      await manager.spawn({
        name: 'test',
        type: 'custom',
        capabilities: ['code'],
        workdir: '/tmp/test-workspace',
        approvalPreset: 'standard',
      });

      expect(mockGenerateApprovalConfig).not.toHaveBeenCalled();
    });

    it('returns AgentHandle with role and capabilities from config', async () => {
      const manager = new AgentManager(logger);
      mockSpawn.mockImplementation((cfg: { id: string; name: string; type: string }) =>
        Promise.resolve({ id: cfg.id, name: cfg.name, type: cfg.type, status: 'starting' })
      );

      const handle = await manager.spawn({
        name: 'arch',
        type: 'claude',
        capabilities: ['architecture', 'design'],
        role: 'architect',
      });

      expect(handle.role).toBe('architect');
      expect(handle.capabilities).toEqual(['architecture', 'design']);
    });
  });

  describe('auto-response rule management', () => {
    it('delegates addAutoResponseRule to pty-manager', () => {
      const manager = new AgentManager(logger);
      const rule = {
        pattern: /test/,
        type: 'config' as const,
        response: 'y',
        description: 'test rule',
      };
      manager.addAutoResponseRule('agent-1', rule);
      expect(mockAddAutoResponseRule).toHaveBeenCalledWith('agent-1', rule);
    });

    it('delegates removeAutoResponseRule to pty-manager', () => {
      const manager = new AgentManager(logger);
      const pattern = /test/;
      manager.removeAutoResponseRule('agent-1', pattern);
      expect(mockRemoveAutoResponseRule).toHaveBeenCalledWith('agent-1', pattern);
    });

    it('delegates setAutoResponseRules to pty-manager', () => {
      const manager = new AgentManager(logger);
      const rules = [
        { pattern: /a/, type: 'config' as const, response: 'y', description: 'rule a' },
      ];
      manager.setAutoResponseRules('agent-1', rules);
      expect(mockSetAutoResponseRules).toHaveBeenCalledWith('agent-1', rules);
    });

    it('delegates getAutoResponseRules to pty-manager', () => {
      const manager = new AgentManager(logger);
      manager.getAutoResponseRules('agent-1');
      expect(mockGetAutoResponseRules).toHaveBeenCalledWith('agent-1');
    });

    it('delegates clearAutoResponseRules to pty-manager', () => {
      const manager = new AgentManager(logger);
      manager.clearAutoResponseRules('agent-1');
      expect(mockClearAutoResponseRules).toHaveBeenCalledWith('agent-1');
    });
  });

  describe('handleStallClassification', () => {
    it('delegates to session.handleStallClassification', () => {
      const manager = new AgentManager(logger);
      const mockHandleStall = vi.fn();
      mockGetSession.mockReturnValue({ handleStallClassification: mockHandleStall });

      const classification = { state: 'task_complete' as const };
      manager.handleStallClassification('agent-1', classification);

      expect(mockGetSession).toHaveBeenCalledWith('agent-1');
      expect(mockHandleStall).toHaveBeenCalledWith(classification);
    });

    it('is a no-op if session not found', () => {
      const manager = new AgentManager(logger);
      mockGetSession.mockReturnValue(undefined);

      // Should not throw
      manager.handleStallClassification('nonexistent', null);
    });
  });

  describe('metrics', () => {
    it('delegates to pty-manager metrics', async () => {
      const manager = new AgentManager(logger);
      mockMetricsFn.mockReturnValue({ uptime: 120, messageCount: 5 });

      const metrics = await manager.metrics('agent-1');

      expect(mockMetricsFn).toHaveBeenCalledWith('agent-1');
      expect(metrics).toEqual({ uptime: 120, messageCount: 5 });
    });

    it('returns null when agent not found', async () => {
      const manager = new AgentManager(logger);
      mockMetricsFn.mockReturnValue(null);

      const metrics = await manager.metrics('nonexistent');
      expect(metrics).toBeNull();
    });
  });

  describe('workspace operations', () => {
    it('throws when workspace service not configured', async () => {
      const manager = new AgentManager(logger);

      await expect(
        manager.provisionWorkspace({} as never)
      ).rejects.toThrow('Workspace service not configured');

      await expect(
        manager.finalizeWorkspace('ws-1', {} as never)
      ).rejects.toThrow('Workspace service not configured');

      await expect(
        manager.cleanupWorkspace('ws-1')
      ).rejects.toThrow('Workspace service not configured');
    });

    it('delegates provisionWorkspace to workspace service', async () => {
      const manager = new AgentManager(logger, {
        workspace: { baseDir: '/tmp' } as never,
      });

      const mockWorkspace = {
        id: 'ws-1',
        path: '/tmp/ws-1',
        repo: 'https://github.com/test/repo',
        branch: { name: 'parallax/exec-1/engineer-test' },
        status: 'ready',
        strategy: 'clone',
      };
      mockProvision.mockResolvedValue(mockWorkspace);

      const config = {
        repo: 'https://github.com/test/repo',
        baseBranch: 'main',
        branchStrategy: 'feature_branch' as const,
        execution: { id: 'exec-1', patternName: 'test' },
        task: { id: 'task-1', role: 'engineer' },
      };
      const result = await manager.provisionWorkspace(config);

      expect(mockProvision).toHaveBeenCalledWith(config);
      expect(result).toEqual(mockWorkspace);
    });

    it('delegates finalizeWorkspace to workspace service', async () => {
      const manager = new AgentManager(logger, {
        workspace: { baseDir: '/tmp' } as never,
      });

      const mockPr = { number: 42, url: 'https://github.com/test/repo/pull/42' };
      mockFinalize.mockResolvedValue(mockPr);

      const options = { push: true, createPr: true, cleanup: false, pr: { title: 'test', body: 'body', targetBranch: 'main' } };
      const result = await manager.finalizeWorkspace('ws-1', options);

      expect(mockFinalize).toHaveBeenCalledWith('ws-1', options);
      expect(result).toEqual(mockPr);
    });

    it('delegates cleanupWorkspace to workspace service', async () => {
      const manager = new AgentManager(logger, {
        workspace: { baseDir: '/tmp' } as never,
      });

      mockCleanup.mockResolvedValue(undefined);
      await manager.cleanupWorkspace('ws-1');

      expect(mockCleanup).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('getHealth', () => {
    it('includes adapter preflight results', async () => {
      const manager = new AgentManager(logger);

      const health = await manager.getHealth();

      expect(mockCheckAdapters).toHaveBeenCalledWith(['claude', 'gemini', 'codex', 'aider']);
      expect(health.adapters).toHaveLength(4);
      expect(health.adapters[0]).toEqual({
        type: 'Claude Code',
        installed: true,
        version: '2.1.0',
        error: undefined,
      });
      expect(health.adapters[1]).toEqual({
        type: 'Gemini CLI',
        installed: false,
        version: undefined,
        error: 'not found',
      });
    });

    it('reports workspace service status', async () => {
      const managerWithoutWs = new AgentManager(logger);
      const health1 = await managerWithoutWs.getHealth();
      expect(health1.workspaceServiceEnabled).toBe(false);

      const managerWithWs = new AgentManager(logger, {
        workspace: { baseDir: '/tmp' } as never,
      });
      const health2 = await managerWithWs.getHealth();
      expect(health2.workspaceServiceEnabled).toBe(true);
    });

    it('reports agent count and max', async () => {
      const manager = new AgentManager(logger, { maxAgents: 5 });
      mockList.mockResolvedValue([{ id: '1' }, { id: '2' }]);

      const health = await manager.getHealth();
      expect(health.agentCount).toBe(2);
      expect(health.maxAgents).toBe(5);
      expect(health.healthy).toBe(true);
    });
  });

  describe('event forwarding', () => {
    it('forwards auth_required event with agent handle', () => {
      const manager = new AgentManager(logger);

      const authHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'auth_required'
      )?.[1] as Function;
      expect(authHandler).toBeDefined();

      const emitSpy = vi.spyOn(manager, 'emit');
      authHandler(
        { id: 'agent-1', name: 'test', type: 'claude', status: 'authenticating' },
        { method: 'oauth_browser', url: 'https://claude.ai/oauth/authorize', instructions: 'Open URL' }
      );

      expect(emitSpy).toHaveBeenCalledWith(
        'auth_required',
        expect.objectContaining({ id: 'agent-1' }),
        expect.objectContaining({ method: 'oauth_browser', url: 'https://claude.ai/oauth/authorize' })
      );
    });

    it('forwards stall_detected event with agent handle', () => {
      const manager = new AgentManager(logger);

      // Find and invoke the stall_detected handler
      const stallHandler = mockOn.mock.calls.find(
        (c: unknown[]) => c[0] === 'stall_detected'
      )?.[1] as Function;
      expect(stallHandler).toBeDefined();

      const emitSpy = vi.spyOn(manager, 'emit');
      stallHandler(
        { id: 'agent-1', name: 'test', type: 'claude', status: 'busy' },
        'some output text',
        8000
      );

      expect(emitSpy).toHaveBeenCalledWith(
        'stall_detected',
        expect.objectContaining({ id: 'agent-1' }),
        'some output text',
        8000
      );
    });
  });

  describe('getWorkspaceFiles', () => {
    it('returns file descriptors for claude', () => {
      const manager = new AgentManager(logger);
      const claudeFiles = [
        { relativePath: 'CLAUDE.md', description: 'Claude memory file', autoLoaded: true, type: 'memory', format: 'markdown' },
      ];
      mockGetWorkspaceFiles.mockReturnValue(claudeFiles);

      const files = manager.getWorkspaceFiles('claude');

      expect(mockCreateAdapter).toHaveBeenCalledWith('claude');
      expect(files).toEqual(claudeFiles);
    });

    it('returns file descriptors for aider', () => {
      const manager = new AgentManager(logger);
      const aiderFiles = [
        { relativePath: '.aider.conventions.md', description: 'Aider conventions', autoLoaded: true, type: 'memory', format: 'markdown' },
      ];
      mockGetWorkspaceFiles.mockReturnValue(aiderFiles);

      const files = manager.getWorkspaceFiles('aider');

      expect(mockCreateAdapter).toHaveBeenCalledWith('aider');
      expect(files).toEqual(aiderFiles);
    });

    it('returns empty array for custom agent type', () => {
      const manager = new AgentManager(logger);

      const files = manager.getWorkspaceFiles('custom');

      expect(mockCreateAdapter).not.toHaveBeenCalled();
      expect(files).toEqual([]);
    });
  });

  describe('writeWorkspaceFile', () => {
    it('writes memory file and returns path', async () => {
      const manager = new AgentManager(logger);
      mockWriteMemoryFile.mockResolvedValue('/tmp/workspace/CLAUDE.md');

      const path = await manager.writeWorkspaceFile('claude', '/tmp/workspace', '# Instructions');

      expect(mockCreateAdapter).toHaveBeenCalledWith('claude');
      expect(mockWriteMemoryFile).toHaveBeenCalledWith('/tmp/workspace', '# Instructions', undefined);
      expect(path).toBe('/tmp/workspace/CLAUDE.md');
    });

    it('passes options through to writeMemoryFile', async () => {
      const manager = new AgentManager(logger);
      mockWriteMemoryFile.mockResolvedValue('/tmp/workspace/custom.md');

      await manager.writeWorkspaceFile('gemini', '/tmp/workspace', 'content', {
        fileName: 'custom.md',
        append: true,
      });

      expect(mockWriteMemoryFile).toHaveBeenCalledWith('/tmp/workspace', 'content', {
        fileName: 'custom.md',
        append: true,
      });
    });

    it('throws for custom agent type', async () => {
      const manager = new AgentManager(logger);

      await expect(
        manager.writeWorkspaceFile('custom', '/tmp', 'content')
      ).rejects.toThrow('Custom agents have no default workspace files');
    });
  });

  describe('list with filters', () => {
    it('filters by role', async () => {
      const manager = new AgentManager(logger);

      // Mock spawn to echo back the id from the config
      mockSpawn.mockImplementation((cfg: { id: string; name: string; type: string }) =>
        Promise.resolve({ id: cfg.id, name: cfg.name, type: cfg.type, status: 'ready' })
      );

      await manager.spawn({ name: 'arch', type: 'claude', capabilities: [], role: 'architect' });
      await manager.spawn({ name: 'eng', type: 'claude', capabilities: [], role: 'engineer' });

      // Get the generated IDs from the spawn calls
      const id1 = mockSpawn.mock.calls[0][0].id;
      const id2 = mockSpawn.mock.calls[1][0].id;

      mockList.mockResolvedValue([
        { id: id1, name: 'arch', type: 'claude', status: 'ready' },
        { id: id2, name: 'eng', type: 'claude', status: 'ready' },
      ]);

      const architects = await manager.list({ role: 'architect' });
      expect(architects).toHaveLength(1);
      expect(architects[0].role).toBe('architect');
    });

    it('filters by capabilities', async () => {
      const manager = new AgentManager(logger);

      mockSpawn.mockImplementation((cfg: { id: string; name: string; type: string }) =>
        Promise.resolve({ id: cfg.id, name: cfg.name, type: cfg.type, status: 'ready' })
      );

      await manager.spawn({ name: 'full', type: 'claude', capabilities: ['code', 'review', 'test'] });
      await manager.spawn({ name: 'review', type: 'claude', capabilities: ['review'] });

      const id1 = mockSpawn.mock.calls[0][0].id;
      const id2 = mockSpawn.mock.calls[1][0].id;

      mockList.mockResolvedValue([
        { id: id1, name: 'full', type: 'claude', status: 'ready' },
        { id: id2, name: 'review', type: 'claude', status: 'ready' },
      ]);

      const codeAndReview = await manager.list({ capabilities: ['code', 'review'] });
      expect(codeAndReview).toHaveLength(1);
      expect(codeAndReview[0].name).toBe('full');
    });
  });
});

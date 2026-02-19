import { describe, it, expect, vi } from 'vitest';
import {
  SpawnInputSchema,
  ProvisionWorkspaceInputSchema,
  FinalizeWorkspaceInputSchema,
  CleanupWorkspaceInputSchema,
  executeSpawn,
  executeStop,
  executeList,
  executeGet,
  executeSend,
  executeHealth,
  executeProvisionWorkspace,
  executeFinalizeWorkspace,
  executeCleanupWorkspace,
  executeListPresets,
  executeGetPresetConfig,
  TOOLS,
  TOOL_PERMISSIONS,
} from './index.js';

// ─────────────────────────────────────────────────────────────────────────────
// Mock AgentManager
// ─────────────────────────────────────────────────────────────────────────────

function createMockManager(overrides: Record<string, unknown> = {}) {
  return {
    spawn: vi.fn().mockResolvedValue({
      id: 'agent-1', name: 'test', type: 'claude', status: 'starting',
      capabilities: ['code'], role: 'engineer',
    }),
    stop: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue({
      id: 'agent-1', name: 'test', type: 'claude', status: 'ready',
      capabilities: ['code'], role: 'engineer',
    }),
    list: vi.fn().mockResolvedValue([
      { id: 'agent-1', name: 'test', type: 'claude', status: 'ready', capabilities: ['code'], role: 'engineer' },
    ]),
    send: vi.fn().mockResolvedValue({
      id: 'msg-1', agentId: 'agent-1', direction: 'inbound', type: 'task',
      timestamp: new Date(),
    }),
    logs: vi.fn().mockImplementation(async function* () { yield 'line 1'; yield 'line 2'; }),
    metrics: vi.fn().mockResolvedValue({ uptime: 60, messageCount: 3 }),
    getHealth: vi.fn().mockResolvedValue({
      healthy: true, agentCount: 1, maxAgents: 10,
      adapters: [
        { type: 'Claude Code', installed: true, version: '2.1.0' },
        { type: 'Gemini CLI', installed: false, error: 'not found' },
      ],
      workspaceServiceEnabled: true,
      stallDetectionEnabled: true,
    }),
    provisionWorkspace: vi.fn().mockResolvedValue({
      id: 'ws-1', path: '/tmp/ws-1', repo: 'https://github.com/test/repo',
      branch: { name: 'parallax/exec-1/engineer-test' }, status: 'ready', strategy: 'clone',
    }),
    finalizeWorkspace: vi.fn().mockResolvedValue({
      number: 42, url: 'https://github.com/test/repo/pull/42',
    }),
    cleanupWorkspace: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never;
}

// ─────────────────────────────────────────────────────────────────────────────
// Schema validation tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Tool schemas', () => {
  describe('SpawnInputSchema', () => {
    it('accepts ruleOverrides with null values (disable rule)', () => {
      const input = {
        name: 'test', type: 'claude', capabilities: ['code'],
        ruleOverrides: { 'trust.*folder': null },
      };
      const parsed = SpawnInputSchema.parse(input);
      expect(parsed.ruleOverrides).toEqual({ 'trust.*folder': null });
    });

    it('accepts ruleOverrides with object values (merge override)', () => {
      const input = {
        name: 'test', type: 'claude', capabilities: ['code'],
        ruleOverrides: { 'update available.*\\[y\\/n\\]': { response: 'y' } },
      };
      const parsed = SpawnInputSchema.parse(input);
      expect(parsed.ruleOverrides?.['update available.*\\[y\\/n\\]']).toEqual({ response: 'y' });
    });

    it('accepts stallTimeoutMs', () => {
      const input = {
        name: 'test', type: 'claude', capabilities: ['code'],
        stallTimeoutMs: 15000,
      };
      const parsed = SpawnInputSchema.parse(input);
      expect(parsed.stallTimeoutMs).toBe(15000);
    });

    it('accepts approvalPreset', () => {
      const input = {
        name: 'test', type: 'claude', capabilities: ['code'],
        approvalPreset: 'permissive',
      };
      const parsed = SpawnInputSchema.parse(input);
      expect(parsed.approvalPreset).toBe('permissive');
    });

    it('rejects invalid approvalPreset', () => {
      expect(() => SpawnInputSchema.parse({
        name: 'test', type: 'claude', capabilities: [],
        approvalPreset: 'invalid_preset',
      })).toThrow();
    });

    it('rejects invalid agent type', () => {
      expect(() => SpawnInputSchema.parse({
        name: 'test', type: 'invalid_type', capabilities: [],
      })).toThrow();
    });
  });

  describe('ProvisionWorkspaceInputSchema', () => {
    it('validates required fields', () => {
      const input = {
        repo: 'https://github.com/test/repo',
        executionId: 'exec-1',
      };
      const parsed = ProvisionWorkspaceInputSchema.parse(input);
      expect(parsed.repo).toBe('https://github.com/test/repo');
      expect(parsed.baseBranch).toBe('main');
      expect(parsed.strategy).toBe('clone');
      expect(parsed.branchStrategy).toBe('feature_branch');
      expect(parsed.role).toBe('engineer');
    });

    it('accepts credentials', () => {
      const input = {
        repo: 'https://github.com/test/repo',
        executionId: 'exec-1',
        credentials: { type: 'pat' as const, token: 'ghp_test123' },
      };
      const parsed = ProvisionWorkspaceInputSchema.parse(input);
      expect(parsed.credentials?.type).toBe('pat');
    });
  });

  describe('FinalizeWorkspaceInputSchema', () => {
    it('validates with PR config', () => {
      const input = {
        workspaceId: 'ws-1',
        push: true,
        createPr: true,
        pr: { title: 'feat: test', body: 'Test PR', targetBranch: 'main' },
      };
      const parsed = FinalizeWorkspaceInputSchema.parse(input);
      expect(parsed.pr?.title).toBe('feat: test');
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool definitions
// ─────────────────────────────────────────────────────────────────────────────

describe('TOOLS', () => {
  it('defines 15 tools', () => {
    expect(TOOLS).toHaveLength(15);
  });

  it('includes spawn with ruleOverrides and stallTimeoutMs properties', () => {
    const spawn = TOOLS.find(t => t.name === 'spawn');
    expect(spawn).toBeDefined();
    expect(spawn!.inputSchema.properties).toHaveProperty('ruleOverrides');
    expect(spawn!.inputSchema.properties).toHaveProperty('stallTimeoutMs');
  });

  it('includes workspace tools', () => {
    const names = TOOLS.map(t => t.name);
    expect(names).toContain('provision_workspace');
    expect(names).toContain('finalize_workspace');
    expect(names).toContain('cleanup_workspace');
  });

  it('includes preset tools', () => {
    const names = TOOLS.map(t => t.name);
    expect(names).toContain('list_presets');
    expect(names).toContain('get_preset_config');
  });

  it('includes approvalPreset property in spawn tool', () => {
    const spawn = TOOLS.find(t => t.name === 'spawn');
    expect(spawn!.inputSchema.properties).toHaveProperty('approvalPreset');
  });
});

describe('TOOL_PERMISSIONS', () => {
  it('maps workspace tools to workspace: permissions', () => {
    expect(TOOL_PERMISSIONS.provision_workspace).toBe('workspace:provision');
    expect(TOOL_PERMISSIONS.finalize_workspace).toBe('workspace:finalize');
    expect(TOOL_PERMISSIONS.cleanup_workspace).toBe('workspace:cleanup');
  });

  it('maps preset tools to presets: permissions', () => {
    expect(TOOL_PERMISSIONS.list_presets).toBe('presets:list');
    expect(TOOL_PERMISSIONS.get_preset_config).toBe('presets:read');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Executor tests
// ─────────────────────────────────────────────────────────────────────────────

describe('Tool executors', () => {
  describe('executeSpawn', () => {
    it('passes ruleOverrides and stallTimeoutMs to manager.spawn', async () => {
      const manager = createMockManager();

      await executeSpawn(manager, {
        name: 'test',
        type: 'claude',
        capabilities: ['code'],
        waitForReady: true,
        ruleOverrides: { 'trust.*folder': null },
        stallTimeoutMs: 12000,
      });

      expect((manager as any).spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          ruleOverrides: { 'trust.*folder': null },
          stallTimeoutMs: 12000,
        })
      );
    });

    it('returns agent info on success', async () => {
      const manager = createMockManager();
      const result = await executeSpawn(manager, {
        name: 'test', type: 'claude', capabilities: ['code'], waitForReady: true,
      });

      expect(result.success).toBe(true);
      expect(result.agent.id).toBe('agent-1');
      expect(result.agent.type).toBe('claude');
    });
  });

  describe('executeStop', () => {
    it('calls manager.stop with options', async () => {
      const manager = createMockManager();
      const result = await executeStop(manager, { agentId: 'agent-1', force: true });

      expect((manager as any).stop).toHaveBeenCalledWith('agent-1', { force: true, timeout: undefined });
      expect(result.success).toBe(true);
    });
  });

  describe('executeList', () => {
    it('returns agent list', async () => {
      const manager = createMockManager();
      const result = await executeList(manager, {});

      expect(result.success).toBe(true);
      expect(result.count).toBe(1);
      expect(result.agents[0].id).toBe('agent-1');
    });
  });

  describe('executeGet', () => {
    it('returns agent details', async () => {
      const manager = createMockManager();
      const result = await executeGet(manager, { agentId: 'agent-1' });
      expect(result.success).toBe(true);
    });

    it('returns error when agent not found', async () => {
      const manager = createMockManager({ get: vi.fn().mockResolvedValue(null) });
      const result = await executeGet(manager, { agentId: 'nonexistent' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('executeSend', () => {
    it('returns message info', async () => {
      const manager = createMockManager();
      const result = await executeSend(manager, {
        agentId: 'agent-1', message: 'hello', expectResponse: false,
      });
      expect(result.success).toBe(true);
      expect(result.message.agentId).toBe('agent-1');
    });
  });

  describe('executeHealth', () => {
    it('returns full health including adapter status', async () => {
      const manager = createMockManager();
      const result = await executeHealth(manager);

      expect(result.success).toBe(true);
      expect(result.healthy).toBe(true);
      expect(result.adapters).toHaveLength(2);
      expect(result.workspaceServiceEnabled).toBe(true);
    });
  });

  describe('executeProvisionWorkspace', () => {
    it('provisions workspace and returns info', async () => {
      const manager = createMockManager();
      const result = await executeProvisionWorkspace(manager, {
        repo: 'https://github.com/test/repo',
        baseBranch: 'main',
        provider: 'github',
        strategy: 'clone',
        executionId: 'exec-1',
        role: 'engineer',
        branchStrategy: 'feature_branch',
      });

      expect(result.success).toBe(true);
      expect(result.workspace.id).toBe('ws-1');
      expect(result.workspace.path).toBe('/tmp/ws-1');
      expect(result.workspace.branch).toBe('parallax/exec-1/engineer-test');
    });
  });

  describe('executeFinalizeWorkspace', () => {
    it('finalizes workspace and returns PR info', async () => {
      const manager = createMockManager();
      const result = await executeFinalizeWorkspace(manager, {
        workspaceId: 'ws-1',
        push: true,
        createPr: true,
        pr: { title: 'feat: test', body: 'body', targetBranch: 'main' },
        cleanup: false,
      });

      expect(result.success).toBe(true);
      expect(result.pullRequest?.number).toBe(42);
      expect(result.pullRequest?.url).toContain('pull/42');
    });
  });

  describe('executeCleanupWorkspace', () => {
    it('cleans up workspace', async () => {
      const manager = createMockManager();
      const result = await executeCleanupWorkspace(manager, { workspaceId: 'ws-1' });

      expect(result.success).toBe(true);
      expect(result.workspaceId).toBe('ws-1');
      expect((manager as any).cleanupWorkspace).toHaveBeenCalledWith('ws-1');
    });
  });

  describe('executeSpawn with approvalPreset', () => {
    it('passes approvalPreset to manager.spawn', async () => {
      const manager = createMockManager();

      await executeSpawn(manager, {
        name: 'test',
        type: 'claude',
        capabilities: ['code'],
        waitForReady: true,
        approvalPreset: 'permissive',
      });

      expect((manager as any).spawn).toHaveBeenCalledWith(
        expect.objectContaining({
          approvalPreset: 'permissive',
        })
      );
    });
  });

  describe('executeListPresets', () => {
    it('returns all preset definitions', () => {
      const result = executeListPresets();
      expect(result.success).toBe(true);
      expect(result.presets).toHaveLength(4);
      expect(result.presets.map((p: { preset: string }) => p.preset)).toEqual([
        'readonly', 'standard', 'permissive', 'autonomous',
      ]);
    });
  });

  describe('executeGetPresetConfig', () => {
    it('returns config for claude/standard', () => {
      const result = executeGetPresetConfig({ agentType: 'claude', preset: 'standard' });
      expect(result.success).toBe(true);
      expect(result.config.preset).toBe('standard');
      expect(result.config.summary).toContain('Claude');
      expect(result.config.workspaceFiles.length).toBeGreaterThan(0);
    });

    it('returns config for gemini/autonomous', () => {
      const result = executeGetPresetConfig({ agentType: 'gemini', preset: 'autonomous' });
      expect(result.success).toBe(true);
      expect(result.config.cliFlags).toContain('-y');
    });

    it('returns config for codex/readonly', () => {
      const result = executeGetPresetConfig({ agentType: 'codex', preset: 'readonly' });
      expect(result.success).toBe(true);
      expect(result.config.cliFlags).toContain('--sandbox');
    });

    it('returns config for aider/permissive', () => {
      const result = executeGetPresetConfig({ agentType: 'aider', preset: 'permissive' });
      expect(result.success).toBe(true);
      expect(result.config.cliFlags).toContain('--yes-always');
    });
  });
});

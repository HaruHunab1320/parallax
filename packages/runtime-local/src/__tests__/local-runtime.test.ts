/**
 * Unit tests for LocalRuntime
 */

import { EventEmitter } from 'node:events';
import type { Logger } from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────
// Mock pty-manager
// ─────────────────────────────────────────────────────────────

const mockManager = {
  spawn: vi.fn(),
  stop: vi.fn(),
  get: vi.fn(),
  has: vi.fn(),
  list: vi.fn(),
  send: vi.fn(),
  shutdown: vi.fn(),
  getStatusCounts: vi.fn(),
  getSession: vi.fn(),
  attachTerminal: vi.fn(),
  metrics: vi.fn(),
  logs: vi.fn(),
  adapters: { all: vi.fn().mockReturnValue([]) },
  registerAdapter: vi.fn(),
  on: vi.fn(),
  off: vi.fn(),
  emit: vi.fn(),
};

vi.mock('pty-manager', () => ({
  PTYManager: vi.fn().mockImplementation(() => mockManager),
}));

// ─────────────────────────────────────────────────────────────
// Mock coding-agent-adapters (via adapters/index.ts)
// ─────────────────────────────────────────────────────────────

vi.mock('../adapters', () => ({
  registerAllAdapters: vi.fn(),
}));

// ─────────────────────────────────────────────────────────────
// Mock filesystem
// ─────────────────────────────────────────────────────────────

vi.mock('node:fs', () => ({
  existsSync: vi.fn().mockReturnValue(false),
  mkdirSync: vi.fn(),
  rmSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { LocalRuntime } from '../local-runtime';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function createLogger(): Logger {
  const noop = vi.fn();
  return {
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    trace: noop,
    child: vi.fn().mockReturnThis(),
  } as unknown as Logger;
}

function makeSessionHandle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'agent-1',
    name: 'Test Agent',
    type: 'claude',
    status: 'ready',
    pid: 1234,
    startedAt: new Date('2025-01-01'),
    lastActivityAt: new Date('2025-01-01'),
    error: undefined,
    exitCode: undefined,
    ...overrides,
  };
}

function makeSessionMessage(overrides: Record<string, unknown> = {}) {
  return {
    id: 'msg-1',
    sessionId: 'agent-1',
    direction: 'inbound' as const,
    type: 'task' as const,
    content: 'hello',
    metadata: {},
    timestamp: new Date('2025-01-01'),
    ...overrides,
  };
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

describe('LocalRuntime', () => {
  let runtime: LocalRuntime;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = createLogger();
    runtime = new LocalRuntime(logger);
  });

  afterEach(async () => {
    runtime.removeAllListeners();
  });

  // ─────────────────────────────────────────────────────────
  // Construction
  // ─────────────────────────────────────────────────────────

  describe('construction', () => {
    it('should create with default options', () => {
      expect(runtime.name).toBe('local');
      expect(runtime.type).toBe('local');
    });

    it('should accept custom maxAgents option', () => {
      const custom = new LocalRuntime(logger, { maxAgents: 5 });
      expect(custom.name).toBe('local');
    });

    it('should be an EventEmitter (extends BaseRuntimeProvider)', () => {
      expect(runtime).toBeInstanceOf(EventEmitter);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────

  describe('initialize', () => {
    it('should set initialized state', async () => {
      mockManager.getStatusCounts.mockReturnValue({
        ready: 0,
        busy: 0,
        error: 0,
      });
      await runtime.initialize();
      const health = await runtime.healthCheck();
      expect(health.healthy).toBe(true);
    });

    it('should be idempotent', async () => {
      mockManager.getStatusCounts.mockReturnValue({
        ready: 0,
        busy: 0,
        error: 0,
      });
      await runtime.initialize();
      await runtime.initialize();
      // Should not throw
      const health = await runtime.healthCheck();
      expect(health.healthy).toBe(true);
    });

    it('should validate adapter installations', async () => {
      const mockAdapter = {
        adapterType: 'claude',
        validateInstallation: vi
          .fn()
          .mockResolvedValue({ installed: true, version: '1.0' }),
      };
      mockManager.adapters.all.mockReturnValueOnce([mockAdapter]);

      await runtime.initialize();

      expect(mockAdapter.validateInstallation).toHaveBeenCalled();
    });

    it('should warn when CLI adapter is not installed', async () => {
      const mockAdapter = {
        adapterType: 'codex',
        validateInstallation: vi
          .fn()
          .mockResolvedValue({ installed: false, error: 'not found' }),
      };
      mockManager.adapters.all.mockReturnValueOnce([mockAdapter]);

      await runtime.initialize();

      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('shutdown', () => {
    it('should call manager.shutdown when stopAgents is true', async () => {
      await runtime.initialize();
      await runtime.shutdown(true);

      expect(mockManager.shutdown).toHaveBeenCalled();
    });

    it('should not call manager.shutdown when stopAgents is false', async () => {
      await runtime.initialize();
      await runtime.shutdown(false);

      expect(mockManager.shutdown).not.toHaveBeenCalled();
    });

    it('should clear agent configs and reset initialized state', async () => {
      await runtime.initialize();
      await runtime.shutdown();

      const health = await runtime.healthCheck();
      expect(health.healthy).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Health Check
  // ─────────────────────────────────────────────────────────

  describe('healthCheck', () => {
    it('should return unhealthy when not initialized', async () => {
      const health = await runtime.healthCheck();
      expect(health.healthy).toBe(false);
      expect(health.message).toBe('Runtime not initialized');
    });

    it('should return healthy with agent counts after init', async () => {
      mockManager.getStatusCounts.mockReturnValue({
        ready: 2,
        busy: 1,
        error: 0,
      });

      await runtime.initialize();
      const health = await runtime.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toContain('3 agents');
      expect(health.message).toContain('2 ready');
      expect(health.message).toContain('1 busy');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Agent Spawning
  // ─────────────────────────────────────────────────────────

  describe('spawn', () => {
    beforeEach(async () => {
      await runtime.initialize();
    });

    it('should throw when not initialized', async () => {
      await runtime.shutdown(false);
      await expect(
        runtime.spawn({
          name: 'Test',
          type: 'claude',
          capabilities: [],
        })
      ).rejects.toThrow('Runtime not initialized');
    });

    it('should spawn an agent via manager', async () => {
      const sessionHandle = makeSessionHandle({ id: 'my-agent' });
      mockManager.spawn.mockResolvedValue(sessionHandle);
      mockManager.list.mockReturnValue([]);

      const handle = await runtime.spawn({
        id: 'my-agent',
        name: 'Test Agent',
        type: 'claude',
        capabilities: ['coding'],
        role: 'engineer',
      });

      expect(mockManager.spawn).toHaveBeenCalled();
      expect(handle.name).toBe('Test Agent');
      expect(handle.type).toBe('claude');
      expect(handle.status).toBe('ready');
      expect(handle.role).toBe('engineer');
      expect(handle.capabilities).toEqual(['coding']);
    });

    it('should use provided id when specified', async () => {
      const sessionHandle = makeSessionHandle({ id: 'custom-id' });
      mockManager.spawn.mockResolvedValue(sessionHandle);
      mockManager.list.mockReturnValue([]);

      const handle = await runtime.spawn({
        id: 'custom-id',
        name: 'Test',
        type: 'claude',
        capabilities: [],
      });

      const spawnArg = mockManager.spawn.mock.calls[0][0];
      expect(spawnArg.id).toBe('custom-id');
      expect(handle.id).toBe('custom-id');
    });

    it('should enforce maxAgents limit', async () => {
      const rt = new LocalRuntime(logger, { maxAgents: 2 });
      await rt.initialize();

      mockManager.list.mockReturnValue([
        makeSessionHandle({ id: '1' }),
        makeSessionHandle({ id: '2' }),
      ]);

      await expect(
        rt.spawn({ name: 'Too Many', type: 'claude', capabilities: [] })
      ).rejects.toThrow('Maximum agent limit reached (2)');
    });

    it('should set up shared auth directory when executionId is provided', async () => {
      const sessionHandle = makeSessionHandle();
      mockManager.spawn.mockResolvedValue(sessionHandle);
      mockManager.list.mockReturnValue([]);

      await runtime.spawn({
        name: 'Test',
        type: 'claude',
        capabilities: [],
        executionId: 'exec-12345678',
      });

      expect(mkdirSync).toHaveBeenCalled();
      const spawnArg = mockManager.spawn.mock.calls[0][0];
      expect(spawnArg.env.PARALLAX_EXECUTION_ID).toBe('exec-12345678');
      expect(spawnArg.env.CLAUDE_CONFIG_DIR).toBeDefined();
      expect(spawnArg.env.CODEX_CONFIG_DIR).toBeDefined();
    });
  });

  // ─────────────────────────────────────────────────────────
  // Agent Stop / Restart
  // ─────────────────────────────────────────────────────────

  describe('stop', () => {
    it('should delegate to manager.stop', async () => {
      mockManager.stop.mockResolvedValue(undefined);
      await runtime.stop('agent-1', { force: true });

      expect(mockManager.stop).toHaveBeenCalledWith('agent-1', { force: true });
    });
  });

  describe('restart', () => {
    it('should throw if agent not found', async () => {
      await expect(runtime.restart('nonexistent')).rejects.toThrow(
        'Agent not found: nonexistent'
      );
    });

    it('should stop then respawn the agent', async () => {
      await runtime.initialize();

      // First spawn to register the config
      const sessionHandle = makeSessionHandle();
      mockManager.spawn.mockResolvedValue(sessionHandle);
      mockManager.list.mockReturnValue([]);
      mockManager.stop.mockResolvedValue(undefined);

      await runtime.spawn({
        id: 'agent-1',
        name: 'Test',
        type: 'claude',
        capabilities: ['coding'],
      });

      // Restart
      const newHandle = makeSessionHandle({ id: 'agent-2' });
      mockManager.spawn.mockResolvedValue(newHandle);

      const handle = await runtime.restart('agent-1');

      expect(mockManager.stop).toHaveBeenCalledWith('agent-1', {
        timeout: 5000,
      });
      expect(handle.id).toBe('agent-2');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Agent Get / List
  // ─────────────────────────────────────────────────────────

  describe('get', () => {
    it('should return null when agent not found', async () => {
      mockManager.get.mockReturnValue(null);
      const result = await runtime.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should return agent handle when found', async () => {
      mockManager.get.mockReturnValue(makeSessionHandle());
      const handle = await runtime.get('agent-1');

      expect(handle).not.toBeNull();
      expect(handle!.id).toBe('agent-1');
      expect(handle!.name).toBe('Test Agent');
    });
  });

  describe('list', () => {
    it('should return all agents when no filter', async () => {
      mockManager.list.mockReturnValue([
        makeSessionHandle({ id: 'a1' }),
        makeSessionHandle({ id: 'a2' }),
      ]);

      const agents = await runtime.list();
      expect(agents).toHaveLength(2);
    });

    it('should pass status and type filters to manager', async () => {
      mockManager.list.mockReturnValue([]);

      await runtime.list({ status: 'ready', type: 'claude' });

      expect(mockManager.list).toHaveBeenCalledWith({
        status: 'ready',
        type: 'claude',
      });
    });

    it('should filter by role in the runtime layer', async () => {
      await runtime.initialize();

      // Spawn two agents with different roles
      mockManager.list.mockReturnValue([]);
      mockManager.spawn.mockResolvedValue(
        makeSessionHandle({ id: 'eng-1' })
      );
      await runtime.spawn({
        id: 'eng-1',
        name: 'Engineer',
        type: 'claude',
        capabilities: [],
        role: 'engineer',
      });

      mockManager.spawn.mockResolvedValue(
        makeSessionHandle({ id: 'qa-1' })
      );
      await runtime.spawn({
        id: 'qa-1',
        name: 'QA',
        type: 'claude',
        capabilities: [],
        role: 'qa',
      });

      // Now list with filter
      mockManager.list.mockReturnValue([
        makeSessionHandle({ id: 'eng-1' }),
        makeSessionHandle({ id: 'qa-1' }),
      ]);

      const engineers = await runtime.list({ role: 'engineer' });
      expect(engineers).toHaveLength(1);
      expect(engineers[0].role).toBe('engineer');
    });

    it('should filter by capabilities', async () => {
      await runtime.initialize();

      mockManager.list.mockReturnValue([]);
      mockManager.spawn.mockResolvedValue(
        makeSessionHandle({ id: 'a1' })
      );
      await runtime.spawn({
        id: 'a1',
        name: 'A1',
        type: 'claude',
        capabilities: ['coding', 'review'],
      });

      mockManager.spawn.mockResolvedValue(
        makeSessionHandle({ id: 'a2' })
      );
      await runtime.spawn({
        id: 'a2',
        name: 'A2',
        type: 'claude',
        capabilities: ['coding'],
      });

      mockManager.list.mockReturnValue([
        makeSessionHandle({ id: 'a1' }),
        makeSessionHandle({ id: 'a2' }),
      ]);

      const reviewers = await runtime.list({
        capabilities: ['coding', 'review'],
      });
      expect(reviewers).toHaveLength(1);
      expect(reviewers[0].id).toBe('a1');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Communication
  // ─────────────────────────────────────────────────────────

  describe('send', () => {
    it('should send a message via the manager and return it', async () => {
      const sessionMsg = makeSessionMessage();
      mockManager.send.mockReturnValue(sessionMsg);

      const result = await runtime.send('agent-1', 'hello');

      expect(mockManager.send).toHaveBeenCalledWith('agent-1', 'hello');
      expect(result).toBeDefined();
      expect(result!.agentId).toBe('agent-1');
      expect(result!.content).toBe('hello');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Metrics
  // ─────────────────────────────────────────────────────────

  describe('metrics', () => {
    it('should return null when agent not found', async () => {
      mockManager.metrics.mockReturnValue(null);
      const result = await runtime.metrics('nonexistent');
      expect(result).toBeNull();
    });

    it('should return mapped metrics', async () => {
      mockManager.metrics.mockReturnValue({
        uptime: 120,
        messageCount: 5,
      });

      const result = await runtime.metrics('agent-1');
      expect(result).toEqual({ uptime: 120, messageCount: 5 });
    });
  });

  // ─────────────────────────────────────────────────────────
  // Thread Management
  // ─────────────────────────────────────────────────────────

  describe('spawnThread', () => {
    beforeEach(async () => {
      await runtime.initialize();
      mockManager.list.mockReturnValue([]);
    });

    it('should spawn a thread and return a ThreadHandle', async () => {
      const sessionHandle = makeSessionHandle();
      mockManager.spawn.mockResolvedValue(sessionHandle);

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix the bug',
        role: 'engineer',
      });

      expect(thread.id).toMatch(/^thread-/);
      expect(thread.executionId).toBe('exec-1');
      expect(thread.runtimeName).toBe('local');
      expect(thread.agentType).toBe('claude');
      expect(thread.role).toBe('engineer');
      expect(thread.objective).toBe('Fix the bug');
    });

    it('should use provided thread id', async () => {
      mockManager.spawn.mockResolvedValue(makeSessionHandle());

      const thread = await runtime.spawnThread({
        id: 'my-thread',
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
      });

      expect(thread.id).toBe('my-thread');
    });

    it('should write context files to workspace', async () => {
      mockManager.spawn.mockResolvedValue(makeSessionHandle());

      await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
        workspace: { path: '/tmp/test-workspace' },
        contextFiles: [
          { path: 'MEMORY.md', content: '# Memory\nContext here' },
        ],
      });

      expect(mkdirSync).toHaveBeenCalled();
      expect(writeFileSync).toHaveBeenCalledWith(
        '/tmp/test-workspace/MEMORY.md',
        '# Memory\nContext here',
        'utf-8'
      );
    });

    it('should use preparation spec over top-level fields', async () => {
      mockManager.spawn.mockResolvedValue(makeSessionHandle());

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
        workspace: { path: '/tmp/fallback' },
        preparation: {
          workspace: { path: '/tmp/prepared' },
          env: { CUSTOM: 'value' },
          contextFiles: [{ path: 'prep.md', content: 'prepared' }],
        },
      });

      const spawnArg = mockManager.spawn.mock.calls[0][0];
      expect(spawnArg.workdir).toBe('/tmp/prepared');
      expect(spawnArg.env.CUSTOM).toBe('value');
    });
  });

  describe('stopThread', () => {
    beforeEach(async () => {
      await runtime.initialize();
      mockManager.list.mockReturnValue([]);
    });

    it('should throw when thread not found', async () => {
      await expect(runtime.stopThread('nonexistent')).rejects.toThrow(
        'Thread not found: nonexistent'
      );
    });

    it('should stop the underlying agent', async () => {
      mockManager.spawn.mockResolvedValue(makeSessionHandle());
      mockManager.stop.mockResolvedValue(undefined);

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
      });

      await runtime.stopThread(thread.id, { force: true });

      expect(mockManager.stop).toHaveBeenCalledWith('agent-1', {
        force: true,
      });
    });
  });

  describe('sendToThread', () => {
    beforeEach(async () => {
      await runtime.initialize();
      mockManager.list.mockReturnValue([]);
    });

    it('should throw when thread not found', async () => {
      await expect(
        runtime.sendToThread('nonexistent', { message: 'hello' })
      ).rejects.toThrow('Thread not found: nonexistent');
    });

    it('should send a message to the underlying agent', async () => {
      mockManager.spawn.mockResolvedValue(makeSessionHandle());
      mockManager.send.mockReturnValue(makeSessionMessage());

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
      });

      await runtime.sendToThread(thread.id, { message: 'do the thing' });

      expect(mockManager.send).toHaveBeenCalledWith('agent-1', 'do the thing');
    });

    it('should write raw input to the terminal', async () => {
      const mockTerminal = { write: vi.fn(), resize: vi.fn() };
      mockManager.spawn.mockResolvedValue(makeSessionHandle());
      mockManager.attachTerminal.mockReturnValue(mockTerminal);

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
      });

      await runtime.sendToThread(thread.id, { raw: '\x03' });

      expect(mockTerminal.write).toHaveBeenCalledWith('\x03');
    });

    it('should send keys via session', async () => {
      const mockSession = { sendKeys: vi.fn() };
      const mockTerminal = { write: vi.fn() };
      mockManager.spawn.mockResolvedValue(makeSessionHandle());
      mockManager.attachTerminal.mockReturnValue(mockTerminal);
      mockManager.getSession.mockReturnValue(mockSession);

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
      });

      await runtime.sendToThread(thread.id, { keys: ['Enter'] });

      expect(mockSession.sendKeys).toHaveBeenCalledWith(['Enter']);
    });

    it('should throw when terminal is not available for raw/keys input', async () => {
      mockManager.spawn.mockResolvedValue(makeSessionHandle());
      mockManager.attachTerminal.mockReturnValue(null);

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
      });

      await expect(
        runtime.sendToThread(thread.id, { raw: 'test' })
      ).rejects.toThrow('Terminal not available for thread');
    });
  });

  describe('getThread', () => {
    beforeEach(async () => {
      await runtime.initialize();
      mockManager.list.mockReturnValue([]);
    });

    it('should return null for unknown thread', async () => {
      const result = await runtime.getThread('nonexistent');
      expect(result).toBeNull();
    });

    it('should return thread handle with updated status from session', async () => {
      mockManager.spawn.mockResolvedValue(makeSessionHandle());

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'Fix it',
      });

      mockManager.get.mockReturnValue(
        makeSessionHandle({ status: 'busy', lastActivityAt: new Date() })
      );

      const result = await runtime.getThread(thread.id);
      expect(result).not.toBeNull();
      expect(result!.status).toBe('running'); // busy maps to running
    });
  });

  describe('listThreads', () => {
    beforeEach(async () => {
      await runtime.initialize();
      mockManager.list.mockReturnValue([]);
    });

    it('should return all threads without filter', async () => {
      mockManager.spawn
        .mockResolvedValueOnce(makeSessionHandle({ id: 'a1' }))
        .mockResolvedValueOnce(makeSessionHandle({ id: 'a2' }));
      mockManager.get.mockReturnValue(null);

      await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'T1',
        agentType: 'claude',
        objective: 'obj1',
      });
      await runtime.spawnThread({
        executionId: 'exec-2',
        name: 'T2',
        agentType: 'gemini',
        objective: 'obj2',
      });

      const threads = await runtime.listThreads();
      expect(threads).toHaveLength(2);
    });

    it('should filter by executionId', async () => {
      mockManager.spawn
        .mockResolvedValueOnce(makeSessionHandle({ id: 'a1' }))
        .mockResolvedValueOnce(makeSessionHandle({ id: 'a2' }));
      mockManager.get.mockReturnValue(null);

      await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'T1',
        agentType: 'claude',
        objective: 'obj1',
      });
      await runtime.spawnThread({
        executionId: 'exec-2',
        name: 'T2',
        agentType: 'gemini',
        objective: 'obj2',
      });

      const threads = await runtime.listThreads({ executionId: 'exec-1' });
      expect(threads).toHaveLength(1);
      expect(threads[0].executionId).toBe('exec-1');
    });

    it('should filter by agentType', async () => {
      mockManager.spawn
        .mockResolvedValueOnce(makeSessionHandle({ id: 'a1' }))
        .mockResolvedValueOnce(makeSessionHandle({ id: 'a2' }));
      mockManager.get.mockReturnValue(null);

      await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'T1',
        agentType: 'claude',
        objective: 'obj1',
      });
      await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'T2',
        agentType: 'gemini',
        objective: 'obj2',
      });

      const threads = await runtime.listThreads({ agentType: 'claude' });
      expect(threads).toHaveLength(1);
      expect(threads[0].agentType).toBe('claude');
    });

    it('should filter by status array', async () => {
      mockManager.spawn.mockResolvedValue(makeSessionHandle({ id: 'a1' }));
      mockManager.get.mockReturnValue(null);

      await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'T1',
        agentType: 'claude',
        objective: 'obj1',
      });

      // Thread starts as 'ready' since the mock session handle is ready
      const threads = await runtime.listThreads({
        status: ['ready', 'running'],
      });
      expect(threads).toHaveLength(1);
    });
  });

  // ─────────────────────────────────────────────────────────
  // Event Forwarding
  // ─────────────────────────────────────────────────────────

  describe('event forwarding', () => {
    let eventHandlers: Map<string, Function>;

    beforeEach(async () => {
      // Capture the event handlers registered on the mock manager
      eventHandlers = new Map();
      mockManager.on.mockImplementation((event: string, handler: Function) => {
        eventHandlers.set(event, handler);
      });

      // Re-create runtime to capture fresh event registrations
      runtime = new LocalRuntime(logger);
      await runtime.initialize();
    });

    it('should forward session_started as agent_started', () => {
      const emitSpy = vi.fn();
      runtime.on('agent_started', emitSpy);

      const handler = eventHandlers.get('session_started');
      expect(handler).toBeDefined();

      handler!(makeSessionHandle());
      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1' })
      );
    });

    it('should forward session_ready as agent_ready', () => {
      const emitSpy = vi.fn();
      runtime.on('agent_ready', emitSpy);

      const handler = eventHandlers.get('session_ready');
      handler!(makeSessionHandle());

      expect(emitSpy).toHaveBeenCalled();
    });

    it('should forward session_stopped as agent_stopped', () => {
      const emitSpy = vi.fn();
      runtime.on('agent_stopped', emitSpy);

      const handler = eventHandlers.get('session_stopped');
      handler!(makeSessionHandle(), 'user requested');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1' }),
        'user requested'
      );
    });

    it('should forward session_error as agent_error', () => {
      const emitSpy = vi.fn();
      runtime.on('agent_error', emitSpy);

      const handler = eventHandlers.get('session_error');
      handler!(makeSessionHandle(), 'something broke');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1' }),
        'something broke'
      );
    });

    it('should forward message events', () => {
      const emitSpy = vi.fn();
      runtime.on('message', emitSpy);

      const handler = eventHandlers.get('message');
      handler!(makeSessionMessage());

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          agentId: 'agent-1',
          content: 'hello',
        })
      );
    });

    it('should forward question events', () => {
      const emitSpy = vi.fn();
      runtime.on('question', emitSpy);

      const handler = eventHandlers.get('question');
      handler!(makeSessionHandle(), 'What branch?');

      expect(emitSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'agent-1' }),
        'What branch?'
      );
    });

    it('should emit thread_event when a thread session fires events', async () => {
      mockManager.list.mockReturnValue([]);
      mockManager.spawn.mockResolvedValue(makeSessionHandle());

      const thread = await runtime.spawnThread({
        executionId: 'exec-1',
        name: 'Worker',
        agentType: 'claude',
        objective: 'test',
      });

      const threadEventSpy = vi.fn();
      runtime.on('thread_event', threadEventSpy);

      // Simulate session_ready for this agent
      const readyHandler = eventHandlers.get('session_ready');
      readyHandler!(makeSessionHandle());

      expect(threadEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ id: thread.id }),
        expect.objectContaining({ type: 'thread_ready' })
      );
    });
  });

  // ─────────────────────────────────────────────────────────
  // Terminal Access
  // ─────────────────────────────────────────────────────────

  describe('attachTerminal', () => {
    it('should delegate to manager.attachTerminal', () => {
      const mockTerminal = {
        onData: vi.fn(),
        write: vi.fn(),
        resize: vi.fn(),
      };
      mockManager.attachTerminal.mockReturnValue(mockTerminal);

      const result = runtime.attachTerminal('agent-1');
      expect(result).toBe(mockTerminal);
      expect(mockManager.attachTerminal).toHaveBeenCalledWith('agent-1');
    });

    it('should return null when agent not found', () => {
      mockManager.attachTerminal.mockReturnValue(null);
      const result = runtime.attachTerminal('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('hasAgent', () => {
    it('should delegate to manager.has', () => {
      mockManager.has.mockReturnValue(true);
      expect(runtime.hasAgent('agent-1')).toBe(true);
      expect(mockManager.has).toHaveBeenCalledWith('agent-1');
    });
  });

  // ─────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────

  describe('cleanupExecution', () => {
    it('should remove shared auth directory when it exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);

      await runtime.cleanupExecution('exec-12345678');

      expect(rmSync).toHaveBeenCalledWith(
        expect.stringContaining('parallax-auth-exec-123'),
        { recursive: true, force: true }
      );
    });

    it('should not throw when directory does not exist', async () => {
      vi.mocked(existsSync).mockReturnValue(false);

      await expect(
        runtime.cleanupExecution('exec-12345678')
      ).resolves.not.toThrow();
    });

    it('should warn on cleanup failure and not throw', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(rmSync).mockImplementation(() => {
        throw new Error('permission denied');
      });

      await expect(
        runtime.cleanupExecution('exec-12345678')
      ).resolves.not.toThrow();
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────
  // Status Mapping
  // ─────────────────────────────────────────────────────────

  describe('sessionStatusToThreadStatus mapping', () => {
    beforeEach(async () => {
      await runtime.initialize();
      mockManager.list.mockReturnValue([]);
    });

    const statusMappings: Array<[string, string]> = [
      ['pending', 'pending'],
      ['starting', 'starting'],
      ['authenticating', 'starting'],
      ['ready', 'ready'],
      ['busy', 'running'],
      ['stopping', 'stopped'],
      ['stopped', 'stopped'],
      ['error', 'failed'],
    ];

    for (const [sessionStatus, threadStatus] of statusMappings) {
      it(`should map session "${sessionStatus}" to thread "${threadStatus}"`, async () => {
        mockManager.spawn.mockResolvedValue(
          makeSessionHandle({ status: 'ready' })
        );

        const thread = await runtime.spawnThread({
          executionId: 'exec-1',
          name: 'T',
          agentType: 'claude',
          objective: 'test',
        });

        mockManager.get.mockReturnValue(
          makeSessionHandle({ status: sessionStatus })
        );

        const result = await runtime.getThread(thread.id);
        expect(result!.status).toBe(threadStatus);
      });
    }
  });
});

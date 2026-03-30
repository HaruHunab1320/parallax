/**
 * Tests for GatewayRuntimeAdapter
 */

import { EventEmitter } from 'node:events';
import type { SpawnThreadInput } from '@parallaxai/runtime-interface';
import {
  GatewayRuntimeAdapter,
  type GatewayAgentSessionInfo,
  type GatewayServiceAdapter,
  type GatewayTaskResult,
  type GatewayThreadEventPayload,
  type GatewayThreadSpawnResult,
} from '../gateway-runtime-adapter';

// ─── Helpers ───

function createMockLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
    fatal: vi.fn(),
    trace: vi.fn(),
    level: 'info',
    silent: vi.fn(),
  } as any;
}

function createMockSession(
  overrides: Partial<GatewayAgentSessionInfo> = {}
): GatewayAgentSessionInfo {
  return {
    agentId: 'agent-1',
    agentName: 'Test Agent',
    capabilities: ['claude'],
    metadata: { agentType: 'claude' },
    connectedAt: new Date(),
    lastHeartbeat: new Date(),
    status: 'connected',
    activeThreads: new Map(),
    ...overrides,
  };
}

function createMockGateway(
  agents: Map<string, GatewayAgentSessionInfo> = new Map()
): GatewayServiceAdapter {
  return {
    getConnectedAgents: vi.fn(() => agents),
    dispatchThreadSpawn: vi.fn(
      async (): Promise<GatewayThreadSpawnResult> => ({
        thread_id: 'thread-1',
        success: true,
        workspace_dir: '/tmp/workspace',
      })
    ),
    dispatchThreadInput: vi.fn(),
    dispatchThreadStop: vi.fn(async () => {}),
    dispatchTask: vi.fn(
      async (): Promise<GatewayTaskResult> => ({
        value: 'result',
        confidence: 0.9,
      })
    ),
    subscribeThreadEvents: vi.fn(() => vi.fn()),
  };
}

function createSpawnInput(
  overrides: Partial<SpawnThreadInput> = {}
): SpawnThreadInput {
  return {
    executionId: 'exec-1',
    name: 'Test Thread',
    agentType: 'claude',
    objective: 'Do something',
    role: 'engineer',
    ...overrides,
  };
}

// ─── Tests ───

describe('GatewayRuntimeAdapter', () => {
  let logger: ReturnType<typeof createMockLogger>;

  beforeEach(() => {
    logger = createMockLogger();
  });

  describe('findGatewayAgent (via spawnThread)', () => {
    it('should match agent by agentType metadata', async () => {
      const session = createMockSession({
        agentId: 'pi-1',
        metadata: { agentType: 'claude', device: 'raspberry-pi' },
      });
      const agents = new Map([['pi-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(createSpawnInput({ agentType: 'claude' }));

      expect(gateway.dispatchThreadSpawn).toHaveBeenCalledWith(
        'pi-1',
        expect.objectContaining({ adapterType: 'claude' })
      );
    });

    it('should match by metadata constraints (e.g., device)', async () => {
      const pi = createMockSession({
        agentId: 'pi-1',
        metadata: { agentType: 'claude', device: 'raspberry-pi' },
      });
      const mac = createMockSession({
        agentId: 'mac-1',
        metadata: { agentType: 'claude', device: 'mac' },
      });
      const agents = new Map([
        ['pi-1', pi],
        ['mac-1', mac],
      ]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(
        createSpawnInput({
          agentType: 'claude',
          metadata: { device: 'mac' },
        })
      );

      expect(gateway.dispatchThreadSpawn).toHaveBeenCalledWith(
        'mac-1',
        expect.objectContaining({ adapterType: 'claude' })
      );
    });

    it('should match by capabilities when type does not match', async () => {
      const session = createMockSession({
        agentId: 'cap-1',
        capabilities: ['gemini', 'coding'],
        metadata: { agentType: 'custom' },
      });
      const agents = new Map([['cap-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(createSpawnInput({ agentType: 'gemini' }));

      expect(gateway.dispatchThreadSpawn).toHaveBeenCalledWith(
        'cap-1',
        expect.objectContaining({ adapterType: 'gemini' })
      );
    });

    it('should fall back to first available when no agentType specified', async () => {
      const session = createMockSession({ agentId: 'any-1' });
      const agents = new Map([['any-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(
        createSpawnInput({ agentType: '' as any })
      );

      expect(gateway.dispatchThreadSpawn).toHaveBeenCalledWith(
        'any-1',
        expect.any(Object)
      );
    });

    it('should throw when no matching agent is found', async () => {
      const gateway = createMockGateway(new Map());
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await expect(
        adapter.spawnThread(createSpawnInput({ agentType: 'claude' }))
      ).rejects.toThrow('No gateway-connected agent found');
    });

    it('should skip agents already assigned to the same execution', async () => {
      const agent1 = createMockSession({
        agentId: 'a1',
        metadata: { agentType: 'claude' },
      });
      const agent2 = createMockSession({
        agentId: 'a2',
        metadata: { agentType: 'claude' },
      });
      const agents = new Map([
        ['a1', agent1],
        ['a2', agent2],
      ]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      // First spawn takes agent a1
      await adapter.spawnThread(
        createSpawnInput({ executionId: 'exec-1', agentType: 'claude' })
      );

      // Second spawn for same execution should take a2
      await adapter.spawnThread(
        createSpawnInput({
          executionId: 'exec-1',
          agentType: 'claude',
          id: 'thread-2',
        })
      );

      const calls = (gateway.dispatchThreadSpawn as ReturnType<typeof vi.fn>)
        .mock.calls;
      expect(calls[0][0]).toBe('a1');
      expect(calls[1][0]).toBe('a2');
    });
  });

  describe('spawnThread', () => {
    it('should return a ThreadHandle with correct fields', async () => {
      const session = createMockSession({ agentId: 'pi-1' });
      const agents = new Map([['pi-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      const handle = await adapter.spawnThread(
        createSpawnInput({ id: 'my-thread' })
      );

      expect(handle.id).toBe('my-thread');
      expect(handle.runtimeName).toBe('gateway');
      expect(handle.agentId).toBe('pi-1');
      expect(handle.status).toBe('running');
      expect(handle.metadata?.gatewayAgentId).toBe('pi-1');
    });

    it('should mark thread as failed when spawn is unsuccessful', async () => {
      const session = createMockSession({ agentId: 'pi-1' });
      const agents = new Map([['pi-1', session]]);
      const gateway = createMockGateway(agents);
      (gateway.dispatchThreadSpawn as ReturnType<typeof vi.fn>).mockResolvedValue({
        thread_id: 'thread-1',
        success: false,
        error_message: 'boot failed',
      });
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      const handle = await adapter.spawnThread(createSpawnInput());

      expect(handle.status).toBe('failed');
    });

    it('should subscribe to thread events from gateway', async () => {
      const session = createMockSession({ agentId: 'pi-1' });
      const agents = new Map([['pi-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(createSpawnInput({ id: 'thread-x' }));

      expect(gateway.subscribeThreadEvents).toHaveBeenCalledWith(
        'thread-x',
        expect.any(Function)
      );
    });
  });

  describe('sendToThread', () => {
    it('should dispatch input to the correct gateway agent', async () => {
      const session = createMockSession({ agentId: 'pi-1' });
      const agents = new Map([['pi-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      const handle = await adapter.spawnThread(
        createSpawnInput({ id: 'thread-s' })
      );

      await adapter.sendToThread('thread-s', { message: 'hello world' });

      expect(gateway.dispatchThreadInput).toHaveBeenCalledWith(
        'pi-1',
        'thread-s',
        'hello world',
        'message'
      );
    });

    it('should throw for unknown thread', async () => {
      const gateway = createMockGateway(new Map());
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await expect(
        adapter.sendToThread('nonexistent', { message: 'hi' })
      ).rejects.toThrow('Thread nonexistent not found');
    });

    it('should send raw input when raw field is set', async () => {
      const session = createMockSession({ agentId: 'pi-1' });
      const agents = new Map([['pi-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(createSpawnInput({ id: 'thread-r' }));
      await adapter.sendToThread('thread-r', { raw: 'raw-data' });

      expect(gateway.dispatchThreadInput).toHaveBeenCalledWith(
        'pi-1',
        'thread-r',
        'raw-data',
        'raw'
      );
    });
  });

  describe('healthCheck', () => {
    it('should always return healthy', async () => {
      const agents = new Map([
        ['a1', createMockSession({ agentId: 'a1' })],
        ['a2', createMockSession({ agentId: 'a2' })],
      ]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toBe('2 gateway agent(s) connected');
    });

    it('should report healthy even with zero agents', async () => {
      const gateway = createMockGateway(new Map());
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      const health = await adapter.healthCheck();

      expect(health.healthy).toBe(true);
      expect(health.message).toBe('0 gateway agent(s) connected');
    });
  });

  describe('stopThread', () => {
    it('should dispatch stop to the gateway agent', async () => {
      const session = createMockSession({ agentId: 'pi-1' });
      const agents = new Map([['pi-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(createSpawnInput({ id: 'thread-stop' }));
      await adapter.stopThread('thread-stop', { force: true });

      expect(gateway.dispatchThreadStop).toHaveBeenCalledWith(
        'pi-1',
        'thread-stop',
        { force: true }
      );
    });

    it('should update thread status to completed after stop', async () => {
      const session = createMockSession({ agentId: 'pi-1' });
      const agents = new Map([['pi-1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(createSpawnInput({ id: 'thread-cs' }));
      await adapter.stopThread('thread-cs');

      const thread = await adapter.getThread('thread-cs');
      expect(thread?.status).toBe('completed');
    });
  });

  describe('cleanupExecution', () => {
    it('should stop all threads for the given execution', async () => {
      const session1 = createMockSession({ agentId: 'a1' });
      const session2 = createMockSession({ agentId: 'a2' });
      const agents = new Map([
        ['a1', session1],
        ['a2', session2],
      ]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(
        createSpawnInput({ id: 't1', executionId: 'exec-clean' })
      );
      await adapter.spawnThread(
        createSpawnInput({ id: 't2', executionId: 'exec-clean' })
      );
      await adapter.spawnThread(
        createSpawnInput({ id: 't3', executionId: 'exec-other' })
      );

      await adapter.cleanupExecution('exec-clean');

      // t1 and t2 should have been stopped
      expect(gateway.dispatchThreadStop).toHaveBeenCalledTimes(2);

      // t3 should still exist
      const remaining = await adapter.getThread('t3');
      expect(remaining).not.toBeNull();

      // t1 should be cleaned up
      const cleaned = await adapter.getThread('t1');
      expect(cleaned).toBeNull();
    });
  });

  describe('listThreads', () => {
    it('should filter by executionId', async () => {
      const session1 = createMockSession({ agentId: 'a1' });
      const session2 = createMockSession({ agentId: 'a2' });
      const agents = new Map([
        ['a1', session1],
        ['a2', session2],
      ]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      await adapter.spawnThread(
        createSpawnInput({ id: 't1', executionId: 'e1' })
      );
      await adapter.spawnThread(
        createSpawnInput({ id: 't2', executionId: 'e2' })
      );

      const threads = await adapter.listThreads({ executionId: 'e1' });
      expect(threads).toHaveLength(1);
      expect(threads[0].id).toBe('t1');
    });
  });

  describe('get (agent)', () => {
    it('should return agent handle for connected agent', async () => {
      const session = createMockSession({
        agentId: 'a1',
        agentName: 'My Agent',
        metadata: { agentType: 'claude' },
        capabilities: ['coding'],
      });
      const agents = new Map([['a1', session]]);
      const gateway = createMockGateway(agents);
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      const handle = await adapter.get('a1');
      expect(handle).not.toBeNull();
      expect(handle!.id).toBe('a1');
      expect(handle!.name).toBe('My Agent');
      expect(handle!.type).toBe('claude');
      expect(handle!.status).toBe('ready');
    });

    it('should return null for unknown agent', async () => {
      const gateway = createMockGateway(new Map());
      const adapter = new GatewayRuntimeAdapter(logger, gateway);

      const handle = await adapter.get('nonexistent');
      expect(handle).toBeNull();
    });
  });
});

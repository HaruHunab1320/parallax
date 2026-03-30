import { EventEmitter } from 'node:events';
import pino from 'pino';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionEventBus } from '@/execution-events';
import { GatewayService } from '@/grpc/services/gateway-service';
import type { IAgentRegistry } from '@/registry/agent-registry-interface';

// ── Helpers ──

function createMockStream() {
  const stream = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  stream.write = vi.fn();
  stream.end = vi.fn();
  return stream;
}

function createMockRegistry(): IAgentRegistry {
  return {
    register: vi.fn().mockResolvedValue(undefined),
    unregister: vi.fn().mockResolvedValue(undefined),
    get: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue([]),
    listServices: vi.fn().mockResolvedValue([]),
    getService: vi.fn().mockResolvedValue(null),
  };
}

const logger = pino({ level: 'silent' });

function makeHello(overrides: Record<string, any> = {}) {
  return {
    request_id: 'req-1',
    hello: {
      agent_id: 'agent-1',
      agent_name: 'Test Agent',
      capabilities: ['analysis'],
      metadata: {},
      heartbeat_interval_ms: 1000,
      ...overrides,
    },
  };
}

describe('GatewayService', () => {
  let service: GatewayService;
  let registry: IAgentRegistry;

  beforeEach(() => {
    vi.useFakeTimers();
    registry = createMockRegistry();
    service = new GatewayService(registry, logger, 'node-1');
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── AgentHello ──

  describe('AgentHello', () => {
    it('creates session, registers in registry, and sends ServerAck', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);

      const hello = makeHello();
      stream.emit('data', hello);

      // Allow async handleHello to complete
      await vi.advanceTimersByTimeAsync(0);

      expect(registry.register).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'agent-1',
          endpoint: 'gateway://agent-1',
        })
      );

      expect(stream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'req-1',
          ack: expect.objectContaining({
            accepted: true,
            assigned_node_id: 'node-1',
          }),
        })
      );

      expect(service.isConnected('agent-1')).toBe(true);
    });

    it('rejects hello with missing agent_id', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);

      stream.emit('data', {
        request_id: 'req-1',
        hello: { agent_name: 'No ID' },
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(stream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          ack: expect.objectContaining({ accepted: false }),
        })
      );
      expect(stream.end).toHaveBeenCalled();
      expect(service.isConnected('agent-1')).toBe(false);
    });

    it('closes old session on reconnect before creating new one', async () => {
      const stream1 = createMockStream();
      const stream2 = createMockStream();
      const impl = service.getImplementation();

      // First connection
      impl.connect(stream1 as any);
      stream1.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      expect(service.isConnected('agent-1')).toBe(true);

      // Second connection (reconnect)
      impl.connect(stream2 as any);
      stream2.emit('data', makeHello({ agent_id: 'agent-1' }));
      await vi.advanceTimersByTimeAsync(10);

      // Old session cleaned up, then new session created
      expect(registry.unregister).toHaveBeenCalledWith('agent', 'agent-1');
      expect(registry.register).toHaveBeenCalledTimes(2);
      expect(service.isConnected('agent-1')).toBe(true);
    });
  });

  // ── AgentHeartbeat ──

  describe('AgentHeartbeat', () => {
    it('updates lastHeartbeat and load', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);

      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      // Send heartbeat
      stream.emit('data', {
        request_id: '',
        heartbeat: { agent_id: 'agent-1', load: 0.75, status: 'healthy' },
      });

      expect(service.healthCheck('agent-1')).toBe(true);
    });
  });

  // ── Heartbeat monitoring ──

  describe('Heartbeat monitoring', () => {
    it('marks agent unhealthy after 2x interval, dead after 3x with cleanup', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);

      stream.emit('data', makeHello({ heartbeat_interval_ms: 1000 }));
      await vi.advanceTimersByTimeAsync(0);

      expect(service.healthCheck('agent-1')).toBe(true);

      // setInterval fires every 1000ms; check uses strict >
      // At tick 3000: elapsed=3000 > 2*1000=2000 → unhealthy
      await vi.advanceTimersByTimeAsync(3000);
      expect(service.isConnected('agent-1')).toBe(true);
      expect(service.healthCheck('agent-1')).toBe(false);

      // At tick 4000: elapsed=4000 > 3*1000=3000 → dead + cleanup
      await vi.advanceTimersByTimeAsync(1000);
      expect(service.isConnected('agent-1')).toBe(false);
    });
  });

  // ── dispatchTask ──

  describe('dispatchTask', () => {
    it('writes TaskRequest to stream and resolves on matching TaskResult', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      // Intercept the write to get the request_id
      let capturedRequest: any;
      stream.write.mockImplementation((msg: any) => {
        if (msg.task_request) {
          capturedRequest = msg;
        }
      });

      const dispatchPromise = service.dispatchTask('agent-1', {
        description: 'Analyze data',
        data: { key: 'value' },
      });

      await vi.advanceTimersByTimeAsync(0);

      // Simulate agent responding with TaskResult
      const requestId = capturedRequest.request_id;
      stream.emit('data', {
        request_id: requestId,
        task_result: {
          task_id: capturedRequest.task_request.task_id,
          value_json: JSON.stringify({ answer: 42 }),
          confidence: 0.9,
          reasoning: 'Computed',
          metadata: {},
        },
      });

      const result = await dispatchPromise;
      expect(result.value).toEqual({ answer: 42 });
      expect(result.confidence).toBe(0.9);
      expect(result.reasoning).toBe('Computed');
    });

    it('resolves with error on timeout', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      // Use large heartbeat interval to prevent heartbeat-death before task timeout
      stream.emit('data', makeHello({ heartbeat_interval_ms: 60000 }));
      await vi.advanceTimersByTimeAsync(0);

      const dispatchPromise = service.dispatchTask(
        'agent-1',
        { description: 'Slow task' },
        5000
      );

      await vi.advanceTimersByTimeAsync(5000);

      const result = await dispatchPromise;
      expect(result.confidence).toBe(0);
      expect(result.error).toContain('timed out');
    });

    it('throws when agent not connected', async () => {
      await expect(
        service.dispatchTask('unknown-agent', { description: 'test' })
      ).rejects.toThrow('not connected');
    });
  });

  // ── TaskError ──

  describe('TaskError', () => {
    it('resolves pending request with confidence=0', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      let capturedRequest: any;
      stream.write.mockImplementation((msg: any) => {
        if (msg.task_request) capturedRequest = msg;
      });

      const dispatchPromise = service.dispatchTask('agent-1', {
        description: 'test',
      });
      await vi.advanceTimersByTimeAsync(0);

      stream.emit('data', {
        request_id: capturedRequest.request_id,
        task_error: {
          task_id: capturedRequest.task_request.task_id,
          error_message: 'Something went wrong',
          error_code: 'INTERNAL',
        },
      });

      const result = await dispatchPromise;
      expect(result.confidence).toBe(0);
      expect(result.error).toBe('Something went wrong');
    });
  });

  // ── Stream end/error ──

  describe('Stream end/error', () => {
    it('resolves pending requests and unregisters on stream end', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      // Start a dispatch that will be pending
      stream.write.mockImplementation(() => {});
      const dispatchPromise = service.dispatchTask(
        'agent-1',
        { description: 'test' },
        60000
      );
      await vi.advanceTimersByTimeAsync(0);

      // End stream
      stream.emit('end');
      await vi.advanceTimersByTimeAsync(0);

      const result = await dispatchPromise;
      expect(result.confidence).toBe(0);
      expect(result.error).toContain('disconnected');
      expect(registry.unregister).toHaveBeenCalledWith('agent', 'agent-1');
    });

    it('resolves pending requests on stream error', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      stream.write.mockImplementation(() => {});
      const dispatchPromise = service.dispatchTask(
        'agent-1',
        { description: 'test' },
        60000
      );
      await vi.advanceTimersByTimeAsync(0);

      stream.emit('error', new Error('Connection reset'));
      await vi.advanceTimersByTimeAsync(0);

      const result = await dispatchPromise;
      expect(result.confidence).toBe(0);
      expect(result.error).toContain('disconnected');
    });
  });

  // ── Query methods ──

  describe('Query methods', () => {
    it('isConnected() returns correct state', async () => {
      expect(service.isConnected('agent-1')).toBe(false);

      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      expect(service.isConnected('agent-1')).toBe(true);
    });

    it('healthCheck() returns correct state', async () => {
      expect(service.healthCheck('agent-1')).toBe(false);

      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      expect(service.healthCheck('agent-1')).toBe(true);
    });

    it('getCapabilities() returns capabilities', async () => {
      expect(service.getCapabilities('agent-1')).toEqual([]);

      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello({ capabilities: ['a', 'b'] }));
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getCapabilities('agent-1')).toEqual(['a', 'b']);
    });
  });

  // ── shutdown ──

  describe('shutdown', () => {
    it('cleans up all sessions', async () => {
      const stream1 = createMockStream();
      const stream2 = createMockStream();
      const impl = service.getImplementation();

      impl.connect(stream1 as any);
      stream1.emit('data', makeHello({ agent_id: 'a1' }));
      await vi.advanceTimersByTimeAsync(0);

      impl.connect(stream2 as any);
      stream2.emit('data', makeHello({ agent_id: 'a2' }));
      await vi.advanceTimersByTimeAsync(0);

      expect(service.getConnectedAgentIds()).toHaveLength(2);

      await service.shutdown();

      expect(service.getConnectedAgentIds()).toHaveLength(0);
      expect(service.isConnected('a1')).toBe(false);
      expect(service.isConnected('a2')).toBe(false);
    });
  });

  // ── Thread Protocol ──

  describe('dispatchThreadSpawn', () => {
    it('sends ThreadSpawnRequest and resolves on ThreadSpawnResult', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello({ heartbeat_interval_ms: 60000 }));
      await vi.advanceTimersByTimeAsync(0);

      let capturedMsg: any;
      stream.write.mockImplementation((msg: any) => {
        if (msg.thread_spawn) capturedMsg = msg;
      });

      const spawnPromise = service.dispatchThreadSpawn('agent-1', {
        threadId: 'thread-1',
        adapterType: 'claude',
        task: 'Build something',
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(capturedMsg).toBeDefined();
      expect(capturedMsg.thread_spawn.thread_id).toBe('thread-1');
      expect(capturedMsg.thread_spawn.adapter_type).toBe('claude');
      expect(capturedMsg.thread_spawn.task).toBe('Build something');

      // Simulate agent responding with ThreadSpawnResult
      stream.emit('data', {
        request_id: capturedMsg.request_id,
        thread_spawn_result: {
          thread_id: 'thread-1',
          success: true,
          adapter_type: 'claude',
          workspace_dir: '/tmp/workspace',
        },
      });

      const result = await spawnPromise;
      expect(result.thread_id).toBe('thread-1');
      expect(result.success).toBe(true);
      expect(result.workspace_dir).toBe('/tmp/workspace');
    });

    it('resolves with error on timeout', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello({ heartbeat_interval_ms: 60000 }));
      await vi.advanceTimersByTimeAsync(0);

      stream.write.mockImplementation(() => {});

      const spawnPromise = service.dispatchThreadSpawn(
        'agent-1',
        { threadId: 'thread-2', adapterType: 'codex', task: 'Slow task' },
        5000
      );

      await vi.advanceTimersByTimeAsync(5000);

      const result = await spawnPromise;
      expect(result.success).toBe(false);
      expect(result.error_message).toContain('timed out');
    });

    it('throws when agent not connected', async () => {
      await expect(
        service.dispatchThreadSpawn('unknown', {
          threadId: 'thread-3',
          adapterType: 'claude',
          task: 'test',
        })
      ).rejects.toThrow('not connected');
    });
  });

  describe('dispatchThreadInput', () => {
    it('writes ThreadInputRequest to stream', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      service.dispatchThreadInput(
        'agent-1',
        'thread-1',
        'do something',
        'text'
      );

      expect(stream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          thread_input: expect.objectContaining({
            thread_id: 'thread-1',
            input: 'do something',
            input_type: 'text',
          }),
        })
      );
    });

    it('throws when agent not connected', () => {
      expect(() =>
        service.dispatchThreadInput('unknown', 'thread-1', 'test')
      ).toThrow('not connected');
    });
  });

  describe('handleThreadEvent', () => {
    it('emits to ExecutionEventBus and local listeners', async () => {
      const eventBus = new ExecutionEventBus();
      const svcWithBus = new GatewayService(
        registry,
        logger,
        'node-1',
        eventBus
      );

      const stream = createMockStream();
      const impl = svcWithBus.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      // Subscribe to local thread events
      const localEvents: any[] = [];
      svcWithBus.subscribeThreadEvents('thread-1', (e) => localEvents.push(e));

      // Subscribe to event bus
      const busEvents: any[] = [];
      eventBus.onExecution((e) => busEvents.push(e));

      // Simulate agent sending ThreadEventReport
      stream.emit('data', {
        request_id: '',
        thread_event: {
          thread_id: 'thread-1',
          event_type: 'output',
          data_json: '{"text":"hello"}',
          timestamp_ms: '1234567890',
          sequence: 1,
        },
      });

      expect(localEvents).toHaveLength(1);
      expect(localEvents[0].thread_id).toBe('thread-1');
      expect(localEvents[0].event_type).toBe('output');
      expect(localEvents[0].data_json).toBe('{"text":"hello"}');

      expect(busEvents).toHaveLength(1);
      expect(busEvents[0].type).toBe('gateway_thread_output');
      expect(busEvents[0].executionId).toBe('thread-1');
    });

    it('ignores events with no thread_id', async () => {
      const eventBus = new ExecutionEventBus();
      const svcWithBus = new GatewayService(
        registry,
        logger,
        'node-1',
        eventBus
      );

      const stream = createMockStream();
      const impl = svcWithBus.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      const busEvents: any[] = [];
      eventBus.onExecution((e) => busEvents.push(e));

      stream.emit('data', {
        request_id: '',
        thread_event: { event_type: 'output' },
      });

      expect(busEvents).toHaveLength(0);
    });
  });

  describe('handleThreadStatusUpdate', () => {
    it('emits status to event bus and updates session tracking', async () => {
      const eventBus = new ExecutionEventBus();
      const svcWithBus = new GatewayService(
        registry,
        logger,
        'node-1',
        eventBus
      );

      const stream = createMockStream();
      const impl = svcWithBus.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello({ heartbeat_interval_ms: 60000 }));
      await vi.advanceTimersByTimeAsync(0);

      // First spawn a thread so it's tracked
      let capturedMsg: any;
      stream.write.mockImplementation((msg: any) => {
        if (msg.thread_spawn) capturedMsg = msg;
      });

      const spawnPromise = svcWithBus.dispatchThreadSpawn('agent-1', {
        threadId: 'thread-status-1',
        adapterType: 'claude',
        task: 'test',
      });
      await vi.advanceTimersByTimeAsync(0);

      stream.emit('data', {
        request_id: capturedMsg.request_id,
        thread_spawn_result: {
          thread_id: 'thread-status-1',
          success: true,
        },
      });
      await spawnPromise;

      // Now send status update
      const busEvents: any[] = [];
      eventBus.onExecution((e) => busEvents.push(e));

      stream.emit('data', {
        request_id: '',
        thread_status_update: {
          thread_id: 'thread-status-1',
          status: 'completed',
          summary: 'All done',
          timestamp_ms: '9999999',
        },
      });

      expect(busEvents).toHaveLength(1);
      expect(busEvents[0].type).toBe('gateway_thread_status');
      expect(busEvents[0].data.status).toBe('completed');
      expect(busEvents[0].data.summary).toBe('All done');
    });
  });

  describe('subscribeThreadEvents', () => {
    it('subscribes and unsubscribes to thread events', async () => {
      const stream = createMockStream();
      const impl = service.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello());
      await vi.advanceTimersByTimeAsync(0);

      const events: any[] = [];
      const unsubscribe = service.subscribeThreadEvents('thread-sub-1', (e) =>
        events.push(e)
      );

      // Emit a thread event
      stream.emit('data', {
        request_id: '',
        thread_event: {
          thread_id: 'thread-sub-1',
          event_type: 'output',
          data_json: '{"text":"line1"}',
          timestamp_ms: '1000',
          sequence: 1,
        },
      });

      expect(events).toHaveLength(1);

      // Unsubscribe
      unsubscribe();

      stream.emit('data', {
        request_id: '',
        thread_event: {
          thread_id: 'thread-sub-1',
          event_type: 'output',
          data_json: '{"text":"line2"}',
          timestamp_ms: '2000',
          sequence: 2,
        },
      });

      // Should NOT receive after unsubscribe
      expect(events).toHaveLength(1);
    });
  });

  describe('cleanupAgent with active threads', () => {
    it('emits thread_failed for active threads on disconnect', async () => {
      const eventBus = new ExecutionEventBus();
      const svcWithBus = new GatewayService(
        registry,
        logger,
        'node-1',
        eventBus
      );

      const stream = createMockStream();
      const impl = svcWithBus.getImplementation();
      impl.connect(stream as any);
      stream.emit('data', makeHello({ heartbeat_interval_ms: 60000 }));
      await vi.advanceTimersByTimeAsync(0);

      // Spawn a thread
      let capturedMsg: any;
      stream.write.mockImplementation((msg: any) => {
        if (msg.thread_spawn) capturedMsg = msg;
      });

      const spawnPromise = svcWithBus.dispatchThreadSpawn('agent-1', {
        threadId: 'thread-cleanup-1',
        adapterType: 'claude',
        task: 'test',
      });
      await vi.advanceTimersByTimeAsync(0);

      stream.emit('data', {
        request_id: capturedMsg.request_id,
        thread_spawn_result: {
          thread_id: 'thread-cleanup-1',
          success: true,
        },
      });
      await spawnPromise;

      // Collect events
      const busEvents: any[] = [];
      eventBus.onExecution((e) => busEvents.push(e));

      // Disconnect agent (stream end triggers cleanup)
      stream.emit('end');
      await vi.advanceTimersByTimeAsync(0);

      // Should have emitted gateway_thread_failed
      const failedEvents = busEvents.filter(
        (e) => e.type === 'gateway_thread_failed'
      );
      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].executionId).toBe('thread-cleanup-1');

      const data = failedEvents[0].data;
      expect(data.thread_id).toBe('thread-cleanup-1');
      expect(data.event_type).toBe('failed');
      expect(JSON.parse(data.data_json).reason).toContain('disconnected');
    });
  });
});

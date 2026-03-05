import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import pino from 'pino';
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

      const dispatchPromise = service.dispatchTask('agent-1', { description: 'test' });
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
      const dispatchPromise = service.dispatchTask('agent-1', { description: 'test' }, 60000);
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
      const dispatchPromise = service.dispatchTask('agent-1', { description: 'test' }, 60000);
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
});

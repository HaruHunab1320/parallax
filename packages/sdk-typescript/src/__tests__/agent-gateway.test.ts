import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EventEmitter } from 'events';
import * as grpc from '@grpc/grpc-js';
import { ParallaxAgent } from '../agent-base';
import type { AgentResponse } from '../types/agent-response';

// ── Mock stream factory ──

function createMockDuplexStream() {
  const stream = new EventEmitter() as EventEmitter & {
    write: ReturnType<typeof vi.fn>;
    end: ReturnType<typeof vi.fn>;
  };
  stream.write = vi.fn();
  stream.end = vi.fn();
  return stream;
}

let mockStream: ReturnType<typeof createMockDuplexStream>;

// Mock proto-loader
vi.mock('@grpc/proto-loader', () => ({
  loadSync: vi.fn(() => ({})),
}));

// Mock grpc with gateway support
vi.mock('@grpc/grpc-js', () => ({
  Server: vi.fn(() => ({
    addService: vi.fn(),
    bindAsync: vi.fn(
      (_addr: string, _creds: unknown, cb: (err: Error | null, port: number) => void) => {
        cb(null, 50051);
      }
    ),
    start: vi.fn(),
    tryShutdown: vi.fn((cb: () => void) => cb()),
  })),
  ServerCredentials: {
    createInsecure: vi.fn(),
  },
  credentials: {
    createInsecure: vi.fn(),
  },
  loadPackageDefinition: vi.fn(() => ({
    parallax: {
      confidence: {
        ConfidenceAgent: { service: {} },
      },
      registry: {
        Registry: vi.fn(() => ({
          waitForReady: vi.fn((_d: number, cb: (err: Error | null) => void) => cb(null)),
          register: vi.fn((_r: unknown, cb: (err: Error | null, res: unknown) => void) =>
            cb(null, { lease_id: 'test-lease' })
          ),
          unregister: vi.fn((_r: unknown, cb: () => void) => cb()),
        })),
      },
      gateway: {
        AgentGateway: vi.fn(() => ({
          connect: vi.fn(() => {
            mockStream = createMockDuplexStream();
            return mockStream;
          }),
        })),
      },
    },
  })),
  status: {
    INTERNAL: 13,
    UNAUTHENTICATED: 16,
  },
}));

// ── Test agent ──

class TestAgent extends ParallaxAgent {
  analyzeResult: AgentResponse = { value: { result: 'ok' }, confidence: 0.9 };
  analyzeError?: Error;
  lastThreadSpawn?: any;
  lastThreadInput?: any;
  lastThreadStop?: any;

  constructor() {
    super('test-gw', 'Test Gateway Agent', ['analysis', 'gateway']);
  }

  async analyze(_task: string, _data?: any): Promise<AgentResponse> {
    if (this.analyzeError) throw this.analyzeError;
    return this.analyzeResult;
  }
}

class ThreadCapableAgent extends ParallaxAgent {
  lastThreadSpawn?: any;
  lastThreadInput?: any;
  lastThreadStop?: any;

  constructor() {
    super('test-thread', 'Thread Agent', ['coding', 'threads']);
  }

  async analyze(_task: string, _data?: any): Promise<AgentResponse> {
    return { value: 'ok', confidence: 1.0 };
  }

  protected async handleGatewayThreadSpawn(
    stream: any,
    requestId: string,
    request: any
  ): Promise<void> {
    this.lastThreadSpawn = request;
    this.registerThread(request.thread_id, () => {});
    stream.write({
      request_id: requestId,
      thread_spawn_result: {
        thread_id: request.thread_id,
        success: true,
        adapter_type: request.adapter_type,
        workspace_dir: '/tmp/workspace',
      },
    });
  }

  protected async handleGatewayThreadInput(request: any): Promise<void> {
    this.lastThreadInput = request;
  }

  protected async handleGatewayThreadStop(
    stream: any,
    requestId: string,
    request: any
  ): Promise<void> {
    this.lastThreadStop = request;
    this.unregisterThread(request.thread_id);
    stream.write({
      request_id: requestId,
      thread_status_update: {
        thread_id: request.thread_id,
        status: 'completed',
        summary: 'Stopped',
        progress: 1.0,
        timestamp_ms: Date.now(),
      },
    });
  }
}

describe('ParallaxAgent Gateway', () => {
  let agent: TestAgent;

  beforeEach(() => {
    vi.useFakeTimers();
    agent = new TestAgent();
    // Force-set gatewayProto since the test env may not find the actual proto file on disk
    const pkgDef = grpc.loadPackageDefinition({} as any) as any;
    (agent as any).gatewayProto = pkgDef.parallax.gateway;
  });

  afterEach(async () => {
    // Prevent reconnect attempts during cleanup
    (agent as any).gatewayReconnecting = true;
    vi.useRealTimers();
  });

  describe('connectViaGateway', () => {
    it('opens stream, sends AgentHello, resolves on accepted ack', async () => {
      const connectPromise = agent.connectViaGateway('localhost:50051', {
        autoReconnect: false,
      });

      // The stream should have been created and a hello written
      await vi.advanceTimersByTimeAsync(0);
      expect(mockStream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          hello: expect.objectContaining({
            agent_id: 'test-gw',
            agent_name: 'Test Gateway Agent',
            capabilities: ['analysis', 'gateway'],
          }),
        })
      );

      // Simulate accepted ack from server
      mockStream.emit('data', {
        ack: { accepted: true, message: 'Connected', assigned_node_id: 'node-1' },
      });

      await connectPromise;
    });

    it('rejects when ack is not accepted', async () => {
      const connectPromise = agent.connectViaGateway('localhost:50051', {
        autoReconnect: false,
      });

      await vi.advanceTimersByTimeAsync(0);

      mockStream.emit('data', {
        ack: { accepted: false, message: 'Agent limit reached' },
      });

      await expect(connectPromise).rejects.toThrow('Gateway rejected');
    });
  });

  describe('Task handling', () => {
    async function connectAgent() {
      const p = agent.connectViaGateway('localhost:50051', { autoReconnect: false });
      await vi.advanceTimersByTimeAsync(0);
      mockStream.emit('data', {
        ack: { accepted: true, message: 'OK', assigned_node_id: 'node-1' },
      });
      await p;
    }

    it('calls analyze() on TaskRequest and sends TaskResult', async () => {
      await connectAgent();

      // Simulate task request from control plane
      mockStream.emit('data', {
        request_id: 'req-123',
        task_request: {
          task_id: 'task-1',
          task_description: 'Analyze something',
          data: { fields: {} },
          timeout_ms: 5000,
        },
      });

      // Allow async handler to complete
      await vi.advanceTimersByTimeAsync(0);

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'req-123',
          task_result: expect.objectContaining({
            task_id: 'task-1',
            value_json: JSON.stringify({ result: 'ok' }),
            confidence: 0.9,
          }),
        })
      );
    });

    it('sends TaskError when analyze() throws', async () => {
      await connectAgent();
      agent.analyzeError = new Error('Analysis failed');

      mockStream.emit('data', {
        request_id: 'req-456',
        task_request: {
          task_id: 'task-2',
          task_description: 'Will fail',
          data: { fields: {} },
          timeout_ms: 5000,
        },
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'req-456',
          task_error: expect.objectContaining({
            task_id: 'task-2',
            error_message: 'Analysis failed',
          }),
        })
      );
    });
  });

  describe('Heartbeat', () => {
    it('sends periodic heartbeat messages', async () => {
      const p = agent.connectViaGateway('localhost:50051', {
        heartbeatIntervalMs: 2000,
        autoReconnect: false,
      });
      await vi.advanceTimersByTimeAsync(0);
      mockStream.emit('data', {
        ack: { accepted: true, message: 'OK', assigned_node_id: 'node-1' },
      });
      await p;

      // Clear write calls from hello + ack handling
      mockStream.write.mockClear();

      // Advance past one heartbeat interval
      await vi.advanceTimersByTimeAsync(2000);

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          heartbeat: expect.objectContaining({
            agent_id: 'test-gw',
            status: 'healthy',
          }),
        })
      );
    });
  });

  describe('shutdown', () => {
    it('cleans up gateway stream and heartbeat timer', async () => {
      const p = agent.connectViaGateway('localhost:50051', {
        heartbeatIntervalMs: 2000,
        autoReconnect: false,
      });
      await vi.advanceTimersByTimeAsync(0);
      mockStream.emit('data', {
        ack: { accepted: true, message: 'OK', assigned_node_id: 'node-1' },
      });
      await p;

      await agent.shutdown();

      expect(mockStream.end).toHaveBeenCalled();

      // No more heartbeats should be sent after shutdown
      mockStream.write.mockClear();
      await vi.advanceTimersByTimeAsync(5000);
      const heartbeatCalls = mockStream.write.mock.calls.filter(
        (c: any[]) => c[0]?.heartbeat
      );
      expect(heartbeatCalls).toHaveLength(0);
    });
  });
});

describe('ParallaxAgent Thread Protocol', () => {
  let agent: ThreadCapableAgent;

  beforeEach(() => {
    vi.useFakeTimers();
    agent = new ThreadCapableAgent();
    const pkgDef = grpc.loadPackageDefinition({} as any) as any;
    (agent as any).gatewayProto = pkgDef.parallax.gateway;
  });

  afterEach(async () => {
    (agent as any).gatewayReconnecting = true;
    vi.useRealTimers();
  });

  async function connectAgent() {
    const p = agent.connectViaGateway('localhost:50051', { autoReconnect: false });
    await vi.advanceTimersByTimeAsync(0);
    mockStream.emit('data', {
      ack: { accepted: true, message: 'OK', assigned_node_id: 'node-1' },
    });
    await p;
  }

  describe('ThreadSpawnRequest', () => {
    it('calls handleGatewayThreadSpawn and sends ThreadSpawnResult', async () => {
      await connectAgent();
      mockStream.write.mockClear();

      mockStream.emit('data', {
        request_id: 'req-spawn-1',
        thread_spawn: {
          thread_id: 'thread-abc',
          adapter_type: 'claude-code',
          task: 'Build a REST API',
          preparation_json: '{"workspace":"/tmp/ws"}',
          policy_json: '{}',
          timeout_ms: 300000,
        },
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(agent.lastThreadSpawn).toEqual(
        expect.objectContaining({
          thread_id: 'thread-abc',
          adapter_type: 'claude-code',
          task: 'Build a REST API',
        })
      );

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'req-spawn-1',
          thread_spawn_result: expect.objectContaining({
            thread_id: 'thread-abc',
            success: true,
            adapter_type: 'claude-code',
            workspace_dir: '/tmp/workspace',
          }),
        })
      );
    });
  });

  describe('ThreadInputRequest', () => {
    it('calls handleGatewayThreadInput', async () => {
      await connectAgent();

      mockStream.emit('data', {
        request_id: '',
        thread_input: {
          thread_id: 'thread-abc',
          input: 'yes',
          input_type: 'approval',
        },
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(agent.lastThreadInput).toEqual(
        expect.objectContaining({
          thread_id: 'thread-abc',
          input: 'yes',
          input_type: 'approval',
        })
      );
    });
  });

  describe('ThreadStopRequest', () => {
    it('calls handleGatewayThreadStop and sends status update', async () => {
      await connectAgent();

      // Spawn a thread first
      mockStream.emit('data', {
        request_id: 'req-spawn-2',
        thread_spawn: {
          thread_id: 'thread-xyz',
          adapter_type: 'claude-code',
          task: 'Test task',
          preparation_json: '{}',
          policy_json: '{}',
          timeout_ms: 0,
        },
      });
      await vi.advanceTimersByTimeAsync(0);
      mockStream.write.mockClear();

      // Now stop it
      mockStream.emit('data', {
        request_id: 'req-stop-1',
        thread_stop: {
          thread_id: 'thread-xyz',
          reason: 'User requested',
          force: false,
        },
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(agent.lastThreadStop).toEqual(
        expect.objectContaining({
          thread_id: 'thread-xyz',
          reason: 'User requested',
        })
      );

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'req-stop-1',
          thread_status_update: expect.objectContaining({
            thread_id: 'thread-xyz',
            status: 'completed',
          }),
        })
      );
    });
  });

  describe('emitThreadEvent', () => {
    it('writes correct proto message to stream', async () => {
      await connectAgent();
      mockStream.write.mockClear();

      (agent as any).emitThreadEvent({
        thread_id: 'thread-abc',
        event_type: 'output',
        data_json: JSON.stringify({ text: 'Building API...' }),
        timestamp_ms: 1710000000000,
        sequence: 1,
      });

      expect(mockStream.write).toHaveBeenCalledWith({
        request_id: '',
        thread_event: {
          thread_id: 'thread-abc',
          event_type: 'output',
          data_json: JSON.stringify({ text: 'Building API...' }),
          timestamp_ms: 1710000000000,
          sequence: 1,
        },
      });
    });
  });

  describe('emitThreadStatusUpdate', () => {
    it('writes correct proto message to stream', async () => {
      await connectAgent();
      mockStream.write.mockClear();

      (agent as any).emitThreadStatusUpdate({
        thread_id: 'thread-abc',
        status: 'running',
        summary: 'Installing dependencies',
        progress: 0.3,
        timestamp_ms: 1710000000000,
      });

      expect(mockStream.write).toHaveBeenCalledWith({
        request_id: '',
        thread_status_update: {
          thread_id: 'thread-abc',
          status: 'running',
          summary: 'Installing dependencies',
          progress: 0.3,
          timestamp_ms: 1710000000000,
        },
      });
    });
  });

  describe('Default handler (no override)', () => {
    it('sends failure result when thread spawning not supported', async () => {
      // Use the base TestAgent which does NOT override thread handlers
      const baseAgent = new TestAgent();
      const pkgDef = grpc.loadPackageDefinition({} as any) as any;
      (baseAgent as any).gatewayProto = pkgDef.parallax.gateway;

      const p = baseAgent.connectViaGateway('localhost:50051', { autoReconnect: false });
      await vi.advanceTimersByTimeAsync(0);
      mockStream.emit('data', {
        ack: { accepted: true, message: 'OK', assigned_node_id: 'node-1' },
      });
      await p;
      mockStream.write.mockClear();

      mockStream.emit('data', {
        request_id: 'req-spawn-fail',
        thread_spawn: {
          thread_id: 'thread-fail',
          adapter_type: 'claude-code',
          task: 'Will fail',
          preparation_json: '{}',
          policy_json: '{}',
          timeout_ms: 0,
        },
      });

      await vi.advanceTimersByTimeAsync(0);

      expect(mockStream.write).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: 'req-spawn-fail',
          thread_spawn_result: expect.objectContaining({
            thread_id: 'thread-fail',
            success: false,
            error_message: 'Thread spawning not supported by this agent',
          }),
        })
      );

      // Cleanup
      (baseAgent as any).gatewayReconnecting = true;
    });
  });
});

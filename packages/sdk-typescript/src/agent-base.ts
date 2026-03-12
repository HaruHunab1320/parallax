import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import fs from 'fs';
import { AgentResponse, ensureConfidence } from './types/agent-response';

const PROTO_DIR = process.env.PARALLAX_PROTO_DIR
  || (fs.existsSync(path.join(__dirname, '../../proto'))
      ? path.join(__dirname, '../../proto')
      : path.join(__dirname, '../../../proto'));

/**
 * Base class for Parallax agents in TypeScript.
 * Agents are standalone services that communicate via gRPC.
 */
interface GrpcProto {
  parallax: {
    confidence: any;
    registry: any;
  };
}

function normalizeStructList(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.map(normalizeStructValue);
  if (Array.isArray(value.values)) return value.values.map(normalizeStructValue);
  return [];
}

function normalizeStructValue(value: any): any {
  if (value == null) return null;
  if (typeof value !== 'object') return value;
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('numberValue' in value) return value.numberValue;
  if ('boolValue' in value) return value.boolValue;
  if ('structValue' in value) return normalizeStruct(value.structValue);
  if ('listValue' in value) return normalizeStructList(value.listValue);
  if ('fields' in value) return normalizeStruct(value);
  if ('values' in value && Array.isArray(value.values)) {
    return value.values.map(normalizeStructValue);
  }
  if ('kind' in value && value.kind && typeof value.kind === 'object') {
    const kindValue = (value.kind as any);
    if ('structValue' in kindValue) return normalizeStruct(kindValue.structValue);
    if ('listValue' in kindValue) return normalizeStructList(kindValue.listValue);
    if ('stringValue' in kindValue) return kindValue.stringValue;
    if ('numberValue' in kindValue) return kindValue.numberValue;
    if ('boolValue' in kindValue) return kindValue.boolValue;
    if ('nullValue' in kindValue) return null;
  }
  return value;
}

function normalizeStruct(input: any): any {
  if (input == null) return input;
  if (Array.isArray(input)) return input.map(normalizeStructValue);
  if (typeof input !== 'object') return input;
  if ('fields' in input && input.fields && typeof input.fields === 'object') {
    const out: Record<string, any> = {};
    for (const [key, value] of Object.entries(input.fields)) {
      out[key] = normalizeStructValue(value);
    }
    return out;
  }
  return input;
}

export interface GatewayOptions {
  /** Credentials for the gateway connection */
  credentials?: grpc.ChannelCredentials;
  /** Heartbeat interval in ms (default: 10000) */
  heartbeatIntervalMs?: number;
  /** Reconnect on disconnect (default: true) */
  autoReconnect?: boolean;
  /** Max reconnect attempts before giving up (default: Infinity) */
  maxReconnectAttempts?: number;
  /** Initial reconnect delay in ms (default: 1000) */
  initialReconnectDelayMs?: number;
  /** Max reconnect delay in ms (default: 30000) */
  maxReconnectDelayMs?: number;
}

export abstract class ParallaxAgent {
  protected server: grpc.Server;
  protected registryClient: any;
  protected confidenceProto: any;
  protected registryProto: any;
  protected gatewayProto: any;
  protected leaseId?: string;
  protected renewInterval?: NodeJS.Timeout;
  private gatewayStream?: grpc.ClientDuplexStream<any, any>;
  private gatewayHeartbeatTimer?: NodeJS.Timeout;
  private gatewayReconnecting: boolean = false;
  private gatewayEndpoint?: string;
  private gatewayOptions?: GatewayOptions;

  constructor(
    public readonly id: string,
    public readonly name: string,
    public readonly capabilities: string[],
    public readonly metadata: Record<string, any> = {}
  ) {
    this.server = new grpc.Server();
    this.loadProtos();
  }

  /**
   * Main analysis method that must be implemented by subclasses.
   * Returns a standardized AgentResponse with automatic confidence.
   */
  abstract analyze(task: string, data?: any): Promise<AgentResponse>;

  protected async streamAnalyze(
    task: string,
    data: any,
    emit: (result: AgentResponse) => void
  ): Promise<void> {
    const result = await this.analyze(task, data);
    emit(result);
  }

  /**
   * Optional: Override to provide custom health checking
   */
  async checkHealth(): Promise<{ status: 'healthy' | 'unhealthy' | 'degraded', message?: string }> {
    return { status: 'healthy' };
  }

  /**
   * Helper method to create standardized agent results
   */
  protected createResult<T>(value: T, confidence: number, reasoning?: string, uncertainties?: string[]): AgentResponse<T> {
    return ensureConfidence({
      value,
      confidence,
      agent: this.id,
      reasoning,
      uncertainties,
      metadata: {
        timestamp: Date.now()
      }
    });
  }

  private loadProtos() {
    // Load confidence proto
    const confidencePath = path.join(PROTO_DIR, 'confidence.proto');
    const confidenceDefinition = protoLoader.loadSync(confidencePath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR]
    });
    
    const confidenceDescriptor = grpc.loadPackageDefinition(confidenceDefinition) as unknown as GrpcProto;
    this.confidenceProto = confidenceDescriptor.parallax.confidence;

    // Load registry proto
    const registryPath = path.join(PROTO_DIR, 'registry.proto');
    const registryDefinition = protoLoader.loadSync(registryPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR]
    });

    const registryDescriptor = grpc.loadPackageDefinition(registryDefinition) as unknown as GrpcProto;
    this.registryProto = registryDescriptor.parallax.registry;

    // Load gateway proto
    const gatewayPath = path.join(PROTO_DIR, 'gateway.proto');
    if (fs.existsSync(gatewayPath)) {
      const gatewayDefinition = protoLoader.loadSync(gatewayPath, {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [PROTO_DIR]
      });
      const gatewayDescriptor = grpc.loadPackageDefinition(gatewayDefinition) as any;
      this.gatewayProto = gatewayDescriptor.parallax.gateway;
    }
  }

  /**
   * Start the gRPC server and register with the control plane
   */
  async serve(
    port: number = 0,
    options?: {
      serverCredentials?: grpc.ServerCredentials;
      registryEndpoint?: string;
      registryCredentials?: grpc.ChannelCredentials;
      verifyRequest?: (call: grpc.ServerUnaryCall<any, any> | grpc.ServerWritableStream<any, any>) => Promise<{ verified: boolean; error?: string }>;
    }
  ): Promise<number> {
    // Add ConfidenceAgent service implementation
    const verify = options?.verifyRequest;
    const wrapUnary = (
      handler: (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => Promise<void>
    ) => async (call: grpc.ServerUnaryCall<any, any>, callback: grpc.sendUnaryData<any>) => {
      if (verify) {
        const result = await verify(call);
        if (!result.verified) {
          const error = new Error(result.error || 'Unauthorized');
          (error as any).code = grpc.status.UNAUTHENTICATED;
          callback(error);
          return;
        }
      }
      await handler(call, callback);
    };
    const wrapStream = (
      handler: (call: grpc.ServerWritableStream<any, any>) => Promise<void>
    ) => async (call: grpc.ServerWritableStream<any, any>) => {
      if (verify) {
        const result = await verify(call);
        if (!result.verified) {
          call.emit('error', {
            code: grpc.status.UNAUTHENTICATED,
            details: result.error || 'Unauthorized'
          });
          return;
        }
      }
      await handler(call);
    };

    this.server.addService(this.confidenceProto.ConfidenceAgent.service, {
      analyze: wrapUnary(this.handleAnalyze.bind(this)),
      streamAnalyze: wrapStream(this.handleStreamAnalyze.bind(this)),
      getCapabilities: wrapUnary(this.handleGetCapabilities.bind(this)),
      healthCheck: wrapUnary(this.handleHealthCheck.bind(this))
    });

    // Start the server
    return new Promise((resolve, reject) => {
      const bindAddr = `0.0.0.0:${port}`;
      const advertisedHost = process.env.PARALLAX_AGENT_HOST || '127.0.0.1';
      const credentials = options?.serverCredentials || grpc.ServerCredentials.createInsecure();

      this.server.bindAsync(
        bindAddr,
        credentials,
        async (error, actualPort) => {
          if (error) {
            reject(error);
            return;
          }

          console.log(`Agent ${this.name} (${this.id}) listening on port ${actualPort}`);

          // Use PARALLAX_AGENT_PORT to override advertised port (e.g. for ngrok tunnels)
          const advertisedPort = process.env.PARALLAX_AGENT_PORT
            ? parseInt(process.env.PARALLAX_AGENT_PORT, 10)
            : actualPort;

          // Register with control plane
          try {
            await this.register(
              `${advertisedHost}:${advertisedPort}`,
              options?.registryEndpoint,
              options?.registryCredentials
            );
            resolve(actualPort);
          } catch (regError) {
            console.error('Failed to register with control plane:', regError);
            // Still resolve - agent can work without registration
            resolve(actualPort);
          }
        }
      );
    });
  }

  /**
   * Register with the control plane
   */
  protected async register(
    agentAddress: string,
    registryEndpoint?: string,
    registryCredentials?: grpc.ChannelCredentials
  ): Promise<void> {
    const endpoint = registryEndpoint || process.env.PARALLAX_REGISTRY || 'localhost:50051';
    
    this.registryClient = new this.registryProto.Registry(
      endpoint,
      registryCredentials || grpc.credentials.createInsecure()
    );

    const request = {
      agent: {
        id: this.id,
        name: this.name,
        endpoint: agentAddress,
        capabilities: this.capabilities,
        metadata: this.metadata
      },
      auto_renew: true
    };

    await new Promise<void>((resolve, reject) => {
      this.registryClient.waitForReady(Date.now() + 5000, (error: any) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    return new Promise((resolve, reject) => {
      this.registryClient.register(request, (error: any, response: any) => {
        if (error) {
          console.error('Agent registration failed:', {
            agentId: this.id,
            endpoint,
            message: error.message,
            code: error.code,
            details: error.details
          });
          reject(error);
          return;
        }

        console.log(`Agent ${this.name} registered with control plane`);
        this.leaseId = response.lease_id;

        // Start lease renewal
        this.startLeaseRenewal();
        resolve();
      });
    });
  }

  /**
   * Start periodic lease renewal
   */
  private startLeaseRenewal() {
    if (!this.leaseId) return;
    
    // Renew lease every 30 seconds
    this.renewInterval = setInterval(async () => {
      try {
        await this.renewLease();
      } catch (error) {
        console.error('Failed to renew lease:', error);
      }
    }, 30000);
  }

  /**
   * Renew lease with registry
   */
  private async renewLease(): Promise<void> {
    if (!this.registryClient || !this.leaseId) return;
    
    return new Promise((resolve, reject) => {
      this.registryClient.renew({ lease_id: this.leaseId }, (error: any, _response: any) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Handle execute requests
   */
  protected async handleAnalyze(
    call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    try {
      const request = call.request;
      const taskDescription = request.task_description || request.task?.description || '';
      const data = normalizeStruct(request.data || (request.task?.data ? JSON.parse(request.task.data) : undefined));
      
      // Call the agent's analyze method
      const result = await this.analyze(
        taskDescription,
        data
      );
      
      // Build response
      const response = {
        value_json: JSON.stringify(result.value),
        confidence: result.confidence,
        agent_id: this.id,
        timestamp: {
          seconds: Math.floor(Date.now() / 1000),
          nanos: 0
        },
        reasoning: result.reasoning || '',
        metadata: result.metadata || {}
      };
      
      callback(null, response);
    } catch (error: any) {
      callback({
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  /**
   * Handle streaming execute requests
   */
  protected async handleStreamAnalyze(call: grpc.ServerWritableStream<any, any>) {
    try {
      const request = call.request;
      const taskDescription = request.task_description || request.task?.description || '';
      const data = normalizeStruct(request.data || (request.task?.data ? JSON.parse(request.task.data) : undefined));

      await this.streamAnalyze(taskDescription, data, (result) => {
        call.write({
          value_json: JSON.stringify(result.value),
          confidence: result.confidence,
          agent_id: this.id,
          timestamp: {
            seconds: Math.floor(Date.now() / 1000),
            nanos: 0
          },
          reasoning: result.reasoning || '',
          metadata: result.metadata || {}
        });
      });

      call.end();
    } catch (error: any) {
      call.emit('error', {
        code: grpc.status.INTERNAL,
        details: error.message
      });
    }
  }

  /**
   * Handle get capabilities requests
   */
  protected async handleGetCapabilities(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    callback(null, {
      agent_id: this.id,
      name: this.name,
      capabilities: this.capabilities,
      expertise_level: 'EXPERT',
      capability_scores: {}
    });
  }

  /**
   * Handle health check requests
   */
  protected async handleHealthCheck(
    _call: grpc.ServerUnaryCall<any, any>,
    callback: grpc.sendUnaryData<any>
  ) {
    const health = await this.checkHealth();
    callback(null, {
      status: health.status.toUpperCase(),
      message: health.message,
      last_check: {
        seconds: Math.floor(Date.now() / 1000),
        nanos: 0
      },
      details: {}
    });
  }

  /**
   * Connect to the control plane via the Agent Gateway (bidirectional stream).
   * Use this instead of serve() for agents behind NAT or without a public endpoint.
   * The agent opens an outbound connection; tasks are received through the stream.
   */
  async connectViaGateway(
    endpoint: string,
    options?: GatewayOptions
  ): Promise<void> {
    if (!this.gatewayProto) {
      throw new Error('Gateway proto not loaded. Ensure gateway.proto exists in the proto directory.');
    }

    this.gatewayEndpoint = endpoint;
    this.gatewayOptions = options;

    const credentials = options?.credentials || grpc.credentials.createInsecure();
    const heartbeatIntervalMs = options?.heartbeatIntervalMs || 10000;

    const client = new this.gatewayProto.AgentGateway(endpoint, credentials);

    // Open bidirectional stream
    const stream = client.connect();
    this.gatewayStream = stream;

    // Send AgentHello
    stream.write({
      request_id: `hello-${this.id}`,
      hello: {
        agent_id: this.id,
        agent_name: this.name,
        capabilities: this.capabilities,
        metadata: this.metadata,
        heartbeat_interval_ms: heartbeatIntervalMs,
      },
    });

    console.log(`Agent ${this.name} (${this.id}) connecting via gateway to ${endpoint}`);

    // Start heartbeat
    this.gatewayHeartbeatTimer = setInterval(() => {
      try {
        stream.write({
          request_id: '',
          heartbeat: {
            agent_id: this.id,
            load: 0,
            status: 'healthy',
          },
        });
      } catch {
        // Stream might be closed; reconnect logic will handle it
      }
    }, heartbeatIntervalMs);

    // Listen for messages from control plane
    stream.on('data', async (message: any) => {
      if (message.ack) {
        if (message.ack.accepted) {
          console.log(`Agent ${this.name} connected via gateway (node: ${message.ack.assigned_node_id})`);
        } else {
          console.error(`Gateway rejected agent: ${message.ack.message}`);
          stream.end();
        }
      } else if (message.task_request) {
        await this.handleGatewayTask(stream, message.request_id, message.task_request);
      } else if (message.cancel_task) {
        console.log(`Task cancelled: ${message.cancel_task.task_id} (${message.cancel_task.reason})`);
        // Cancellation support can be extended in subclasses
      } else if (message.ping) {
        // Respond to ping with a heartbeat
        stream.write({
          request_id: '',
          heartbeat: {
            agent_id: this.id,
            load: 0,
            status: 'healthy',
          },
        });
      }
    });

    stream.on('error', (error: any) => {
      console.error(`Gateway stream error: ${error.message}`);
      this.handleGatewayDisconnect(error);
    });

    stream.on('end', () => {
      console.log('Gateway stream ended');
      this.handleGatewayDisconnect(new Error('Stream ended'));
    });

    // Wait for the ack before returning
    return new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Gateway connection timed out waiting for ack'));
      }, 10000);

      const onData = (message: any) => {
        if (message.ack) {
          clearTimeout(timeout);
          stream.removeListener('data', onData);
          if (message.ack.accepted) {
            resolve();
          } else {
            reject(new Error(`Gateway rejected: ${message.ack.message}`));
          }
        }
      };

      // Add a temporary listener just for the initial ack
      // Note: the permanent 'data' listener above will also fire
      stream.on('data', onData);
    });
  }

  /**
   * Handle a task received via the gateway stream.
   */
  private async handleGatewayTask(
    stream: grpc.ClientDuplexStream<any, any>,
    requestId: string,
    taskRequest: any
  ): Promise<void> {
    try {
      const taskDescription = taskRequest.task_description || '';
      const data = normalizeStruct(taskRequest.data);

      const result = await this.analyze(taskDescription, data);

      stream.write({
        request_id: requestId,
        task_result: {
          task_id: taskRequest.task_id,
          value_json: JSON.stringify(result.value),
          confidence: result.confidence,
          reasoning: result.reasoning || '',
          metadata: result.metadata || {},
        },
      });
    } catch (error: any) {
      stream.write({
        request_id: requestId,
        task_error: {
          task_id: taskRequest.task_id,
          error_message: error.message || 'Unknown error',
          error_code: 'INTERNAL',
        },
      });
    }
  }

  /**
   * Handle gateway disconnection with auto-reconnect.
   */
  private handleGatewayDisconnect(_error: Error): void {
    // Clean up heartbeat timer
    if (this.gatewayHeartbeatTimer) {
      clearInterval(this.gatewayHeartbeatTimer);
      this.gatewayHeartbeatTimer = undefined;
    }

    this.gatewayStream = undefined;

    const autoReconnect = this.gatewayOptions?.autoReconnect !== false;
    if (!autoReconnect || this.gatewayReconnecting) return;

    if (!this.gatewayEndpoint) return;

    this.gatewayReconnecting = true;
    const initialDelay = this.gatewayOptions?.initialReconnectDelayMs || 1000;
    const maxDelay = this.gatewayOptions?.maxReconnectDelayMs || 30000;
    const maxAttempts = this.gatewayOptions?.maxReconnectAttempts ?? Infinity;

    let attempt = 0;
    const reconnect = async () => {
      if (attempt >= maxAttempts) {
        console.error(`Gateway reconnect failed after ${attempt} attempts`);
        this.gatewayReconnecting = false;
        return;
      }

      const delay = Math.min(initialDelay * Math.pow(2, attempt), maxDelay);
      attempt++;

      console.log(`Gateway reconnecting in ${delay}ms (attempt ${attempt})...`);
      await new Promise(r => setTimeout(r, delay));

      try {
        await this.connectViaGateway(this.gatewayEndpoint!, this.gatewayOptions);
        console.log('Gateway reconnected successfully');
        this.gatewayReconnecting = false;
      } catch (reconnectError: any) {
        console.error(`Gateway reconnect attempt ${attempt} failed: ${reconnectError.message}`);
        await reconnect();
      }
    };

    reconnect().catch(() => {
      this.gatewayReconnecting = false;
    });
  }

  /**
   * Shutdown the agent
   */
  async shutdown(): Promise<void> {
    // Stop gateway connection
    if (this.gatewayHeartbeatTimer) {
      clearInterval(this.gatewayHeartbeatTimer);
      this.gatewayHeartbeatTimer = undefined;
    }
    if (this.gatewayStream) {
      try {
        this.gatewayStream.end();
      } catch {
        // Ignore errors on stream close
      }
      this.gatewayStream = undefined;
    }
    // Prevent reconnect during shutdown
    this.gatewayReconnecting = true;

    // Stop lease renewal
    if (this.renewInterval) {
      clearInterval(this.renewInterval);
    }

    // Unregister from control plane
    if (this.registryClient && this.id) {
      try {
        await new Promise<void>((resolve) => {
          this.registryClient.unregister({ id: this.id }, () => {
            resolve();
          });
        });
      } catch (error) {
        console.error('Failed to unregister:', error);
      }
    }

    // Stop gRPC server
    return new Promise((resolve) => {
      this.server.tryShutdown(() => {
        resolve();
      });
    });
  }
}

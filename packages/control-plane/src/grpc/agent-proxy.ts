/**
 * gRPC client proxy for calling agents
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';

const PROTO_DIR = path.join(__dirname, '../../../../proto');

export interface AgentTask {
  description: string;
  data?: any;
  metadata?: Record<string, any>;
}

export interface AgentResult {
  value?: any;
  confidence: number;
  reasoning?: string;
  metadata?: Record<string, any>;
  error?: string;
}

export class AgentProxy {
  private clients: Map<string, any> = new Map();
  private confidenceProto: any;
  private agentCredentials?: grpc.ChannelCredentials;

  constructor(private logger: Logger) {
    this.loadProto();
  }

  private toStructValue(value: any): any {
    if (value === null || value === undefined) {
      return { nullValue: 0 };
    }
    if (Array.isArray(value)) {
      return { listValue: { values: value.map((item) => this.toStructValue(item)) } };
    }
    if (typeof value === 'object') {
      const fields: Record<string, any> = {};
      for (const [key, entry] of Object.entries(value)) {
        fields[key] = this.toStructValue(entry);
      }
      return { structValue: { fields } };
    }
    if (typeof value === 'string') return { stringValue: value };
    if (typeof value === 'number') return { numberValue: value };
    if (typeof value === 'boolean') return { boolValue: value };
    return { stringValue: String(value) };
  }

  private toStruct(value: any): any {
    if (value && typeof value === 'object' && 'fields' in value) return value;
    const structValue = this.toStructValue(value)?.structValue;
    return { fields: structValue?.fields || {} };
  }

  private loadProto() {
    const protoPath = path.join(PROTO_DIR, 'confidence.proto');
    const packageDefinition = protoLoader.loadSync(protoPath, {
      keepCase: true,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
      includeDirs: [PROTO_DIR]
    });
    
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition) as any;
    this.confidenceProto = protoDescriptor.parallax.confidence;
  }

  private getClient(address: string): any {
    if (!this.clients.has(address)) {
      if (!this.agentCredentials) {
        this.agentCredentials = this.buildCredentials();
      }
      const client = new this.confidenceProto.ConfidenceAgent(
        address,
        this.agentCredentials || grpc.credentials.createInsecure()
      );
      this.clients.set(address, client);
    }
    return this.clients.get(address);
  }

  private buildCredentials(): grpc.ChannelCredentials | undefined {
    const enabled = process.env.PARALLAX_AGENT_MTLS_ENABLED === 'true';
    if (!enabled) return grpc.credentials.createInsecure();

    const caPath = process.env.PARALLAX_AGENT_MTLS_CA;
    const certPath = process.env.PARALLAX_AGENT_MTLS_CERT;
    const keyPath = process.env.PARALLAX_AGENT_MTLS_KEY;

    try {
      if (!caPath) {
        this.logger.warn('PARALLAX_AGENT_MTLS_CA not set; falling back to insecure agent credentials');
        return grpc.credentials.createInsecure();
      }

      const ca = fs.readFileSync(caPath);
      const cert = certPath ? fs.readFileSync(certPath) : undefined;
      const key = keyPath ? fs.readFileSync(keyPath) : undefined;

      if (cert && key) {
        return grpc.credentials.createSsl(ca, key, cert);
      }
      return grpc.credentials.createSsl(ca);
    } catch (error) {
      this.logger.warn({ error }, 'Failed to load agent mTLS credentials; falling back to insecure');
      return grpc.credentials.createInsecure();
    }
  }

  /**
   * Execute a task on an agent
   */
  async executeTask(
    agentAddress: string,
    task: AgentTask,
    timeout: number = 30000
  ): Promise<AgentResult> {
    const client = this.getClient(agentAddress);
    
    return new Promise((resolve) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + Math.floor(timeout / 1000));

      const request = {
        task_id: uuidv4(),
        task_description: task.description,
        data: this.toStruct(task.data || {}),
        context: task.metadata || {},
        timeout_ms: timeout
      };

      this.logger.debug({ agentAddress, task }, 'Executing task on agent');

      client.analyze(request, { deadline }, (error: any, response: any) => {
        if (error) {
          this.logger.error({ error, agentAddress }, 'Failed to execute task on agent');
          resolve({
            confidence: 0,
            error: error.message
          });
          return;
        }

        const result: AgentResult = {
          value: response.value_json ? JSON.parse(response.value_json) : undefined,
          confidence: response.confidence || 0,
          reasoning: response.reasoning,
          metadata: response.metadata || {},
          error: response.error
        };

        this.logger.debug({ agentAddress, result }, 'Received result from agent');
        resolve(result);
      });
    });
  }

  /**
   * Execute a task on an agent with streaming response
   */
  async executeTaskStream(
    agentAddress: string,
    task: AgentTask,
    onResult: (result: AgentResult) => void,
    timeout: number = 30000
  ): Promise<void> {
    const client = this.getClient(agentAddress);
    
    return new Promise((resolve, reject) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + Math.floor(timeout / 1000));

      const request = {
        task_id: uuidv4(),
        task_description: task.description,
        data: task.data || {},
        context: task.metadata || {},
        timeout_ms: timeout
      };

      const stream = client.streamAnalyze(request, { deadline });

      stream.on('data', (response: any) => {
        const result: AgentResult = {
          value: response.value_json ? JSON.parse(response.value_json) : undefined,
          confidence: response.confidence || 0,
          reasoning: response.reasoning,
          metadata: response.metadata || {},
          error: response.error
        };
        
        onResult(result);
      });

      stream.on('error', (error: any) => {
        this.logger.error({ error, agentAddress }, 'Stream error from agent');
        reject(error);
      });

      stream.on('end', () => {
        this.logger.debug({ agentAddress }, 'Stream ended from agent');
        resolve();
      });
    });
  }

  /**
   * Get capabilities from an agent
   */
  async getCapabilities(agentAddress: string, timeout: number = 5000): Promise<string[]> {
    const client = this.getClient(agentAddress);
    
    return new Promise((resolve) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + Math.floor(timeout / 1000));

      client.getCapabilities({}, { deadline }, (error: any, response: any) => {
        if (error) {
          this.logger.error({ error, agentAddress }, 'Failed to get capabilities');
          resolve([]); // Return empty capabilities on error
          return;
        }

        resolve(response.capabilities || []);
      });
    });
  }

  /**
   * Health check an agent
   */
  async healthCheck(agentAddress: string, timeout: number = 5000): Promise<boolean> {
    const client = this.getClient(agentAddress);
    
    return new Promise((resolve) => {
      const deadline = new Date();
      deadline.setSeconds(deadline.getSeconds() + Math.floor(timeout / 1000));

      client.healthCheck({}, { deadline }, (error: any, response: any) => {
        if (error) {
          this.logger.debug({ error, agentAddress }, 'Health check failed');
          resolve(false);
          return;
        }

        resolve(response.status === 'HEALTHY');
      });
    });
  }

  /**
   * Close all client connections
   */
  close() {
    for (const [_address, client] of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}

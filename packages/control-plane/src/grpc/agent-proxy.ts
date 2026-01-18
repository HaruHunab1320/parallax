/**
 * gRPC client proxy for calling agents
 */

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import path from 'path';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';

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

  constructor(private logger: Logger) {
    this.loadProto();
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
    
    const protoDescriptor = grpc.loadPackageDefinition(packageDefinition);
    this.confidenceProto = protoDescriptor.parallax.confidence;
  }

  private getClient(address: string): any {
    if (!this.clients.has(address)) {
      const client = new this.confidenceProto.ConfidenceAgent(
        address,
        grpc.credentials.createInsecure()
      );
      this.clients.set(address, client);
    }
    return this.clients.get(address);
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
    
    return new Promise((resolve, reject) => {
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
    for (const [address, client] of this.clients) {
      client.close();
    }
    this.clients.clear();
  }
}

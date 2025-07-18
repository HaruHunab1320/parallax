/**
 * HTTP client for Parallax Control Plane API
 */

import axios, { AxiosInstance } from 'axios';
import WebSocket from 'ws';

export interface ParallaxHttpConfig {
  baseURL?: string;
  timeout?: number;
  apiKey?: string;
}

export interface Pattern {
  name: string;
  version: string;
  description: string;
  minAgents?: number;
  maxAgents?: number;
  input?: any;
  metadata?: Record<string, any>;
}

export interface Agent {
  id: string;
  name: string;
  endpoint: string;
  status: string;
  capabilities?: string[];
  lastSeen?: string;
}

export interface Execution {
  id: string;
  patternName: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
  startTime: string;
  endTime?: string;
  result?: any;
  error?: string;
  confidence?: number;
  metrics?: any;
  warnings?: any[];
}

export class ParallaxHttpClient {
  private client: AxiosInstance;
  private baseURL: string;

  constructor(config: ParallaxHttpConfig = {}) {
    this.baseURL = config.baseURL || process.env.PARALLAX_API_URL || 'http://localhost:3000';
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { 'X-API-Key': config.apiKey } : {})
      }
    });

    // Add request/response interceptors for error handling
    this.client.interceptors.response.use(
      response => response,
      error => {
        if (error.response) {
          const message = error.response.data?.error || error.message;
          throw new Error(`API Error (${error.response.status}): ${message}`);
        }
        throw error;
      }
    );
  }

  // Health check
  async health() {
    const response = await this.client.get('/health');
    return response.data;
  }

  // Pattern methods
  async listPatterns(): Promise<Pattern[]> {
    const response = await this.client.get('/api/patterns');
    return response.data.patterns;
  }

  async getPattern(name: string): Promise<Pattern> {
    const response = await this.client.get(`/api/patterns/${name}`);
    return response.data;
  }

  async validatePattern(name: string, input: any) {
    const response = await this.client.post(`/api/patterns/${name}/validate`, input);
    return response.data;
  }

  async executePattern(name: string, input: any, options?: { timeout?: number }) {
    const response = await this.client.post(
      `/api/patterns/${name}/execute`,
      input,
      {
        params: options,
        timeout: options?.timeout || 60000 // Default 60s for execution
      }
    );
    return response.data.execution;
  }

  // Agent methods
  async listAgents(): Promise<Agent[]> {
    const response = await this.client.get('/api/agents');
    return response.data.agents;
  }

  async getAgent(id: string): Promise<Agent> {
    const response = await this.client.get(`/api/agents/${id}`);
    return response.data;
  }

  async getAgentHealth(id: string) {
    const response = await this.client.get(`/api/agents/${id}/health`);
    return response.data;
  }

  async testAgent(id: string, task: string = 'test', data: any = {}) {
    const response = await this.client.post(`/api/agents/${id}/test`, { task, data });
    return response.data;
  }

  async getAgentsByCapability(capability: string): Promise<Agent[]> {
    const response = await this.client.get(`/api/agents/capability/${capability}`);
    return response.data.agents;
  }

  // Execution methods
  async listExecutions(options?: { limit?: number; offset?: number; status?: string }) {
    const response = await this.client.get('/api/executions', { params: options });
    return response.data;
  }

  async getExecution(id: string): Promise<Execution> {
    const response = await this.client.get(`/api/executions/${id}`);
    return response.data;
  }

  async createExecution(patternName: string, input: any, options?: { timeout?: number; stream?: boolean }) {
    const response = await this.client.post('/api/executions', {
      patternName,
      input,
      options
    });
    return response.data;
  }

  async cancelExecution(id: string) {
    const response = await this.client.post(`/api/executions/${id}/cancel`);
    return response.data;
  }

  async retryExecution(id: string) {
    const response = await this.client.post(`/api/executions/${id}/retry`);
    return response.data;
  }

  // WebSocket streaming
  streamExecution(executionId: string, handlers: {
    onMessage?: (data: any) => void;
    onError?: (error: Error) => void;
    onClose?: () => void;
  }): WebSocket {
    const wsUrl = this.baseURL.replace(/^http/, 'ws');
    const ws = new WebSocket(`${wsUrl}/api/executions/stream?executionId=${executionId}`);

    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        handlers.onMessage?.(message);
      } catch (error) {
        handlers.onError?.(new Error('Failed to parse WebSocket message'));
      }
    });

    ws.on('error', (error) => {
      handlers.onError?.(error);
    });

    ws.on('close', () => {
      handlers.onClose?.();
    });

    return ws;
  }

  // Utility methods
  async reloadPatterns() {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Pattern reload is only available in development mode');
    }
    const response = await this.client.post('/api/patterns/reload');
    return response.data;
  }

  async getMetrics() {
    const response = await this.client.get('/metrics');
    return response.data;
  }
}
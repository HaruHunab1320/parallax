export interface ProxyConfig {
  timeout: number;
  retries: number;
  circuitBreaker: {
    failureThreshold: number;
    resetTimeout: number;
    monitoringPeriod: number;
  };
  rateLimit: {
    maxRequests: number;
    windowMs: number;
  };
}

export interface AgentConnection {
  id: string;
  endpoint: string;
  protocol: 'grpc' | 'http';
  status: 'connected' | 'disconnected' | 'error';
  lastSeen: Date;
  metrics: ConnectionMetrics;
}

export interface ConnectionMetrics {
  requestCount: number;
  errorCount: number;
  averageLatency: number;
  successRate: number;
}

export interface ProxyRequest {
  agentId: string;
  method: string;
  payload: any;
  timeout?: number;
  retries?: number;
}

export interface ProxyResponse<T = any> {
  data: T;
  metadata: {
    agentId: string;
    latency: number;
    retries: number;
    cached: boolean;
  };
}
import { 
  ProxyConfig, 
  AgentConnection, 
  ProxyRequest, 
  ProxyResponse,
  ConnectionMetrics 
} from './types';
import { CircuitBreaker } from './circuit-breaker';
import { LoadBalancer, LoadBalancingStrategy } from './load-balancer';
import { Logger } from 'pino';
import { EventEmitter } from 'events';

export class AgentProxy extends EventEmitter {
  private connections: Map<string, AgentConnection> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();
  private loadBalancer: LoadBalancer;
  private requestTimestamps: Map<string, number[]> = new Map();

  constructor(
    private config: ProxyConfig,
    private logger: Logger,
    loadBalancingStrategy: LoadBalancingStrategy = LoadBalancingStrategy.CONFIDENCE_BASED
  ) {
    super();
    this.loadBalancer = new LoadBalancer(loadBalancingStrategy);
  }

  async registerAgent(id: string, endpoint: string, protocol: 'grpc' | 'http' = 'grpc'): Promise<void> {
    const connection: AgentConnection = {
      id,
      endpoint,
      protocol,
      status: 'disconnected',
      lastSeen: new Date(),
      metrics: {
        requestCount: 0,
        errorCount: 0,
        averageLatency: 0,
        successRate: 1.0,
      },
    };

    this.connections.set(id, connection);
    
    // Create circuit breaker for this agent
    const circuitBreaker = new CircuitBreaker(this.config.circuitBreaker);
    circuitBreaker.on('state-change', (state) => {
      this.logger.warn({ agentId: id, state }, 'Circuit breaker state changed');
      this.emit('circuit-breaker-change', { agentId: id, state });
    });
    
    this.circuitBreakers.set(id, circuitBreaker);

    // Initialize rate limiting tracking
    this.requestTimestamps.set(id, []);

    await this.connectAgent(id);
  }

  private async connectAgent(id: string): Promise<void> {
    const connection = this.connections.get(id);
    if (!connection) return;

    try {
      // TODO: Implement actual connection logic based on protocol
      connection.status = 'connected';
      connection.lastSeen = new Date();
      
      this.logger.info({ agentId: id }, 'Agent connected');
      this.emit('agent-connected', id);
    } catch (error) {
      connection.status = 'error';
      this.logger.error({ agentId: id, error }, 'Failed to connect to agent');
      this.emit('agent-error', { agentId: id, error });
    }
  }

  async request<T>(request: ProxyRequest): Promise<ProxyResponse<T>> {
    const agent = this.connections.get(request.agentId);
    if (!agent) {
      throw new Error(`Agent ${request.agentId} not found`);
    }

    // Check rate limit
    if (!this.checkRateLimit(request.agentId)) {
      throw new Error(`Rate limit exceeded for agent ${request.agentId}`);
    }

    // Get circuit breaker
    const circuitBreaker = this.circuitBreakers.get(request.agentId);
    if (!circuitBreaker) {
      throw new Error(`Circuit breaker not found for agent ${request.agentId}`);
    }

    const startTime = Date.now();
    let retries = 0;
    let lastError: any;

    // Increment connection count for load balancing
    this.loadBalancer.incrementConnection(request.agentId);

    try {
      // Execute with circuit breaker protection
      const result = await circuitBreaker.execute(async () => {
        // Retry logic
        for (let i = 0; i <= (request.retries ?? this.config.retries); i++) {
          try {
            retries = i;
            return await this.executeRequest<T>(agent, request);
          } catch (error) {
            lastError = error;
            if (i < (request.retries ?? this.config.retries)) {
              await this.delay(Math.pow(2, i) * 1000); // Exponential backoff
            }
          }
        }
        throw lastError;
      });

      // Update metrics
      this.updateMetrics(request.agentId, true, Date.now() - startTime);

      return {
        data: result,
        metadata: {
          agentId: request.agentId,
          latency: Date.now() - startTime,
          retries,
          cached: false,
        },
      };
    } catch (error) {
      // Update metrics
      this.updateMetrics(request.agentId, false, Date.now() - startTime);
      
      throw error;
    } finally {
      // Decrement connection count
      this.loadBalancer.decrementConnection(request.agentId);
    }
  }

  private async executeRequest<T>(
    agent: AgentConnection,
    request: ProxyRequest
  ): Promise<T> {
    // TODO: Implement actual request execution based on protocol
    // This is a placeholder implementation
    
    if (agent.status !== 'connected') {
      throw new Error(`Agent ${agent.id} is not connected`);
    }

    // Simulate request with timeout
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Request timeout'));
      }, request.timeout ?? this.config.timeout);

      // Simulate successful response
      setTimeout(() => {
        clearTimeout(timeout);
        resolve({ success: true, method: request.method } as any);
      }, 100);
    });
  }

  private checkRateLimit(agentId: string): boolean {
    const timestamps = this.requestTimestamps.get(agentId) || [];
    const now = Date.now();
    
    // Remove old timestamps
    const recentTimestamps = timestamps.filter(
      t => now - t < this.config.rateLimit.windowMs
    );
    
    if (recentTimestamps.length >= this.config.rateLimit.maxRequests) {
      return false;
    }
    
    recentTimestamps.push(now);
    this.requestTimestamps.set(agentId, recentTimestamps);
    
    return true;
  }

  private updateMetrics(
    agentId: string,
    success: boolean,
    latency: number
  ): void {
    const connection = this.connections.get(agentId);
    if (!connection) return;

    connection.metrics.requestCount++;
    
    if (!success) {
      connection.metrics.errorCount++;
    }
    
    // Update average latency
    const prevAvg = connection.metrics.averageLatency;
    const count = connection.metrics.requestCount;
    connection.metrics.averageLatency = (prevAvg * (count - 1) + latency) / count;
    
    // Update success rate
    connection.metrics.successRate = 
      (connection.metrics.requestCount - connection.metrics.errorCount) / 
      connection.metrics.requestCount;
  }

  selectAgent(agentIds?: string[]): string | null {
    let agents: AgentConnection[];
    
    if (agentIds) {
      agents = agentIds
        .map(id => this.connections.get(id))
        .filter((a): a is AgentConnection => a !== undefined);
    } else {
      agents = Array.from(this.connections.values());
    }
    
    const selected = this.loadBalancer.selectAgent(agents);
    return selected?.id || null;
  }

  getAgentMetrics(agentId: string): ConnectionMetrics | null {
    const connection = this.connections.get(agentId);
    return connection?.metrics || null;
  }

  getAllMetrics(): Map<string, ConnectionMetrics> {
    const metrics = new Map<string, ConnectionMetrics>();
    
    for (const [id, connection] of this.connections) {
      metrics.set(id, connection.metrics);
    }
    
    return metrics;
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async disconnect(): Promise<void> {
    // Clean up all connections
    for (const [id, connection] of this.connections) {
      connection.status = 'disconnected';
      this.emit('agent-disconnected', id);
    }
    
    this.connections.clear();
    this.circuitBreakers.clear();
    this.requestTimestamps.clear();
    this.loadBalancer.reset();
  }
}
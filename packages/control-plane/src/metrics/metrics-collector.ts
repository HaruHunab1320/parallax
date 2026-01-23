/**
 * Prometheus metrics collection for Parallax control plane
 */

import { Registry, Counter, Histogram, Gauge, collectDefaultMetrics } from 'prom-client';
import { Request, Response } from 'express';

export class MetricsCollector {
  private registry: Registry;
  
  // Pattern metrics
  public patternExecutions!: Counter;
  public patternDuration!: Histogram;
  public patternErrors!: Counter;
  public patternConfidence!: Histogram;
  
  // Agent metrics
  public activeAgents!: Gauge;
  public agentRequests!: Counter;
  public agentResponseTime!: Histogram;
  public agentErrors!: Counter;
  
  // System metrics
  public queueSize!: Gauge;
  public concurrentExecutions!: Gauge;
  
  constructor() {
    this.registry = new Registry();
    
    // Collect default metrics (CPU, memory, etc.)
    collectDefaultMetrics({
      register: this.registry,
      prefix: 'parallax_control_plane_',
    });
    
    // Initialize custom metrics
    this.initializeMetrics();
  }
  
  private initializeMetrics(): void {
    // Pattern execution metrics
    this.patternExecutions = new Counter({
      name: 'parallax_pattern_executions_total',
      help: 'Total number of pattern executions',
      labelNames: ['pattern', 'status'],
      registers: [this.registry],
    });
    
    this.patternDuration = new Histogram({
      name: 'parallax_pattern_duration_seconds',
      help: 'Pattern execution duration in seconds',
      labelNames: ['pattern'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60],
      registers: [this.registry],
    });
    
    this.patternErrors = new Counter({
      name: 'parallax_pattern_errors_total',
      help: 'Total number of pattern execution errors',
      labelNames: ['pattern', 'error_type'],
      registers: [this.registry],
    });
    
    this.patternConfidence = new Histogram({
      name: 'parallax_pattern_confidence',
      help: 'Pattern result confidence distribution',
      labelNames: ['pattern'],
      buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
      registers: [this.registry],
    });
    
    // Agent metrics
    this.activeAgents = new Gauge({
      name: 'parallax_active_agents',
      help: 'Number of currently active agents',
      labelNames: ['type'],
      registers: [this.registry],
    });
    
    this.agentRequests = new Counter({
      name: 'parallax_agent_requests_total',
      help: 'Total number of requests to agents',
      labelNames: ['agent_id', 'task_type'],
      registers: [this.registry],
    });
    
    this.agentResponseTime = new Histogram({
      name: 'parallax_agent_response_time_seconds',
      help: 'Agent response time in seconds',
      labelNames: ['agent_id', 'task_type'],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
      registers: [this.registry],
    });
    
    this.agentErrors = new Counter({
      name: 'parallax_agent_errors_total',
      help: 'Total number of agent errors',
      labelNames: ['agent_id', 'error_type'],
      registers: [this.registry],
    });
    
    // System metrics
    this.queueSize = new Gauge({
      name: 'parallax_queue_size',
      help: 'Current size of the execution queue',
      registers: [this.registry],
    });
    
    this.concurrentExecutions = new Gauge({
      name: 'parallax_concurrent_executions',
      help: 'Number of concurrent pattern executions',
      registers: [this.registry],
    });
  }
  
  /**
   * Record pattern execution start
   */
  recordPatternStart(pattern: string): () => void {
    const timer = this.patternDuration.startTimer({ pattern });
    this.concurrentExecutions.inc();
    
    return () => {
      timer();
      this.concurrentExecutions.dec();
    };
  }
  
  /**
   * Record pattern execution result
   */
  recordPatternResult(pattern: string, success: boolean, confidence?: number): void {
    this.patternExecutions.inc({
      pattern,
      status: success ? 'success' : 'failure',
    });
    
    if (confidence !== undefined) {
      this.patternConfidence.observe({ pattern }, confidence);
    }
  }
  
  /**
   * Record pattern error
   */
  recordPatternError(pattern: string, errorType: string): void {
    this.patternErrors.inc({ pattern, error_type: errorType });
  }
  
  /**
   * Record agent request
   */
  recordAgentRequest(agentId: string, taskType: string): () => void {
    this.agentRequests.inc({ agent_id: agentId, task_type: taskType });
    const timer = this.agentResponseTime.startTimer({
      agent_id: agentId,
      task_type: taskType,
    });
    
    return timer;
  }
  
  /**
   * Record agent error
   */
  recordAgentError(agentId: string, errorType: string): void {
    this.agentErrors.inc({ agent_id: agentId, error_type: errorType });
  }
  
  /**
   * Update active agents count
   */
  updateActiveAgents(type: string, count: number): void {
    this.activeAgents.set({ type }, count);
  }
  
  /**
   * Update queue size
   */
  updateQueueSize(size: number): void {
    this.queueSize.set(size);
  }
  
  /**
   * Express middleware for metrics endpoint
   */
  metricsHandler() {
    return async (_req: Request, res: Response) => {
      try {
        res.set('Content-Type', this.registry.contentType);
        const metrics = await this.registry.metrics();
        res.end(metrics);
      } catch (error) {
        res.status(500).end();
      }
    };
  }
  
  /**
   * Get registry for advanced use cases
   */
  getRegistry(): Registry {
    return this.registry;
  }
  
  /**
   * Record API call metrics
   */
  recordApiCall(_resource: string, _method: string, _statusCode: number): void {
    // This could be implemented with a counter if needed
    // For now, just a placeholder
  }
  
  /**
   * Record pattern execution with timing
   */
  recordPatternExecution(pattern: string, duration: number, success: boolean): void {
    this.patternDuration.observe({ pattern }, duration / 1000); // Convert ms to seconds
    this.recordPatternResult(pattern, success);
  }
}
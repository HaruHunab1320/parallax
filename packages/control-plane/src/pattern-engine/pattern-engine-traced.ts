import { Pattern, PatternExecution, ExecutionMetrics } from './types';
import { PatternLoader } from './pattern-loader';
import { RuntimeManager } from '../runtime-manager';
import { EtcdRegistry } from '../registry';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { GrpcAgentProxy } from '@parallax/runtime';
import { LocalAgentManager } from './local-agents';
import { 
  PatternTracer
} from '@parallax/telemetry';

export class TracedPatternEngine {
  private loader: PatternLoader;
  private executions: Map<string, PatternExecution> = new Map();
  private localAgentManager: LocalAgentManager;
  private tracer: PatternTracer;
  
  constructor(
    private runtimeManager: RuntimeManager,
    private agentRegistry: EtcdRegistry,
    patternsDir: string,
    private logger: Logger
  ) {
    this.loader = new PatternLoader(patternsDir, logger);
    this.localAgentManager = LocalAgentManager.fromEnv();
    this.tracer = new PatternTracer('control-plane', '0.1.0');
  }

  async initialize(): Promise<void> {
    await this.loader.loadPatterns();
  }

  async executePattern(
    patternName: string,
    input: any,
    options?: { timeout?: number }
  ): Promise<PatternExecution> {
    const executionId = uuidv4();
    
    return this.tracer.tracePatternExecution(
      patternName,
      input,
      async () => {
        const pattern = this.loader.getPattern(patternName);
        if (!pattern) {
          throw new Error(`Pattern ${patternName} not found`);
        }

        const execution: PatternExecution = {
          id: executionId,
          patternName,
          startTime: new Date(),
          status: 'running',
        };

        this.executions.set(execution.id, execution);

        // Add pattern metadata to span
        this.tracer.addPatternMetadata({
          minAgents: pattern.minAgents,
          confidenceThreshold: pattern.metadata?.defaultThreshold,
          timeout: options?.timeout?.toString(),
          retries: pattern.metadata?.retryPolicy?.maxRetries
        });

        try {
          // Select agents based on pattern requirements
          const agents = await this.selectAgents(pattern);
          
          // Create Prism context with agent proxies
          const prismContext: Record<string, any> = {
            agents: agents.reduce((acc, agent) => {
              acc[agent.id] = agent;
              return acc;
            }, {} as Record<string, GrpcAgentProxy>),
            input,
            logger: this.logger,
            confidence: {
              threshold: pattern.metadata?.defaultThreshold || 0.7,
              aggregation: pattern.metadata?.aggregationMethod || 'weighted_average',
            },
          };

          // Execute the pattern via Prism runtime
          const result = await this.runtimeManager.executePrismScript(
            pattern.script,
            prismContext
          );

          execution.status = 'completed';
          execution.endTime = new Date();
          execution.result = result;
          execution.confidence = result?.confidence;

          return execution;
        } catch (error) {
          this.logger.error({ error, patternName }, 'Pattern execution failed');
          
          execution.status = 'failed';
          execution.endTime = new Date();
          execution.error = error instanceof Error ? error.message : String(error);
          
          throw error;
        }
      }
    );
  }

  private async selectAgents(pattern: Pattern): Promise<GrpcAgentProxy[]> {
    const requiredCapabilities = pattern.metadata?.requiredCapabilities || [];
    
    this.logger.info(
      { patternName: pattern.name, requiredCapabilities },
      'Selecting agents for pattern'
    );
    
    // First check local agents
    const localAgents = this.localAgentManager.getAgentsByCapabilities(requiredCapabilities);
    
    if (localAgents.length >= (pattern.minAgents || 0)) {
      this.logger.info(
        { count: localAgents.length },
        'Using local agents'
      );
      
      const proxies = localAgents.map(metadata => 
        GrpcAgentProxy.fromMetadata(metadata)
      );
      
      // Trace agent selection
      this.tracer.traceAgentSelection(
        pattern.name,
        requiredCapabilities.join(','),
        proxies.map(p => p.id)
      );
      
      return proxies;
    }
    
    // Fall back to registry
    const services = await this.agentRegistry.listServices('agent');
    
    // Filter by capabilities
    const eligibleAgents = services.filter(service => {
      const capabilities = service.metadata?.capabilities || [];
      return requiredCapabilities.every((req: string) => capabilities.includes(req));
    });
    
    if (eligibleAgents.length < (pattern.minAgents || 0)) {
      throw new Error(
        `Not enough agents available. Required: ${pattern.minAgents}, Found: ${eligibleAgents.length}`
      );
    }
    
    // Create proxies for selected agents
    const selectedAgents = eligibleAgents.slice(0, (pattern.minAgents || 1) * 2); // Get extra for redundancy
    const proxies = selectedAgents.map(service => 
      new GrpcAgentProxy(
        service.id,
        service.name,
        service.endpoint
      )
    );
    
    // Trace agent selection
    this.tracer.traceAgentSelection(
      pattern.name,
      requiredCapabilities.join(','),
      proxies.map(p => p.id)
    );
    
    return proxies;
  }

  getExecution(id: string): PatternExecution | undefined {
    return this.executions.get(id);
  }

  getPatterns(): Pattern[] {
    return this.loader.getAllPatterns();
  }

  getExecutionMetrics(): ExecutionMetrics {
    const executions = Array.from(this.executions.values());
    const completed = executions.filter(e => e.status === 'completed');
    const failed = executions.filter(e => e.status === 'failed');
    
    const avgConfidence = completed.length > 0
      ? completed.reduce((sum, e) => sum + (e.confidence || 0), 0) / completed.length
      : 0;
    
    const avgDuration = completed.length > 0
      ? completed.reduce((sum, e) => {
          const duration = e.endTime 
            ? e.endTime.getTime() - e.startTime.getTime()
            : 0;
          return sum + duration;
        }, 0) / completed.length
      : 0;
    
    return {
      totalExecutions: executions.length,
      successfulExecutions: completed.length,
      failedExecutions: failed.length,
      averageConfidence: avgConfidence,
      averageDuration: avgDuration,
    };
  }

  calculateMetrics(
    execution: PatternExecution,
    agentCount: number
  ): ExecutionMetrics {
    const executionTime = execution.endTime
      ? execution.endTime.getTime() - execution.startTime.getTime()
      : 0;

    return {
      agentsUsed: agentCount,
      averageConfidence: execution.result?.confidence || 0,
      executionTime,
      parallelPaths: execution.result?.paths?.length || 0,
    };
  }

  async reloadPatterns(): Promise<void> {
    await this.loader.loadPatterns();
  }
}
import { Pattern, PatternExecution, ExecutionMetrics } from './types';
import { PatternLoader } from './pattern-loader';
import { RuntimeManager } from '../runtime-manager';
import { EtcdRegistry } from '../registry';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { GrpcAgentProxy } from '@parallax/runtime';
import { LocalAgentManager } from './local-agents';

export class PatternEngine {
  private loader: PatternLoader;
  private executions: Map<string, PatternExecution> = new Map();
  private localAgentManager: LocalAgentManager;
  
  constructor(
    private runtimeManager: RuntimeManager,
    private agentRegistry: EtcdRegistry,
    patternsDir: string,
    private logger: Logger
  ) {
    this.loader = new PatternLoader(patternsDir, logger);
    this.localAgentManager = LocalAgentManager.fromEnv();
  }

  async initialize(): Promise<void> {
    await this.loader.loadPatterns();
  }

  async executePattern(
    patternName: string,
    input: any,
    _options?: { timeout?: number }
  ): Promise<PatternExecution> {
    const pattern = this.loader.getPattern(patternName);
    if (!pattern) {
      throw new Error(`Pattern ${patternName} not found`);
    }

    const execution: PatternExecution = {
      id: uuidv4(),
      patternName,
      startTime: new Date(),
      status: 'running',
    };

    this.executions.set(execution.id, execution);

    try {
      // Select agents based on pattern requirements
      const agents = await this.selectAgents(pattern);
      
      // Prepare context with agents and pattern info
      const context = {
        input,
        agents,
        pattern: {
          name: pattern.name,
          version: pattern.version,
        },
        __parallaxAgents: agents,
        __parallaxPatterns: { [pattern.name]: pattern },
      };

      // Inject Parallax context and execute
      const enhancedScript = await this.runtimeManager.injectParallaxContext(
        pattern.script
      );
      
      const result = await this.runtimeManager.executePrismScript(
        enhancedScript,
        context
      );

      // Update execution record
      execution.endTime = new Date();
      execution.status = 'completed';
      execution.result = result;
      execution.metrics = this.calculateMetrics(execution, agents.length);

      this.logger.info(
        { executionId: execution.id, pattern: patternName },
        'Pattern execution completed'
      );

      return execution;
    } catch (error) {
      execution.endTime = new Date();
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      
      this.logger.error(
        { executionId: execution.id, pattern: patternName, error },
        'Pattern execution failed'
      );

      throw error;
    }
  }

  private async selectAgents(pattern: Pattern): Promise<any[]> {
    let agents: GrpcAgentProxy[] = [];
    
    // First, check for local agents (development mode)
    const localAgents = this.localAgentManager.createProxies();
    if (localAgents.length > 0) {
      this.logger.info(`Using ${localAgents.length} local agents`);
      agents = localAgents;
    } else {
      // Get all agent services from registry
      const agentServices = await this.agentRegistry.listServices('agent');
      
      // Create gRPC proxies for each agent
      agents = agentServices.map(service => {
        const proxy = new GrpcAgentProxy(
          service.id,
          service.name,
          service.endpoint
        );
        
        // Add capabilities from registry metadata
        if (service.metadata.capabilities) {
          (proxy as any)._capabilities = service.metadata.capabilities;
        }
        
        return proxy;
      });
    }

    // Filter by capabilities if specified
    if (pattern.agents?.capabilities) {
      agents = agents.filter(agent =>
        pattern.agents!.capabilities!.every((cap: string) =>
          agent.capabilities.includes(cap)
        )
      );
    }

    // Apply min/max constraints
    if (pattern.minAgents && agents.length < pattern.minAgents) {
      throw new Error(
        `Not enough agents available. Required: ${pattern.minAgents}, Available: ${agents.length}`
      );
    }

    if (pattern.maxAgents && agents.length > pattern.maxAgents) {
      agents = agents.slice(0, pattern.maxAgents);
    }

    return agents;
  }

  private calculateMetrics(
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

  getExecution(id: string): PatternExecution | undefined {
    return this.executions.get(id);
  }

  getPatterns(): Pattern[] {
    return this.loader.getAllPatterns();
  }

  async reloadPatterns(): Promise<void> {
    await this.loader.loadPatterns();
  }
}
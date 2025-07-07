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
  private localAgents: any[] = []; // Direct agent instances for demo
  
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
      
      // Pre-execute async agent operations based on pattern requirements
      const preProcessedData: any = {};
      
      // Check if pattern needs agent analysis results
      const patternNameLower = pattern.name.toLowerCase();
      if (patternNameLower.includes('consensus') || patternNameLower.includes('cascade') || 
          patternNameLower.includes('orchestrator') || patternNameLower.includes('router')) {
        
        // Execute all agent analyses in parallel
        const agentResults = await Promise.all(
          agents.map(async (agent) => {
            try {
              const result = await agent.analyze(input.task || 'analyze', input.data || input);
              return {
                agentId: agent.id,
                agentName: agent.name,
                capabilities: agent.capabilities,
                expertise: agent.expertise || 0.7,
                result: result.value,
                confidence: result.confidence,
                reasoning: result.reasoning,
                timestamp: result.timestamp
              };
            } catch (error) {
              this.logger.warn({ agentId: agent.id, error }, 'Agent analysis failed');
              return {
                agentId: agent.id,
                agentName: agent.name,
                capabilities: agent.capabilities,
                expertise: agent.expertise || 0.7,
                result: null,
                confidence: 0,
                reasoning: 'Agent failed to respond',
                error: error instanceof Error ? error.message : 'Unknown error',
                timestamp: Date.now()
              };
            }
          })
        );
        
        preProcessedData.agentResults = agentResults;
        preProcessedData.successfulResults = agentResults.filter(r => r.confidence > 0);
      }
      
      // Prepare context with pre-processed results
      const context = {
        input,
        agentList: agents.map(a => ({
          id: a.id,
          name: a.name,
          capabilities: a.capabilities,
          expertise: a.expertise || 0.7,
          historicalConfidence: a.historicalConfidence || 0.75
        })),
        agentCount: agents.length,
        ...preProcessedData,
        pattern: {
          name: pattern.name,
          version: pattern.version,
        },
        // Helper functions for Prism
        parallax: {
          agentList: agents.map(a => ({
            id: a.id,
            name: a.name,
            capabilities: a.capabilities,
            expertise: a.expertise || 0.7
          })),
          patterns: { 
            [pattern.name]: {
              name: pattern.name,
              version: pattern.version,
              description: pattern.description,
              input: pattern.input,
              // Omit 'agents' property to avoid reserved word issue
              minAgents: pattern.minAgents || 0,
              maxAgents: pattern.maxAgents || 999,
              script: pattern.script,
              metadata: pattern.metadata ? (() => {
                const cleanMetadata: any = {};
                for (const [key, value] of Object.entries(pattern.metadata)) {
                  if (key !== 'agents') {
                    cleanMetadata[key] = value;
                  } else if (value !== null && value !== undefined) {
                    cleanMetadata.agentRequirements = value;
                  }
                }
                return cleanMetadata;
              })() : undefined
            }
          },
          confidence: {
            // Remove functions as they can't be serialized to Prism
            // track: (value: any, confidence: number) => ({ value, confidence }),
            // propagate: (results: any[]) => results.map(r => r.confidence)
          }
        },
        // Remove helper functions as they can't be serialized to Prism
        // highConfidenceAgreement: (results: any[]) => {
        //   const highConf = results.filter(r => r.confidence > 0.8);
        //   return highConf.length > results.length * 0.6;
        // },
        // parallel: async (tasks: any[]) => {
        //   return Promise.all(tasks);
        // },
        // range: (start: number, end: number) => {
        //   const result = [];
        //   for (let i = start; i < end; i++) {
        //     result.push(i);
        //   }
        //   return result;
        // }
      };

      // Preprocess the script to handle Prism syntax issues
      const preprocessedScript = pattern.script;
      
      // For debugging, check if this is a test pattern
      const isTestPattern = pattern.name.startsWith('Test');
      
      // Inject Parallax context and execute
      const enhancedScript = await this.runtimeManager.injectParallaxContext(
        preprocessedScript
      );
      
      this.logger.debug({ 
        patternName, 
        agentCount: agents.length,
        scriptLength: enhancedScript.length,
        isTestPattern
      }, 'Executing pattern script');
      
      
      // For test patterns, try running without context to isolate issues
      if (isTestPattern && pattern.name === 'TestEmpty') {
        this.logger.info('Running TestEmpty without context injection');
        const result = await this.runtimeManager.executePrismScript(
          pattern.script,  // Just the raw script
          {}  // Empty context
        );
        return execution;
      }
      
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
    let agents: any[] = [];
    
    // First, check for directly registered local agents (for demos)
    if (this.localAgents.length > 0) {
      this.logger.info(`Using ${this.localAgents.length} directly registered agents`);
      agents = this.localAgents;
    } else {
      // Check for local agents from environment (development mode)
      const localAgentProxies = this.localAgentManager.createProxies();
      if (localAgentProxies.length > 0) {
        this.logger.info(`Using ${localAgentProxies.length} local agent proxies`);
        agents = localAgentProxies;
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
  
  /**
   * Register local agent instances directly (for demos/testing)
   */
  registerLocalAgents(agents: any[]): void {
    this.localAgents = agents;
    this.logger.info(`Registered ${agents.length} local agents`);
  }
}
import { Pattern, PatternExecution, ExecutionMetrics, PatternWorkspaceConfig } from './types';
import { PatternLoader } from './pattern-loader';
import { RuntimeManager } from '../runtime-manager';
import { EtcdRegistry } from '../registry';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { GrpcAgentProxy } from '@parallax/runtime';
import { AgentProxy } from '../grpc/agent-proxy';
import { LocalAgentManager } from './local-agents';
import {
  PatternTracer
} from '@parallax/telemetry';
import { DatabaseService } from '../db/database.service';
import { IPatternEngine, PatternExecutionOptions, PatternWithSource, PatternVersion } from './interfaces';
import { ConfidenceCalibrationService } from '../services/confidence-calibration-service';
import { LicenseEnforcer } from '../licensing/license-enforcer';
import { DatabasePatternService } from './database-pattern-service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecutionEventBus } from '../execution-events';
import { WorkspaceService, Workspace, WorkspaceConfig } from '../workspace';
import {
  ExecutionEngine,
  ExecutionTask,
  ExecutionResult,
  ParallelExecutionPlan
} from '@parallax/data-plane';

export class TracedPatternEngine implements IPatternEngine {
  private loader: PatternLoader;
  private executions: Map<string, PatternExecution> = new Map();
  private localAgentManager: LocalAgentManager;
  private tracer: PatternTracer;
  protected localAgentsStore: any[] = [];
  private _calibrationService: ConfidenceCalibrationService;
  protected licenseEnforcer: LicenseEnforcer;
  private agentProxy: AgentProxy;
  private databasePatterns?: DatabasePatternService;
  private workspaceService?: WorkspaceService;
  private executionEngine?: ExecutionEngine;

  constructor(
    private runtimeManager: RuntimeManager,
    private agentRegistry: EtcdRegistry,
    private patternsDir: string,
    private logger: Logger,
    private database?: DatabaseService,
    private executionEvents?: ExecutionEventBus,
    databasePatterns?: DatabasePatternService,
    workspaceService?: WorkspaceService,
    executionEngine?: ExecutionEngine
  ) {
    this.loader = new PatternLoader(patternsDir, logger);
    this.localAgentManager = LocalAgentManager.fromEnv();
    this.tracer = new PatternTracer('control-plane', '0.1.0');
    this._calibrationService = new ConfidenceCalibrationService(logger);
    this.licenseEnforcer = new LicenseEnforcer(logger);
    this.agentProxy = new AgentProxy(logger);
    this.databasePatterns = databasePatterns;
    this.workspaceService = workspaceService;
    this.executionEngine = executionEngine;
  }

  async initialize(): Promise<void> {
    await this.loader.loadPatterns();

    // Initialize database patterns if available
    if (this.databasePatterns) {
      await this.databasePatterns.initialize();
    }
  }

  /**
   * Set the workspace service (for deferred initialization)
   */
  setWorkspaceService(service: WorkspaceService): void {
    this.workspaceService = service;
  }

  async executePattern(
    patternName: string,
    input: any,
    options?: PatternExecutionOptions
  ): Promise<PatternExecution> {
    const executionId = options?.executionId || uuidv4();
    
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
          input,
        };

        this.executions.set(execution.id, execution);

        // Create database record for the execution before emitting events
        // Note: This requires the Pattern to exist in the database first
        let dbExecutionCreated = false;
        if (this.database) {
          try {
            // First check if the pattern exists in the database
            const dbPattern = await this.database.patterns.findByName(pattern.name);
            if (dbPattern) {
              await this.database.executions.create({
                id: executionId,
                pattern: { connect: { id: dbPattern.id } },
                input: input as any,
                status: 'running',
              });
              dbExecutionCreated = true;
            }
          } catch (dbError) {
            this.logger.warn({ error: dbError, executionId }, 'Failed to persist execution to database - events will not be persisted');
          }
        }

        const emitEvent = (type: string, data?: any) => {
          this.executionEvents?.emitEvent({
            executionId,
            type,
            data,
            timestamp: new Date()
          });

          // Only persist events if the execution was created in the database
          if (this.database && dbExecutionCreated) {
            const agentId = data?.agentId;
            this.database.executions
              .addEvent(executionId, {
                type,
                agentId,
                data
              })
              .catch(error => {
                this.logger.warn({ error, executionId, type }, 'Failed to persist execution event');
              });
          }
        };

        emitEvent('started', { patternName });

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
          emitEvent('agents_selected', { count: agents.length });
          
          const preProcessedData: any = {
            agentResults: [],
            successfulResults: []
          };

          const patternNameLower = pattern.name.toLowerCase();
          if (
            patternNameLower.includes('consensus') ||
            patternNameLower.includes('cascade') ||
            patternNameLower.includes('orchestrator') ||
            patternNameLower.includes('router') ||
            patternNameLower.includes('robust') ||
            patternNameLower.includes('validator') ||
            patternNameLower.includes('balancer') ||
            patternNameLower.includes('mapreduce') ||
            patternNameLower.includes('exploration') ||
            patternNameLower.includes('refinement') ||
            patternNameLower.includes('voting') ||
            patternNameLower.includes('extraction') ||
            patternNameLower.includes('qualitygate') ||
            patternNameLower.includes('translation') ||
            patternNameLower.includes('documentanalysis') ||
            patternNameLower.includes('prompttest')
          ) {
            let agentResults: any[];

            // Use ExecutionEngine if available, otherwise fall back to direct AgentProxy calls
            if (this.executionEngine) {
              // Register agents with the ExecutionEngine's proxy
              await this.registerAgentsWithExecutionEngine(agents);

              // Map agents to ExecutionTasks
              const tasks = this.mapAgentsToExecutionTasks(agents, input, pattern.name, executionId);

              // Emit start events for each agent
              agents.forEach(agent => {
                emitEvent('agent_started', {
                  agentId: agent.id,
                  agentName: agent.name,
                  capabilities: [],
                  task: input.task || input?.data?.task
                });
              });

              // Create parallel execution plan
              const plan: ParallelExecutionPlan = {
                id: `${executionId}-parallel`,
                tasks,
                strategy: 'all',
                maxConcurrency: 10,
                timeout: 30000,
              };

              // Execute via ExecutionEngine with tracing
              this.logger.debug({ planId: plan.id, taskCount: tasks.length }, 'Executing agents via ExecutionEngine');
              const results = await this.executionEngine.executeParallel(plan);

              // Map results back to expected format
              agentResults = this.mapExecutionResultsToAgentResults(results, agents);

              // Emit completion events
              const completedCount = agentResults.filter(r => r.confidence > 0).length;
              const failedCount = agentResults.length - completedCount;

              agentResults.forEach(result => {
                if (result.confidence > 0) {
                  emitEvent('agent_completed', {
                    agentId: result.agentId,
                    agentName: result.agentName,
                    confidence: result.confidence,
                  });
                } else {
                  emitEvent('agent_failed', {
                    agentId: result.agentId,
                    agentName: result.agentName,
                    error: result.error,
                  });
                }
              });

              emitEvent('agents_completed', {
                total: agents.length,
                completed: completedCount,
                failed: failedCount,
              });

            } else {
              // Fallback: Execute all agent analyses in parallel using direct AgentProxy
              let completedCount = 0;
              let failedCount = 0;
              const waitForAgentHealthy = async (address: string): Promise<boolean> => {
                const attempts = 5;
                for (let attempt = 0; attempt < attempts; attempt += 1) {
                  const healthy = await this.agentProxy.healthCheck(address, 2000);
                  if (healthy) return true;
                  await new Promise(resolve => setTimeout(resolve, 300));
                }
                return false;
              };

              agentResults = await Promise.all(
                agents.map(async (agent) => {
                  emitEvent('agent_started', {
                    agentId: agent.id,
                    agentName: agent.name,
                    capabilities: agent.capabilities,
                    task: input.task || input?.data?.task
                  });
                  try {
                    const healthy = await waitForAgentHealthy(agent.endpoint);
                    if (!healthy) {
                      this.logger.warn(
                        { agentId: agent.id, agentAddress: agent.endpoint },
                        'Agent health check failed; continuing'
                      );
                    }
                    const result = await this.agentProxy.executeTask(
                      agent.endpoint,
                      {
                        description: input.task || 'analyze',
                        data: input.data || input
                      },
                      30000
                    );
                    emitEvent('agent_completed', {
                      agentId: agent.id,
                      agentName: agent.name,
                      confidence: result.confidence
                    });
                    completedCount += 1;
                    emitEvent('progress', {
                      total: agents.length,
                      completed: completedCount,
                      failed: failedCount
                    });
                    return {
                      agentId: agent.id,
                      agentName: agent.name,
                      capabilities: agent.capabilities,
                      expertise: agent.expertise || 0.7,
                      result: result.value,
                      confidence: result.confidence,
                      reasoning: result.reasoning,
                      timestamp: Date.now()
                    };
                  } catch (error) {
                    this.logger.warn({ agentId: agent.id, error }, 'Agent analysis failed');
                    emitEvent('agent_failed', {
                      agentId: agent.id,
                      agentName: agent.name,
                      error: error instanceof Error ? error.message : 'Unknown error'
                    });
                    failedCount += 1;
                    emitEvent('progress', {
                      total: agents.length,
                      completed: completedCount,
                      failed: failedCount
                    });
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

              emitEvent('agents_completed', {
                total: agents.length,
                completed: completedCount,
                failed: failedCount
              });
            }

            preProcessedData.agentResults = agentResults;
            preProcessedData.successfulResults = agentResults.filter(r => r.confidence > 0);
          }

          // Create Prism context with agent proxies
          const prismContext: Record<string, any> = {
            agents: agents.reduce((acc, agent) => {
              acc[agent.id] = agent;
              return acc;
            }, {} as Record<string, GrpcAgentProxy>),
            input,
            logger: this.logger,
            ...preProcessedData,
            agentCount: agents.length,
            confidence: {
              threshold: pattern.metadata?.defaultThreshold || 0.7,
              aggregation: pattern.metadata?.aggregationMethod || 'weighted_average',
            },
          };

          // Execute the pattern via Prism runtime
          emitEvent('runtime_started', { patternName });
          const result = await this.runtimeManager.executePrismScript(
            pattern.script,
            prismContext
          );
          emitEvent('runtime_completed', { patternName });

          execution.status = 'completed';
          execution.endTime = new Date();
          execution.result = result;
          execution.confidence = result?.confidence;

          emitEvent('completed', {
            patternName,
            confidence: execution.confidence || 0
          });

          return execution;
        } catch (error) {
          this.logger.error({ error, patternName }, 'Pattern execution failed');
          
          execution.status = 'failed';
          execution.endTime = new Date();
          execution.error = error instanceof Error ? error.message : String(error);

          emitEvent('failed', {
            patternName,
            error: execution.error
          });
          
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

  listExecutions(options?: { limit?: number; status?: string }): PatternExecution[] {
    const entries = Array.from(this.executions.values());
    const filtered = options?.status
      ? entries.filter(entry => entry.status === options.status)
      : entries;

    const sorted = filtered.sort(
      (a, b) => b.startTime.getTime() - a.startTime.getTime()
    );

    if (options?.limit && options.limit > 0) {
      return sorted.slice(0, options.limit);
    }

    return sorted;
  }

  getPattern(name: string): Pattern | null {
    // Check database patterns first (they override file-based)
    if (this.databasePatterns) {
      const cached = (this.databasePatterns as any).cache?.get(name);
      if (cached) return cached;
    }
    return this.loader.getPattern(name) || null;
  }

  listPatterns(): PatternWithSource[] {
    const filePatterns = this.loader.getAllPatterns();

    // If no database patterns, return file patterns with source annotation
    if (!this.databasePatterns) {
      return filePatterns.map(p => ({ ...p, source: 'file' as const }));
    }

    // Merge file and database patterns (database overrides)
    const merged = new Map<string, PatternWithSource>();

    for (const p of filePatterns) {
      merged.set(p.name, { ...p, source: 'file' as const });
    }

    // Database patterns cache is populated during initialize()
    const dbCache = (this.databasePatterns as any).cache as Map<string, PatternWithSource> | undefined;
    if (dbCache) {
      for (const p of dbCache.values()) {
        merged.set(p.name, p);
      }
    }

    return Array.from(merged.values());
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

  getMetrics(): ExecutionMetrics[] {
    return Array.from(this.executions.values()).map(execution => ({
      pattern: execution.patternName,
      patternName: execution.patternName,
      timestamp: execution.startTime.toISOString(),
      duration: execution.endTime 
        ? execution.endTime.getTime() - execution.startTime.getTime()
        : 0,
      confidence: execution.metrics?.confidence || 0,
      success: execution.status === 'completed',
      agentCount: execution.metrics?.agentCount || 0
    }));
  }

  async reloadPatterns(): Promise<void> {
    await this.loader.loadPatterns();

    // Also reload database patterns if available
    if (this.databasePatterns) {
      await this.databasePatterns.reload();
    }
  }

  async deletePattern(name: string): Promise<void> {
    if (!this.databasePatterns) {
      throw new Error('Cannot delete file-based patterns. Edit the .prism file directly or enable database storage.');
    }

    const pattern = await this.databasePatterns.getByName(name);
    if (!pattern) {
      // Check if it's a file-based pattern
      const filePattern = this.loader.getPattern(name);
      if (filePattern) {
        throw new Error('Cannot delete file-based patterns. Edit the .prism file directly.');
      }
      throw new Error(`Pattern '${name}' not found`);
    }

    await this.databasePatterns.delete(name);
  }

  async getPatternVersions(name: string): Promise<PatternVersion[]> {
    if (!this.databasePatterns) {
      // File-based patterns don't have versions
      return [];
    }

    return this.databasePatterns.getVersions(name);
  }

  hasDatabasePatterns(): boolean {
    return !!this.databasePatterns;
  }

  async savePattern(
    pattern: Pattern,
    options?: { overwrite?: boolean }
  ): Promise<Pattern> {
    if (!pattern.name) {
      throw new Error('Pattern name is required');
    }
    if (!pattern.script) {
      throw new Error('Pattern script is required');
    }

    // If database patterns are available, use them
    if (this.databasePatterns) {
      return this.databasePatterns.save(pattern, {
        overwrite: options?.overwrite,
        createVersion: options?.overwrite, // Create version on update
      });
    }

    // Fall back to file-based storage
    await fs.mkdir(this.patternsDir, { recursive: true });
    const filePath = path.join(this.patternsDir, `${pattern.name}.prism`);

    if (!options?.overwrite) {
      try {
        await fs.access(filePath);
        throw new Error(`Pattern ${pattern.name} already exists`);
      } catch (error: any) {
        if (error?.code !== 'ENOENT') {
          throw error;
        }
      }
    }

    const content = this.buildPatternFileContent(pattern);
    await fs.writeFile(filePath, content, 'utf-8');
    await this.loader.reloadPattern(pattern.name);

    const saved = this.loader.getPattern(pattern.name);
    if (!saved) {
      throw new Error(`Failed to load saved pattern ${pattern.name}`);
    }

    return saved;
  }
  
  // Additional methods for compatibility
  registerLocalAgents(agents: any[]): void {
    this.localAgentsStore = agents;
  }

  getCalibrationService(): ConfidenceCalibrationService {
    return this._calibrationService;
  }

  private buildPatternFileContent(pattern: Pattern): string {
    const metadataLines: string[] = [];

    if (pattern.name) metadataLines.push(`@name ${pattern.name}`);
    if (pattern.version) metadataLines.push(`@version ${pattern.version}`);
    if (pattern.description) metadataLines.push(`@description ${pattern.description}`);
    if (pattern.input) metadataLines.push(`@input ${JSON.stringify(pattern.input)}`);
    if (pattern.agents) metadataLines.push(`@agents ${JSON.stringify(pattern.agents)}`);
    if (typeof pattern.minAgents === 'number') metadataLines.push(`@minAgents ${pattern.minAgents}`);
    if (typeof pattern.maxAgents === 'number') metadataLines.push(`@maxAgents ${pattern.maxAgents}`);
    if (pattern.metadata && Object.keys(pattern.metadata).length > 0) {
      metadataLines.push(`@metadata ${JSON.stringify(pattern.metadata)}`);
    }

    if (metadataLines.length === 0) {
      return pattern.script.trim();
    }

    const header = `/**\n${metadataLines.map(line => ` * ${line}`).join('\n')}\n */\n`;
    return `${header}${pattern.script.trim()}`;
  }

  /**
   * Map selected agents to ExecutionEngine tasks
   */
  private mapAgentsToExecutionTasks(
    agents: GrpcAgentProxy[],
    input: any,
    patternName: string,
    executionId: string
  ): ExecutionTask[] {
    return agents.map((agent, index) => ({
      id: `${executionId}-${agent.id}-${index}`,
      type: 'agent' as const,
      target: agent.id,
      payload: {
        task: input.task || 'analyze',
        data: input.data || input,
        agentAddress: agent.endpoint,
      },
      metadata: {
        pattern: patternName,
        agentName: agent.name,
        agentAddress: agent.endpoint,
        timeout: 30000,
        retries: 2,
      },
    }));
  }

  /**
   * Map ExecutionEngine results back to agent result format
   */
  private mapExecutionResultsToAgentResults(
    results: ExecutionResult[],
    agents: GrpcAgentProxy[]
  ): any[] {
    const agentMap = new Map(agents.map(a => [a.id, a]));

    return results.map(result => {
      // Extract agent ID from task ID (format: executionId-agentId-index)
      const parts = result.taskId.split('-');
      const agentId = result.metadata?.agentId || parts.slice(1, -1).join('-');
      const agent = agentMap.get(agentId);

      if (result.status === 'success') {
        return {
          agentId: agent?.id || agentId,
          agentName: agent?.name || 'unknown',
          capabilities: [],
          expertise: 0.7,
          result: result.result?.value || result.result,
          confidence: result.confidence || result.result?.confidence || 0,
          reasoning: result.result?.reasoning || result.metadata?.reasoning,
          timestamp: Date.now(),
        };
      } else {
        return {
          agentId: agent?.id || agentId,
          agentName: agent?.name || 'unknown',
          capabilities: [],
          expertise: 0.7,
          result: null,
          confidence: 0,
          reasoning: 'Agent failed to respond',
          error: result.error || `Task ${result.status}`,
          timestamp: Date.now(),
        };
      }
    });
  }

  /**
   * Register agents with the ExecutionEngine's AgentProxy
   */
  private async registerAgentsWithExecutionEngine(agents: GrpcAgentProxy[]): Promise<void> {
    if (!this.executionEngine) return;

    const agentProxy = this.executionEngine.getAgentProxy();

    for (const agent of agents) {
      const endpoint = agent.endpoint;
      const protocol = endpoint.startsWith('http') ? 'http' : 'grpc';

      try {
        await agentProxy.registerAgent(agent.id, endpoint, protocol);
      } catch (error) {
        this.logger.warn(
          { agentId: agent.id, endpoint, error },
          'Failed to register agent with ExecutionEngine proxy'
        );
      }
    }
  }
}

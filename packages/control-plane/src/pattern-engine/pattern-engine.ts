import { Pattern, PatternExecution, ExecutionMetrics, PatternWorkspaceConfig } from './types';
import { PatternLoader } from './pattern-loader';
import { RuntimeManager } from '../runtime-manager';
import { EtcdRegistry } from '../registry';
import { Logger } from 'pino';
import { v4 as uuidv4 } from 'uuid';
import { AgentProxy } from '../grpc/agent-proxy';
import { LocalAgentManager } from './local-agents';
import { ConfidenceCalibrationService } from '../services/confidence-calibration-service';
import { LicenseEnforcer } from '../licensing/license-enforcer';
import { DatabaseService } from '../db/database.service';
import { IPatternEngine, PatternExecutionOptions, PatternWithSource, PatternVersion } from './interfaces';
import { DatabasePatternService } from './database-pattern-service';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecutionEventBus } from '../execution-events';
import { WorkspaceService, Workspace, WorkspaceConfig } from '../workspace';

export class PatternEngine implements IPatternEngine {
  private loader: PatternLoader;
  private executions: Map<string, PatternExecution> = new Map();
  private localAgentManager: LocalAgentManager;
  private localAgents: any[] = []; // Direct agent instances for demo
  private _calibrationService: ConfidenceCalibrationService;
  protected licenseEnforcer: LicenseEnforcer;
  protected currentExecutionId?: string;
  private agentProxy: AgentProxy;
  private databasePatterns?: DatabasePatternService;
  private workspaceService?: WorkspaceService;

  constructor(
    private runtimeManager: RuntimeManager,
    private agentRegistry: EtcdRegistry,
    private patternsDir: string,
    private logger: Logger,
    private database?: DatabaseService,
    private executionEvents?: ExecutionEventBus,
    databasePatterns?: DatabasePatternService,
    workspaceService?: WorkspaceService
  ) {
    this.loader = new PatternLoader(patternsDir, logger);
    this.localAgentManager = LocalAgentManager.fromEnv();
    this._calibrationService = new ConfidenceCalibrationService(logger);
    this.licenseEnforcer = new LicenseEnforcer(logger);
    this.agentProxy = new AgentProxy(logger);
    this.databasePatterns = databasePatterns;
    this.workspaceService = workspaceService;
  }

  async initialize(): Promise<void> {
    await this.loader.loadPatterns();
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
    const pattern = this.loader.getPattern(patternName);
    if (!pattern) {
      throw new Error(`Pattern ${patternName} not found`);
    }

    const executionId = options?.executionId || uuidv4();
    const execution: PatternExecution = {
      id: executionId,
      patternName,
      startTime: new Date(),
      status: 'running',
      input,
    };

    this.executions.set(execution.id, execution);
    this.currentExecutionId = execution.id;

    const emitEvent = (type: string, data?: any) => {
      this.executionEvents?.emitEvent({
        executionId,
        type,
        data,
        timestamp: new Date()
      });

      if (this.database) {
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

    // Provision workspace if pattern requires it
    let workspace: Workspace | null = null;
    if (pattern.workspace?.enabled && this.workspaceService) {
      const workspaceConfig = this.resolveWorkspaceConfig(pattern, input, executionId);
      if (workspaceConfig) {
        try {
          emitEvent('workspace_provisioning', { repo: workspaceConfig.repo });
          workspace = await this.workspaceService.provision(workspaceConfig);
          execution.workspace = {
            id: workspace.id,
            path: workspace.path,
            repo: workspace.repo,
            branch: workspace.branch.name,
            baseBranch: workspace.branch.baseBranch,
          };
          emitEvent('workspace_ready', {
            workspaceId: workspace.id,
            branch: workspace.branch.name,
            path: workspace.path,
          });
        } catch (error) {
          this.logger.error({ error, executionId, patternName }, 'Failed to provision workspace');
          emitEvent('workspace_failed', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          // Don't fail the entire execution if workspace provisioning fails
          // unless the pattern explicitly requires it
          if (pattern.workspace.repo) {
            throw new Error(`Workspace provisioning failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }
    }

    try {
      // Select agents based on pattern requirements
      const agents = await this.selectAgents(pattern);
      emitEvent('agents_selected', { count: agents.length });
      
      // Pre-execute async agent operations based on pattern requirements
      const preProcessedData: any = {
        agentResults: [],
        successfulResults: []
      };
      
      // Check if pattern needs agent analysis results
      const patternNameLower = pattern.name.toLowerCase();
      if (patternNameLower.includes('consensus') || patternNameLower.includes('cascade') ||
          patternNameLower.includes('orchestrator') || patternNameLower.includes('router') ||
          patternNameLower.includes('robust') || patternNameLower.includes('validator') ||
          patternNameLower.includes('balancer') || patternNameLower.includes('mapreduce') ||
          patternNameLower.includes('exploration') || patternNameLower.includes('refinement') ||
          patternNameLower.includes('voting') ||
          patternNameLower.includes('extraction') ||
          patternNameLower.includes('qualitygate') ||
          patternNameLower.includes('translation') ||
          patternNameLower.includes('documentanalysis') ||
          patternNameLower.includes('prompttest')) {
        
        // Execute all agent analyses in parallel
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

        const agentResults = await Promise.all(
          agents.map(async (agent) => {
            emitEvent('agent_started', {
              agentId: agent.id,
              agentName: agent.name,
              capabilities: agent.capabilities,
              task: input.task || input?.data?.task
            });
            try {
              const healthy = await waitForAgentHealthy(agent.address || agent.endpoint);
              if (!healthy) {
                this.logger.warn(
                  { agentId: agent.id, agentAddress: agent.address || agent.endpoint },
                  'Agent health check failed; continuing'
                );
              }
              const result = await this.agentProxy.executeTask(
                agent.address || agent.endpoint,
                {
                  description: input.task || 'analyze',
                  data: input.data || input
                },
                30000 // 30 second timeout
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
        
        preProcessedData.agentResults = agentResults;
        preProcessedData.successfulResults = agentResults.filter(r => r.confidence > 0);
        emitEvent('agents_completed', {
          total: agents.length,
          completed: completedCount,
          failed: failedCount
        });
      }
      
      // Prepare context with pre-processed results
      const context = {
        input,
        // Include workspace info if available
        workspace: workspace ? {
          id: workspace.id,
          path: workspace.path,
          repo: workspace.repo,
          branch: workspace.branch.name,
          baseBranch: workspace.branch.baseBranch,
        } : undefined,
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
        await this.runtimeManager.executePrismScript(
          pattern.script,  // Just the raw script
          {}  // Empty context
        );
        return execution;
      }
      
      emitEvent('runtime_started', { patternName });
      const result = await this.runtimeManager.executePrismScript(
        enhancedScript,
        context
      );
      emitEvent('runtime_completed', { patternName });

      // Update execution record
      execution.endTime = new Date();
      execution.status = 'completed';
      execution.result = result;
      execution.metrics = this.calculateMetrics(execution, agents.length);

      this.logger.info(
        { executionId: execution.id, pattern: patternName },
        'Pattern execution completed'
      );

      // Finalize workspace (push, create PR) if configured
      if (workspace && pattern.workspace?.createPr && this.workspaceService) {
        try {
          emitEvent('workspace_finalizing', { workspaceId: workspace.id });
          const pr = await this.workspaceService.finalize(workspace.id, {
            push: true,
            createPr: true,
            pr: {
              title: `[Parallax] ${patternName}: ${execution.id.slice(0, 8)}`,
              body: this.generatePrBody(pattern, execution),
              targetBranch: workspace.branch.baseBranch,
              draft: pattern.workspace?.pr?.draft,
              labels: pattern.workspace?.pr?.labels,
              reviewers: pattern.workspace?.pr?.reviewers,
            },
            cleanup: false, // Keep workspace for now
          });

          if (pr) {
            execution.workspace!.prUrl = pr.url;
            execution.workspace!.prNumber = pr.number;
            emitEvent('workspace_pr_created', {
              workspaceId: workspace.id,
              prNumber: pr.number,
              prUrl: pr.url,
            });
          }
        } catch (error) {
          this.logger.warn({ error, workspaceId: workspace.id }, 'Failed to finalize workspace');
          emitEvent('workspace_finalize_failed', {
            workspaceId: workspace.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      emitEvent('completed', {
        patternName,
        confidence: execution.metrics?.averageConfidence ?? 0,
        durationMs: execution.metrics?.executionTime ?? 0,
        agentCount: agents.length,
        prUrl: execution.workspace?.prUrl,
      });

      return execution;
    } catch (error) {
      execution.endTime = new Date();
      execution.status = 'failed';
      execution.error = error instanceof Error ? error.message : String(error);
      
      this.logger.error(
        { executionId: execution.id, pattern: patternName, error },
        'Pattern execution failed'
      );

      emitEvent('failed', {
        patternName,
        error: execution.error
      });

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
      const localAgentConfigs = this.localAgentManager.getAgents();
      if (localAgentConfigs.length > 0) {
        this.logger.info(`Using ${localAgentConfigs.length} local agents`);
        agents = localAgentConfigs.map(config => ({
          id: config.id,
          name: config.name,
          address: config.endpoint,
          endpoint: config.endpoint,
          capabilities: config.capabilities,
          expertise: 0.7,
          historicalConfidence: 0.75
        }));
      } else {
        // Get all agent services from registry
        const agentServices = await this.agentRegistry.listServices('agent');

        // Map agent services to agent info objects
        agents = agentServices.map(service => ({
          id: service.id,
          name: service.name,
          address: service.endpoint,
          endpoint: service.endpoint,
          capabilities: service.metadata?.capabilities || [],
          expertise: service.metadata?.expertise || 0.7,
          historicalConfidence: service.metadata?.historicalConfidence || 0.75
        }));
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

    const runId = process.env.PARALLAX_RUN_ID;
    if (runId) {
      agents = agents.filter(agent => agent.metadata?.labels?.runId === runId || agent.metadata?.runId === runId);
    }

    // No agent limits - all agents are available in open source

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
    // Check database patterns first (they override file patterns)
    if (this.databasePatterns) {
      // Note: getByName is async but we need sync here for compatibility
      // The pattern should already be in cache after initialize()
      const dbPatterns = this.databasePatterns['cache'] as Map<string, Pattern>;
      if (dbPatterns?.has(name)) {
        return dbPatterns.get(name) || null;
      }
    }
    return this.loader.getPattern(name) || null;
  }

  listPatterns(): PatternWithSource[] {
    const filePatterns = this.loader.getAllPatterns();

    // Add source: 'file' to file patterns
    const patternsWithSource: PatternWithSource[] = filePatterns.map(p => ({
      ...p,
      source: 'file' as const,
    }));

    if (!this.databasePatterns) {
      return patternsWithSource;
    }

    // Merge database patterns (they override file patterns with same name)
    const merged = new Map<string, PatternWithSource>();

    for (const p of patternsWithSource) {
      merged.set(p.name, p);
    }

    // Get database patterns from cache
    const dbCache = this.databasePatterns['cache'] as Map<string, PatternWithSource>;
    if (dbCache) {
      for (const p of dbCache.values()) {
        merged.set(p.name, p);
      }
    }

    return Array.from(merged.values());
  }

  hasDatabasePatterns(): boolean {
    return !!this.databasePatterns;
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

    // Use database storage if available (enterprise feature)
    if (this.databasePatterns) {
      return this.databasePatterns.save(pattern, {
        overwrite: options?.overwrite,
        createVersion: true,
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

  async deletePattern(name: string): Promise<void> {
    // Check if pattern exists
    const pattern = this.getPattern(name) as PatternWithSource;
    if (!pattern) {
      throw new Error(`Pattern '${name}' not found`);
    }

    // Cannot delete file-based patterns through this API
    if (pattern.source === 'file' || !this.databasePatterns) {
      throw new Error(
        `Cannot delete file-based pattern '${name}'. Remove the .prism file from the filesystem.`
      );
    }

    await this.databasePatterns.delete(name);
  }

  async getPatternVersions(name: string): Promise<PatternVersion[]> {
    if (!this.databasePatterns) {
      return []; // File-based patterns don't have versions
    }

    const versions = await this.databasePatterns.getVersions(name);
    return versions.map(v => ({
      id: v.id,
      patternId: v.patternId,
      version: v.version,
      script: v.script,
      metadata: v.metadata,
      createdAt: v.createdAt,
      createdBy: v.createdBy || undefined,
    }));
  }
  
  /**
   * Register local agent instances directly (for demos/testing)
   */
  registerLocalAgents(agents: any[]): void {
    this.localAgents = agents;
    this.logger.info(`Registered ${agents.length} local agents`);
  }
  
  /**
   * Get the calibration service for external use
   */
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
   * Resolve workspace configuration from pattern and input
   */
  private resolveWorkspaceConfig(
    pattern: Pattern,
    input: any,
    executionId: string
  ): WorkspaceConfig | null {
    const wsConfig = pattern.workspace;
    if (!wsConfig?.enabled) {
      return null;
    }

    // Get repo from pattern config or input
    const repo = input?.repo || wsConfig.repo;
    if (!repo) {
      this.logger.warn(
        { patternName: pattern.name },
        'Workspace enabled but no repo specified in pattern or input'
      );
      return null;
    }

    return {
      repo,
      provider: 'github', // Default to GitHub for now
      branchStrategy: wsConfig.branchStrategy || 'feature_branch',
      baseBranch: input?.baseBranch || wsConfig.baseBranch || 'main',
      execution: {
        id: executionId,
        patternName: pattern.name,
      },
      task: {
        id: `task-${executionId.slice(0, 8)}`,
        role: 'agent',
        slug: pattern.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      },
    };
  }

  /**
   * Generate PR body from pattern execution
   */
  private generatePrBody(pattern: Pattern, execution: PatternExecution): string {
    const lines = [
      '## Summary',
      '',
      `This PR was automatically generated by Parallax pattern: **${pattern.name}** (v${pattern.version})`,
      '',
      '### Execution Details',
      '',
      `- **Execution ID**: \`${execution.id}\``,
      `- **Started**: ${execution.startTime.toISOString()}`,
      `- **Status**: ${execution.status}`,
    ];

    if (execution.metrics?.agentsUsed) {
      lines.push(`- **Agents Used**: ${execution.metrics.agentsUsed}`);
    }

    if (execution.metrics?.averageConfidence) {
      lines.push(`- **Confidence**: ${(execution.metrics.averageConfidence * 100).toFixed(1)}%`);
    }

    lines.push('');
    lines.push('---');
    lines.push('*Generated by [Parallax](https://github.com/parallax) agent orchestration platform*');

    return lines.join('\n');
  }
}

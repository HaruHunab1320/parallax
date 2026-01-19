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
import { DatabaseService } from '../db/database.service';
import { IPatternEngine, PatternExecutionOptions } from './interfaces';
import { ConfidenceCalibrationService } from '../services/confidence-calibration-service';
import { LicenseEnforcer } from '../licensing/license-enforcer';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ExecutionEventBus } from '../execution-events';

export class TracedPatternEngine implements IPatternEngine {
  private loader: PatternLoader;
  private executions: Map<string, PatternExecution> = new Map();
  private localAgentManager: LocalAgentManager;
  private tracer: PatternTracer;
  private localAgents: any[] = [];
  private _calibrationService: ConfidenceCalibrationService;
  private licenseEnforcer: LicenseEnforcer;
  
  constructor(
    private runtimeManager: RuntimeManager,
    private agentRegistry: EtcdRegistry,
    private patternsDir: string,
    private logger: Logger,
    private database?: DatabaseService,
    private executionEvents?: ExecutionEventBus
  ) {
    this.loader = new PatternLoader(patternsDir, logger);
    this.localAgentManager = LocalAgentManager.fromEnv();
    this.tracer = new PatternTracer('control-plane', '0.1.0');
    this._calibrationService = new ConfidenceCalibrationService(logger);
    this.licenseEnforcer = new LicenseEnforcer(logger);
  }

  async initialize(): Promise<void> {
    await this.loader.loadPatterns();
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
    return this.loader.getPattern(name) || null;
  }

  listPatterns(): Pattern[] {
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
    this.localAgents = agents;
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
}

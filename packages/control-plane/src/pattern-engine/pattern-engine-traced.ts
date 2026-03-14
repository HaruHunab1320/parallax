import { Pattern, PatternExecution } from './types';
import { RuntimeManager } from '../runtime-manager';
import { EtcdRegistry } from '../registry';
import { Logger } from 'pino';
import {
  PatternTracer
} from '@parallaxai/telemetry';
import { DatabaseService } from '../db/database.service';
import { PatternExecutionOptions } from './interfaces';
import { DatabasePatternService } from './database-pattern-service';
import { ExecutionEventBus } from '../execution-events';
import { WorkspaceService, Workspace } from '../workspace';
import { AgentRuntimeService } from '../agent-runtime';
import { ThreadPreparationService } from '../threads';
import {
  ExecutionEngine,
} from '@parallaxai/data-plane';
import { PatternEngine } from './pattern-engine';

export class TracedPatternEngine extends PatternEngine {
  private tracer: PatternTracer;

  constructor(
    runtimeManager: RuntimeManager,
    agentRegistry: EtcdRegistry,
    patternsDir: string,
    logger: Logger,
    database?: DatabaseService,
    executionEvents?: ExecutionEventBus,
    databasePatterns?: DatabasePatternService,
    workspaceService?: WorkspaceService,
    executionEngine?: ExecutionEngine,
    agentRuntimeService?: AgentRuntimeService,
    threadPreparationService?: ThreadPreparationService
  ) {
    super(
      runtimeManager,
      agentRegistry,
      patternsDir,
      logger,
      database,
      executionEvents,
      databasePatterns,
      workspaceService,
      executionEngine,
      agentRuntimeService,
      threadPreparationService
    );
    this.tracer = new PatternTracer('control-plane', '0.1.0');
  }

  async executePattern(
    patternName: string,
    input: any,
    options?: PatternExecutionOptions
  ): Promise<PatternExecution> {
    return this.tracer.tracePatternExecution(
      patternName,
      input,
      async () => {
        // Add pattern metadata to the tracing span
        const pattern = this.getPattern(patternName);
        if (pattern) {
          this.tracer.addPatternMetadata({
            minAgents: pattern.minAgents,
            confidenceThreshold: pattern.metadata?.defaultThreshold,
            timeout: options?.timeout?.toString(),
            retries: pattern.metadata?.retryPolicy?.maxRetries
          });
        }

        // Create database execution record for event persistence
        const executionId = options?.executionId;
        if (this.database && executionId && pattern) {
          try {
            const dbPattern = await this.database.patterns.findByName(pattern.name);
            if (dbPattern) {
              await this.database.executions.create({
                id: executionId,
                pattern: { connect: { id: dbPattern.id } },
                input: input,
                status: 'running',
              });
            }
          } catch (dbError) {
            this.logger.warn(
              { error: dbError, executionId },
              'Failed to persist execution to database'
            );
          }
        }

        // Delegate to parent for all actual execution logic
        return super.executePattern(patternName, input, options);
      }
    );
  }

  protected async selectAgents(
    pattern: Pattern,
    executionId?: string,
    workspace?: Workspace | null
  ): Promise<Record<string, unknown>[]> {
    const agents = await super.selectAgents(pattern, executionId, workspace);

    // Add tracing for agent selection
    const requiredCapabilities = pattern.agents?.capabilities || [];
    this.tracer.traceAgentSelection(
      pattern.name,
      requiredCapabilities.join(','),
      agents.map(a => a.id as string)
    );

    return agents;
  }
}

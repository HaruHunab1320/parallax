import type { ExecutionEngine } from '@parallaxai/data-plane';
import { PatternTracer } from '@parallaxai/telemetry';
import type { Logger } from 'pino';
import type { AgentRuntimeService } from '../agent-runtime';
import type { DatabaseService } from '../db/database.service';
import type { ExecutionEventBus } from '../execution-events';
import type { EtcdRegistry } from '../registry';
import type { RuntimeManager } from '../runtime-manager';
import type { ThreadPreparationService } from '../threads';
import type { Workspace, WorkspaceService } from '../workspace';
import type { DatabasePatternService } from './database-pattern-service';
import type { PatternExecutionOptions } from './interfaces';
import { PatternEngine } from './pattern-engine';
import type { Pattern, PatternExecution } from './types';

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
    return this.tracer.tracePatternExecution(patternName, input, async () => {
      // Add pattern metadata to the tracing span
      const pattern = this.getPattern(patternName);
      if (pattern) {
        this.tracer.addPatternMetadata({
          minAgents: pattern.minAgents,
          confidenceThreshold: pattern.metadata?.defaultThreshold,
          timeout: options?.timeout?.toString(),
          retries: pattern.metadata?.retryPolicy?.maxRetries,
        });
      }

      // Create database execution record for event persistence
      const executionId = options?.executionId;
      if (this.database && executionId && pattern) {
        try {
          const dbPattern = await this.database.patterns.findByName(
            pattern.name
          );
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
    });
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
      agents.map((a) => a.id as string)
    );

    return agents;
  }
}

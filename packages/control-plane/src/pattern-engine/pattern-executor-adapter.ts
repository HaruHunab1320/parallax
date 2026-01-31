import {
  PatternExecutor,
  PatternExecutorOptions,
  PatternExecutionResult,
} from '@parallax/data-plane';
import { PatternEngine } from './pattern-engine';

/**
 * Adapter that implements the data-plane's PatternExecutor interface
 * by delegating to the control-plane's PatternEngine.
 *
 * This allows the ExecutionEngine to execute nested patterns without
 * creating a circular dependency between data-plane and control-plane.
 */
export class PatternExecutorAdapter implements PatternExecutor {
  constructor(private patternEngine: PatternEngine) {}

  async execute(
    patternName: string,
    input: any,
    options?: PatternExecutorOptions
  ): Promise<PatternExecutionResult> {
    const startTime = Date.now();

    try {
      const execution = await this.patternEngine.executePattern(patternName, input, {
        timeout: options?.timeout,
        executionId: options?.executionId,
      });

      return {
        id: execution.id,
        patternName: execution.patternName,
        status: execution.status === 'completed' ? 'completed' : 'failed',
        result: execution.result,
        error: execution.error,
        confidence: execution.metrics?.averageConfidence,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      return {
        id: options?.executionId || 'unknown',
        patternName,
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        executionTime: Date.now() - startTime,
      };
    }
  }
}

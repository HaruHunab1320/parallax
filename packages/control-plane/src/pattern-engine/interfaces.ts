import { Pattern, PatternExecution, ExecutionMetrics } from './types';

/**
 * Common interface for pattern engines
 */
export interface PatternExecutionOptions {
  timeout?: number;
  stream?: boolean;
  executionId?: string;
}

export interface IPatternEngine {
  initialize(): Promise<void>;
  executePattern(
    patternName: string,
    input: any,
    options?: PatternExecutionOptions
  ): Promise<PatternExecution>;
  getPattern(name: string): Pattern | null;
  listPatterns(): Pattern[];
  getExecution(id: string): PatternExecution | undefined;
  listExecutions(options?: { limit?: number; status?: string }): PatternExecution[];
  getMetrics(): ExecutionMetrics[];
  reloadPatterns(): Promise<void>;
  savePattern(pattern: Pattern, options?: { overwrite?: boolean }): Promise<Pattern>;
}

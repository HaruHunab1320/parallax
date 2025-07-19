import { Pattern, PatternExecution, ExecutionMetrics } from './types';

/**
 * Common interface for pattern engines
 */
export interface IPatternEngine {
  initialize(): Promise<void>;
  executePattern(
    patternName: string,
    input: any,
    options?: { timeout?: number }
  ): Promise<PatternExecution>;
  getPattern(name: string): Pattern | null;
  listPatterns(): Pattern[];
  getExecution(id: string): PatternExecution | undefined;
  getMetrics(): ExecutionMetrics[];
}
import { Pattern, PatternExecution, ExecutionMetrics } from './types';
import { WorkspaceService } from '../workspace';

/**
 * Common interface for pattern engines
 */
export interface PatternExecutionOptions {
  timeout?: number;
  stream?: boolean;
  executionId?: string;
}

export interface PatternWithSource extends Pattern {
  id?: string;
  source?: 'file' | 'database';
  createdAt?: Date;
  updatedAt?: Date;
}

export interface PatternVersion {
  id: string;
  patternId: string;
  version: string;
  script: string;
  metadata?: any;
  createdAt: Date;
  createdBy?: string | null;
}

export interface IPatternEngine {
  initialize(): Promise<void>;
  executePattern(
    patternName: string,
    input: any,
    options?: PatternExecutionOptions
  ): Promise<PatternExecution>;
  getPattern(name: string): Pattern | null;
  listPatterns(): PatternWithSource[];
  getExecution(id: string): PatternExecution | undefined;
  listExecutions(options?: { limit?: number; status?: string }): PatternExecution[];
  getMetrics(): ExecutionMetrics[];
  reloadPatterns(): Promise<void>;
  savePattern(pattern: Pattern, options?: { overwrite?: boolean }): Promise<Pattern>;
  deletePattern(name: string): Promise<void>;
  getPatternVersions(name: string): Promise<PatternVersion[]>;
  hasDatabasePatterns(): boolean;
  /**
   * Set the workspace service for git workspace provisioning
   */
  setWorkspaceService(service: WorkspaceService): void;
}

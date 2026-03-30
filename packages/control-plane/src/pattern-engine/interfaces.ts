import type { ExecutionEngine } from '@parallaxai/data-plane';
import type { Logger } from 'pino';
import type { AgentRuntimeService } from '../agent-runtime';
import type { DatabaseService } from '../db/database.service';
import type { ExecutionEventBus } from '../execution-events';
import type { EtcdRegistry } from '../registry';
import type { RuntimeManager } from '../runtime-manager';
import type { ThreadPreparationService } from '../threads';
import type { UserProvidedCredentials, WorkspaceService } from '../workspace';
import type { DatabasePatternService } from './database-pattern-service';
import type { ExecutionMetrics, Pattern, PatternExecution } from './types';

/**
 * Service bundle for PatternEngine construction.
 * Groups the 11 constructor parameters into required core deps and optional services.
 */
export interface PatternEngineServices {
  /** Runtime manager for agent lifecycle */
  runtimeManager: RuntimeManager;
  /** Agent registry (etcd-backed) */
  agentRegistry: EtcdRegistry;
  /** Directory containing pattern files */
  patternsDir: string;
  /** Logger instance */
  logger: Logger;
  /** Database service for execution persistence */
  database?: DatabaseService;
  /** Event bus for execution events */
  executionEvents?: ExecutionEventBus;
  /** Database-backed pattern storage */
  databasePatterns?: DatabasePatternService;
  /** Workspace provisioning service (often set later via setter) */
  workspaceService?: WorkspaceService;
  /** Data-plane execution engine */
  executionEngine?: ExecutionEngine;
  /** Agent runtime service for dynamic spawning (often set later via setter) */
  agentRuntimeService?: AgentRuntimeService;
  /** Thread preparation service */
  threadPreparationService?: ThreadPreparationService;
}

/**
 * Common interface for pattern engines
 */
export interface PatternExecutionOptions {
  timeout?: number;
  stream?: boolean;
  executionId?: string;
  /**
   * User-provided credentials (PAT or OAuth token)
   * If provided, these are used instead of GitHub App credentials
   */
  credentials?: UserProvidedCredentials;
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
  listExecutions(options?: {
    limit?: number;
    status?: string;
  }): PatternExecution[];
  getMetrics(): ExecutionMetrics[];
  reloadPatterns(): Promise<void>;
  savePattern(
    pattern: Pattern,
    options?: { overwrite?: boolean }
  ): Promise<Pattern>;
  deletePattern(name: string): Promise<void>;
  getPatternVersions(name: string): Promise<PatternVersion[]>;
  hasDatabasePatterns(): boolean;
  /**
   * Set the workspace service for git workspace provisioning
   */
  setWorkspaceService(service: WorkspaceService): void;
  /**
   * Set the agent runtime service for dynamic agent spawning
   */
  setAgentRuntimeService(service: AgentRuntimeService): void;
  /**
   * Set the thread preparation service for normalizing prepared thread spawns
   */
  setThreadPreparationService?(service: ThreadPreparationService): void;
}

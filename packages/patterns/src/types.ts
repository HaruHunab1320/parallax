/**
 * The pattern contract: a parallax pattern is a TypeScript module deployed
 * with the control plane (Temporal-style), not a script uploaded at runtime.
 *
 * The engine performs agent selection and the fan-out dispatch, then hands
 * the collected results to `execute()`. The module's job is aggregation and
 * decision logic — the confidence algebra lives in @parallaxai/confidence.
 */
import type { Confident } from '@parallaxai/confidence';

/** An agent selected for this execution (pre-dispatch metadata). */
export interface PatternAgentInfo {
  id: string;
  name: string;
  capabilities: string[];
  expertise: number;
  historicalConfidence?: number;
}

/** One agent's response from the engine-side fan-out. */
export interface PatternAgentResult {
  agentId: string;
  agentName: string;
  capabilities?: string[];
  expertise?: number;
  /** The agent's answer (null when the agent failed). */
  result: unknown;
  /** 0..1; failed agents report 0. */
  confidence: number;
  reasoning?: string;
  error?: string;
  timestamp?: number;
}

/** Structural pino-compatible logger. */
export interface PatternLogger {
  debug(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
}

export interface PatternWorkspaceInfo {
  id: string;
  path: string;
  repo: string;
  branch: string;
  baseBranch: string;
}

export interface PatternContext {
  /** The ExecutePattern request input. */
  input: any;
  /** Agents selected for this execution. */
  agents: PatternAgentInfo[];
  /**
   * All fan-out results, in dispatch order — including failures
   * (confidence 0, `error` set).
   */
  results: PatternAgentResult[];
  /** `results` filtered to confidence > 0. */
  successfulResults: PatternAgentResult[];
  /** Git workspace info when the pattern requested one. */
  workspace?: PatternWorkspaceInfo;
  pattern: { name: string; version: string };
  logger: PatternLogger;
}

export interface PatternMeta {
  name: string;
  version: string;
  description: string;
  input?: { type: string; required?: boolean; schema?: unknown };
  /** Capabilities agents must have to be selected. */
  capabilities?: string[];
  minAgents?: number;
  maxAgents?: number;
  /** Minimum confidence for agent selection filtering. */
  minConfidence?: number;
  metadata?: Record<string, unknown>;
}

export interface PatternModule<T = unknown> {
  meta: PatternMeta;
  execute(ctx: PatternContext): Promise<Confident<T>>;
}

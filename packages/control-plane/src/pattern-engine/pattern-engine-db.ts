import type { DatabaseService } from '../db/database.service';
import type { PatternExecution } from './types';

/**
 * Extension methods for PatternEngine to support database persistence
 */
export async function createExecutionInDb(
  database: DatabaseService,
  patternName: string,
  input: any,
  options?: {
    nodeId?: string;
    timeoutMs?: number;
    [key: string]: any;
  }
): Promise<string> {
  // First, ensure the pattern exists in the database
  let pattern = await database.patterns.findByName(patternName);
  if (!pattern) {
    // Create pattern record if it doesn't exist
    pattern = await database.patterns.create({
      name: patternName,
      description: `Pattern ${patternName}`,
      script: '', // Empty script for now
      metadata: {},
    });
  }

  // Create execution record with resilience fields
  const createData: any = {
    pattern: {
      connect: { id: pattern.id },
    },
    input: input,
    status: 'running',
    // Persist execution settings only; credentials must never enter execution history.
    metrics: { timeout: options?.timeout, stream: options?.stream },
  };

  // Add resilience fields if provided (columns added via migration)
  if (options?.executionId) createData.id = options.executionId;
  if (options?.nodeId) createData.nodeId = options.nodeId;
  if (options?.timeoutMs !== undefined)
    createData.timeoutMs = options.timeoutMs;
  createData.startedAt = new Date();

  const execution = await database.executions.create(createData);

  // Add initial event
  await database.executions.addEvent(execution.id, {
    type: 'started',
    data: {
      patternName,
      input,
      nodeId: options?.nodeId,
      timeoutMs: options?.timeoutMs,
    },
  });

  return execution.id;
}

export async function updateExecutionInDb(
  database: DatabaseService,
  executionId: string,
  updates: {
    status?: string;
    result?: any;
    error?: string;
    confidence?: number;
    durationMs?: number;
    agentCount?: number;
  }
): Promise<boolean> {
  const changed = await database.executions.transitionStatus(
    executionId,
    updates.status || 'running',
    {
      result: updates.result,
      error: updates.error,
      confidence: updates.confidence,
      durationMs: updates.durationMs,
    }
  );

  // Record only the transition that actually won.
  if (!changed) return false;
  if (updates.status) {
    await database.executions.addEvent(executionId, {
      type:
        updates.status === 'completed'
          ? 'completed'
          : updates.status === 'failed'
            ? 'failed'
            : 'status_changed',
      data: updates,
    });
  }
  return true;
}

export async function addAgentEventToDb(
  database: DatabaseService,
  executionId: string,
  agentId: string,
  eventType: string,
  data: any
): Promise<void> {
  await database.executions.addEvent(executionId, {
    type: eventType,
    agentId,
    data,
  });
}

export async function convertExecutionFromDb(
  dbExecution: any
): Promise<PatternExecution> {
  return {
    id: dbExecution.id,
    patternName: dbExecution.pattern?.name || 'unknown',
    startTime: dbExecution.time,
    endTime: ['completed', 'failed', 'cancelled'].includes(dbExecution.status)
      ? new Date(dbExecution.time.getTime() + (dbExecution.durationMs || 0))
      : undefined,
    status: dbExecution.status as any,
    result: dbExecution.result,
    error: dbExecution.error || undefined,
    metrics: {
      confidence: dbExecution.confidence || 0,
      warnings: dbExecution.warnings ? (dbExecution.warnings as string[]) : [],
      duration: dbExecution.durationMs || 0,
      pattern: dbExecution.pattern?.name || 'unknown',
      patternName: dbExecution.pattern?.name || 'unknown',
      agentCount: dbExecution.agentCount || 0,
      timestamp: dbExecution.time.toISOString(),
      success: dbExecution.status === 'completed',
    },
  };
}

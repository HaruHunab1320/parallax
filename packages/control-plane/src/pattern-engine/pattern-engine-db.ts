import { PatternExecution } from './types';
import { DatabaseService } from '../db/database.service';

/**
 * Extension methods for PatternEngine to support database persistence
 */
export async function createExecutionInDb(
  database: DatabaseService,
  patternName: string,
  input: any,
  options?: any
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

  // Create execution record
  const execution = await database.executions.create({
    pattern: {
      connect: { id: pattern.id }
    },
    input: input,
    status: 'running',
    metrics: options || {},
  });

  // Add initial event
  await database.executions.addEvent(execution.id, {
    type: 'started',
    data: {
      patternName,
      input,
      options,
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
): Promise<void> {
  await database.executions.updateStatus(
    executionId,
    updates.status || 'running',
    {
      result: updates.result,
      error: updates.error,
      confidence: updates.confidence,
      durationMs: updates.durationMs,
    }
  );

  // Add event for status change
  if (updates.status) {
    await database.executions.addEvent(executionId, {
      type: updates.status === 'completed' ? 'completed' : 
            updates.status === 'failed' ? 'failed' : 'status_changed',
      data: updates,
    });
  }
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
    endTime: dbExecution.status === 'completed' || dbExecution.status === 'failed' 
      ? new Date(dbExecution.time.getTime() + (dbExecution.durationMs || 0))
      : undefined,
    status: dbExecution.status as any,
    result: dbExecution.result,
    error: dbExecution.error || undefined,
    metrics: {
      confidence: dbExecution.confidence || 0,
      warnings: dbExecution.warnings ? dbExecution.warnings as string[] : [],
      duration: dbExecution.durationMs || 0,
      pattern: dbExecution.pattern?.name || 'unknown',
      patternName: dbExecution.pattern?.name || 'unknown',
      agentCount: dbExecution.agentCount || 0,
      timestamp: dbExecution.time.toISOString(),
      success: dbExecution.status === 'completed'
    },
  };
}
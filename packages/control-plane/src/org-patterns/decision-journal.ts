import type { EventEmitter } from 'node:events';
import type { Logger } from 'pino';

/**
 * Structural slice of the db repositories the journal writes through.
 * Kept structural (not imported classes) so the journal is trivially
 * testable and org-patterns doesn't depend on the db layer at runtime.
 */
export interface DecisionJournalStores {
  sharedDecisions: {
    create(input: {
      executionId: string;
      threadId?: string | null;
      category: string;
      summary: string;
      details?: Record<string, unknown>;
    }): Promise<unknown>;
  };
  episodicExperiences: {
    create(input: {
      executionId: string;
      threadId?: string | null;
      role?: string | null;
      repo?: string | null;
      objective: string;
      summary: string;
      outcome: string;
      details?: Record<string, unknown>;
    }): Promise<unknown>;
  };
}

export interface DecisionJournalMeta {
  /** Durable execution id (the pattern-engine's, not the executor's internal one). */
  executionId: string;
  patternName: string;
  /** What the workflow was asked to do; falls back to patternName. */
  objective?: string;
  repo?: string;
}

interface RecordedDecision {
  role?: string;
  action?: string;
  confidence?: number;
  source?: string;
  [key: string]: unknown;
}

/**
 * Persists the confidence decisions an org workflow makes (accept / retry /
 * escalate) and labels the whole execution with its final outcome.
 *
 * Decisions are written as they happen (`shared_decisions`, category
 * `confidence_policy`); the outcome row (`episodic_experiences`) is written
 * once, when the executor emits `workflow_completed` or `workflow_failed`.
 * Joining the two on `executionId` gives outcome-labelled decision paths —
 * the raw material for learning escalation policies from history.
 *
 * Persistence failures are logged and swallowed: journaling must never
 * affect the workflow itself. One instance journals one execution.
 */
export class DecisionJournal {
  private logger: Logger;
  private decisions: RecordedDecision[] = [];
  private pending: Promise<unknown>[] = [];
  private outcomeRecorded = false;

  constructor(
    private stores: DecisionJournalStores,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'DecisionJournal' });
  }

  /**
   * Subscribe to a workflow executor's decision and outcome events.
   * Returns a detach function; call it after the execution settles.
   */
  attach(executor: EventEmitter, meta: DecisionJournalMeta): () => void {
    const onDecision = (event: RecordedDecision) =>
      this.recordDecision(meta, event);
    const onCompleted = (event: Record<string, unknown>) =>
      this.recordOutcome(meta, 'success', event);
    const onFailed = (event: Record<string, unknown>) =>
      this.recordOutcome(meta, 'failure', event);

    executor.on('step_confidence', onDecision);
    executor.on('workflow_completed', onCompleted);
    executor.on('workflow_failed', onFailed);

    return () => {
      executor.off('step_confidence', onDecision);
      executor.off('workflow_completed', onCompleted);
      executor.off('workflow_failed', onFailed);
    };
  }

  /** Resolves when every write issued so far has settled. */
  async flush(): Promise<void> {
    await Promise.all(this.pending);
  }

  private recordDecision(
    meta: DecisionJournalMeta,
    event: RecordedDecision
  ): void {
    this.decisions.push(event);

    const confidence =
      typeof event.confidence === 'number'
        ? ` at ${event.confidence.toFixed(2)}`
        : '';
    const summary = `${event.role ?? 'unknown'}: ${event.action ?? 'unknown'}${confidence} (${event.source ?? 'no signal'})`;

    this.track(
      this.stores.sharedDecisions.create({
        executionId: meta.executionId,
        category: 'confidence_policy',
        summary,
        details: { ...event, patternName: meta.patternName },
      }),
      meta
    );
  }

  private recordOutcome(
    meta: DecisionJournalMeta,
    outcome: 'success' | 'failure',
    event: Record<string, unknown>
  ): void {
    if (this.outcomeRecorded) return;
    this.outcomeRecorded = true;

    const tally: Record<string, number> = {};
    for (const d of this.decisions) {
      const action = d.action ?? 'unknown';
      tally[action] = (tally[action] ?? 0) + 1;
    }
    const tallyStr = Object.entries(tally)
      .map(([action, count]) => `${count} ${action}`)
      .join(', ');
    const summary =
      `${outcome} after ${this.decisions.length} confidence decision(s)` +
      (tallyStr ? ` (${tallyStr})` : '');

    this.track(
      this.stores.episodicExperiences.create({
        executionId: meta.executionId,
        repo: meta.repo ?? null,
        objective: meta.objective ?? meta.patternName,
        summary,
        outcome,
        details: {
          patternName: meta.patternName,
          decisions: tally,
          durationMs: event.durationMs,
          error: event.error,
          workflowExecutionId: event.executionId,
        },
      }),
      meta
    );
  }

  private track(write: Promise<unknown>, meta: DecisionJournalMeta): void {
    this.pending.push(
      write.catch((error) => {
        this.logger.warn(
          {
            error: error instanceof Error ? error.message : String(error),
            executionId: meta.executionId,
          },
          'Failed to persist decision record'
        );
      })
    );
  }
}

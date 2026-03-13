import { Logger } from 'pino';
import { ThreadEvent, ThreadHandle } from '@parallaxai/runtime-interface';
import { PersistedSharedDecision, SharedDecisionRepository } from '../db/repositories';

export class SharedDecisionService {
  constructor(
    private readonly repository: SharedDecisionRepository,
    private readonly logger: Logger
  ) {}

  async recordDecision(input: {
    executionId: string;
    threadId?: string | null;
    category: string;
    summary: string;
    details?: Record<string, unknown>;
  }): Promise<PersistedSharedDecision> {
    return this.repository.create(input);
  }

  async list(filter?: {
    executionId?: string;
    threadId?: string;
    category?: string;
    limit?: number;
  }): Promise<PersistedSharedDecision[]> {
    return this.repository.findAll(filter);
  }

  async projectThreadEvent(thread: ThreadHandle, event: ThreadEvent): Promise<void> {
    const decision = this.extractDecision(thread, event);
    if (!decision) return;

    const latest = await this.repository.findLatestForThreadCategory(
      decision.threadId!,
      decision.category
    );

    if (latest && this.areSemanticallyEquivalent(latest.summary, decision.summary)) {
      return;
    }

    await this.repository.create(decision);
    this.logger.debug(
      {
        threadId: decision.threadId,
        executionId: decision.executionId,
        category: decision.category,
      },
      'Shared decision captured from thread event'
    );
  }

  private extractDecision(
    thread: ThreadHandle,
    event: ThreadEvent
  ): {
    executionId: string;
    threadId: string;
    category: string;
    summary: string;
    details?: Record<string, unknown>;
  } | null {
    if (event.type === 'thread_completed') {
      const completionSummary = this.getSummary(thread, event);
      if (!completionSummary) return null;

      return {
        executionId: thread.executionId,
        threadId: thread.id,
        category: 'completion_outcome',
        summary: this.formatCompletionSummary(thread, completionSummary),
        details: {
          role: thread.role,
          agentType: thread.agentType,
          status: thread.status,
          completionState: thread.completion?.state ?? null,
          artifacts: thread.completion?.artifacts ?? [],
        },
      };
    }

    if (event.type === 'thread_turn_complete') {
      const summary = this.getSummary(thread, event);
      if (!summary) return null;

      return {
        executionId: thread.executionId,
        threadId: thread.id,
        category: 'thread_summary',
        summary: this.normalizeSummary(summary),
        details: {
          role: thread.role,
          agentType: thread.agentType,
          status: thread.status,
          completionState: thread.completion?.state ?? null,
        },
      };
    }

    if (event.type === 'thread_failed') {
      const failureSummary =
        this.getString(event.data?.error) ||
        thread.completion?.summary ||
        thread.summary;

      if (!failureSummary) return null;

      return {
        executionId: thread.executionId,
        threadId: thread.id,
        category: 'failure_recovery',
        summary: this.normalizeSummary(failureSummary),
        details: {
          role: thread.role,
          agentType: thread.agentType,
          status: thread.status,
        },
      };
    }

    return null;
  }

  private getSummary(thread: ThreadHandle, event: ThreadEvent): string | null {
    const fromEvent = this.getString(event.data?.summary);
    const fromCompletion = thread.completion?.summary;
    const fromThread = thread.summary;

    return fromEvent || fromCompletion || fromThread || this.buildFallbackSummary(thread, event);
  }

  private getString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
  }

  private formatCompletionSummary(thread: ThreadHandle, summary: string): string {
    const artifacts = thread.completion?.artifacts ?? [];
    if (artifacts.length === 0) {
      return this.normalizeSummary(summary);
    }

    const artifactSummary = artifacts
      .slice(0, 3)
      .map((artifact) => `${artifact.type}:${artifact.value}`)
      .join(', ');
    return this.normalizeSummary(`${summary} Artifacts: ${artifactSummary}.`);
  }

  private normalizeSummary(summary: string): string {
    return summary.replace(/\s+/g, ' ').trim();
  }

  private buildFallbackSummary(thread: ThreadHandle, event: ThreadEvent): string | null {
    if (event.type === 'thread_turn_complete') {
      return `Completed a supervised turn for objective: ${thread.objective}`;
    }

    if (event.type === 'thread_completed') {
      return `Completed objective: ${thread.objective}`;
    }

    if (event.type === 'thread_failed') {
      return `Failed while working on objective: ${thread.objective}`;
    }

    return null;
  }

  private areSemanticallyEquivalent(left: string, right: string): boolean {
    return this.fingerprint(left) === this.fingerprint(right);
  }

  private fingerprint(value: string): string {
    return this.normalizeSummary(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
      .slice(0, 24)
      .join(' ');
  }
}

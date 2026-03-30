import type { ThreadEvent, ThreadHandle } from '@parallaxai/runtime-interface';
import type { Logger } from 'pino';
import type {
  EpisodicExperienceRepository,
  PersistedEpisodicExperience,
} from '../db/repositories';

export class EpisodicExperienceService {
  constructor(
    private readonly repository: EpisodicExperienceRepository,
    private readonly logger: Logger
  ) {}

  async list(filter?: {
    executionId?: string;
    threadId?: string;
    role?: string;
    repo?: string;
    outcome?: string;
    limit?: number;
  }): Promise<PersistedEpisodicExperience[]> {
    return this.repository.findAll(filter);
  }

  async projectThreadEvent(
    thread: ThreadHandle,
    event: ThreadEvent
  ): Promise<void> {
    const experience = this.extractExperience(thread, event);
    if (!experience) return;

    const latest = await this.repository.findLatestForThread(thread.id);
    if (
      latest &&
      latest.outcome === experience.outcome &&
      this.fingerprint(latest.summary) === this.fingerprint(experience.summary)
    ) {
      return;
    }

    await this.repository.create(experience);
    this.logger.debug(
      {
        threadId: thread.id,
        executionId: thread.executionId,
        outcome: experience.outcome,
      },
      'Episodic experience captured from thread event'
    );
  }

  private extractExperience(
    thread: ThreadHandle,
    event: ThreadEvent
  ): {
    executionId: string;
    threadId: string;
    role?: string | null;
    repo?: string | null;
    objective: string;
    summary: string;
    outcome: string;
    details?: Record<string, unknown>;
  } | null {
    if (
      event.type !== 'thread_turn_complete' &&
      event.type !== 'thread_completed' &&
      event.type !== 'thread_failed'
    ) {
      return null;
    }

    const summary =
      this.getString(event.data?.summary) ||
      thread.completion?.summary ||
      thread.summary ||
      this.buildFallbackSummary(thread, event);
    if (!summary) return null;

    const outcome = this.getOutcome(thread, event);
    const normalizedSummary = this.buildExperienceSummary(
      thread,
      summary,
      outcome
    );

    return {
      executionId: thread.executionId,
      threadId: thread.id,
      role: thread.role,
      repo: thread.workspace?.repo || null,
      objective: thread.objective,
      summary: normalizedSummary,
      outcome,
      details: {
        agentType: thread.agentType,
        branch: thread.workspace?.branch,
        workspaceId: thread.workspace?.workspaceId,
        completionState: thread.completion?.state ?? null,
        artifacts: thread.completion?.artifacts ?? [],
      },
    };
  }

  private getOutcome(thread: ThreadHandle, event: ThreadEvent): string {
    if (
      event.type === 'thread_failed' ||
      thread.completion?.state === 'failed'
    ) {
      return 'failed';
    }
    if (thread.completion?.state === 'partial') {
      return 'partial';
    }
    return 'successful';
  }

  private buildExperienceSummary(
    thread: ThreadHandle,
    summary: string,
    outcome: string
  ): string {
    const prefix =
      outcome === 'successful'
        ? 'Succeeded'
        : outcome === 'partial'
          ? 'Partially succeeded'
          : 'Failed';
    const artifactText = (thread.completion?.artifacts ?? [])
      .slice(0, 3)
      .map((artifact) => `${artifact.type}:${artifact.value}`)
      .join(', ');

    const parts = [
      `${prefix} on objective: ${thread.objective}.`,
      this.normalizeSummary(summary),
      artifactText ? `Artifacts: ${artifactText}.` : '',
    ].filter(Boolean);

    return parts.join(' ');
  }

  private getString(value: unknown): string | null {
    return typeof value === 'string' && value.trim().length > 0
      ? value.trim()
      : null;
  }

  private normalizeSummary(summary: string): string {
    return summary.replace(/\s+/g, ' ').trim();
  }

  private buildFallbackSummary(
    thread: ThreadHandle,
    event: ThreadEvent
  ): string | null {
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

  private fingerprint(value: string): string {
    return this.normalizeSummary(value)
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((token) => token.length > 2)
      .slice(0, 32)
      .join(' ');
  }
}

import { Logger } from 'pino';
import {
  EpisodicExperienceRepository,
  SharedDecisionRepository,
} from '../db/repositories';
import { ThreadPreparationSpec, ThreadWorkspaceRef } from '@parallaxai/runtime-interface';

export class MemoryContextService {
  constructor(
    private readonly sharedDecisions: SharedDecisionRepository,
    private readonly episodicExperiences: EpisodicExperienceRepository,
    private readonly logger: Logger
  ) {}

  async buildThreadMemory(params: {
    executionId: string;
    role?: string;
    objective: string;
    workspace?: ThreadWorkspaceRef;
  }): Promise<{
    preparation?: ThreadPreparationSpec;
    metadata?: Record<string, unknown>;
  }> {
    const repo = params.workspace?.repo;
    const [decisionCandidates, experienceCandidates] = await Promise.all([
      this.sharedDecisions.findAll({
        executionId: params.executionId,
        limit: 12,
      }),
      this.episodicExperiences.findAll({
        repo: repo || undefined,
        role: params.role || undefined,
        limit: 12,
      }),
    ]);

    const decisions = this.rankDecisions(decisionCandidates).slice(0, 5);
    const experiences = this.rankExperiences(
      experienceCandidates,
      params.objective,
      params.role,
      repo
    ).slice(0, 4);

    if (decisions.length === 0 && experiences.length === 0) {
      return {};
    }

    const lines: string[] = [
      '# Parallax Thread Memory',
      '',
      `Objective: ${params.objective}`,
      params.role ? `Role: ${params.role}` : '',
      repo ? `Repository: ${repo}` : '',
      '',
    ].filter(Boolean);

    if (decisions.length > 0) {
      lines.push('## Current Execution Shared Decisions', '');
      for (const decision of decisions) {
        lines.push(`- [${decision.category}] ${decision.summary}`);
      }
      lines.push('');
    }

    if (experiences.length > 0) {
      lines.push('## Relevant Prior Experiences', '');
      for (const experience of experiences) {
        const roleText = experience.role ? ` (${experience.role})` : '';
        lines.push(`- [${experience.outcome}] ${experience.summary}${roleText}`);
      }
      lines.push('');
    }

    const content = lines.join('\n').trim() + '\n';

    this.logger.debug(
      {
        executionId: params.executionId,
        role: params.role,
        repo,
        decisions: decisions.length,
        experiences: experiences.length,
      },
      'Built thread memory context'
    );

    return {
      preparation: {
        workspace: params.workspace,
        contextFiles: [
          {
            path: '.parallax/thread-memory.md',
            content,
          },
        ],
      },
      metadata: {
        memoryContext: {
          sharedDecisionCount: decisions.length,
          episodicExperienceCount: experiences.length,
          repo: repo || null,
          role: params.role || null,
          objective: params.objective,
        },
      },
    };
  }

  private rankDecisions(
    decisions: Awaited<ReturnType<SharedDecisionRepository['findAll']>>
  ) {
    const priority: Record<string, number> = {
      completion_outcome: 4,
      failure_recovery: 3,
      thread_summary: 2,
    };

    return decisions
      .slice()
      .sort((left, right) => {
        const priorityDelta =
          (priority[right.category] ?? 0) - (priority[left.category] ?? 0);
        if (priorityDelta !== 0) {
          return priorityDelta;
        }
        return right.createdAt.getTime() - left.createdAt.getTime();
      });
  }

  private rankExperiences(
    experiences: Awaited<ReturnType<EpisodicExperienceRepository['findAll']>>,
    objective: string,
    role?: string,
    repo?: string
  ) {
    const objectiveTokens = this.tokenize(objective);
    const seen = new Set<string>();

    return experiences
      .map((experience) => ({
        experience,
        score: this.scoreExperience(experience, objectiveTokens, role, repo),
      }))
      .filter(({ experience }) => {
        const fingerprint = this.fingerprint(experience.summary);
        if (seen.has(fingerprint)) {
          return false;
        }
        seen.add(fingerprint);
        return true;
      })
      .sort((left, right) => {
        if (right.score !== left.score) {
          return right.score - left.score;
        }
        return right.experience.createdAt.getTime() - left.experience.createdAt.getTime();
      })
      .map(({ experience }) => experience);
  }

  private scoreExperience(
    experience: Awaited<ReturnType<EpisodicExperienceRepository['findAll']>>[number],
    objectiveTokens: Set<string>,
    role?: string,
    repo?: string
  ): number {
    let score = 0;

    if (repo && experience.repo === repo) score += 8;
    if (role && experience.role === role) score += 5;
    if (experience.outcome === 'successful') score += 4;
    if (experience.outcome === 'partial') score += 2;
    if (experience.outcome === 'failed') score -= 2;

    const summaryTokens = this.tokenize(`${experience.objective} ${experience.summary}`);
    for (const token of objectiveTokens) {
      if (summaryTokens.has(token)) {
        score += 1;
      }
    }

    const ageHours = Math.max(
      1,
      (Date.now() - experience.createdAt.getTime()) / (1000 * 60 * 60)
    );
    score += 1 / ageHours;

    return score;
  }

  private tokenize(value: string): Set<string> {
    return new Set(
      value
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((token) => token.length > 2)
    );
  }

  private fingerprint(value: string): string {
    return Array.from(this.tokenize(value)).sort().slice(0, 24).join(' ');
  }
}

import {
  ageDecayWeight,
  type HistoryRun as KernelHistoryRun,
  scoreHistory,
} from '@_89/confidence-kernel';
import type { Logger } from 'pino';
import type { HistoryOracle } from './types';

/**
 * Structural slice of the db repositories the history oracle reads from —
 * the read-side counterpart of DecisionJournalStores. Kept structural so
 * org-patterns doesn't depend on the db layer at runtime.
 */
export interface DecisionHistoryStores {
  sharedDecisions: {
    findAll(filter?: { category?: string; limit?: number }): Promise<
      Array<{
        executionId: string;
        details: Record<string, unknown> | null;
      }>
    >;
  };
  episodicExperiences: {
    findAll(filter?: { limit?: number }): Promise<
      Array<{
        executionId: string;
        outcome: string;
        details: Record<string, unknown> | null;
        createdAt: Date;
      }>
    >;
  };
}

export interface HistoryRun {
  outcome: string;
  createdAt: Date;
}

export interface HistoryScore {
  confidence: number;
  detail: string;
}

const DEFAULTS = {
  halfLifeDays: 30,
  minRuns: 3,
  saturationRuns: 10,
  maxRuns: 200,
};

/**
 * Score a role's history prior from outcome-labelled past runs.
 *
 * The scoring math (age-decayed success rate × efficiency × sample-saturation)
 * is delegated to the shared confidence-kernel under `posture:'suppress'`:
 * a sparse history *shrinks toward neutral 1.0* rather than toward zero,
 * because parallax's low-confidence actions (retry, escalate) are costly —
 * see the kernel README's posture table (`suppress` originates here).
 *
 * Parallax's "efficiency" is the role's clean-decision rate (share of its
 * confidence decisions that were clean accepts), computed here and passed to
 * the kernel as the fixed `efficiency` number — the kernel's default
 * step-length efficiency does not apply to this host.
 */
export function scoreDecisionHistory(
  runs: HistoryRun[],
  roleActions: string[],
  oracle: HistoryOracle,
  now: Date = new Date()
): HistoryScore | undefined {
  const halfLife = oracle.halfLifeDays ?? DEFAULTS.halfLifeDays;
  const minRuns = oracle.minRuns ?? DEFAULTS.minRuns;
  const saturationRuns = oracle.saturationRuns ?? DEFAULTS.saturationRuns;

  // Retry/escalation friction: the share of this role's past decisions
  // that were clean accepts.
  const clean = roleActions.filter((a) => a === 'accept').length;
  const efficiency = roleActions.length > 0 ? clean / roleActions.length : 1;

  const kernelRuns: KernelHistoryRun[] = runs.map((run, i) => ({
    id: String(i),
    timestamp: run.createdAt.getTime(),
    outcome: run.outcome === 'success' ? 'success' : 'failure',
  }));

  const score = scoreHistory(kernelRuns, {
    posture: 'suppress',
    halfLifeDays: halfLife,
    saturationRuns,
    minRuns,
    decayBase: '2',
    efficiency,
    now: now.getTime(),
  });

  if (!score) return undefined;

  // Weighted success rate for the detail string — recomputed with the kernel's
  // decay weight so it stays exact regardless of the efficiency factor.
  let weightSum = 0;
  let successSum = 0;
  for (const run of runs) {
    const ageDays =
      (now.getTime() - run.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const weight = ageDecayWeight(ageDays, halfLife, '2');
    weightSum += weight;
    if (run.outcome === 'success') successSum += weight;
  }
  const successRate = weightSum > 0 ? successSum / weightSum : 0;

  return {
    confidence: score.confidence,
    detail:
      `history — ${runs.length} prior run(s): ` +
      `${(successRate * 100).toFixed(0)}% weighted success, ` +
      `${(efficiency * 100).toFixed(0)}% clean decisions ` +
      `→ ${score.confidence.toFixed(2)}`,
  };
}

/**
 * Reads the decision journal back as a verification signal: the `history`
 * oracle's confidence for a (pattern, role) pair. Returns neutral (1.0)
 * whenever the prior is too weak to act on — sparse history must never
 * trigger a retry or escalation on its own.
 */
export class DecisionHistory {
  private logger: Logger;

  constructor(
    private stores: DecisionHistoryStores,
    logger: Logger
  ) {
    this.logger = logger.child({ component: 'DecisionHistory' });
  }

  async signal(
    query: { patternName: string; role: string },
    oracle: HistoryOracle,
    now: Date = new Date()
  ): Promise<{ confidence: number; detail?: string }> {
    const maxRuns = oracle.maxRuns ?? DEFAULTS.maxRuns;

    const experiences = await this.stores.episodicExperiences.findAll({
      limit: maxRuns,
    });
    const runs = experiences.filter(
      (e) => e.details?.patternName === query.patternName
    );

    const score =
      runs.length > 0
        ? await this.scoreWithDecisions(runs, query, oracle, maxRuns, now)
        : undefined;

    if (!score) {
      return {
        confidence: 1.0,
        detail:
          `history — ${runs.length} prior run(s) of ` +
          `"${query.patternName}" (min ${oracle.minRuns ?? DEFAULTS.minRuns}): neutral`,
      };
    }
    return score;
  }

  private async scoreWithDecisions(
    runs: Array<{ executionId: string; outcome: string; createdAt: Date }>,
    query: { patternName: string; role: string },
    oracle: HistoryOracle,
    maxRuns: number,
    now: Date
  ): Promise<HistoryScore | undefined> {
    const runIds = new Set(runs.map((r) => r.executionId));
    const decisions = await this.stores.sharedDecisions.findAll({
      category: 'confidence_policy',
      limit: maxRuns * 5,
    });
    const roleActions = decisions
      .filter(
        (d) =>
          d.details?.role === query.role &&
          runIds.has(d.executionId) &&
          typeof d.details?.action === 'string'
      )
      .map((d) => d.details!.action as string);

    return scoreDecisionHistory(runs, roleActions, oracle, now);
  }
}

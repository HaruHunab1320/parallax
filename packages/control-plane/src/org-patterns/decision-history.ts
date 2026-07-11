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
 * Ingredients follow decision-pathfinder's RecommendationEngine
 * (age-decayed success rate × sample factor × efficiency), with one
 * deliberate inversion: decision-pathfinder multiplies the sample factor
 * in because its low-confidence action is conservative (keep asking the
 * LLM), while parallax's low-confidence actions are costly (retry,
 * escalate). Here sparse history therefore *shrinks toward neutral 1.0*
 * instead of toward zero:
 *
 *   raw        = weightedSuccessRate × cleanDecisionRate
 *   sample     = min(weightedRuns / saturationRuns, 1)
 *   confidence = 1 − sample × (1 − raw)
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

  if (runs.length < minRuns) return undefined;

  let weightSum = 0;
  let successSum = 0;
  for (const run of runs) {
    const ageDays =
      (now.getTime() - run.createdAt.getTime()) / (24 * 60 * 60 * 1000);
    const weight =
      halfLife > 0 && Number.isFinite(halfLife)
        ? Math.pow(2, -Math.max(ageDays, 0) / halfLife)
        : 1;
    weightSum += weight;
    if (run.outcome === 'success') successSum += weight;
  }
  const successRate = weightSum > 0 ? successSum / weightSum : 0;

  // Retry/escalation friction: the share of this role's past decisions
  // that were clean accepts.
  const clean = roleActions.filter((a) => a === 'accept').length;
  const efficiency = roleActions.length > 0 ? clean / roleActions.length : 1;

  const raw = successRate * efficiency;
  const sample = Math.min(weightSum / saturationRuns, 1);
  const confidence = 1 - sample * (1 - raw);

  return {
    confidence,
    detail:
      `history — ${runs.length} prior run(s): ` +
      `${(successRate * 100).toFixed(0)}% weighted success, ` +
      `${(efficiency * 100).toFixed(0)}% clean decisions ` +
      `→ ${confidence.toFixed(2)}`,
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

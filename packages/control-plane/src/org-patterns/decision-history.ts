import {
  ageDecayWeight,
  detectDrift,
  type HistoryRun as KernelHistoryRun,
  pool,
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
        /** Repo the execution ran against; a pooling dimension. */
        repo?: string | null;
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
  /** True when the recent window collapsed vs lifetime and the prior was demoted. */
  drifted?: boolean;
  /**
   * Sibling tags the runs were borrowed from (e.g. `family:coding`,
   * `repo:acme/api`). Absent for first-party history.
   */
  pooledFrom?: string[];
}

const DEFAULTS = {
  halfLifeDays: 30,
  minRuns: 3,
  saturationRuns: 10,
  maxRuns: 200,
  /** Most-recent runs compared against lifetime for drift. */
  driftRecentN: 5,
  /** Recent must fall this far below lifetime to count as drift. */
  driftThreshold: 0.25,
  /** A pooled prior's strength relative to first-party history. */
  poolWeight: 0.5,
};

/**
 * Sibling family key for a pattern name.
 *
 * Parallax patterns are named `<family>-<variant>` (`coding-swarm`,
 * `coding-swarm-local`, `startup-team`, `enterprise-review`, `pong-builder`),
 * so the leading hyphen-delimited segment is the family: `coding-swarm` and
 * `coding-swarm-local` are siblings, `startup-team` is not. Operators whose
 * names don't follow the convention override it with the oracle's
 * `poolFamily`.
 */
export function patternFamily(patternName: string): string {
  const head = patternName.split('-')[0];
  return head.length > 0 ? head : patternName;
}

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
 *
 * Two supplements sit on top, both of which can only move the prior DOWN
 * (toward "verify this") or leave it where it was:
 *
 * - **Drift demotion.** `detectDrift` compares the most-recent window's
 *   success rate to the lifetime rate; a collapse multiplies `raw` by
 *   `1 − (lifetime − recent)`. Because the demotion is folded into `raw` and
 *   not into the final confidence, the suppress posture still shapes it —
 *   a thin prior stays near neutral no matter how badly it drifted.
 * - **Pooling.** When `pooledFrom` is set the runs were borrowed from sibling
 *   subjects, so `saturationRuns` is divided by `poolWeight`: the same runs
 *   buy less sample sufficiency, i.e. the prior sits closer to neutral 1.0
 *   than first-party history would.
 */
export function scoreDecisionHistory(
  runs: HistoryRun[],
  roleActions: string[],
  oracle: HistoryOracle,
  now: Date = new Date(),
  /** Sibling tags these runs were pooled from; omit for first-party history. */
  pooledFrom?: string[]
): HistoryScore | undefined {
  const halfLife = oracle.halfLifeDays ?? DEFAULTS.halfLifeDays;
  const minRuns = oracle.minRuns ?? DEFAULTS.minRuns;
  const baseSaturation = oracle.saturationRuns ?? DEFAULTS.saturationRuns;

  // A pooled prior must be weaker than first-party history: the same weighted
  // run count buys proportionally less `sample`, which under `suppress` means
  // it shrinks further toward neutral 1.0.
  const poolWeight = clampUnit(oracle.poolWeight ?? DEFAULTS.poolWeight);
  const saturationRuns =
    pooledFrom && poolWeight > 0 ? baseSaturation / poolWeight : baseSaturation;

  // Retry/escalation friction: the share of this role's past decisions
  // that were clean accepts.
  const clean = roleActions.filter((a) => a === 'accept').length;
  const efficiency = roleActions.length > 0 ? clean / roleActions.length : 1;

  const kernelRuns: KernelHistoryRun[] = runs.map((run, i) => ({
    id: String(i),
    timestamp: run.createdAt.getTime(),
    outcome: run.outcome === 'success' ? 'success' : 'failure',
  }));

  const drift = evaluateDrift(kernelRuns, oracle, minRuns);
  // In [0,1]: a total collapse (lifetime 1.0 → recent 0.0) zeroes `raw`;
  // a just-over-threshold wobble barely moves it. Never above 1, so drift
  // can never RAISE the prior.
  const driftFactor = drift
    ? clampUnit(1 - (drift.lifetime - drift.recent))
    : 1;

  const score = scoreHistory(kernelRuns, {
    posture: 'suppress',
    halfLifeDays: halfLife,
    saturationRuns,
    minRuns,
    decayBase: '2',
    efficiency: efficiency * driftFactor,
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

  const source = pooledFrom
    ? `history (pooled from ${pooledFrom.join(', ')})`
    : 'history';
  const runNoun = pooledFrom ? 'sibling run(s)' : 'prior run(s)';
  const driftNote = drift
    ? `, DRIFT: last ${drift.recentN} at ${(drift.recent * 100).toFixed(0)}% ` +
      `vs ${(drift.lifetime * 100).toFixed(0)}% lifetime ` +
      `(prior demoted x${driftFactor.toFixed(2)})`
    : '';

  return {
    confidence: score.confidence,
    detail:
      `${source} — ${runs.length} ${runNoun}: ` +
      `${(successRate * 100).toFixed(0)}% weighted success, ` +
      `${(efficiency * 100).toFixed(0)}% clean decisions${driftNote} ` +
      `→ ${score.confidence.toFixed(2)}`,
    drifted: drift !== undefined,
    ...(pooledFrom ? { pooledFrom } : {}),
  };
}

function clampUnit(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(Math.max(value, 0), 1);
}

/**
 * Run the kernel's drift check, or `undefined` when it did not fire.
 *
 * The drift window is only evaluated once the prior is thick enough to trust:
 * at least the oracle's own `minRuns` (below which the whole prior is neutral
 * anyway) AND at least twice the recent window, so "lifetime" is genuinely
 * more than a restatement of "recent". Without that guard a run of three
 * fresh failures would read as a catastrophic collapse rather than as the
 * thin prior it is.
 */
function evaluateDrift(
  runs: KernelHistoryRun[],
  oracle: HistoryOracle,
  minRuns: number
): { recent: number; lifetime: number; recentN: number } | undefined {
  if (oracle.drift === false) return undefined;

  const recentN = oracle.driftRecentN ?? DEFAULTS.driftRecentN;
  const driftThreshold = oracle.driftThreshold ?? DEFAULTS.driftThreshold;

  const result = detectDrift(runs, {
    recentN,
    driftThreshold,
    minRuns: Math.max(minRuns, recentN * 2),
  });

  if (!result.drifted) return undefined;
  return {
    recent: result.recentScore,
    lifetime: result.lifetimeScore,
    recentN,
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
    query: { patternName: string; role: string; repo?: string },
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

    // First-party history wins outright; siblings are only ever a fallback
    // for a subject too new to have a prior of its own.
    let score =
      runs.length > 0
        ? await this.scoreWithDecisions(runs, query, oracle, maxRuns, now)
        : undefined;

    if (!score && oracle.pool) {
      score = await this.scorePooled(experiences, query, oracle, maxRuns, now);
    }

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

  /**
   * Warm start for a subject with too little history of its own: pool runs
   * from sibling buckets and score those instead.
   *
   * Sibling keys, both derivable from what the journal already records:
   * - `family:<x>` — other patterns in the same family ({@link patternFamily}).
   * - `repo:<x>`   — any pattern's runs against the same repo, since a repo's
   *                  difficulty transfers across the patterns pointed at it.
   *
   * The role dimension comes along for free: `scoreWithDecisions` looks up
   * this role's clean-decision rate over whichever executions ended up in the
   * pool, so the friction term becomes "this role across sibling runs".
   *
   * The result is marked pooled — weaker `sample` and a labelled detail
   * string — and, like every history prior, is still min-combined downstream
   * and can only pull confidence below the neutral 1.0 it replaces.
   */
  private async scorePooled(
    experiences: Array<{
      executionId: string;
      outcome: string;
      details: Record<string, unknown> | null;
      createdAt: Date;
      repo?: string | null;
    }>,
    query: { patternName: string; role: string; repo?: string },
    oracle: HistoryOracle,
    maxRuns: number,
    now: Date
  ): Promise<HistoryScore | undefined> {
    const family = oracle.poolFamily ?? patternFamily(query.patternName);
    const familyTag = `family:${family}`;
    const repoTag = query.repo ? `repo:${query.repo}` : undefined;

    const byTag = new Map<string, KernelHistoryRun[]>();
    const push = (tag: string, run: KernelHistoryRun) => {
      const bucket = byTag.get(tag);
      if (bucket) bucket.push(run);
      else byTag.set(tag, [run]);
    };

    for (const e of experiences) {
      const patternName = e.details?.patternName;
      if (typeof patternName !== 'string') continue;
      // `id` is the execution id so the kernel's de-dup collapses a run that
      // qualifies under both family and repo into one.
      const run: KernelHistoryRun = {
        id: e.executionId,
        timestamp: e.createdAt.getTime(),
        outcome: e.outcome === 'success' ? 'success' : 'failure',
      };
      if (patternFamily(patternName) === family) push(familyTag, run);
      if (repoTag && e.repo === query.repo) push(repoTag, run);
    }

    const tags = [familyTag, ...(repoTag ? [repoTag] : [])];
    const pooled = pool(byTag, tags);
    if (pooled.length === 0) return undefined;

    const usedTags = tags.filter((t) => (byTag.get(t)?.length ?? 0) > 0);
    const runs = pooled.map((r) => ({
      executionId: r.id,
      outcome: r.outcome,
      createdAt: new Date(r.timestamp),
    }));

    this.logger.debug(
      {
        patternName: query.patternName,
        role: query.role,
        tags: usedTags,
        pooledRuns: runs.length,
      },
      'History prior warm-started from sibling subjects'
    );

    return this.scoreWithDecisions(runs, query, oracle, maxRuns, now, usedTags);
  }

  private async scoreWithDecisions(
    runs: Array<{ executionId: string; outcome: string; createdAt: Date }>,
    query: { patternName: string; role: string },
    oracle: HistoryOracle,
    maxRuns: number,
    now: Date,
    pooledFrom?: string[]
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

    return scoreDecisionHistory(runs, roleActions, oracle, now, pooledFrom);
  }
}

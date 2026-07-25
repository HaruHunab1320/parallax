/**
 * Wave 2: drift demotion + sibling pooling on the history oracle.
 *
 * Both are *supplements* to a prior that is itself only a supplement. The
 * invariant every test here defends: neither can raise confidence, neither
 * fires on a prior too thin to trust, and both stay min-combinable so a real
 * oracle always outvotes them.
 *
 * The behaviour-preserving numbers for the plain (non-drifted, non-pooled)
 * path live in decision-history.golden.test.ts and are untouched by this file.
 */

import { combine } from '@_89/confidence-kernel';
import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import {
  DecisionHistory,
  type HistoryRun,
  patternFamily,
  scoreDecisionHistory,
} from '../decision-history';
import type { HistoryOracle } from '../types';

const logger = pino({ level: 'silent' });
const NOW = new Date('2026-07-10T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

/** `halfLifeDays: 0` disables age decay, so every weight is exactly 1. */
const NO_DECAY: HistoryOracle = { type: 'history', halfLifeDays: 0 };

/**
 * Build runs newest-first: `outcomes[0]` is 0 days old, `[1]` is 1 day old…
 * so the "recent window" is the head of the array.
 */
function runs(outcomes: string[]): HistoryRun[] {
  return outcomes.map((outcome, i) => ({
    outcome,
    createdAt: new Date(NOW.getTime() - i * DAY),
  }));
}

const fill = (n: number, outcome: string) => Array(n).fill(outcome) as string[];

describe('drift demotion', () => {
  // 5 fresh failures on top of 15 older successes.
  // lifetime = 15/20 = 0.75, recent(5) = 0.0 → gap 0.75 > 0.25 → drift.
  const collapsed = runs([...fill(5, 'failure'), ...fill(15, 'success')]);

  it('lowers the prior for a subject whose success just collapsed', () => {
    const withDrift = scoreDecisionHistory(collapsed, [], NO_DECAY, NOW);
    const without = scoreDecisionHistory(
      collapsed,
      [],
      { ...NO_DECAY, drift: false },
      NOW
    );

    // No drift: weighted success 0.75, sample 1 → 0.75.
    expect(without!.confidence).toBeCloseTo(0.75, 10);
    expect(without!.drifted).toBe(false);

    // Drift: raw is demoted by 1 − (0.75 − 0.0) = 0.25 → 0.75 × 0.25 = 0.1875.
    expect(withDrift!.drifted).toBe(true);
    expect(withDrift!.confidence).toBeCloseTo(0.1875, 10);
    expect(withDrift!.confidence).toBeLessThan(without!.confidence);
  });

  it('labels the drift in the detail string', () => {
    const score = scoreDecisionHistory(collapsed, [], NO_DECAY, NOW);
    expect(score!.detail).toContain('DRIFT');
    expect(score!.detail).toContain('last 5 at 0%');
    expect(score!.detail).toContain('75% lifetime');
  });

  it('does not fire on a prior too thin to trust', () => {
    // 8 runs: below the 2×recentN guard even though recent(5) = 20% vs 50%.
    const thin = runs([...fill(4, 'failure'), ...fill(4, 'success')]);
    const score = scoreDecisionHistory(thin, [], NO_DECAY, NOW);
    const plain = scoreDecisionHistory(
      thin,
      [],
      { ...NO_DECAY, drift: false },
      NOW
    );

    expect(score!.drifted).toBe(false);
    expect(score!.confidence).toBeCloseTo(0.6, 10);
    expect(score!.confidence).toBeCloseTo(plain!.confidence, 12);
  });

  it('still returns neutral (undefined) below minRuns', () => {
    expect(
      scoreDecisionHistory(runs(['failure', 'failure']), [], NO_DECAY, NOW)
    ).toBeUndefined();
  });

  it('never raises confidence — an improving subject is not "reverse drift"', () => {
    // 5 fresh successes on top of 15 older failures: recent 1.0 > lifetime 0.25.
    const improving = runs([...fill(5, 'success'), ...fill(15, 'failure')]);
    const withDrift = scoreDecisionHistory(improving, [], NO_DECAY, NOW);
    const without = scoreDecisionHistory(
      improving,
      [],
      { ...NO_DECAY, drift: false },
      NOW
    );

    expect(withDrift!.drifted).toBe(false);
    expect(withDrift!.confidence).toBeCloseTo(0.25, 10);
    expect(withDrift!.confidence).toBeCloseTo(without!.confidence, 12);
  });

  it('leaves a steady subject exactly where the plain formula put it', () => {
    const steady = runs(fill(20, 'success'));
    const a = scoreDecisionHistory(steady, [], NO_DECAY, NOW);
    const b = scoreDecisionHistory(
      steady,
      [],
      { ...NO_DECAY, drift: false },
      NOW
    );
    expect(a!.confidence).toBeCloseTo(b!.confidence, 12);
    expect(a!.drifted).toBe(false);
  });

  it('honours driftRecentN and driftThreshold', () => {
    // 3 fresh failures + 9 successes: lifetime 0.75, recent(3) = 0.0.
    const r = runs([...fill(3, 'failure'), ...fill(9, 'success')]);

    // Default recentN of 5 dilutes the collapse: recent(5) = 2/5 = 0.4,
    // gap 0.35 → still drift, but a milder demotion than a tight window.
    const wide = scoreDecisionHistory(r, [], NO_DECAY, NOW);
    const tight = scoreDecisionHistory(
      r,
      [],
      { ...NO_DECAY, driftRecentN: 3 },
      NOW
    );
    expect(tight!.confidence).toBeLessThan(wide!.confidence);

    // A threshold above the observed gap disarms it entirely.
    const tolerant = scoreDecisionHistory(
      r,
      [],
      { ...NO_DECAY, driftRecentN: 3, driftThreshold: 0.8 },
      NOW
    );
    expect(tolerant!.drifted).toBe(false);
    expect(tolerant!.confidence).toBeCloseTo(0.75, 10);
  });

  it('keeps a drifted-but-weak prior near neutral (suppress posture holds)', () => {
    // Same collapse, but saturation at 200 → sample 0.1. A prior this thin
    // must not become an escalation trigger no matter how hard it drifted.
    const score = scoreDecisionHistory(
      collapsed,
      [],
      { ...NO_DECAY, saturationRuns: 200 },
      NOW
    );
    expect(score!.drifted).toBe(true);
    expect(score!.confidence).toBeCloseTo(0.91875, 10);
    expect(score!.confidence).toBeGreaterThan(0.9);
  });

  it('is still min-combined — a drifted prior cannot outvote a real oracle', () => {
    const drifted = scoreDecisionHistory(collapsed, [], NO_DECAY, NOW)!;
    // A passing command oracle is not dragged UP by anything, and the drifted
    // prior can only pull the combined signal down.
    expect(
      combine([{ confidence: 1.0 }, { confidence: drifted.confidence }], 'min')
        .confidence
    ).toBeCloseTo(drifted.confidence, 12);
    // …and a failing real check still wins outright.
    expect(
      combine([{ confidence: 0.0 }, { confidence: drifted.confidence }], 'min')
        .confidence
    ).toBe(0);
  });
});

describe('patternFamily', () => {
  it('keys siblings off the leading segment of the pattern name', () => {
    expect(patternFamily('coding-swarm')).toBe('coding');
    expect(patternFamily('coding-swarm-local')).toBe('coding');
    expect(patternFamily('startup-team')).toBe('startup');
    expect(patternFamily('solo')).toBe('solo');
  });
});

describe('sibling pooling / warm start', () => {
  function makeStores(
    experiences: Array<Record<string, unknown>>,
    decisions: Array<Record<string, unknown>> = []
  ) {
    return {
      episodicExperiences: { findAll: vi.fn().mockResolvedValue(experiences) },
      sharedDecisions: { findAll: vi.fn().mockResolvedValue(decisions) },
    };
  }

  const exp = (
    executionId: string,
    outcome: string,
    patternName: string,
    repo: string | null = null,
    daysOld = 0
  ) => ({
    executionId,
    outcome,
    details: { patternName },
    repo,
    createdAt: new Date(NOW.getTime() - daysOld * DAY),
  });

  /** 10 sibling failures of `coding-swarm`; the subject is `coding-swarm-local`. */
  const siblingFailures = Array.from({ length: 10 }, (_, i) =>
    exp(`s${i}`, 'failure', 'coding-swarm', null, i)
  );

  const POOLING: HistoryOracle = {
    type: 'history',
    halfLifeDays: 0,
    pool: true,
  };

  it('is neutral for a brand-new subject when pooling is off (the default)', async () => {
    const history = new DecisionHistory(makeStores(siblingFailures), logger);
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      { type: 'history', halfLifeDays: 0 },
      NOW
    );
    expect(signal.confidence).toBe(1.0);
    expect(signal.detail).toContain('neutral');
  });

  it('warm-starts a brand-new subject from its family and labels it pooled', async () => {
    const history = new DecisionHistory(makeStores(siblingFailures), logger);
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      POOLING,
      NOW
    );

    // 10 pooled failures at poolWeight 0.5 → saturation 20 → sample 0.5.
    expect(signal.confidence).toBeCloseTo(0.5, 10);
    expect(signal.detail).toContain('pooled from family:coding');
    expect(signal.detail).toContain('10 sibling run(s)');
  });

  it('marks a pooled prior weaker than the same runs as first-party history', async () => {
    const pooled = new DecisionHistory(makeStores(siblingFailures), logger);
    const pooledSignal = await pooled.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      POOLING,
      NOW
    );

    // Identical runs, but recorded against the subject itself.
    const firstParty = new DecisionHistory(
      makeStores(
        siblingFailures.map((e) => ({
          ...e,
          details: { patternName: 'coding-swarm-local' },
        }))
      ),
      logger
    );
    const firstPartySignal = await firstParty.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      POOLING,
      NOW
    );

    expect(firstPartySignal.confidence).toBeCloseTo(0.0, 10);
    expect(firstPartySignal.detail).not.toContain('pooled');
    // The borrowed prior is closer to neutral — half the sample strength.
    expect(pooledSignal.confidence).toBeGreaterThan(
      firstPartySignal.confidence
    );
  });

  it('honours poolWeight', async () => {
    const history = new DecisionHistory(makeStores(siblingFailures), logger);
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      { ...POOLING, poolWeight: 0.25 },
      NOW
    );
    // saturation 10 / 0.25 = 40 → sample 0.25 → confidence 0.75.
    expect(signal.confidence).toBeCloseTo(0.75, 10);
  });

  it('pools by repo when the family has nothing to offer', async () => {
    const repoSiblings = Array.from({ length: 6 }, (_, i) =>
      exp(`r${i}`, 'failure', 'beta-thing', 'acme/api', i)
    );
    const history = new DecisionHistory(makeStores(repoSiblings), logger);
    const signal = await history.signal(
      { patternName: 'alpha-thing', role: 'engineer', repo: 'acme/api' },
      POOLING,
      NOW
    );

    // 6 pooled runs, saturation 20 → sample 0.3 → confidence 0.7.
    expect(signal.confidence).toBeCloseTo(0.7, 10);
    expect(signal.detail).toContain('pooled from repo:acme/api');
    expect(signal.detail).not.toContain('family:');
  });

  it('counts a run qualifying under two tags once', async () => {
    const both = siblingFailures.map((e) => ({ ...e, repo: 'acme/api' }));
    const history = new DecisionHistory(makeStores(both), logger);
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer', repo: 'acme/api' },
      POOLING,
      NOW
    );

    // De-duped: 10 runs → sample 0.5. Double-counting would give 20 → 0.0.
    expect(signal.confidence).toBeCloseTo(0.5, 10);
    expect(signal.detail).toContain('10 sibling run(s)');
    expect(signal.detail).toContain('family:coding');
    expect(signal.detail).toContain('repo:acme/api');
  });

  it('honours poolFamily as an explicit override', async () => {
    const history = new DecisionHistory(makeStores(siblingFailures), logger);
    const signal = await history.signal(
      { patternName: 'unrelated-name', role: 'engineer' },
      { ...POOLING, poolFamily: 'coding' },
      NOW
    );
    expect(signal.confidence).toBeCloseTo(0.5, 10);
    expect(signal.detail).toContain('pooled from family:coding');
  });

  it('stays neutral when even the pooled prior is below minRuns', async () => {
    const history = new DecisionHistory(
      makeStores([exp('s0', 'failure', 'coding-swarm')]),
      logger
    );
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      POOLING,
      NOW
    );
    expect(signal.confidence).toBe(1.0);
    expect(signal.detail).toContain('neutral');
  });

  it('stays neutral when no sibling shares a family or repo', async () => {
    const history = new DecisionHistory(
      makeStores(
        Array.from({ length: 10 }, (_, i) =>
          exp(`o${i}`, 'failure', 'startup-team', 'other/repo', i)
        )
      ),
      logger
    );
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer', repo: 'acme/api' },
      POOLING,
      NOW
    );
    expect(signal.confidence).toBe(1.0);
  });

  it('borrows the role friction from sibling executions too', async () => {
    // Same 10 sibling failures, but the engineer role retried in half of them.
    const history = new DecisionHistory(
      makeStores(siblingFailures, [
        { executionId: 's0', details: { role: 'engineer', action: 'accept' } },
        { executionId: 's1', details: { role: 'engineer', action: 'retry' } },
        // other role / unpooled execution: ignored
        { executionId: 's2', details: { role: 'reviewer', action: 'retry' } },
        { executionId: 'zz', details: { role: 'engineer', action: 'retry' } },
      ]),
      logger
    );
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      POOLING,
      NOW
    );
    // Outcomes are all failures so raw is 0 either way, but the friction term
    // is reported from the pooled executions: 1 of 2 clean.
    expect(signal.detail).toContain('50% clean decisions');
  });

  it('never raises confidence and is still min-combined', async () => {
    const successes = Array.from({ length: 10 }, (_, i) =>
      exp(`s${i}`, 'success', 'coding-swarm', null, i)
    );
    const history = new DecisionHistory(makeStores(successes), logger);
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      POOLING,
      NOW
    );

    // A perfect pooled prior tops out at the neutral 1.0 it replaced —
    // pooling can only ever move the signal down.
    expect(signal.confidence).toBeLessThanOrEqual(1.0);
    expect(
      combine([{ confidence: 0.3 }, { confidence: signal.confidence }], 'min')
        .confidence
    ).toBeCloseTo(0.3, 12);
  });

  it('prefers first-party history over siblings when it has enough of it', async () => {
    const history = new DecisionHistory(
      makeStores([
        ...siblingFailures,
        ...Array.from({ length: 10 }, (_, i) =>
          exp(`m${i}`, 'success', 'coding-swarm-local', null, i)
        ),
      ]),
      logger
    );
    const signal = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      POOLING,
      NOW
    );
    expect(signal.confidence).toBeCloseTo(1.0, 10);
    expect(signal.detail).not.toContain('pooled');
    expect(signal.detail).toContain('10 prior run(s)');
  });

  it('drift applies to a pooled prior as well', async () => {
    // 5 fresh sibling failures on top of 15 older sibling successes.
    const collapsing = [
      ...Array.from({ length: 5 }, (_, i) =>
        exp(`f${i}`, 'failure', 'coding-swarm', null, i)
      ),
      ...Array.from({ length: 15 }, (_, i) =>
        exp(`p${i}`, 'success', 'coding-swarm', null, 5 + i)
      ),
    ];
    const history = new DecisionHistory(makeStores(collapsing), logger);
    const drifted = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      POOLING,
      NOW
    );
    const steady = await history.signal(
      { patternName: 'coding-swarm-local', role: 'engineer' },
      { ...POOLING, drift: false },
      NOW
    );

    expect(drifted.detail).toContain('DRIFT');
    expect(drifted.confidence).toBeLessThan(steady.confidence);
  });
});

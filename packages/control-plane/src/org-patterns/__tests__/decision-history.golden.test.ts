/**
 * Golden test for the confidence-kernel migration.
 *
 * `scoreDecisionHistory` used to carry its own scoring math inline
 * (2^(-ageDays/halfLife) decay, weighted success × clean-decision rate,
 * min(weightSum/saturationRuns,1) sample, 1 − sample × (1 − raw) suppress
 * shape). That math now lives in `@_89/confidence-kernel` under
 * `posture:'suppress'`.
 *
 * This test reimplements the OLD formula inline (exactly as it existed before
 * the migration) and asserts the kernel-backed `scoreDecisionHistory`
 * reproduces it to ~12 decimals across a range of inputs — the acceptance bar
 * for "behavior-preserving". It also pins the below-minRuns → neutral case.
 */

import { describe, expect, it } from 'vitest';
import {
  type HistoryRun,
  scoreDecisionHistory,
} from '../decision-history';
import type { HistoryOracle } from '../types';

const NOW = new Date('2026-07-10T12:00:00Z');
const DAY = 24 * 60 * 60 * 1000;

const DEFAULTS = { halfLifeDays: 30, minRuns: 3, saturationRuns: 10 };

/**
 * The OLD Parallax formula, reimplemented inline verbatim from the
 * pre-migration `scoreDecisionHistory` body.
 */
function oldReference(
  runs: HistoryRun[],
  roleActions: string[],
  oracle: HistoryOracle,
  now: Date
): number | undefined {
  const halfLife = oracle.halfLifeDays ?? DEFAULTS.halfLifeDays;
  const minRuns = oracle.minRuns ?? DEFAULTS.minRuns;
  const saturationRuns = oracle.saturationRuns ?? DEFAULTS.saturationRuns;

  if (runs.length < minRuns) return undefined;

  let weightSum = 0;
  let successSum = 0;
  for (const run of runs) {
    const ageDays = (now.getTime() - run.createdAt.getTime()) / DAY;
    const weight =
      halfLife > 0 && Number.isFinite(halfLife)
        ? Math.pow(2, -Math.max(ageDays, 0) / halfLife)
        : 1;
    weightSum += weight;
    if (run.outcome === 'success') successSum += weight;
  }
  const successRate = weightSum > 0 ? successSum / weightSum : 0;

  const clean = roleActions.filter((a) => a === 'accept').length;
  const efficiency = roleActions.length > 0 ? clean / roleActions.length : 1;

  const raw = successRate * efficiency;
  const sample = Math.min(weightSum / saturationRuns, 1);
  return 1 - sample * (1 - raw);
}

function runs(outcomes: string[], daysOld: number[]): HistoryRun[] {
  return outcomes.map((outcome, i) => ({
    outcome,
    createdAt: new Date(NOW.getTime() - (daysOld[i] ?? 0) * DAY),
  }));
}

describe('golden: Parallax decision-history (suppress) — kernel migration', () => {
  const cases: Array<{
    name: string;
    outcomes: string[];
    ages: number[];
    actions: string[];
    oracle: HistoryOracle;
  }> = [
    {
      name: 'mixed outcomes, varied ages, partial clean rate',
      outcomes: ['success', 'failure', 'success', 'success', 'failure'],
      ages: [3, 10, 15, 45, 1],
      actions: ['accept', 'retry', 'accept', 'accept', 'escalate'],
      oracle: { type: 'history' },
    },
    {
      name: 'all success, all clean, fresh (saturates near neutral)',
      outcomes: Array(10).fill('success'),
      ages: Array(10).fill(0),
      actions: Array(10).fill('accept'),
      oracle: { type: 'history' },
    },
    {
      name: 'all failure at full sample strength',
      outcomes: Array(10).fill('failure'),
      ages: Array(10).fill(0),
      actions: [],
      oracle: { type: 'history' },
    },
    {
      name: 'half-life decay of old runs',
      outcomes: Array(10).fill('failure'),
      ages: Array(10).fill(30),
      actions: [],
      oracle: { type: 'history', halfLifeDays: 30 },
    },
    {
      name: 'custom saturationRuns',
      outcomes: Array(5).fill('failure'),
      ages: Array(5).fill(0),
      actions: [],
      oracle: { type: 'history', saturationRuns: 5 },
    },
    {
      name: 'sparse prior stays near neutral, never gates',
      outcomes: ['failure', 'failure', 'success'],
      ages: [0, 0, 0],
      actions: ['retry', 'escalate', 'accept'],
      oracle: { type: 'history', saturationRuns: 50 },
    },
    {
      name: 'efficiency 0 (no clean accepts)',
      outcomes: ['success', 'success', 'success', 'success'],
      ages: [1, 2, 3, 4],
      actions: ['retry', 'retry', 'escalate'],
      oracle: { type: 'history' },
    },
  ];

  for (const c of cases) {
    it(`reproduces the old formula to 12 decimals: ${c.name}`, () => {
      const r = runs(c.outcomes, c.ages);
      const expected = oldReference(r, c.actions, c.oracle, NOW);
      const got = scoreDecisionHistory(r, c.actions, c.oracle, NOW);
      expect(got).toBeDefined();
      expect(got!.confidence).toBeCloseTo(expected as number, 12);
    });
  }

  it('below minRuns → neutral (undefined, host emits 1.0)', () => {
    const r = runs(['success', 'success'], [0, 0]);
    expect(oldReference(r, [], { type: 'history' }, NOW)).toBeUndefined();
    expect(
      scoreDecisionHistory(r, [], { type: 'history' }, NOW)
    ).toBeUndefined();
  });

  it('sparse prior confidence stays above 0.95 (neutral-ish)', () => {
    const r = runs(['failure', 'failure', 'success'], [0, 0, 0]);
    const got = scoreDecisionHistory(r, [], { type: 'history', saturationRuns: 50 }, NOW);
    expect(got!.confidence).toBeGreaterThan(0.95);
  });
});

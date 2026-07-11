/**
 * DecisionHistory tests
 *
 * scoreDecisionHistory is the pure scoring core (decision-pathfinder's
 * ingredients, shrink-toward-neutral adaptation); DecisionHistory wraps it
 * with journal-table reads.
 */

import pino from 'pino';
import { describe, expect, it, vi } from 'vitest';
import {
  DecisionHistory,
  type HistoryRun,
  scoreDecisionHistory,
} from '../decision-history';

const logger = pino({ level: 'silent' });
const NOW = new Date('2026-07-10T12:00:00Z');

function runsAt(outcomes: string[], daysOld = 0): HistoryRun[] {
  return outcomes.map((outcome) => ({
    outcome,
    createdAt: new Date(NOW.getTime() - daysOld * 24 * 60 * 60 * 1000),
  }));
}

describe('scoreDecisionHistory', () => {
  it('returns undefined below minRuns', () => {
    expect(
      scoreDecisionHistory(
        runsAt(['success', 'success']),
        [],
        { type: 'history' },
        NOW
      )
    ).toBeUndefined();
  });

  it('scores an all-success, all-clean history near neutral-or-better', () => {
    // 10 fresh successes, clean accepts → raw 1.0 → confidence 1.0
    const score = scoreDecisionHistory(
      runsAt(Array(10).fill('success')),
      Array(10).fill('accept'),
      { type: 'history' },
      NOW
    );
    expect(score!.confidence).toBeCloseTo(1.0, 5);
  });

  it('scores an all-failure history at full sample strength as 0', () => {
    const score = scoreDecisionHistory(
      runsAt(Array(10).fill('failure')),
      [],
      { type: 'history' },
      NOW
    );
    expect(score!.confidence).toBeCloseTo(0.0, 5);
  });

  it('shrinks sparse history toward neutral instead of toward zero', () => {
    // 3 fresh failures: raw = 0, but weightedN = 3 → sample = 0.3
    // confidence = 1 − 0.3 × 1 = 0.7, NOT 0. A weak prior must not escalate.
    const score = scoreDecisionHistory(
      runsAt(Array(3).fill('failure')),
      [],
      { type: 'history' },
      NOW
    );
    expect(score!.confidence).toBeCloseTo(0.7, 5);
  });

  it('decays old runs by the half-life', () => {
    // 10 failures exactly one half-life old: each weighs 0.5 →
    // weightedN = 5 → sample = 0.5 → confidence = 0.5.
    const score = scoreDecisionHistory(
      runsAt(Array(10).fill('failure'), 30),
      [],
      { type: 'history', halfLifeDays: 30 },
      NOW
    );
    expect(score!.confidence).toBeCloseTo(0.5, 5);
  });

  it('discounts by the role retry/escalation friction', () => {
    // 10 fresh successes but half the role's decisions were retries:
    // raw = 1.0 × 0.5 → confidence = 1 − 1 × 0.5 = 0.5.
    const score = scoreDecisionHistory(
      runsAt(Array(10).fill('success')),
      ['accept', 'retry', 'accept', 'retry'],
      { type: 'history' },
      NOW
    );
    expect(score!.confidence).toBeCloseTo(0.5, 5);
  });

  it('treats a role with no recorded decisions as frictionless', () => {
    const score = scoreDecisionHistory(
      runsAt(Array(10).fill('success')),
      [],
      { type: 'history' },
      NOW
    );
    expect(score!.confidence).toBeCloseTo(1.0, 5);
  });

  it('honours saturationRuns for full-strength priors', () => {
    // 5 fresh failures with saturation at 5 → sample = 1 → confidence 0.
    const score = scoreDecisionHistory(
      runsAt(Array(5).fill('failure')),
      [],
      { type: 'history', saturationRuns: 5 },
      NOW
    );
    expect(score!.confidence).toBeCloseTo(0.0, 5);
  });
});

describe('DecisionHistory', () => {
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
    patternName = 'startup-team'
  ) => ({
    executionId,
    outcome,
    details: { patternName },
    createdAt: NOW,
  });

  it('is neutral when the pattern has too little history', async () => {
    const stores = makeStores([
      exp('e1', 'failure'),
      exp('e2', 'failure', 'other-pattern'),
    ]);
    const history = new DecisionHistory(stores, logger);

    const signal = await history.signal(
      { patternName: 'startup-team', role: 'engineer' },
      { type: 'history' },
      NOW
    );

    expect(signal.confidence).toBe(1.0);
    expect(signal.detail).toContain('1 prior run(s)');
    expect(signal.detail).toContain('neutral');
  });

  it('scores only this pattern, filtering role decisions by execution', async () => {
    const stores = makeStores(
      [
        ...Array.from({ length: 10 }, (_, i) => exp(`e${i}`, 'success')),
        exp('other', 'failure', 'other-pattern'),
      ],
      [
        // engineer decisions inside the matched runs: 1 accept, 1 retry
        { executionId: 'e1', details: { role: 'engineer', action: 'accept' } },
        { executionId: 'e2', details: { role: 'engineer', action: 'retry' } },
        // other role and other execution: ignored
        {
          executionId: 'e1',
          details: { role: 'reviewer', action: 'escalate' },
        },
        {
          executionId: 'other',
          details: { role: 'engineer', action: 'retry' },
        },
      ]
    );
    const history = new DecisionHistory(stores, logger);

    const signal = await history.signal(
      { patternName: 'startup-team', role: 'engineer' },
      { type: 'history' },
      NOW
    );

    // 10 fresh successes (rate 1.0), efficiency 1/2 → confidence 0.5
    expect(signal.confidence).toBeCloseTo(0.5, 5);
    expect(stores.sharedDecisions.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'confidence_policy' })
    );
  });
});

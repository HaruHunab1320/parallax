import { describe, expect, it } from 'vitest';
import { diffTranscripts, jaccardSimilarity } from './session-diff';
import type { SessionTranscript, Turn } from './types';

function makeTurn(overrides: Partial<Turn> & { index: number }): Turn {
  return {
    timing: {
      startedAt: '2025-01-01T00:00:00Z',
      endedAt: '2025-01-01T00:00:01Z',
      durationMs: 1000,
    },
    input: '',
    rawOutput: '',
    cleanOutput: '',
    transitions: [],
    finalState: 'ready_for_input',
    eventCount: 1,
    ...overrides,
  };
}

function makeTranscript(
  overrides: Partial<SessionTranscript> = {}
): SessionTranscript {
  return {
    sessionId: 'test',
    startedAt: '2025-01-01T00:00:00Z',
    endedAt: '2025-01-01T00:00:10Z',
    totalDurationMs: 10000,
    turns: [],
    finalState: 'ready_for_input',
    totalTransitions: 0,
    ...overrides,
  };
}

describe('jaccardSimilarity', () => {
  it('returns 1 for identical strings', () => {
    expect(jaccardSimilarity('hello world', 'hello world')).toBe(1);
  });

  it('returns 0 for completely different strings', () => {
    expect(jaccardSimilarity('hello world', 'foo bar')).toBe(0);
  });

  it('returns partial similarity for overlapping tokens', () => {
    const sim = jaccardSimilarity('hello world foo', 'hello bar foo');
    // intersection: hello, foo (2), union: hello, world, foo, bar (4)
    expect(sim).toBe(0.5);
  });

  it('returns 1 for two empty strings', () => {
    expect(jaccardSimilarity('', '')).toBe(1);
  });

  it('returns 0 when one string is empty', () => {
    expect(jaccardSimilarity('hello', '')).toBe(0);
  });
});

describe('diffTranscripts', () => {
  it('returns score 0 for identical transcripts', () => {
    const turns = [
      makeTurn({
        index: 0,
        cleanOutput: 'hello world',
        finalState: 'completed',
      }),
    ];
    const baseline = makeTranscript({ turns, finalState: 'completed' });
    const candidate = makeTranscript({ turns, finalState: 'completed' });

    const result = diffTranscripts(baseline, candidate);
    expect(result.score).toBe(0);
    expect(result.severity).toBe('none');
  });

  it('flags regression when baseline completed but candidate did not', () => {
    const baseline = makeTranscript({
      turns: [makeTurn({ index: 0, finalState: 'completed' })],
      finalState: 'completed',
    });
    const candidate = makeTranscript({
      turns: [makeTurn({ index: 0, finalState: 'ready_for_input' })],
      finalState: 'ready_for_input',
    });

    const result = diffTranscripts(baseline, candidate);
    expect(result.score).toBeGreaterThanOrEqual(31);
    expect(result.severity).toBe('regression');
    expect(result.flags).toContain('baseline_completed_candidate_did_not');
  });

  it('recognizes improvement when candidate completed but baseline did not', () => {
    const baseline = makeTranscript({
      turns: [makeTurn({ index: 0, finalState: 'ready_for_input' })],
      finalState: 'ready_for_input',
    });
    const candidate = makeTranscript({
      turns: [makeTurn({ index: 0, finalState: 'completed' })],
      finalState: 'completed',
    });

    const result = diffTranscripts(baseline, candidate);
    expect(result.flags).toContain('candidate_completed_baseline_did_not');
    // Score should be low since this is an improvement
    expect(result.score).toBeLessThan(31);
  });

  it('penalizes extra turns in candidate', () => {
    const baseline = makeTranscript({
      turns: [makeTurn({ index: 0 })],
    });
    const candidate = makeTranscript({
      turns: [
        makeTurn({ index: 0 }),
        makeTurn({ index: 1 }),
        makeTurn({ index: 2 }),
        makeTurn({ index: 3 }),
      ],
    });

    const result = diffTranscripts(baseline, candidate);
    expect(result.flags).toContain('extra_turns');
    expect(result.score).toBeGreaterThan(0);
  });

  it('detects stuck states in candidate', () => {
    const baseline = makeTranscript({
      turns: [makeTurn({ index: 0, finalState: 'ready_for_input' })],
    });
    const candidate = makeTranscript({
      turns: [makeTurn({ index: 0, finalState: 'awaiting_auth' })],
      finalState: 'awaiting_auth',
    });

    const result = diffTranscripts(baseline, candidate);
    expect(result.flags).toContain('new_stuck_states');
    expect(result.turnComparisons[0].candidateStuck).toBe(true);
  });

  it('detects output divergence', () => {
    const baseline = makeTranscript({
      turns: [
        makeTurn({ index: 0, cleanOutput: 'alpha beta gamma delta epsilon' }),
      ],
    });
    const candidate = makeTranscript({
      turns: [makeTurn({ index: 0, cleanOutput: 'one two three four five' })],
    });

    const result = diffTranscripts(baseline, candidate);
    expect(result.flags).toContain('output_divergence');
    expect(result.turnComparisons[0].outputSimilarity).toBe(0);
  });

  it('handles unmatched turns with null indices', () => {
    const baseline = makeTranscript({
      turns: [makeTurn({ index: 0 }), makeTurn({ index: 1 })],
    });
    const candidate = makeTranscript({
      turns: [makeTurn({ index: 0 })],
    });

    const result = diffTranscripts(baseline, candidate);
    expect(result.turnComparisons.length).toBe(2);
    expect(result.turnComparisons[1].candidateTurnIndex).toBeNull();
  });
});

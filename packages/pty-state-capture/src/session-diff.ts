import type {
  RegressionSeverity,
  SessionDiffResult,
  SessionTranscript,
  Turn,
  TurnComparison,
} from './types';

const STUCK_STATES = new Set(['awaiting_auth', 'awaiting_approval']);

export function jaccardSimilarity(a: string, b: string): number {
  if (!a && !b) return 1;
  if (!a || !b) return 0;

  const tokensA = new Set(a.split(/\s+/).filter(Boolean));
  const tokensB = new Set(b.split(/\s+/).filter(Boolean));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersection = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersection += 1;
  }

  const union = tokensA.size + tokensB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

export function diffTranscripts(
  baseline: SessionTranscript,
  candidate: SessionTranscript
): SessionDiffResult {
  const flags: string[] = [];
  let score = 0;

  const baselineCompleted = baseline.finalState === 'completed';
  const candidateCompleted = candidate.finalState === 'completed';

  // Factor: baseline completed, candidate didn't (+40)
  if (baselineCompleted && !candidateCompleted) {
    score += 40;
    flags.push('baseline_completed_candidate_did_not');
  }

  // Factor: candidate completed, baseline didn't (-10)
  if (candidateCompleted && !baselineCompleted) {
    score -= 10;
    flags.push('candidate_completed_baseline_did_not');
  }

  // Factor: new stuck states in candidate (+20 per state, max 40)
  const baselineStuck = getStuckStates(baseline.turns);
  const candidateStuck = getStuckStates(candidate.turns);
  let stuckPenalty = 0;
  for (const state of candidateStuck) {
    if (!baselineStuck.has(state)) {
      stuckPenalty += 20;
    }
  }
  stuckPenalty = Math.min(stuckPenalty, 40);
  if (stuckPenalty > 0) {
    score += stuckPenalty;
    flags.push('new_stuck_states');
  }

  // Factor: extra turns (+3 per extra turn, max 15) or fewer turns (-2 per fewer, max -10)
  const turnDelta = candidate.turns.length - baseline.turns.length;
  if (turnDelta > 0) {
    const extraPenalty = Math.min(turnDelta * 3, 15);
    score += extraPenalty;
    flags.push('extra_turns');
  } else if (turnDelta < 0) {
    const improvement = Math.max(turnDelta * 2, -10);
    score += improvement; // negative, so reduces score
    flags.push('fewer_turns');
  }

  // Turn comparisons (sequential alignment)
  const maxTurns = Math.max(baseline.turns.length, candidate.turns.length);
  const turnComparisons: TurnComparison[] = [];
  let totalSimilarity = 0;
  let comparedCount = 0;

  for (let i = 0; i < maxTurns; i++) {
    const baseTurn = baseline.turns[i] ?? null;
    const candTurn = candidate.turns[i] ?? null;

    const similarity =
      baseTurn && candTurn
        ? jaccardSimilarity(baseTurn.cleanOutput, candTurn.cleanOutput)
        : 0;

    if (baseTurn && candTurn) {
      totalSimilarity += similarity;
      comparedCount += 1;
    }

    const durationDeltaMs =
      baseTurn && candTurn
        ? candTurn.timing.durationMs - baseTurn.timing.durationMs
        : 0;

    const finalStateMatch =
      baseTurn && candTurn
        ? baseTurn.finalState === candTurn.finalState
        : false;

    const isStuck = candTurn ? STUCK_STATES.has(candTurn.finalState) : false;

    turnComparisons.push({
      baselineTurnIndex: baseTurn?.index ?? null,
      candidateTurnIndex: candTurn?.index ?? null,
      outputSimilarity: similarity,
      durationDeltaMs,
      finalStateMatch,
      candidateStuck: isStuck,
    });
  }

  // Factor: output divergence (1 - avg Jaccard) * 20, max 20
  if (comparedCount > 0) {
    const avgSimilarity = totalSimilarity / comparedCount;
    const divergence = (1 - avgSimilarity) * 20;
    score += divergence;
    if (divergence > 1) {
      flags.push('output_divergence');
    }
  }

  // Clamp score to minimum 0
  score = Math.max(0, Math.round(score));

  const severity = scoreSeverity(score);
  const summary = buildSummary(baseline, candidate, score, severity, flags);

  return {
    severity,
    score,
    summary,
    flags,
    turnComparisons,
  };
}

function getStuckStates(turns: Turn[]): Set<string> {
  const stuck = new Set<string>();
  for (const turn of turns) {
    if (STUCK_STATES.has(turn.finalState)) {
      stuck.add(turn.finalState);
    }
  }
  return stuck;
}

function scoreSeverity(score: number): RegressionSeverity {
  if (score === 0) return 'none';
  if (score <= 10) return 'info';
  if (score <= 30) return 'warning';
  return 'regression';
}

function buildSummary(
  baseline: SessionTranscript,
  candidate: SessionTranscript,
  score: number,
  severity: RegressionSeverity,
  flags: string[]
): string {
  const parts: string[] = [
    `${severity} (score ${score})`,
    `baseline: ${baseline.turns.length} turns → ${baseline.finalState}`,
    `candidate: ${candidate.turns.length} turns → ${candidate.finalState}`,
  ];
  if (flags.length > 0) {
    parts.push(`flags: ${flags.join(', ')}`);
  }
  return parts.join('; ');
}

import {
  cf,
  conf,
  synthesize,
  uncertain,
  val,
  type Confident,
} from '@parallaxai/confidence';
import type {
  PatternAgentInfo,
  PatternAgentResult,
  PatternModule,
} from '../types';

/** Sum of confidence values across results (`<~` extraction + sum). */
function sumConfidence(results: PatternAgentResult[]): number {
  return results.reduce((sum, r) => sum + r.confidence, 0);
}

/** Conservative synthesis when the budget is barely met. */
function conservativeSynthesis(items: Array<Confident<unknown>>): unknown {
  const highConf = items.filter((i) => conf(i) > 0.8);
  return val(synthesize(highConf.length > 0 ? highConf : items));
}

/** Best-effort synthesis when the budget is not met. */
function bestEffortSynthesis(
  consumed: PatternAgentResult[],
  items: Array<Confident<unknown>>
): unknown {
  if (items.length === 0) {
    return {
      status: 'insufficient-data',
      recommendation: 'Unable to provide confident recommendation',
    };
  }
  const bestValue = val(synthesize(items));
  return {
    ...(typeof bestValue === 'object' && bestValue !== null ? bestValue : {}),
    caveat: 'Low confidence due to insufficient analysis budget',
    confidence: sumConfidence(consumed) / consumed.length,
  };
}

/** Which phases contributed agents. */
function getPhases(agents: PatternAgentInfo[]): string[] {
  const phases: string[] = [];
  if (agents.some((a) => a.capabilities.includes('fast'))) phases.push('fast');
  if (
    agents.some(
      (a) =>
        (a.historicalConfidence ?? 0) > 0.6 &&
        (a.historicalConfidence ?? 0) <= 0.8
    )
  ) {
    phases.push('standard');
  }
  if (agents.some((a) => a.expertise > 0.85)) phases.push('expert');
  return phases;
}

function explainBudgetDecision(
  met: boolean,
  total: number,
  target: number
): string {
  if (met && total > target * 1.2) {
    return 'Confidence budget exceeded - high quality analysis achieved';
  }
  if (met) {
    return 'Confidence budget met - sufficient analysis completed';
  }
  const percentAchieved = (total / target) * 100;
  return `Confidence budget not met - achieved ${percentAchieved}% of target`;
}

/**
 * Converted from patterns/confidence-budget.prism — progressive analysis
 * with confidence budget tracking.
 *
 * NOTE: the original pattern dispatched agents itself in three phases
 * (fast → standard → expert) via `agent.analyze(task)`. Pattern modules
 * receive pre-dispatched results, so this version *consumes* the engine's
 * results in the same phase order — classifying each result by its agent's
 * metadata — and stops charging the budget once it is met. The original's
 * mid-run time-limit checks are meaningless post-dispatch and are reported
 * only in metrics.
 */
export const confidenceBudget: PatternModule = {
  meta: {
    name: 'ConfidenceBudget',
    version: '2.0.0',
    description:
      'Progressive analysis with confidence budget tracking across fast, standard, and expert agent phases',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          task: { type: 'string' },
          minConfidence: { type: 'number' },
          maxAgents: { type: 'number' },
          timeLimit: { type: 'number' },
        },
      },
    },
    minAgents: 1,
  },

  async execute(ctx) {
    const minConfidenceTotal: number = ctx.input?.minConfidence ?? 3.0;
    const maxAgents: number = ctx.input?.maxAgents ?? 5;
    const timeLimit: number = ctx.input?.timeLimit ?? 5000;
    const startTime = Date.now();

    const agentById = new Map(ctx.agents.map((a) => [a.id, a]));
    const infoFor = (r: PatternAgentResult): PatternAgentInfo | undefined =>
      agentById.get(r.agentId);

    const consumed: PatternAgentResult[] = [];
    const usedIds = new Set<string>();
    const take = (rs: PatternAgentResult[]): void => {
      for (const r of rs) {
        consumed.push(r);
        usedIds.add(r.agentId);
      }
    };

    // Phase 1: fast, high-confidence agents.
    take(
      ctx.results.filter((r) => {
        const a = infoFor(r);
        return (
          !!a &&
          a.capabilities.includes('fast') &&
          (a.historicalConfidence ?? 0) > 0.8
        );
      })
    );
    let budgetMet = sumConfidence(consumed) >= minConfidenceTotal;

    // Phase 2: standard agents if needed (take only what we need).
    if (!budgetMet && consumed.length < maxAgents) {
      const standard = ctx.results.filter((r) => {
        const a = infoFor(r);
        return (
          !usedIds.has(r.agentId) &&
          !!a &&
          (a.historicalConfidence ?? 0) > 0.6
        );
      });
      take(standard.slice(0, maxAgents - consumed.length));
      budgetMet = sumConfidence(consumed) >= minConfidenceTotal;
    }

    // Phase 3: expert agents as a last resort (expensive — use one).
    if (!budgetMet && consumed.length < maxAgents) {
      const experts = ctx.results.filter((r) => {
        const a = infoFor(r);
        return !usedIds.has(r.agentId) && !!a && a.expertise > 0.85;
      });
      if (experts.length > 0) take([experts[0]!]);
    }

    // Fallback (adaptation): if agent metadata matched no phase at all,
    // consume results in dispatch order so the budget math still applies.
    if (consumed.length === 0) {
      take(ctx.results.slice(0, maxAgents));
    }

    const totalConfidence = sumConfidence(consumed);
    budgetMet = totalConfidence >= minConfidenceTotal;

    const items = consumed.map((r) => cf(r.result, r.confidence));
    const usedAgents = consumed
      .map(infoFor)
      .filter((a): a is PatternAgentInfo => !!a);

    // The original wrote `uncertain if (budgetMet)` on a plain boolean
    // (which always reads as fully-confident); its branch comments make
    // clear the intent was to band on how well the budget was filled, so
    // we dispatch on the budget-fill ratio.
    const budgetRatio =
      minConfidenceTotal > 0
        ? Math.min(1, totalConfidence / minConfidenceTotal)
        : 1;

    let finalResult: unknown;
    let status: string;
    if (items.length === 0) {
      finalResult = bestEffortSynthesis(consumed, items);
      status = 'budget-insufficient';
    } else {
      const banded = uncertain(cf(budgetMet, budgetRatio), {
        high: () => ({
          result: val(synthesize(items)),
          status: 'budget-met',
        }),
        medium: () => ({
          result: conservativeSynthesis(items),
          status: 'budget-marginal',
        }),
        low: () => ({
          result: bestEffortSynthesis(consumed, items),
          status: 'budget-insufficient',
        }),
      });
      finalResult = banded.value.result;
      status = banded.value.status;
    }

    const avgConfidence =
      consumed.length > 0 ? totalConfidence / consumed.length : 0;

    return cf(
      {
        result: finalResult,
        confidence: avgConfidence,
        budgetMet,
        budgetStatus: status,
        metrics: {
          totalConfidence,
          targetConfidence: minConfidenceTotal,
          agentsUsed: consumed.length,
          maxAgents,
          timeElapsed: Date.now() - startTime,
          timeLimit,
          phases: getPhases(usedAgents),
        },
        analysis: consumed,
        reasoning: explainBudgetDecision(
          budgetMet,
          totalConfidence,
          minConfidenceTotal
        ),
      },
      avgConfidence
    );
  },
};

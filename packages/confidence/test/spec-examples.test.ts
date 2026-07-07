/**
 * The worked examples from docs/prism-specs.md, translated 1:1 — these are
 * the acceptance tests for replacing the DSL with this library.
 */
import { describe, expect, it } from 'vitest';
import {
  add,
  averageConfidence,
  best,
  cf,
  coalesce,
  conf,
  gate,
  mul,
  uncertain,
  val,
} from '../src';

describe('prism-specs.md worked examples', () => {
  it('confident arithmetic: sensors combine at min confidence', () => {
    // sensor1 = 23.1 ~> 0.8 ; sensor2 = 22.9 ~> 0.7
    const sensor1 = cf(23.1, 0.8);
    const sensor2 = cf(22.9, 0.7);

    // combined = sensor1 ~+ sensor2  // min(0.8, 0.7) = 0.7
    const combined = add(sensor1, sensor2);
    expect(combined.value).toBeCloseTo(46.0);
    expect(combined.confidence).toBe(0.7);

    // scaled = combined ~* 1.5      // maintains 0.7
    const scaled = mul(combined, 1.5);
    expect(scaled.confidence).toBe(0.7);
  });

  it('multi-level fallback: gpt ~?? claude ~?? gemini ~?? "unknown"', () => {
    const gpt = cf('gpt-answer', 0.3);
    const claude = cf('claude-answer', 0.6);
    const gemini = cf('gemini-answer', 0.9);

    expect(val(coalesce([gpt, claude, gemini, 'unknown']))).toBe(
      'claude-answer'
    );
    // All below threshold → cascade default
    expect(
      val(coalesce([cf('a', 0.1), cf('b', 0.2), 'unknown'], 0.5))
    ).toBe('unknown');
  });

  it('parallel selection: model1 ~||> model2 ~||> model3', () => {
    const m1 = cf('m1', 0.7);
    const m2 = cf('m2', 0.95);
    const m3 = cf('m3', 0.8);
    expect(best(m1, m2, m3)).toEqual(m2);
  });

  it('threshold gate with fallback: analysis ~@> "auto_approve" ~?? "manual_review"', () => {
    const confident = cf({ ok: true }, 0.92);
    const shaky = cf({ ok: true }, 0.4);

    const approve = (x: typeof confident) =>
      coalesce<string>([
        gate(x, 0.9, () => 'auto_approve') as never,
        'manual_review',
      ]);

    expect(val(approve(confident))).toBe('auto_approve');
    expect(val(approve(shaky))).toBe('manual_review');
  });

  it('uncertain if: deploy_to_production / staging / human_review', () => {
    const route = (c: number) =>
      val(
        uncertain(cf('analysis', c), {
          high: () => 'deploy_to_production',
          medium: () => 'deploy_to_staging',
          low: () => 'request_human_review',
        })
      );

    expect(route(0.9)).toBe('deploy_to_production');
    expect(route(0.8)).toBe('deploy_to_production'); // inclusive bound
    expect(route(0.65)).toBe('deploy_to_staging');
    expect(route(0.2)).toBe('request_human_review');
  });
});

describe('pattern library acceptance: simple-consensus in a few lines', () => {
  // The 45-line patterns/simple-consensus.prism, expressed with the library.
  interface AgentResult {
    agentName: string;
    result: unknown;
    confidence: number;
  }

  function simpleConsensus(agentResults: AgentResult[]) {
    const results = agentResults.map((r) => cf(r.result, r.confidence));
    const avg = averageConfidence(results);
    return cf(
      {
        status: avg > 0.7 ? 'consensus_reached' : 'low_consensus',
        agentCount: agentResults.length,
        agents: agentResults.map((r) => ({
          name: r.agentName,
          confidence: r.confidence,
          result: r.result,
        })),
      },
      avg
    );
  }

  it('reaches consensus above the 0.7 average', () => {
    const out = simpleConsensus([
      { agentName: 'a1', result: 'yes', confidence: 0.9 },
      { agentName: 'a2', result: 'yes', confidence: 0.8 },
    ]);
    expect(out.value.status).toBe('consensus_reached');
    expect(conf(out)).toBeCloseTo(0.85);
  });

  it('reports low consensus below it', () => {
    const out = simpleConsensus([
      { agentName: 'a1', result: 'yes', confidence: 0.5 },
      { agentName: 'a2', result: 'no', confidence: 0.6 },
    ]);
    expect(out.value.status).toBe('low_consensus');
  });
});

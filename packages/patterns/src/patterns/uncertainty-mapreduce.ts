import { cf } from '@parallaxai/confidence';
import type { PatternModule } from '../types';

/**
 * Converted from patterns/uncertainty-mapreduce.prism (v1.0.0) — the
 * manually-unrolled map phase (4 `if (agentCount >= n)` blocks) is a loop
 * now. As in the original, at most the first 4 results are folded into the
 * map phase, while the average still divides by the full result count.
 *
 * The original read `input.chunkSize ?? 3` into a variable it never used;
 * chunkSize remains in the input schema but is not consumed here.
 */
export const uncertaintyMapreduce: PatternModule = {
  meta: {
    name: 'UncertaintyMapReduce',
    version: '2.0.0',
    description:
      'Distributed processing with confidence tracking and fallback strategies',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          data: { type: 'array' },
          mapFunction: { type: 'string' },
          reduceFunction: { type: 'string' },
          chunkSize: { type: 'number' },
        },
      },
    },
    capabilities: ['processing', 'code-analysis'],
    minAgents: 2,
  },

  async execute(ctx) {
    const minMapConfidence = 0.7;
    const agentCount = ctx.results.length;

    // Map phase: the original unrolled at most 4 mapping agents
    const processed = ctx.results.slice(0, 4);
    const mapResults = processed.map((r) => r.result);
    const totalMapConfidence = processed.reduce(
      (sum, r) => sum + r.confidence,
      0
    );
    const successfulMaps = processed.filter(
      (r) => r.confidence >= minMapConfidence
    ).length;

    const avgMapConfidence =
      agentCount > 0 ? totalMapConfidence / agentCount : 0;

    // Determine if we have enough successful maps
    const mapQuality =
      successfulMaps >= 2 ? 'good' : successfulMaps >= 1 ? 'partial' : 'poor';

    // Simulated reduce phase result (the original combined map results here)
    const reduceResult = {
      combined: mapResults,
      mapQuality,
      processedChunks: agentCount,
    };

    // Map quality affects reduce confidence
    const reduceConfidence =
      mapQuality === 'good' ? 0.9 : mapQuality === 'partial' ? 0.6 : 0.3;
    const overallConfidence = reduceConfidence * (0.7 + 0.3 * avgMapConfidence);

    const finalResult = {
      value: reduceResult,
      confidence: overallConfidence,
      processing: {
        chunks: agentCount,
        avgMapConfidence,
        successfulMaps,
        mapQuality,
      },
      strategy:
        overallConfidence < 0.5
          ? 'Consider re-processing with different parameters'
          : 'Processing successful',
    };

    return cf(finalResult, overallConfidence);
  },
};

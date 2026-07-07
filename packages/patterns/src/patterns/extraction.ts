import { averageConfidence, cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

/**
 * The Prism script's `results.reduce((acc, r) => r.result.<field>, [])` —
 * the last matching result's array field, or [] when absent.
 */
function arrayFieldFromLast(
  results: PatternAgentResult[],
  field: string
): unknown[] {
  if (results.length === 0) return [];
  const last = results[results.length - 1]!;
  const value = (last.result as Record<string, unknown> | null | undefined)?.[
    field
  ];
  return Array.isArray(value) ? value : [];
}

/** Converted from patterns/extraction.prism (v1.0.0). */
export const extraction: PatternModule = {
  meta: {
    name: 'DocumentExtraction',
    version: '2.0.0',
    description:
      'Merges extraction results from specialized agents into a unified structured output',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          document: { type: 'string' },
        },
      },
    },
    capabilities: ['extraction'],
    minAgents: 2,
  },

  async execute(ctx) {
    const validResults = ctx.results.filter(
      (r) => r.confidence > 0 && r.result
    );

    const byAgent = (id: string) =>
      validResults.filter((r) => r.agentId === id);

    const dates = arrayFieldFromLast(byAgent('date-extractor'), 'dates');
    const amounts = arrayFieldFromLast(byAgent('amount-extractor'), 'amounts');
    const entityResults = byAgent('entity-extractor');
    const entities = arrayFieldFromLast(entityResults, 'entities');
    const people = arrayFieldFromLast(entityResults, 'people');
    const organizations = arrayFieldFromLast(entityResults, 'organizations');
    const addresses = arrayFieldFromLast(
      byAgent('address-extractor'),
      'addresses'
    );

    const dateCount = dates.length;
    const amountCount = amounts.length;
    const entityCount = entities.length;
    const addressCount = addresses.length;
    const totalExtractions =
      dateCount + amountCount + entityCount + addressCount;

    const avgConfidence = averageConfidence(
      validResults.map((r) => cf(r.result, r.confidence))
    );

    const extractionDetails = validResults.map((r) => ({
      agent: r.agentName,
      agentId: r.agentId,
      confidence: r.confidence,
      itemsExtracted: (r.result as { count?: number } | null | undefined)
        ?.count,
      reasoning: r.reasoning,
    }));

    const summary =
      totalExtractions > 0
        ? `Extracted ${totalExtractions} items: ${dateCount} dates, ` +
          `${amountCount} amounts, ${entityCount} entities, ` +
          `${addressCount} addresses`
        : 'No extractions found in document';

    return cf(
      {
        extractions: {
          dates,
          amounts,
          entities: {
            all: entities,
            people,
            organizations,
          },
          addresses,
        },
        summary: {
          totalItems: totalExtractions,
          breakdown: {
            dates: dateCount,
            amounts: amountCount,
            entities: entityCount,
            addresses: addressCount,
          },
          message: summary,
        },
        confidence: avgConfidence,
        agents: {
          total: validResults.length,
          details: extractionDetails,
        },
        metadata: {
          patternVersion: '2.0.0',
        },
      },
      avgConfidence
    );
  },
};

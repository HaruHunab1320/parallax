import {
  averageConfidence,
  cf,
  prop,
  uncertain,
  val,
} from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

/**
 * Converted from patterns/website-builder.prism (v1.0.0).
 *
 * NOTE: the original pattern orchestrated six sequential/parallel phases
 * itself, calling `agent.analyze(...)` mid-pattern (branding → visual →
 * content → architecture/implementation → deployment → QA) — not available
 * in pattern modules; the engine performs a single fan-out. This module
 * reconstructs the phase structure by grouping the fan-out results by agent
 * capability and combining per-phase confidence exactly as the original's
 * `calculateConfidence` did (simple mean of the six phase confidences).
 */

const hasCapability = (r: PatternAgentResult, caps: string[]): boolean =>
  (r.capabilities ?? []).some((c) => caps.includes(c));

/** Safe field access on an agent result payload (Prism `~.`). */
const field = (
  r: PatternAgentResult | null | undefined,
  path: string
): unknown => val(prop(r?.result ?? null, path));

interface BrandIdentity {
  name: unknown;
  mission: unknown;
  guidelines: unknown;
}

export const websiteBuilder: PatternModule = {
  meta: {
    name: 'WebsiteBuilder',
    version: '2.0.0',
    description: 'Orchestrates multiple agents to build a complete website',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          companyType: { type: 'string' },
          style: { type: 'string' },
          features: { type: 'array' },
        },
      },
    },
    minAgents: 10,
    metadata: { requiresLlm: true },
  },

  async execute(ctx) {
    const results = ctx.results;
    const find = (caps: string[]) =>
      results.find((r) => hasCapability(r, caps)) ?? null;
    const filter = (caps: string[]) =>
      results.filter((r) => hasCapability(r, caps));
    const asConfident = (rs: PatternAgentResult[]) =>
      rs.map((r) => cf(r.result, r.confidence));

    // Phase 1: Brand Foundation
    const brandingResult = find(['branding']);

    // Prism `uncertain if (brandIdentity)` with bounds {high: 0.8, medium: 0.5}
    const brand = uncertain<unknown, BrandIdentity>(
      cf(brandingResult?.result ?? null, brandingResult?.confidence ?? 0),
      {
        high: (v) => ({
          name: val(prop(v, 'name')),
          mission: val(prop(v, 'mission')),
          guidelines: val(prop(v, 'guidelines')),
        }),
        // NOTE: original pattern re-dispatched the branding agent with a more
        // specific prompt at medium confidence — cannot re-dispatch from a
        // pattern module; the identity is extracted from the result as-is.
        medium: (v) => ({
          name: val(prop(v, 'name')),
          mission: val(prop(v, 'mission')),
          guidelines: val(prop(v, 'guidelines')),
        }),
        // NOTE: original called getDefaultGuidelines() — not available;
        // guidelines fall back to null.
        low: () => ({
          name: 'TechCorp Solutions',
          mission: 'Innovation for tomorrow',
          guidelines: null,
        }),
      }
    ).value;

    const companyName = brand.name ?? 'TechCorp Solutions';

    // Phase 2: Visual Assets (original parallel order: logo, design system,
    // hero graphics)
    const visualResults = filter(['design', 'visual', 'ui']);
    const logoResult = visualResults[0] ?? null;
    const designSystemResult = visualResults[1] ?? null;

    // Phase 3: Content Creation (original parallel order: homepage, about,
    // products, blog, legal)
    const contentResults = filter(['writing', 'content', 'copy']);
    const blogResult = contentResults[3] ?? null;

    // Phase 4: Technical Implementation (original implementation array:
    // frontend, backend, database, seo)
    const frontendResult = find(['frontend']);
    const backendResult = find(['backend']);
    const databaseResult = find(['database']);
    const seoResult = find(['seo']);
    const implementationResults = [
      frontendResult,
      backendResult,
      databaseResult,
      seoResult,
    ].filter((r): r is PatternAgentResult => r !== null);

    // Phase 5: Deployment
    const deploymentResult = find(['devops']);

    // Phase 6: Quality Assurance (accessibility, performance, compatibility)
    const accessibilityResult = find(['accessibility']);
    const performanceResult = find(['performance']);
    const testingResult = find(['testing']);
    const qaResults = [
      accessibilityResult,
      performanceResult,
      testingResult,
    ].filter((r): r is PatternAgentResult => r !== null);

    // NOTE: original called aggregateQualityScores(qaResults) — not
    // available; the mean QA confidence stands in for the quality score.
    const websiteQuality = averageConfidence(asConfident(qaResults));

    // calculateConfidence([...]) in the original was a simple mean
    const phaseConfidences = [
      brandingResult?.confidence ?? 0,
      averageConfidence(asConfident(visualResults)),
      averageConfidence(asConfident(contentResults)),
      averageConfidence(asConfident(implementationResults)),
      deploymentResult?.confidence ?? 0,
      websiteQuality,
    ];
    const overallConfidence =
      phaseConfidences.reduce((sum, c) => sum + c, 0) /
      phaseConfidences.length;

    // NOTE: original called generateRecommendations(qaResults,
    // websiteQuality) — not available; recommendations are derived from
    // low-confidence QA checks instead.
    const recommendations: string[] = [];
    if (websiteQuality < 0.7) {
      recommendations.push('Review QA results before launch');
    }
    for (const qa of qaResults) {
      if (qa.confidence < 0.7) {
        recommendations.push(
          `Low confidence in ${qa.agentName} checks - manual verification recommended`
        );
      }
    }

    const result = {
      success: true,
      website: {
        url: field(deploymentResult, 'url') ?? null,
        adminPanel: field(deploymentResult, 'adminUrl') ?? null,
        staging: field(deploymentResult, 'stagingUrl') ?? null,
      },
      company: {
        name: companyName,
        brand: brandingResult?.result ?? null,
        assets: {
          logo: field(logoResult, 'files') ?? null,
          designSystem: designSystemResult?.result ?? null,
        },
      },
      content: {
        pages: contentResults.length,
        blogPosts: field(blogResult, 'posts') ?? [],
        // NOTE: original called countWords(websiteContent) — not available.
        totalWords: null,
      },
      technical: {
        frontend: field(frontendResult, 'technology') ?? null,
        backend: field(backendResult, 'technology') ?? 'Static',
        hosting: field(deploymentResult, 'platform') ?? null,
        performance: field(performanceResult, 'scores') ?? null,
      },
      timeline: {
        // NOTE: original called calculateTotalTime() — not available.
        total: null,
        phases: {
          branding: '5 minutes',
          design: '10 minutes',
          content: '15 minutes',
          development: '20 minutes',
          deployment: '5 minutes',
          testing: '5 minutes',
        },
      },
      confidence: overallConfidence,
      recommendations,
    };

    return cf(result, overallConfidence);
  },
};

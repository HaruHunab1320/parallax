import { cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

/** Shape of the per-check payloads the translation agents return. */
type CheckPayload = Record<string, any>;

const payload = (r: PatternAgentResult): CheckPayload =>
  r.result as CheckPayload;

/** Converted from patterns/translation.prism (v1.0.0). */
export const translation: PatternModule = {
  meta: {
    name: 'TranslationVerification',
    version: '2.0.0',
    description:
      'Translates text and verifies quality via round-trip verification',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          text: { type: 'string' },
          sourceLanguage: { type: 'string' },
          targetLanguage: { type: 'string' },
        },
      },
    },
    capabilities: ['translation', 'verification'],
    minAgents: 2,
  },

  async execute(ctx) {
    // Filter to only successful results with a payload
    const validResults = ctx.results.filter(
      (r) => r.confidence > 0 && r.result
    );

    const byType = (checkType: string): PatternAgentResult[] =>
      validResults.filter((r) => payload(r).checkType === checkType);

    const translationResults = byType('translation');
    const roundtripResults = byType('roundtrip');
    const qualityResults = byType('quality');

    // The .prism's `reduce((acc, r) => r, null)` kept the LAST element of
    // each filtered list (despite its "take first" comment) — preserved.
    const last = (rs: PatternAgentResult[]): PatternAgentResult | null =>
      rs.length > 0 ? rs[rs.length - 1]! : null;

    const translationCheck = last(translationResults);
    const roundtripCheck = last(roundtripResults);
    const qualityCheck = last(qualityResults);

    // Primary translation from translator agent
    const primaryTranslation = translationCheck
      ? payload(translationCheck).translation
      : '';
    const translatorNotes = translationCheck
      ? payload(translationCheck).notes
      : '';

    // Round-trip verification results
    const roundtripPassed = roundtripCheck
      ? payload(roundtripCheck).passed
      : false;
    const roundtripSimilarity = roundtripCheck
      ? payload(roundtripCheck).similarity
      : 0;
    const backTranslation = roundtripCheck
      ? payload(roundtripCheck).backTranslation
      : '';
    const meaningPreserved = roundtripCheck
      ? payload(roundtripCheck).meaningPreserved
      : false;
    const meaningDifferences = roundtripCheck
      ? payload(roundtripCheck).differences
      : [];
    const lostNuances = roundtripCheck
      ? payload(roundtripCheck).lostNuances
      : [];

    // Quality check results
    const qualityPassed = qualityCheck ? payload(qualityCheck).passed : false;
    const qualityScore = qualityCheck
      ? payload(qualityCheck).overallScore
      : 0;
    const qualityScores = qualityCheck ? payload(qualityCheck).scores : {};
    const qualityIssues = qualityCheck ? payload(qualityCheck).issues : [];
    const qualityStrengths = qualityCheck
      ? payload(qualityCheck).strengths
      : [];

    // Overall pass (round-trip AND quality must pass)
    const allPassed = roundtripPassed && qualityPassed;

    // Count verification checks only (not translator - no pass/fail)
    const verificationResults = validResults.filter(
      (r) =>
        payload(r).checkType === 'roundtrip' ||
        payload(r).checkType === 'quality'
    );
    const totalChecks = verificationResults.length;
    const passedCount = (roundtripPassed ? 1 : 0) + (qualityPassed ? 1 : 0);
    const failedChecks = totalChecks - passedCount;

    // Average score combining round-trip similarity and quality score
    const avgScore = (roundtripSimilarity + qualityScore) / 2;

    const status = allPassed
      ? 'approved'
      : failedChecks === totalChecks
        ? 'rejected'
        : 'needs_review';

    const summary = allPassed
      ? 'Translation verified - round-trip similarity and quality checks passed'
      : roundtripPassed === false && qualityPassed === false
        ? 'Translation has significant issues - both round-trip and quality checks failed'
        : roundtripPassed === false
          ? 'Translation may lose meaning - round-trip verification failed'
          : 'Translation has quality issues - flagging for human review';

    const checkDetails = verificationResults.map((r) => ({
      checkType: payload(r).checkType,
      agent: r.agentName,
      passed: payload(r).passed,
      confidence: r.confidence,
      reasoning: r.reasoning,
    }));

    const output = {
      status,
      approved: allPassed,
      translation: primaryTranslation,
      sourceLanguage: ctx.input?.data?.sourceLanguage,
      targetLanguage: ctx.input?.data?.targetLanguage,
      scores: {
        overall: avgScore,
        roundtripSimilarity,
        qualityScore,
        qualityBreakdown: qualityScores,
      },
      verification: {
        roundtrip: {
          passed: roundtripPassed,
          similarity: roundtripSimilarity,
          backTranslation,
          meaningPreserved,
          differences: meaningDifferences,
          lostNuances,
        },
        quality: {
          passed: qualityPassed,
          score: qualityScore,
          issues: qualityIssues,
          strengths: qualityStrengths,
        },
      },
      checks: {
        total: totalChecks,
        passed: passedCount,
        failed: failedChecks,
      },
      summary,
      details: checkDetails,
      translatorNotes,
      recommendation: allPassed
        ? 'Use translation - quality verified'
        : status === 'needs_review'
          ? 'Flag for human translator review'
          : 'Reject translation - significant quality issues',
      metadata: {
        patternVersion: '2.0.0',
      },
    };

    return cf(output, avgScore);
  },
};

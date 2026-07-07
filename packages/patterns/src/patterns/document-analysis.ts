import { averageConfidence, cf } from '@parallaxai/confidence';
import type { PatternAgentResult, PatternModule } from '../types';

/** Result payload shape emitted by the document-analysis agents. */
type AnalysisPayload = Record<string, any>;

const payloadOf = (r: PatternAgentResult): AnalysisPayload =>
  r.result as AnalysisPayload;

/** Converted from patterns/document-analysis.prism (v1.0.0). */
export const documentAnalysis: PatternModule = {
  meta: {
    name: 'DocumentAnalysis',
    version: '2.0.0',
    description:
      'Multi-perspective document analysis with parallel specialized agents',
    input: {
      type: 'object',
      schema: {
        type: 'object',
        properties: {
          document: { type: 'string' },
          title: { type: 'string' },
        },
      },
    },
    capabilities: ['document', 'analysis'],
    minAgents: 2,
  },

  async execute(ctx) {
    // Successful results with a payload attached.
    const validResults = ctx.results.filter((r) => r.confidence > 0 && r.result);

    const ofType = (analysisType: string): PatternAgentResult | null => {
      const matches = validResults.filter(
        (r) => payloadOf(r).analysisType === analysisType
      );
      // The original's `reduce((acc, r) => r, null)` keeps the LAST match
      // (despite its "take first" comment) — preserved here.
      return matches.length > 0 ? matches[matches.length - 1]! : null;
    };

    const summaryCheck = ofType('summary');
    const keypointsCheck = ofType('keypoints');
    const actionsCheck = ofType('actions');
    const sentimentCheck = ofType('sentiment');

    const summary = summaryCheck ? payloadOf(summaryCheck) : null;
    const keypoints = keypointsCheck ? payloadOf(keypointsCheck) : null;
    const actions = actionsCheck ? payloadOf(actionsCheck) : null;
    const sentiment = sentimentCheck ? payloadOf(sentimentCheck) : null;

    const totalAnalyses = validResults.length;
    const avgConfidence = averageConfidence(
      validResults.map((r) => cf(r.result, r.confidence))
    );

    const analysisDetails = validResults.map((r) => ({
      analysisType: payloadOf(r).analysisType,
      agent: r.agentName,
      confidence: r.confidence,
      reasoning: r.reasoning,
    }));

    return cf(
      {
        document: {
          title: summary ? summary.title : 'Unknown',
          type: summary ? summary.documentType : 'unknown',
          wordCount: summary ? summary.wordCount : 0,
        },
        summary: {
          mainTopic: summary ? summary.mainTopic : '',
          overview: summary ? summary.summary : '',
          conclusion: summary ? summary.conclusion : '',
        },
        keyPoints: {
          critical: keypoints ? keypoints.criticalPoints : [],
          supporting: keypoints ? keypoints.supportingPoints : [],
          factsAndData: keypoints ? keypoints.factsAndData : [],
          totalCount: keypoints ? keypoints.totalPoints : 0,
        },
        actionItems: {
          items: actions ? actions.actionItems : [],
          decisions: actions ? actions.decisions : [],
          followUps: actions ? actions.followUps : [],
          hasUrgentItems: actions ? actions.hasUrgentItems : false,
          totalCount: actions ? actions.totalActions : 0,
        },
        sentiment: {
          overall: sentiment ? sentiment.overallSentiment : 'unknown',
          score: sentiment ? sentiment.sentimentScore : 0,
          tone: sentiment ? sentiment.tone : {},
          emotionalIndicators: sentiment ? sentiment.emotionalIndicators : [],
          concerns: sentiment ? sentiment.concerns : [],
          professionalism: sentiment ? sentiment.professionalism : {},
        },
        metadata: {
          analysesCompleted: totalAnalyses,
          averageConfidence: avgConfidence,
          details: analysisDetails,
          patternVersion: '1.0.0',
        },
      },
      avgConfidence
    );
  },
};

export type {
  PatternAgentInfo,
  PatternAgentResult,
  PatternContext,
  PatternLogger,
  PatternMeta,
  PatternModule,
  PatternWorkspaceInfo,
} from './types';

import type { PatternModule } from './types';

import { cascadingRefinement } from './patterns/cascading-refinement';
import { codeReview } from './patterns/code-review';
import { confidenceBudget } from './patterns/confidence-budget';
import { confidenceCascade } from './patterns/confidence-cascade';
import { consensusBuilder } from './patterns/consensus-builder';
import { documentAnalysis } from './patterns/document-analysis';
import { enhancedConsensus } from './patterns/enhanced-consensus';
import { epistemicOrchestrator } from './patterns/epistemic-orchestrator';
import { extraction } from './patterns/extraction';
import { llmAugmentedDecision } from './patterns/llm-augmented-decision';
import { loadBalancer } from './patterns/load-balancer';
import { multiValidator } from './patterns/multi-validator';
import { parallelExploration } from './patterns/parallel-exploration';
import { promptTesting } from './patterns/prompt-testing';
import { qualityGate } from './patterns/quality-gate';
import { robustAnalysis } from './patterns/robust-analysis';
import { simpleConsensus } from './patterns/simple-consensus';
import { translation } from './patterns/translation';
import { uncertaintyMapreduce } from './patterns/uncertainty-mapreduce';
import { uncertaintyRouter } from './patterns/uncertainty-router';
import { voting } from './patterns/voting';
import { websiteBuilder } from './patterns/website-builder';

export {
  cascadingRefinement,
  codeReview,
  confidenceBudget,
  confidenceCascade,
  consensusBuilder,
  documentAnalysis,
  enhancedConsensus,
  epistemicOrchestrator,
  extraction,
  llmAugmentedDecision,
  loadBalancer,
  multiValidator,
  parallelExploration,
  promptTesting,
  qualityGate,
  robustAnalysis,
  simpleConsensus,
  translation,
  uncertaintyMapreduce,
  uncertaintyRouter,
  voting,
  websiteBuilder,
};

const modules: PatternModule[] = [
  cascadingRefinement,
  codeReview,
  confidenceBudget,
  confidenceCascade,
  consensusBuilder,
  documentAnalysis,
  enhancedConsensus,
  epistemicOrchestrator,
  extraction,
  llmAugmentedDecision,
  loadBalancer,
  multiValidator,
  parallelExploration,
  promptTesting,
  qualityGate,
  robustAnalysis,
  simpleConsensus,
  translation,
  uncertaintyMapreduce,
  uncertaintyRouter,
  voting,
  websiteBuilder,
];

/** All built-in patterns, keyed by their registered pattern name. */
export const patternManifest: Record<string, PatternModule> =
  Object.fromEntries(modules.map((m) => [m.meta.name, m]));

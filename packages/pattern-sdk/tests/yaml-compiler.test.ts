/**
 * YAML-to-Prism Compiler Tests
 *
 * Tests the compilation of YAML patterns to Prism DSL by:
 * 1. Compiling YAML to Prism
 * 2. Validating the generated Prism syntax
 *
 * Covers 30 common pattern use cases across different categories.
 */

import { describe, it, expect } from 'vitest';
import { compileYamlToPrism, CompileResult } from '../src/yaml/yaml-to-prism';
import { Validator } from '@prism-lang/validator';

const validator = new Validator();

/**
 * Helper to compile YAML and validate the resulting Prism
 */
function compileAndValidate(yaml: string): {
  compile: CompileResult;
  validation: { valid: boolean; errors: any[]; warnings: any[] };
  parseResult: { ast?: any; errors: any[] };
} {
  const compile = compileYamlToPrism(yaml);
  const validation = validator.validate(compile.prism);
  const parseResult = validator.parse(compile.prism);

  return { compile, validation, parseResult };
}

/**
 * Helper to assert successful compilation and validation
 */
function expectValid(yaml: string, description?: string): CompileResult {
  const { compile, validation, parseResult } = compileAndValidate(yaml);

  if (!validation.valid || parseResult.errors.length > 0) {
    console.error('Generated Prism:\n', compile.prism);
    console.error('Validation errors:', validation.errors);
    console.error('Parse errors:', parseResult.errors);
  }

  expect(validation.valid, `${description || 'Pattern'} should be valid`).toBe(true);
  expect(parseResult.errors, `${description || 'Pattern'} should parse without errors`).toHaveLength(0);

  return compile;
}

// =============================================================================
// CATEGORY 1: Simple Aggregation Patterns (1-5)
// =============================================================================

describe('Simple Aggregation Patterns', () => {
  it('1. Basic sentiment analysis with average confidence', () => {
    const yaml = `
name: SentimentAnalysis
description: Analyze text sentiment with multiple agents
input:
  text: string
agents:
  capabilities: [sentiment, analysis]
  min: 2
output:
  sentiment: $validResults
confidence: average
`;
    expectValid(yaml, 'Basic sentiment analysis');
  });

  it('2. Document summarization with min confidence', () => {
    const yaml = `
name: DocumentSummarizer
description: Summarize documents with minimum confidence
input:
  document: string
  maxLength:
    type: number
    default: 500
agents:
  capabilities: [summarization]
  min: 3
output:
  summary: $validResults
confidence: min
`;
    expectValid(yaml, 'Document summarization');
  });

  it('3. Code review with max confidence', () => {
    const yaml = `
name: CodeReview
description: Review code quality
input:
  code: string
  language: string
agents:
  capabilities: [code, review]
  min: 2
  max: 5
output:
  reviews: $validResults
confidence: max
`;
    expectValid(yaml, 'Code review');
  });

  it('4. Translation with single agent', () => {
    const yaml = `
name: SimpleTranslation
description: Translate text between languages
input:
  text: string
  targetLang: string
agents:
  capabilities: [translation]
  min: 1
output:
  translation: $validResults
confidence: average
`;
    expectValid(yaml, 'Simple translation');
  });

  it('5. Fact extraction with multiple required fields', () => {
    const yaml = `
name: FactExtraction
description: Extract facts from text
input:
  text:
    type: string
    description: Source text to extract facts from
  factTypes:
    type: array
    description: Types of facts to extract
    required: true
agents:
  capabilities: [extraction, facts]
  min: 2
output:
  facts: $validResults
  count: $totalCount
confidence: average
`;
    expectValid(yaml, 'Fact extraction');
  });
});

// =============================================================================
// CATEGORY 2: Grouped Result Patterns (6-12)
// =============================================================================

describe('Grouped Result Patterns', () => {
  it('6. Multi-perspective document analysis', () => {
    const yaml = `
name: DocumentAnalysis
description: Analyze documents from multiple perspectives
input:
  document: string
agents:
  capabilities: [document, analysis]
  min: 4
groups:
  summary:
    match: result.analysisType == "summary"
  keypoints:
    match: result.analysisType == "keypoints"
  sentiment:
    match: result.analysisType == "sentiment"
  actions:
    match: result.analysisType == "actions"
output:
  summary: $summary.result
  keypoints: $keypoints.result
  sentiment: $sentiment.result
  actions: $actions.result
confidence: average
`;
    expectValid(yaml, 'Multi-perspective document analysis');
  });

  it('7. A/B prompt testing with variants', () => {
    const yaml = `
name: PromptTesting
description: Test different prompt styles
input:
  query: string
agents:
  capabilities: [prompt, testing]
  min: 3
groups:
  concise:
    match: result.variantType == "concise"
  detailed:
    match: result.variantType == "detailed"
  creative:
    match: result.variantType == "creative"
output:
  variants:
    concise: $concise.result
    detailed: $detailed.result
    creative: $creative.result
confidence: average
`;
    expectValid(yaml, 'A/B prompt testing');
  });

  it('8. Multi-model classification', () => {
    const yaml = `
name: MultiModelClassification
description: Classify content using multiple models
input:
  content: string
  categories: array
agents:
  capabilities: [classification]
  min: 3
groups:
  primary:
    match: result.modelType == "primary"
  secondary:
    match: result.modelType == "secondary"
  fallback:
    match: result.modelType == "fallback"
output:
  primaryResult: $primary.result
  secondaryResult: $secondary.result
  fallbackResult: $fallback.result
confidence: max
`;
    expectValid(yaml, 'Multi-model classification');
  });

  it('9. Specialized extractors pattern', () => {
    const yaml = `
name: SpecializedExtractors
description: Extract different data types with specialized agents
input:
  document: string
agents:
  capabilities: [extraction]
  min: 3
groups:
  entities:
    match: result.extractorType == "entity"
  dates:
    match: result.extractorType == "date"
  amounts:
    match: result.extractorType == "amount"
output:
  entities: $entities.result.data
  dates: $dates.result.data
  amounts: $amounts.result.data
confidence: average
`;
    expectValid(yaml, 'Specialized extractors');
  });

  it('10. RAG quality gate with checks', () => {
    const yaml = `
name: RAGQualityGate
description: Validate RAG responses with quality checks
input:
  query: string
  response: string
  context: string
agents:
  capabilities: [validation, quality]
  min: 3
groups:
  groundedness:
    match: result.checkType == "groundedness"
  relevance:
    match: result.checkType == "relevance"
  completeness:
    match: result.checkType == "completeness"
output:
  groundedness: $groundedness.result
  relevance: $relevance.result
  completeness: $completeness.result
  passed: $avgConfidence
confidence: min
`;
    expectValid(yaml, 'RAG quality gate');
  });

  it('11. Translation verification', () => {
    const yaml = `
name: TranslationVerification
description: Verify translation quality
input:
  original: string
  translation: string
  sourceLang: string
  targetLang: string
agents:
  capabilities: [translation, verification]
  min: 3
groups:
  accuracy:
    match: result.checkType == "accuracy"
  fluency:
    match: result.checkType == "fluency"
  preservation:
    match: result.checkType == "preservation"
output:
  accuracy: $accuracy.result
  fluency: $fluency.result
  preservation: $preservation.result
confidence: average
`;
    expectValid(yaml, 'Translation verification');
  });

  it('12. Content moderation multi-check', () => {
    const yaml = `
name: ContentModeration
description: Check content against multiple policies
input:
  content: string
  policies: array
agents:
  capabilities: [moderation]
  min: 4
groups:
  toxicity:
    match: result.checkType == "toxicity"
  spam:
    match: result.checkType == "spam"
  misinformation:
    match: result.checkType == "misinformation"
  copyright:
    match: result.checkType == "copyright"
output:
  toxicity: $toxicity.result
  spam: $spam.result
  misinformation: $misinformation.result
  copyright: $copyright.result
  flagged: $validResults
confidence: min
`;
    expectValid(yaml, 'Content moderation');
  });
});

// =============================================================================
// CATEGORY 3: Aggregation Strategy Patterns (13-18)
// =============================================================================

describe('Aggregation Strategy Patterns', () => {
  it('13. Consensus voting pattern', () => {
    const yaml = `
name: ConsensusVoting
description: Build consensus through voting
input:
  question: string
  options: array
agents:
  capabilities: [voting, decision]
  min: 5
aggregation:
  strategy: consensus
  threshold: 0.7
  minVotes: 3
output:
  decision: $validResults
confidence: average
`;
    expectValid(yaml, 'Consensus voting');
  });

  it('14. Majority voting pattern', () => {
    const yaml = `
name: MajorityVote
description: Simple majority voting
input:
  options: array
agents:
  capabilities: [voting]
  min: 3
aggregation:
  strategy: voting
  method: majority
output:
  winner: $validResults
confidence: average
`;
    expectValid(yaml, 'Majority voting');
  });

  it('15. Unanimous voting pattern', () => {
    const yaml = `
name: UnanimousDecision
description: Require unanimous agreement
input:
  proposal: string
agents:
  capabilities: [decision]
  min: 3
aggregation:
  strategy: voting
  method: unanimous
output:
  approved: $validResults
confidence: min
`;
    expectValid(yaml, 'Unanimous voting');
  });

  it('16. Result merging pattern', () => {
    const yaml = `
name: ResultMerger
description: Merge results from multiple agents
input:
  data: object
agents:
  capabilities: [processing]
  min: 3
aggregation:
  strategy: merge
  fields: [entities, relationships, metadata]
output:
  merged: $validResults
confidence: average
`;
    expectValid(yaml, 'Result merging');
  });

  it('17. Best result selection', () => {
    const yaml = `
name: BestResult
description: Select the highest confidence result
input:
  query: string
agents:
  capabilities: [analysis]
  min: 3
aggregation:
  strategy: best
  by: confidence
output:
  best: $validResults
confidence: max
`;
    expectValid(yaml, 'Best result selection');
  });

  it('18. Weighted voting pattern', () => {
    const yaml = `
name: WeightedVoting
description: Voting with expertise weights
input:
  question: string
agents:
  capabilities: [expert, voting]
  min: 3
aggregation:
  strategy: voting
  method: weighted
output:
  decision: $validResults
confidence: weighted
`;
    expectValid(yaml, 'Weighted voting');
  });
});

// =============================================================================
// CATEGORY 4: Confidence Calculation Patterns (19-23)
// =============================================================================

describe('Confidence Calculation Patterns', () => {
  it('19. Weighted confidence by group', () => {
    const yaml = `
name: WeightedConfidence
description: Calculate confidence with group weights
input:
  data: string
agents:
  capabilities: [analysis]
  min: 3
groups:
  critical:
    match: result.priority == "high"
  normal:
    match: result.priority == "normal"
output:
  result: $validResults
confidence:
  method: weighted
  weights:
    critical: 0.7
    normal: 0.3
`;
    expectValid(yaml, 'Weighted confidence');
  });

  it('20. Custom confidence expression', () => {
    const yaml = `
name: CustomConfidence
description: Use custom confidence calculation
input:
  query: string
agents:
  capabilities: [analysis]
  min: 2
output:
  result: $validResults
confidence:
  method: custom
  expression: "validResults.length > 0 ? validResults[0].confidence * 0.9 : 0"
`;
    expectValid(yaml, 'Custom confidence');
  });

  it('21. Minimum confidence threshold', () => {
    const yaml = `
name: MinConfidenceRequired
description: Require minimum confidence from all agents
input:
  data: string
agents:
  capabilities: [validation]
  min: 3
output:
  validated: $validResults
confidence: min
`;
    expectValid(yaml, 'Minimum confidence');
  });

  it('22. Maximum confidence selection', () => {
    const yaml = `
name: MaxConfidenceSelection
description: Use highest confidence agent result
input:
  query: string
agents:
  capabilities: [search]
  min: 3
output:
  bestResult: $validResults
confidence: max
`;
    expectValid(yaml, 'Maximum confidence');
  });

  it('23. Average with outlier handling', () => {
    const yaml = `
name: AverageConfidence
description: Average confidence across agents
input:
  text: string
agents:
  capabilities: [analysis]
  min: 5
output:
  analysis: $validResults
  agentCount: $totalCount
confidence: average
`;
    expectValid(yaml, 'Average confidence');
  });
});

// =============================================================================
// CATEGORY 5: Fallback Patterns (24-27)
// =============================================================================

describe('Fallback Patterns', () => {
  it('24. Escalation on low confidence', () => {
    const yaml = `
name: EscalationPattern
description: Escalate to human when confidence is low
input:
  request: string
agents:
  capabilities: [support]
  min: 2
output:
  response: $validResults
confidence: average
fallback:
  condition: confidence < 0.5
  action: escalate
  target: human_review
`;
    expectValid(yaml, 'Escalation pattern');
  });

  it('25. Retry on failure', () => {
    const yaml = `
name: RetryPattern
description: Retry when confidence is insufficient
input:
  query: string
agents:
  capabilities: [search]
  min: 2
output:
  results: $validResults
confidence: average
fallback:
  condition: confidence < 0.6
  action: retry
  maxRetries: 3
`;
    expectValid(yaml, 'Retry pattern');
  });

  it('26. Default value fallback', () => {
    const yaml = `
name: DefaultFallback
description: Use default value when confidence is low
input:
  input: string
agents:
  capabilities: [processing]
  min: 1
output:
  result: $validResults
confidence: average
fallback:
  condition: confidence < 0.4
  action: default
  value:
    message: Unable to process with sufficient confidence
    status: fallback
`;
    expectValid(yaml, 'Default fallback');
  });

  it('27. Conditional escalation', () => {
    const yaml = `
name: ConditionalEscalation
description: Escalate based on multiple conditions
input:
  ticket: object
agents:
  capabilities: [triage]
  min: 2
output:
  classification: $validResults
confidence: min
fallback:
  condition: confidence < 0.7
  action: escalate
  target: senior_agent
`;
    expectValid(yaml, 'Conditional escalation');
  });
});

// =============================================================================
// CATEGORY 6: Domain-Specific Patterns (28-35)
// =============================================================================

describe('Domain-Specific Patterns', () => {
  it('28. Medical diagnosis support', () => {
    const yaml = `
name: MedicalDiagnosisSupport
description: Support medical diagnosis with multiple specialists
input:
  symptoms: array
  patientHistory: object
agents:
  capabilities: [medical, diagnosis]
  min: 3
groups:
  general:
    match: result.speciality == "general"
  specialist:
    match: result.speciality == "specialist"
output:
  generalAssessment: $general.result
  specialistOpinion: $specialist.result
  confidence: $avgConfidence
confidence: min
`;
    expectValid(yaml, 'Medical diagnosis support');
  });

  it('29. Legal document analysis', () => {
    const yaml = `
name: LegalDocumentAnalysis
description: Analyze legal documents for key clauses
input:
  document: string
  jurisdiction: string
agents:
  capabilities: [legal, analysis]
  min: 2
groups:
  risks:
    match: result.category == "risk"
  obligations:
    match: result.category == "obligation"
  rights:
    match: result.category == "right"
output:
  risks: $risks.result
  obligations: $obligations.result
  rights: $rights.result
confidence: average
`;
    expectValid(yaml, 'Legal document analysis');
  });

  it('30. Financial fraud detection', () => {
    const yaml = `
name: FraudDetection
description: Detect potential fraud in transactions
input:
  transaction: object
  userHistory: object
agents:
  capabilities: [fraud, detection]
  min: 3
groups:
  behavioral:
    match: result.analysisType == "behavioral"
  pattern:
    match: result.analysisType == "pattern"
  anomaly:
    match: result.analysisType == "anomaly"
output:
  behavioral: $behavioral.result
  pattern: $pattern.result
  anomaly: $anomaly.result
  riskScore: $avgConfidence
confidence: max
`;
    expectValid(yaml, 'Financial fraud detection');
  });

  it('31. Customer support routing', () => {
    const yaml = `
name: SupportRouting
description: Route customer support tickets
input:
  ticket: string
  priority: string
agents:
  capabilities: [routing, classification]
  min: 2
aggregation:
  strategy: consensus
  threshold: 0.8
output:
  department: $validResults
  priority: $validResults
confidence: average
`;
    expectValid(yaml, 'Customer support routing');
  });

  it('32. Resume screening', () => {
    const yaml = `
name: ResumeScreening
description: Screen resumes against job requirements
input:
  resume: string
  jobDescription: string
  requirements: array
agents:
  capabilities: [hr, screening]
  min: 2
groups:
  skills:
    match: result.category == "skills"
  experience:
    match: result.category == "experience"
  education:
    match: result.category == "education"
output:
  skillsMatch: $skills.result
  experienceMatch: $experience.result
  educationMatch: $education.result
  overallScore: $avgConfidence
confidence: average
`;
    expectValid(yaml, 'Resume screening');
  });

  it('33. Product recommendation', () => {
    const yaml = `
name: ProductRecommendation
description: Generate product recommendations
input:
  userProfile: object
  browsingHistory: array
  preferences: object
agents:
  capabilities: [recommendation]
  min: 3
aggregation:
  strategy: merge
output:
  recommendations: $validResults
  personalizationScore: $avgConfidence
confidence: average
`;
    expectValid(yaml, 'Product recommendation');
  });

  it('34. News article verification', () => {
    const yaml = `
name: NewsVerification
description: Verify news article accuracy
input:
  article: string
  sources: array
agents:
  capabilities: [factcheck, verification]
  min: 3
groups:
  facts:
    match: result.checkType == "factual"
  sources:
    match: result.checkType == "source"
  bias:
    match: result.checkType == "bias"
output:
  factualAccuracy: $facts.result
  sourceReliability: $sources.result
  biasAssessment: $bias.result
confidence: min
`;
    expectValid(yaml, 'News verification');
  });

  it('35. Code security audit', () => {
    const yaml = `
name: SecurityAudit
description: Audit code for security vulnerabilities
input:
  code: string
  language: string
  framework: string
agents:
  capabilities: [security, audit]
  min: 3
groups:
  injection:
    match: result.vulnerabilityType == "injection"
  authentication:
    match: result.vulnerabilityType == "authentication"
  dataExposure:
    match: result.vulnerabilityType == "data_exposure"
output:
  injectionRisks: $injection.result
  authIssues: $authentication.result
  dataExposure: $dataExposure.result
  overallRisk: $avgConfidence
confidence: max
`;
    expectValid(yaml, 'Security audit');
  });
});

// =============================================================================
// CATEGORY 7: Edge Cases and Complex Patterns (36-40)
// =============================================================================

describe('Edge Cases and Complex Patterns', () => {
  it('36. Minimal pattern (bare minimum)', () => {
    const yaml = `
name: MinimalPattern
description: Simplest possible pattern
input:
  data: string
output:
  result: $validResults
`;
    expectValid(yaml, 'Minimal pattern');
  });

  it('37. Deep nested output structure', () => {
    const yaml = `
name: NestedOutput
description: Pattern with deeply nested output
input:
  input: string
agents:
  capabilities: [processing]
  min: 2
groups:
  main:
    match: result.type == "main"
output:
  result:
    level1:
      level2:
        level3:
          data: $main.result
          metadata:
            processed: true
            source: parallax
confidence: average
`;
    expectValid(yaml, 'Nested output');
  });

  it('38. Array output mapping', () => {
    const yaml = `
name: ArrayOutput
description: Pattern with array outputs
input:
  items: array
agents:
  capabilities: [processing]
  min: 2
output:
  results: $validResults
  items:
    - first
    - second
    - third
confidence: average
`;
    expectValid(yaml, 'Array output');
  });

  it('39. Multiple input types', () => {
    const yaml = `
name: MultipleInputTypes
description: Pattern with various input types
input:
  text:
    type: string
    description: Text input
    required: true
  count:
    type: number
    default: 10
  enabled:
    type: boolean
    default: true
  config:
    type: object
    required: false
  tags:
    type: array
    default: []
agents:
  capabilities: [processing]
  min: 1
output:
  processed: $validResults
confidence: average
`;
    expectValid(yaml, 'Multiple input types');
  });

  it('40. All features combined', () => {
    const yaml = `
name: FullFeaturedPattern
description: Pattern using all available features
input:
  query:
    type: string
    description: Main query input
    required: true
  options:
    type: object
    required: false
agents:
  capabilities: [analysis, processing]
  min: 3
  max: 5
groups:
  primary:
    match: result.category == "primary"
    take: first
  secondary:
    match: result.category == "secondary"
    take: all
aggregation:
  strategy: consensus
  threshold: 0.75
output:
  primary: $primary.result
  secondary: $secondary.result
  totalAgents: $totalCount
  averageConf: $avgConfidence
confidence:
  method: weighted
  weights:
    primary: 0.6
    secondary: 0.4
fallback:
  condition: confidence < 0.5
  action: escalate
  target: expert_review
`;
    expectValid(yaml, 'Full featured pattern');
  });
});

// =============================================================================
// Output verification tests
// =============================================================================

describe('Compilation Output Verification', () => {
  it('generates correct metadata header', () => {
    const yaml = `
name: TestPattern
version: 2.0.0
description: Test description
input:
  text: string
agents:
  capabilities: [test]
  min: 2
  max: 4
output:
  result: $validResults
`;
    const result = expectValid(yaml);

    expect(result.prism).toContain('@name TestPattern');
    expect(result.prism).toContain('@version 2.0.0');
    expect(result.prism).toContain('@description Test description');
    expect(result.prism).toContain('@minAgents 2');
    expect(result.prism).toContain('@maxAgents 4');
    expect(result.metadata.name).toBe('TestPattern');
    expect(result.metadata.version).toBe('2.0.0');
  });

  it('generates group filters correctly', () => {
    const yaml = `
name: GroupTest
description: Test group generation
input:
  data: string
agents:
  capabilities: [test]
  min: 2
groups:
  typeA:
    match: result.type == "A"
  typeB:
    match: result.type == "B"
output:
  a: $typeA.result
  b: $typeB.result
`;
    const result = expectValid(yaml);

    expect(result.prism).toContain('typeAResults = validResults.filter');
    expect(result.prism).toContain('typeBResults = validResults.filter');
    expect(result.prism).toContain('r.result.type == "A"');
    expect(result.prism).toContain('r.result.type == "B"');
    expect(result.metadata.groups).toContain('typeA');
    expect(result.metadata.groups).toContain('typeB');
  });

  it('generates confidence calculation correctly', () => {
    const yaml = `
name: ConfidenceTest
description: Test confidence calculation
input:
  data: string
output:
  result: $validResults
confidence: min
`;
    const result = expectValid(yaml);

    expect(result.prism).toContain('finalConfidence');
    expect(result.prism).toContain('reduce');
    expect(result.metadata.confidenceMethod).toBe('min');
  });

  it('includes output with confidence operator', () => {
    const yaml = `
name: OutputTest
description: Test output generation
input:
  data: string
output:
  result: $validResults
`;
    const result = expectValid(yaml);

    expect(result.prism).toContain('output ~> finalConfidence');
  });
});

// =============================================================================
// Error handling tests
// =============================================================================

describe('Error Handling', () => {
  it('rejects invalid YAML schema', () => {
    const invalidYaml = `
name: InvalidPattern
# Missing description
input:
  data: string
output:
  result: $validResults
`;
    expect(() => compileYamlToPrism(invalidYaml)).toThrow();
  });

  it('rejects missing output', () => {
    const invalidYaml = `
name: NoOutput
description: Pattern without output
input:
  data: string
`;
    expect(() => compileYamlToPrism(invalidYaml)).toThrow();
  });

  it('rejects missing input', () => {
    const invalidYaml = `
name: NoInput
description: Pattern without input
output:
  result: $validResults
`;
    expect(() => compileYamlToPrism(invalidYaml)).toThrow();
  });
});

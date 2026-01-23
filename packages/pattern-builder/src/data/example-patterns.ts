/**
 * Example Patterns
 *
 * Pre-built patterns that can be loaded into the canvas
 */

import { PatternNode, PatternEdge } from '../types';

export interface ExamplePattern {
  id: string;
  name: string;
  description: string;
  category: 'voting' | 'quality' | 'extraction' | 'verification' | 'performance';
  nodes: Omit<PatternNode, 'id'>[];
  edges: Array<{ source: number; target: number; sourceHandle?: string }>;
}

export const EXAMPLE_PATTERNS: ExamplePattern[] = [
  // Pattern 1: Multi-Agent Voting
  {
    id: 'multi-agent-voting',
    name: 'Multi-Agent Voting',
    description: 'Content moderation with majority vote from multiple agents',
    category: 'voting',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Content Input',
          fields: [
            { name: 'content', type: 'string', required: true },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Moderators',
          capabilities: ['content-moderation'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Parallel Review',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'voting',
        position: { x: 740, y: 200 },
        data: {
          label: 'Majority Vote',
          method: 'majority',
        },
      },
      {
        type: 'output',
        position: { x: 970, y: 200 },
        data: {
          label: 'Decision',
          mappings: [
            { name: 'verdict', reference: '$vote.result' },
            { name: 'confidence', reference: '$vote.confidence' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
    ],
  },

  // Pattern 2: Quality-Gated Analysis
  {
    id: 'quality-gated-analysis',
    name: 'Quality-Gated Analysis',
    description: 'Document analysis with consensus building and quality threshold',
    category: 'quality',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 150 },
        data: {
          label: 'Document',
          fields: [
            { name: 'document', type: 'string', required: true },
            { name: 'analysisType', type: 'string', required: false },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 150 },
        data: {
          label: 'Analysts',
          capabilities: ['document-analysis', 'reasoning'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 150 },
        data: {
          label: 'Analyze',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'consensus',
        position: { x: 740, y: 150 },
        data: {
          label: 'Build Consensus',
          threshold: 0.8,
          minVotes: 2,
        },
      },
      {
        type: 'threshold',
        position: { x: 970, y: 150 },
        data: {
          label: 'Quality Gate',
          minConfidence: 0.7,
          action: 'fallback',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 50 },
        data: {
          label: 'Analysis Result',
          mappings: [
            { name: 'analysis', reference: '$consensus.result' },
            { name: 'confidence', reference: '$consensus.confidence' },
          ],
        },
      },
      {
        type: 'fallback',
        position: { x: 1200, y: 250 },
        data: {
          label: 'Human Review',
          fallbackType: 'escalate',
          fallbackTarget: 'human-review-queue',
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5, sourceHandle: 'true' },
      { source: 4, target: 6, sourceHandle: 'false' },
    ],
  },

  // Pattern 3: Specialized Extractors
  {
    id: 'specialized-extractors',
    name: 'Specialized Extractors',
    description: 'Route document parts to specialized extraction agents and merge results',
    category: 'extraction',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Mixed Document',
          fields: [
            { name: 'document', type: 'object', required: true },
            { name: 'extractionConfig', type: 'object', required: false },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Extractors',
          capabilities: ['table-extraction', 'text-extraction', 'image-ocr'],
          minAgents: 3,
        },
      },
      {
        type: 'delegate',
        position: { x: 510, y: 200 },
        data: {
          label: 'Route by Type',
          assignmentStrategy: 'capability',
        },
      },
      {
        type: 'parallel',
        position: { x: 740, y: 200 },
        data: {
          label: 'Extract All',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'merge',
        position: { x: 970, y: 200 },
        data: {
          label: 'Combine Results',
          strategy: 'deep',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 200 },
        data: {
          label: 'Extracted Data',
          mappings: [
            { name: 'tables', reference: '$merged.tables' },
            { name: 'text', reference: '$merged.text' },
            { name: 'images', reference: '$merged.images' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5 },
    ],
  },

  // Pattern 4: Translation Verification
  {
    id: 'translation-verification',
    name: 'Translation Verification',
    description: 'Multi-agent translation with consensus check and retry on low confidence',
    category: 'verification',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Source Text',
          fields: [
            { name: 'text', type: 'string', required: true },
            { name: 'sourceLang', type: 'string', required: true },
            { name: 'targetLang', type: 'string', required: true },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Translators',
          capabilities: ['translation', 'language-expert'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Translate',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'consensus',
        position: { x: 740, y: 200 },
        data: {
          label: 'Agreement Check',
          threshold: 0.85,
          minVotes: 2,
        },
      },
      {
        type: 'condition',
        position: { x: 970, y: 200 },
        data: {
          label: 'High Confidence?',
          expression: 'confidence >= 0.85',
          trueLabel: 'Accept',
          falseLabel: 'Retry',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 100 },
        data: {
          label: 'Translation',
          mappings: [
            { name: 'translated', reference: '$consensus.result' },
            { name: 'confidence', reference: '$consensus.confidence' },
          ],
        },
      },
      {
        type: 'retry',
        position: { x: 1200, y: 300 },
        data: {
          label: 'Retry Translation',
          maxRetries: 2,
          backoffMs: 1000,
          backoffMultiplier: 1.5,
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5, sourceHandle: 'true' },
      { source: 4, target: 6, sourceHandle: 'false' },
    ],
  },

  // Pattern 5: Race (Fastest Response)
  {
    id: 'race-fastest-response',
    name: 'Race - Fastest Response',
    description: 'Get the fastest response that meets quality threshold',
    category: 'performance',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Query',
          fields: [
            { name: 'query', type: 'string', required: true },
            { name: 'context', type: 'object', required: false },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Fast Models',
          capabilities: ['fast-inference', 'qa'],
          minAgents: 3,
        },
      },
      {
        type: 'race',
        position: { x: 510, y: 200 },
        data: {
          label: 'First Response',
          timeout: 5000,
          minConfidence: 0.6,
        },
      },
      {
        type: 'threshold',
        position: { x: 740, y: 200 },
        data: {
          label: 'Quality Check',
          minConfidence: 0.7,
          action: 'pass',
        },
      },
      {
        type: 'output',
        position: { x: 970, y: 200 },
        data: {
          label: 'Answer',
          mappings: [
            { name: 'response', reference: '$winner.result' },
            { name: 'latency', reference: '$winner.latency' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
    ],
  },

  // Pattern 6: PR Review Bot
  {
    id: 'pr-review-bot',
    name: 'PR Review Bot',
    description: 'Automated code review with multiple specialized reviewers',
    category: 'quality',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Pull Request',
          fields: [
            { name: 'diff', type: 'string', required: true },
            { name: 'prNumber', type: 'number', required: true },
            { name: 'repository', type: 'string', required: true },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Code Reviewers',
          capabilities: ['code-review', 'security-audit', 'style-check'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Review Code',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'merge',
        position: { x: 740, y: 200 },
        data: {
          label: 'Combine Feedback',
          strategy: 'concat',
        },
      },
      {
        type: 'consensus',
        position: { x: 970, y: 200 },
        data: {
          label: 'Approve/Reject',
          threshold: 0.7,
          minVotes: 2,
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 200 },
        data: {
          label: 'Review Result',
          mappings: [
            { name: 'decision', reference: '$consensus.result' },
            { name: 'comments', reference: '$merged.comments' },
            { name: 'suggestions', reference: '$merged.suggestions' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5 },
    ],
  },

  // Pattern 7: RAG Quality Gate
  {
    id: 'rag-quality-gate',
    name: 'RAG Quality Gate',
    description: 'Retrieval-augmented generation with quality filtering on retrieved chunks',
    category: 'quality',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Query + Context',
          fields: [
            { name: 'query', type: 'string', required: true },
            { name: 'retrievedChunks', type: 'array', required: true },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Relevance Scorers',
          capabilities: ['relevance-scoring', 'semantic-analysis'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Score Chunks',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'threshold',
        position: { x: 740, y: 200 },
        data: {
          label: 'Relevance Gate',
          minConfidence: 0.75,
          action: 'pass',
        },
      },
      {
        type: 'merge',
        position: { x: 970, y: 200 },
        data: {
          label: 'Combine Valid',
          strategy: 'concat',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 200 },
        data: {
          label: 'Filtered Context',
          mappings: [
            { name: 'relevantChunks', reference: '$merged' },
            { name: 'avgRelevance', reference: '$threshold.avgScore' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5 },
    ],
  },

  // Pattern 8: Prompt A/B Testing
  {
    id: 'prompt-ab-testing',
    name: 'Prompt A/B Testing',
    description: 'Test multiple prompt variants and compare results',
    category: 'verification',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Test Input',
          fields: [
            { name: 'testCase', type: 'object', required: true },
            { name: 'promptVariants', type: 'array', required: true },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Prompt Testers',
          capabilities: ['prompt-execution'],
          minAgents: 3,
        },
      },
      {
        type: 'delegate',
        position: { x: 510, y: 200 },
        data: {
          label: 'Assign Variants',
          assignmentStrategy: 'round-robin',
        },
      },
      {
        type: 'parallel',
        position: { x: 740, y: 200 },
        data: {
          label: 'Run All Variants',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'voting',
        position: { x: 970, y: 200 },
        data: {
          label: 'Rank Results',
          method: 'weighted',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 200 },
        data: {
          label: 'Test Results',
          mappings: [
            { name: 'winner', reference: '$vote.winner' },
            { name: 'rankings', reference: '$vote.rankings' },
            { name: 'allResults', reference: '$parallel.results' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5 },
    ],
  },

  // Pattern 9: Fact Checking Pipeline
  {
    id: 'fact-checking',
    name: 'Fact Checking Pipeline',
    description: 'Verify claims using multiple agents with source citations',
    category: 'verification',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Claim',
          fields: [
            { name: 'claim', type: 'string', required: true },
            { name: 'context', type: 'string', required: false },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Fact Checkers',
          capabilities: ['fact-verification', 'source-retrieval'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Verify Claim',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'consensus',
        position: { x: 740, y: 200 },
        data: {
          label: 'Verdict Agreement',
          threshold: 0.7,
          minVotes: 2,
        },
      },
      {
        type: 'merge',
        position: { x: 970, y: 200 },
        data: {
          label: 'Combine Sources',
          strategy: 'concat',
          fields: ['sources', 'evidence'],
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 200 },
        data: {
          label: 'Verification Result',
          mappings: [
            { name: 'verdict', reference: '$consensus.result' },
            { name: 'confidence', reference: '$consensus.confidence' },
            { name: 'sources', reference: '$merged.sources' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5 },
    ],
  },

  // Pattern 10: Sentiment Analysis Ensemble
  {
    id: 'sentiment-ensemble',
    name: 'Sentiment Analysis Ensemble',
    description: 'Multi-model sentiment analysis with weighted voting',
    category: 'voting',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Text Input',
          fields: [
            { name: 'text', type: 'string', required: true },
            { name: 'language', type: 'string', required: false },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Sentiment Models',
          capabilities: ['sentiment-analysis'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Analyze Sentiment',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'voting',
        position: { x: 740, y: 200 },
        data: {
          label: 'Weighted Vote',
          method: 'weighted',
          minVotes: 2,
        },
      },
      {
        type: 'output',
        position: { x: 970, y: 200 },
        data: {
          label: 'Sentiment Result',
          mappings: [
            { name: 'sentiment', reference: '$vote.result' },
            { name: 'score', reference: '$vote.score' },
            { name: 'breakdown', reference: '$parallel.results' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
    ],
  },

  // Pattern 11: Resilient API Call
  {
    id: 'resilient-api',
    name: 'Resilient API Call',
    description: 'API call with retry logic and fallback providers',
    category: 'performance',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'API Request',
          fields: [
            { name: 'endpoint', type: 'string', required: true },
            { name: 'payload', type: 'object', required: true },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'API Providers',
          capabilities: ['api-call', 'http-client'],
          minAgents: 1,
        },
      },
      {
        type: 'retry',
        position: { x: 510, y: 200 },
        data: {
          label: 'Retry on Failure',
          maxRetries: 3,
          backoffMs: 1000,
          backoffMultiplier: 2,
        },
      },
      {
        type: 'threshold',
        position: { x: 740, y: 200 },
        data: {
          label: 'Success Check',
          minConfidence: 0.5,
          action: 'fallback',
        },
      },
      {
        type: 'fallback',
        position: { x: 970, y: 100 },
        data: {
          label: 'Backup Provider',
          fallbackType: 'agent',
          fallbackTarget: 'backup-api-agent',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 200 },
        data: {
          label: 'API Response',
          mappings: [
            { name: 'response', reference: '$result.data' },
            { name: 'provider', reference: '$result.source' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 5, sourceHandle: 'true' },
      { source: 3, target: 4, sourceHandle: 'false' },
      { source: 4, target: 5 },
    ],
  },

  // Pattern 12: Multi-Step Research
  {
    id: 'multi-step-research',
    name: 'Multi-Step Research',
    description: 'Sequential research pipeline with iterative refinement',
    category: 'extraction',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Research Query',
          fields: [
            { name: 'topic', type: 'string', required: true },
            { name: 'depth', type: 'number', required: false },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Research Agents',
          capabilities: ['web-search', 'summarization', 'synthesis'],
          minAgents: 3,
        },
      },
      {
        type: 'sequential',
        position: { x: 510, y: 200 },
        data: {
          label: 'Research Pipeline',
          steps: ['search', 'extract', 'synthesize'],
        },
      },
      {
        type: 'consensus',
        position: { x: 740, y: 200 },
        data: {
          label: 'Validate Findings',
          threshold: 0.8,
          minVotes: 2,
        },
      },
      {
        type: 'condition',
        position: { x: 970, y: 200 },
        data: {
          label: 'Sufficient?',
          expression: 'depth >= targetDepth',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 100 },
        data: {
          label: 'Research Report',
          mappings: [
            { name: 'findings', reference: '$consensus.result' },
            { name: 'sources', reference: '$pipeline.sources' },
            { name: 'confidence', reference: '$consensus.confidence' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5, sourceHandle: 'true' },
    ],
  },

  // Pattern 13: Data Validation Pipeline
  {
    id: 'data-validation',
    name: 'Data Validation Pipeline',
    description: 'Validate data against multiple rule sets with detailed error reporting',
    category: 'quality',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Data Input',
          fields: [
            { name: 'data', type: 'object', required: true },
            { name: 'schema', type: 'object', required: true },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Validators',
          capabilities: ['schema-validation', 'business-rules', 'data-quality'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Run Validations',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'merge',
        position: { x: 740, y: 200 },
        data: {
          label: 'Collect Errors',
          strategy: 'concat',
        },
      },
      {
        type: 'condition',
        position: { x: 970, y: 200 },
        data: {
          label: 'Has Errors?',
          expression: 'errors.length === 0',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 100 },
        data: {
          label: 'Valid Data',
          mappings: [
            { name: 'data', reference: '$input.data' },
            { name: 'validatedAt', reference: '$timestamp' },
          ],
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 300 },
        data: {
          label: 'Validation Errors',
          mappings: [
            { name: 'errors', reference: '$merged.errors' },
            { name: 'errorCount', reference: '$merged.count' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5, sourceHandle: 'true' },
      { source: 4, target: 6, sourceHandle: 'false' },
    ],
  },

  // Pattern 14: Summarization Chain
  {
    id: 'summarization-chain',
    name: 'Summarization Chain',
    description: 'Multi-level document summarization with quality checks',
    category: 'extraction',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Document',
          fields: [
            { name: 'content', type: 'string', required: true },
            { name: 'targetLength', type: 'number', required: false },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Summarizers',
          capabilities: ['summarization', 'compression'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Generate Summaries',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'consensus',
        position: { x: 740, y: 200 },
        data: {
          label: 'Best Summary',
          threshold: 0.75,
        },
      },
      {
        type: 'threshold',
        position: { x: 970, y: 200 },
        data: {
          label: 'Quality Check',
          minConfidence: 0.8,
          action: 'pass',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 200 },
        data: {
          label: 'Summary',
          mappings: [
            { name: 'summary', reference: '$consensus.result' },
            { name: 'compressionRatio', reference: '$stats.ratio' },
          ],
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5 },
    ],
  },

  // Pattern 15: Classification with Confidence
  {
    id: 'classification-confidence',
    name: 'Classification with Confidence',
    description: 'Multi-class classification with confidence thresholds and human escalation',
    category: 'voting',
    nodes: [
      {
        type: 'input',
        position: { x: 50, y: 200 },
        data: {
          label: 'Item to Classify',
          fields: [
            { name: 'item', type: 'object', required: true },
            { name: 'categories', type: 'array', required: true },
          ],
        },
      },
      {
        type: 'agents',
        position: { x: 280, y: 200 },
        data: {
          label: 'Classifiers',
          capabilities: ['classification', 'categorization'],
          minAgents: 3,
        },
      },
      {
        type: 'parallel',
        position: { x: 510, y: 200 },
        data: {
          label: 'Classify',
          agentCount: 3,
          waitForAll: true,
        },
      },
      {
        type: 'voting',
        position: { x: 740, y: 200 },
        data: {
          label: 'Vote on Category',
          method: 'majority',
          minVotes: 2,
        },
      },
      {
        type: 'threshold',
        position: { x: 970, y: 200 },
        data: {
          label: 'Confidence Gate',
          minConfidence: 0.7,
          action: 'fallback',
        },
      },
      {
        type: 'output',
        position: { x: 1200, y: 100 },
        data: {
          label: 'Classification',
          mappings: [
            { name: 'category', reference: '$vote.result' },
            { name: 'confidence', reference: '$vote.confidence' },
          ],
        },
      },
      {
        type: 'fallback',
        position: { x: 1200, y: 300 },
        data: {
          label: 'Human Review',
          fallbackType: 'escalate',
        },
      },
    ],
    edges: [
      { source: 0, target: 1 },
      { source: 1, target: 2 },
      { source: 2, target: 3 },
      { source: 3, target: 4 },
      { source: 4, target: 5, sourceHandle: 'true' },
      { source: 4, target: 6, sourceHandle: 'false' },
    ],
  },
];

export function getPatternsByCategory(category: ExamplePattern['category']): ExamplePattern[] {
  return EXAMPLE_PATTERNS.filter(p => p.category === category);
}

export function getPatternById(id: string): ExamplePattern | undefined {
  return EXAMPLE_PATTERNS.find(p => p.id === id);
}

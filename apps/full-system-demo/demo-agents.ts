/**
 * Demo Agents for Parallax Full System Test
 * 
 * Showcases:
 * 1. Basic agents with confidence extraction
 * 2. Pattern-aware agents
 * 3. Pattern composition from natural language
 * 4. Multiple agents working together
 */

import { ParallaxAgent, withConfidence } from '@parallax/sdk-typescript';
import { PatternAwareWrapper } from '@parallax/meta-agents';
import { z } from 'zod';

// Mock LLM Provider for demo
class MockLLMProvider {
  async generateObject({ schema, prompt }: any) {
    console.log('\n🤖 Mock LLM Processing...');
    
    // Simulate different responses based on prompt
    if (prompt.includes('sentiment analysis')) {
      return {
        object: {
          sentiment: 'positive',
          confidence: 0.85,
          reasoning: 'The text contains positive keywords and expressions',
          aspects: {
            product: 'positive',
            service: 'neutral',
            price: 'negative'
          }
        }
      };
    }
    
    if (prompt.includes('code review')) {
      return {
        object: {
          quality: 'good',
          issues: [
            'Consider adding error handling in parseInput function',
            'Variable naming could be more descriptive'
          ],
          suggestions: [
            'Add unit tests for edge cases',
            'Consider using TypeScript for better type safety'
          ],
          confidence: 0.75
        }
      };
    }
    
    if (prompt.includes('data validation')) {
      return {
        object: {
          valid: true,
          warnings: ['Some fields have unusual values'],
          confidence: 0.9
        }
      };
    }
    
    // Pattern composition responses
    if (prompt.includes('Analyze this orchestration task')) {
      return {
        object: {
          goal: "Get consensus from multiple experts",
          strategy: "consensus",
          actors: ["expert1", "expert2", "expert3"],
          constraints: {
            minConfidence: 0.8,
            maxTime: 30000,
            fallback: "escalate to senior expert"
          },
          reasoning: "Multiple experts need to agree, requiring consensus pattern"
        }
      };
    }
    
    if (prompt.includes('Select the appropriate primitives')) {
      return {
        object: {
          selected: [
            {
              name: "parallel",
              config: { maxConcurrency: 3 },
              reason: "Expert analyses are independent"
            },
            {
              name: "consensus",
              config: { threshold: 0.8 },
              reason: "Need agreement among experts"
            },
            {
              name: "threshold",
              config: { threshold: 0.8 },
              reason: "Only accept high-confidence consensus"
            },
            {
              name: "fallback",
              config: { fallbackTo: "senior-expert" },
              reason: "Escalate if consensus not reached"
            }
          ],
          order: ["parallel", "consensus", "threshold", "fallback"],
          confidence: 0.9
        }
      };
    }
    
    // Default response
    return {
      object: {
        result: 'Analysis complete',
        confidence: 0.7
      }
    };
  }
}

// 1. Sentiment Analysis Agent
class SentimentAgent extends ParallaxAgent {
  constructor() {
    super('sentiment-agent-1', 'Sentiment Analyzer', ['sentiment', 'nlp']);
  }
  
  @withConfidence
  async analyze(task: string, data?: any): Promise<[any, number]> {
    console.log(`\n📊 Sentiment Agent analyzing: ${task}`);
    
    const text = data?.text || task;
    
    // Simulate sentiment analysis
    const positiveWords = ['great', 'excellent', 'amazing', 'good', 'love', 'wonderful'];
    const negativeWords = ['bad', 'terrible', 'hate', 'awful', 'poor', 'worst'];
    
    let score = 0;
    const words = text.toLowerCase().split(' ');
    
    words.forEach((word: string) => {
      if (positiveWords.includes(word)) score += 1;
      if (negativeWords.includes(word)) score -= 1;
    });
    
    const sentiment = score > 0 ? 'positive' : score < 0 ? 'negative' : 'neutral';
    const confidence = Math.min(0.95, 0.6 + Math.abs(score) * 0.1);
    
    return {
      sentiment,
      score,
      confidence,
      reasoning: `Found ${Math.abs(score)} sentiment indicators`,
      uncertainties: score === 0 ? ['No clear sentiment indicators found'] : []
    };
  }
}

// 2. Code Review Agent
class CodeReviewAgent extends ParallaxAgent {
  constructor() {
    super('code-review-agent-1', 'Code Reviewer', ['code-review', 'analysis']);
  }
  
  async analyze(task: string, data?: any): Promise<[any, number]> {
    console.log(`\n🔍 Code Review Agent analyzing: ${task}`);
    
    const code = data?.code || '';
    
    const issues = [];
    const suggestions = [];
    
    // Simulate code analysis
    if (!code.includes('try')) {
      issues.push('Missing error handling');
      suggestions.push('Add try-catch blocks for error handling');
    }
    
    if (code.length < 50) {
      issues.push('Code seems incomplete');
    }
    
    if (!code.includes('//') && !code.includes('/*')) {
      suggestions.push('Add comments to explain complex logic');
    }
    
    const quality = issues.length === 0 ? 'excellent' : 
                   issues.length <= 2 ? 'good' : 'needs improvement';
    
    const confidence = Math.max(0.5, 0.9 - issues.length * 0.1);
    
    return [{
      quality,
      issues,
      suggestions,
      metrics: {
        complexity: 'medium',
        maintainability: 'good'
      },
      reasoning: `Found ${issues.length} issues and ${suggestions.length} suggestions`
    }, confidence];
  }
}

// 3. Data Validation Agent
class DataValidationAgent extends ParallaxAgent {
  constructor() {
    super('validation-agent-1', 'Data Validator', ['validation', 'data-quality']);
  }
  
  @withConfidence
  async analyze(task: string, data?: any): Promise<[any, number]> {
    console.log(`\n✅ Data Validation Agent analyzing: ${task}`);
    
    const errors = [];
    const warnings = [];
    
    if (!data) {
      errors.push('No data provided');
      return {
        valid: false,
        errors,
        warnings,
        definitely: false // Low confidence keyword
      };
    }
    
    // Validate different data types
    if (data.email && !data.email.includes('@')) {
      errors.push('Invalid email format');
    }
    
    if (data.age && (data.age < 0 || data.age > 150)) {
      warnings.push('Age value seems unusual');
    }
    
    if (data.required && !data.value) {
      errors.push('Required field is missing');
    }
    
    const valid = errors.length === 0;
    
    return {
      valid,
      errors,
      warnings,
      certainly: valid, // High confidence keyword
      reasoning: `Validated ${Object.keys(data).length} fields`
    };
  }
}

// 4. Expert Analysis Agent (for consensus testing)
class ExpertAgent extends ParallaxAgent {
  private expertise: string;
  
  constructor(id: string, expertise: string) {
    super(id, `${expertise} Expert`, ['analysis', expertise.toLowerCase()]);
    this.expertise = expertise;
  }
  
  async analyze(task: string, data?: any): Promise<[any, number]> {
    console.log(`\n🎓 ${this.expertise} Expert analyzing: ${task}`);
    
    // Simulate expert analysis with some randomness
    const confidence = 0.7 + Math.random() * 0.25;
    const recommendation = Math.random() > 0.3 ? 'approve' : 'needs-revision';
    
    return [{
      expert: this.expertise,
      recommendation,
      reasoning: `Based on ${this.expertise.toLowerCase()} best practices`,
      concerns: recommendation === 'needs-revision' ? 
        [`Does not meet ${this.expertise.toLowerCase()} standards`] : []
    }, confidence];
  }
}

// Create and register agents
export async function setupDemoAgents() {
  console.log('🚀 Setting up demo agents...\n');
  
  const agents = [];
  
  // 1. Basic agents
  const sentimentAgent = new SentimentAgent();
  const codeReviewAgent = new CodeReviewAgent();
  const validationAgent = new DataValidationAgent();
  
  agents.push(
    sentimentAgent.serve(50100),
    codeReviewAgent.serve(50101),
    validationAgent.serve(50102)
  );
  
  // 2. Expert agents for consensus
  const securityExpert = new ExpertAgent('security-expert-1', 'Security');
  const performanceExpert = new ExpertAgent('performance-expert-1', 'Performance');
  const usabilityExpert = new ExpertAgent('usability-expert-1', 'Usability');
  
  agents.push(
    securityExpert.serve(50103),
    performanceExpert.serve(50104),
    usabilityExpert.serve(50105)
  );
  
  // 3. Pattern Composer Agent
  const patternComposer = createPatternComposerAgent(new MockLLMProvider(), {
    id: 'pattern-composer-1',
    primitiveDescriptors: PRIMITIVE_DESCRIPTORS
  });
  
  agents.push(patternComposer.serve(50106));
  
  // 4. Pattern-Aware Enhanced Agent
  const enhancedReviewer = makePatternAware(codeReviewAgent, {
    autoCompose: true,
    cachePatterns: true
  });
  
  // Wait for all agents to start
  await Promise.all(agents);
  
  console.log('\n✅ All demo agents started successfully!');
  console.log('\n📍 Agent Endpoints:');
  console.log('  - Sentiment Agent: localhost:50100');
  console.log('  - Code Review Agent: localhost:50101');
  console.log('  - Data Validation Agent: localhost:50102');
  console.log('  - Security Expert: localhost:50103');
  console.log('  - Performance Expert: localhost:50104');
  console.log('  - Usability Expert: localhost:50105');
  console.log('  - Pattern Composer: localhost:50106');
  
  return {
    sentimentAgent,
    codeReviewAgent,
    validationAgent,
    securityExpert,
    performanceExpert,
    usabilityExpert,
    patternComposer,
    enhancedReviewer
  };
}

// Demonstrate confidence aggregation
export function demonstrateConfidenceAggregation() {
  console.log('\n🔄 Demonstrating Confidence Aggregation:\n');
  
  const aggregator = new ConfidenceAggregator();
  const confidences = [0.8, 0.85, 0.75, 0.9, 0.82];
  
  console.log('Confidence values:', confidences);
  console.log('Min strategy:', aggregator.combine(confidences, 'min'));
  console.log('Max strategy:', aggregator.combine(confidences, 'max'));
  console.log('Average strategy:', aggregator.combine(confidences, 'avg'));
  console.log('Weighted average:', aggregator.combine(confidences, 'weighted_avg'));
  console.log('Consensus strategy:', aggregator.combine(confidences, 'consensus'));
  
  // Consistency-based confidence
  const results = [
    { answer: 'approved' },
    { answer: 'approved' },
    { answer: 'needs-revision' },
    { answer: 'approved' }
  ];
  
  console.log('\nConsistency-based confidence:');
  console.log('Results:', results);
  console.log('Confidence from consistency:', aggregator.fromConsistency(results));
}

// Main demo runner
if (require.main === module) {
  setupDemoAgents()
    .then(() => {
      demonstrateConfidenceAggregation();
      console.log('\n🎯 Demo agents ready for testing!');
      console.log('\nPress Ctrl+C to stop all agents...');
    })
    .catch(console.error);
}
/**
 * Battle Test Suite for Pattern SDK
 * 
 * Tests a wide variety of prompts to evaluate the Pattern SDK's capabilities
 * and identify areas for improvement.
 */

import { PatternGenerator } from '../src';
import { createGeminiProvider } from '../src/llm';
import { config } from 'dotenv';
import { resolve } from 'path';
import * as fs from 'fs-extra';
import * as path from 'path';

// Load environment variables
config({ path: resolve(__dirname, '../../../.env') });

interface TestCase {
  id: string;
  name: string;
  category: string;
  requirements: any;
  expectedPrimitives?: string[];
  expectedComplexity?: 'low' | 'medium' | 'high';
}

interface TestResult {
  testCase: TestCase;
  success: boolean;
  pattern?: any;
  error?: string;
  validationResult?: any;
  analysis: {
    primitivesUsed: string[];
    hasValidSyntax: boolean;
    hasProperConfidenceFlow: boolean;
    complexity: number;
    issues: string[];
  };
}

// Comprehensive test cases covering various scenarios
const TEST_CASES: TestCase[] = [
  // === SIMPLE PATTERNS ===
  {
    id: 'simple-1',
    name: 'Basic parallel execution',
    category: 'simple',
    requirements: {
      goal: "Execute data processing tasks in parallel",
      strategy: "parallel",
      minConfidence: 0.7,
      agents: [{ capability: "processor", count: 3 }]
    },
    expectedPrimitives: ['parallel']
  },
  {
    id: 'simple-2',
    name: 'Sequential pipeline',
    category: 'simple',
    requirements: {
      goal: "Process data through a series of transformation steps",
      strategy: "sequential",
      minConfidence: 0.6,
      stages: [
        { name: "extract", agents: [{ capability: "extractor" }] },
        { name: "transform", agents: [{ capability: "transformer" }] },
        { name: "load", agents: [{ capability: "loader" }] }
      ]
    },
    expectedPrimitives: ['sequential']
  },
  
  // === CONSENSUS PATTERNS ===
  {
    id: 'consensus-1',
    name: 'Simple consensus',
    category: 'consensus',
    requirements: {
      goal: "Reach consensus among multiple reviewers",
      strategy: "consensus",
      minConfidence: 0.8,
      agents: [{ capability: "reviewer", count: 5 }]
    },
    expectedPrimitives: ['parallel', 'consensus']
  },
  {
    id: 'consensus-2',
    name: 'Consensus with threshold',
    category: 'consensus',
    requirements: {
      goal: "Make decision based on expert consensus with high confidence",
      strategy: "consensus",
      minConfidence: 0.95,
      agents: [{ capability: "expert", count: 7 }],
      constraints: { requiredApprovals: 5 }
    },
    expectedPrimitives: ['parallel', 'consensus', 'threshold']
  },
  
  // === ERROR HANDLING PATTERNS ===
  {
    id: 'error-1',
    name: 'Retry pattern',
    category: 'error-handling',
    requirements: {
      goal: "Process API calls with retry on failure",
      minConfidence: 0.7,
      constraints: { maxRetries: 3, timeout: 5000 }
    },
    expectedPrimitives: ['retry', 'timeout']
  },
  {
    id: 'error-2',
    name: 'Fallback pattern',
    category: 'error-handling',
    requirements: {
      goal: "Process with fallback to expert on low confidence",
      minConfidence: 0.8,
      fallback: "domain-expert",
      agents: [{ capability: "analyzer", count: 2 }]
    },
    expectedPrimitives: ['parallel', 'threshold', 'fallback']
  },
  
  // === COMPLEX PATTERNS ===
  {
    id: 'complex-1',
    name: 'Multi-stage pipeline with consensus',
    category: 'complex',
    requirements: {
      goal: "Complex document processing with validation and approval",
      strategy: "pipeline",
      minConfidence: 0.85,
      stages: [
        { 
          name: "extraction", 
          description: "Extract data from documents",
          parallel: true,
          agents: [{ capability: "extractor", count: 3 }] 
        },
        { 
          name: "validation", 
          description: "Validate extracted data",
          agents: [{ capability: "validator", count: 2 }] 
        },
        { 
          name: "approval", 
          description: "Get consensus approval",
          agents: [{ capability: "approver", count: 5 }] 
        }
      ],
      constraints: { 
        maxRetries: 2, 
        timeout: 60000,
        requiredApprovals: 3 
      },
      fallback: "manual-review"
    },
    expectedPrimitives: ['sequential', 'parallel', 'consensus', 'threshold', 'retry', 'timeout', 'fallback']
  },
  {
    id: 'complex-2',
    name: 'Hierarchical decision making',
    category: 'complex',
    requirements: {
      goal: "Multi-level approval process with escalation",
      minConfidence: 0.9,
      stages: [
        { 
          name: "initial-review", 
          parallel: true,
          agents: [{ capability: "junior-reviewer", count: 4 }] 
        },
        { 
          name: "senior-review", 
          condition: "confidence < 0.8",
          agents: [{ capability: "senior-reviewer", count: 2 }] 
        },
        { 
          name: "executive-approval", 
          condition: "critical",
          agents: [{ capability: "executive", count: 1 }] 
        }
      ]
    },
    expectedComplexity: 'high'
  },
  
  // === EDGE CASES ===
  {
    id: 'edge-1',
    name: 'No agents specified',
    category: 'edge-cases',
    requirements: {
      goal: "Process data",
      minConfidence: 0.5
    }
  },
  {
    id: 'edge-2',
    name: 'Conflicting requirements',
    category: 'edge-cases',
    requirements: {
      goal: "Process quickly but with high accuracy",
      strategy: "parallel",
      minConfidence: 0.99,
      constraints: { 
        timeout: 100, // Very short timeout
        requiredApprovals: 10 // High approval count
      },
      agents: [{ capability: "processor", count: 2 }] // Few agents
    }
  },
  {
    id: 'edge-3',
    name: 'Very high agent count',
    category: 'edge-cases',
    requirements: {
      goal: "Massive parallel processing",
      strategy: "parallel",
      agents: [{ capability: "worker", count: 100 }]
    }
  },
  
  // === NATURAL LANGUAGE VARIATIONS ===
  {
    id: 'nl-1',
    name: 'Vague requirements',
    category: 'natural-language',
    requirements: {
      goal: "Make it work better and faster",
      minConfidence: 0.7
    }
  },
  {
    id: 'nl-2',
    name: 'Contradictory language',
    category: 'natural-language',
    requirements: {
      goal: "Process sequentially but in parallel with consensus but independently",
      minConfidence: 0.8
    }
  },
  
  // === DOMAIN-SPECIFIC PATTERNS ===
  {
    id: 'domain-1',
    name: 'Security scanning',
    category: 'domain-specific',
    requirements: {
      goal: "Scan codebase for security vulnerabilities with high confidence",
      strategy: "parallel",
      minConfidence: 0.95,
      stages: [
        { name: "static-analysis", parallel: true, agents: [{ capability: "static-analyzer", count: 3 }] },
        { name: "dependency-check", agents: [{ capability: "dependency-scanner", count: 2 }] },
        { name: "penetration-test", agents: [{ capability: "pen-tester", count: 1 }] }
      ],
      fallback: "security-expert"
    }
  },
  {
    id: 'domain-2',
    name: 'Medical diagnosis consensus',
    category: 'domain-specific',
    requirements: {
      goal: "Diagnose medical condition with multiple specialist consensus",
      strategy: "consensus",
      minConfidence: 0.98,
      agents: [
        { capability: "radiologist", count: 2 },
        { capability: "pathologist", count: 2 },
        { capability: "specialist", count: 3 }
      ],
      constraints: { 
        requiredApprovals: 5,
        blockOnCritical: true 
      }
    }
  },
  {
    id: 'domain-3',
    name: 'Financial fraud detection',
    category: 'domain-specific',
    requirements: {
      goal: "Detect fraudulent transactions in real-time",
      strategy: "parallel",
      minConfidence: 0.9,
      stages: [
        { name: "pattern-match", parallel: true, agents: [{ capability: "pattern-detector", count: 5 }] },
        { name: "ml-analysis", agents: [{ capability: "ml-analyzer", count: 3 }] },
        { name: "decision", agents: [{ capability: "fraud-expert", count: 1 }] }
      ],
      constraints: { 
        timeout: 1000, // 1 second for real-time
        maxRetries: 0 // No retries for speed
      }
    }
  }
];

class BattleTestRunner {
  private generator: PatternGenerator;
  private results: TestResult[] = [];
  private outputDir: string;
  
  constructor() {
    this.generator = new PatternGenerator(createGeminiProvider());
    this.outputDir = path.join(__dirname, 'battle-test-results');
  }
  
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting Pattern SDK Battle Test\n');
    console.log(`Running ${TEST_CASES.length} test cases across ${this.getCategories().length} categories\n`);
    
    await fs.ensureDir(this.outputDir);
    
    for (const testCase of TEST_CASES) {
      console.log(`\nTest ${testCase.id}: ${testCase.name}`);
      console.log('─'.repeat(50));
      
      const result = await this.runTest(testCase);
      this.results.push(result);
      
      if (result.success) {
        console.log('✅ Success');
      } else {
        console.log('❌ Failed:', result.error);
      }
      
      // Add delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    await this.generateReport();
  }
  
  async runTest(testCase: TestCase): Promise<TestResult> {
    const result: TestResult = {
      testCase,
      success: false,
      analysis: {
        primitivesUsed: [],
        hasValidSyntax: false,
        hasProperConfidenceFlow: false,
        complexity: 0,
        issues: []
      }
    };
    
    try {
      // Generate pattern
      const pattern = await this.generator.generate(testCase.requirements);
      result.pattern = pattern;
      
      // Validate pattern
      const validation = await this.generator.validate(pattern);
      result.validationResult = validation;
      
      // Analyze pattern
      result.analysis = this.analyzePattern(pattern, validation);
      
      // Determine success
      result.success = validation.isValid && 
                      result.analysis.hasProperConfidenceFlow &&
                      result.analysis.issues.length === 0;
      
      // Save pattern
      if (result.success) {
        const filename = `${testCase.category}/${testCase.id}-${testCase.name.replace(/\s+/g, '-')}.prism`;
        await this.savePattern(pattern, filename);
      }
      
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error);
      result.analysis.issues.push(`Generation error: ${result.error}`);
    }
    
    return result;
  }
  
  analyzePattern(pattern: any, validation: any): TestResult['analysis'] {
    const analysis: TestResult['analysis'] = {
      primitivesUsed: pattern.metadata?.primitives || [],
      hasValidSyntax: validation.isValid,
      hasProperConfidenceFlow: false,
      complexity: pattern.metadata?.complexity || 0,
      issues: []
    };
    
    // Check confidence flow
    const code = pattern.code || '';
    const hasConfidenceExtraction = code.includes('.confidence') || code.includes('confidence:');
    const usesConfidenceOperator = code.includes('~>');
    const returnsWithConfidence = code.includes('return') && code.includes('~>');
    
    analysis.hasProperConfidenceFlow = hasConfidenceExtraction && usesConfidenceOperator && returnsWithConfidence;
    
    // Check for common issues
    if (code.match(/~>\s*0\.9[^0-9]/) || code.match(/~>\s*1\.0[^0-9]/)) {
      // Only flag if it's actually hardcoded, not part of calculations
      if (!code.includes('0 ~> 1.0)') && !code.includes('~> 0.95')) {
        analysis.issues.push('Hardcoded confidence values detected');
      }
    }
    
    if (!code.includes('map(') && pattern.metadata?.primitives?.includes('parallel')) {
      analysis.issues.push('Parallel primitive used but no agent mapping found');
    }
    
    if (code.includes('step1 = input') && code.includes('step2 = step1')) {
      analysis.issues.push('No-op steps detected (steps that don\'t transform data)');
    }
    
    if (validation.errors) {
      validation.errors.forEach((err: any) => {
        analysis.issues.push(`Validation error: ${err.message}`);
      });
    }
    
    return analysis;
  }
  
  async savePattern(pattern: any, filename: string): Promise<void> {
    const filepath = path.join(this.outputDir, 'patterns', filename);
    await fs.ensureDir(path.dirname(filepath));
    await fs.writeFile(filepath, pattern.code, 'utf8');
  }
  
  async generateReport(): Promise<void> {
    const report = {
      summary: this.generateSummary(),
      byCategory: this.generateCategoryBreakdown(),
      commonIssues: this.identifyCommonIssues(),
      successfulPatterns: this.getSuccessfulPatterns(),
      failedPatterns: this.getFailedPatterns(),
      recommendations: this.generateRecommendations()
    };
    
    // Save detailed report
    await fs.writeJson(
      path.join(this.outputDir, 'battle-test-report.json'), 
      report, 
      { spaces: 2 }
    );
    
    // Save markdown report
    const markdown = this.generateMarkdownReport(report);
    await fs.writeFile(
      path.join(this.outputDir, 'battle-test-report.md'),
      markdown,
      'utf8'
    );
    
    // Print summary to console
    console.log('\n' + '='.repeat(60));
    console.log('📊 BATTLE TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.results.length}`);
    console.log(`Successful: ${report.summary.successful} (${report.summary.successRate}%)`);
    console.log(`Failed: ${report.summary.failed}`);
    console.log(`\nTop Issues:`);
    report.commonIssues.slice(0, 5).forEach((issue, i) => {
      console.log(`${i + 1}. ${issue.issue} (${issue.count} occurrences)`);
    });
    console.log(`\nFull report saved to: ${this.outputDir}/battle-test-report.md`);
  }
  
  private generateSummary() {
    const successful = this.results.filter(r => r.success).length;
    const failed = this.results.length - successful;
    const successRate = Math.round((successful / this.results.length) * 100);
    
    return {
      totalTests: this.results.length,
      successful,
      failed,
      successRate,
      averageComplexity: this.calculateAverageComplexity(),
      validSyntaxRate: this.calculateValidSyntaxRate(),
      properConfidenceFlowRate: this.calculateProperConfidenceFlowRate()
    };
  }
  
  private generateCategoryBreakdown() {
    const breakdown: any = {};
    
    this.getCategories().forEach(category => {
      const categoryResults = this.results.filter(r => r.testCase.category === category);
      const successful = categoryResults.filter(r => r.success).length;
      
      breakdown[category] = {
        total: categoryResults.length,
        successful,
        failed: categoryResults.length - successful,
        successRate: Math.round((successful / categoryResults.length) * 100)
      };
    });
    
    return breakdown;
  }
  
  private identifyCommonIssues(): Array<{ issue: string; count: number }> {
    const issueCount = new Map<string, number>();
    
    this.results.forEach(result => {
      result.analysis.issues.forEach(issue => {
        issueCount.set(issue, (issueCount.get(issue) || 0) + 1);
      });
    });
    
    return Array.from(issueCount.entries())
      .map(([issue, count]) => ({ issue, count }))
      .sort((a, b) => b.count - a.count);
  }
  
  private getSuccessfulPatterns() {
    return this.results
      .filter(r => r.success)
      .map(r => ({
        id: r.testCase.id,
        name: r.testCase.name,
        category: r.testCase.category,
        complexity: r.analysis.complexity,
        primitives: r.analysis.primitivesUsed
      }));
  }
  
  private getFailedPatterns() {
    return this.results
      .filter(r => !r.success)
      .map(r => ({
        id: r.testCase.id,
        name: r.testCase.name,
        category: r.testCase.category,
        error: r.error,
        issues: r.analysis.issues
      }));
  }
  
  private generateRecommendations(): string[] {
    const recommendations = [];
    
    // Based on common issues
    const topIssues = this.identifyCommonIssues().slice(0, 3);
    topIssues.forEach(({ issue }) => {
      if (issue.includes('Hardcoded confidence')) {
        recommendations.push('Improve confidence extraction logic to avoid hardcoded values');
      }
      if (issue.includes('No-op steps')) {
        recommendations.push('Optimize step generation to avoid redundant transformations');
      }
      if (issue.includes('Validation error')) {
        recommendations.push('Enhance Prism syntax generation to reduce validation errors');
      }
    });
    
    // Based on category performance
    const categoryBreakdown = this.generateCategoryBreakdown();
    Object.entries(categoryBreakdown).forEach(([category, stats]: [string, any]) => {
      if (stats.successRate < 50) {
        recommendations.push(`Improve handling of ${category} patterns (${stats.successRate}% success rate)`);
      }
    });
    
    return [...new Set(recommendations)]; // Remove duplicates
  }
  
  private generateMarkdownReport(report: any): string {
    let md = '# Pattern SDK Battle Test Report\n\n';
    md += `Generated: ${new Date().toISOString()}\n\n`;
    
    // Summary
    md += '## Summary\n\n';
    md += `- **Total Tests**: ${report.summary.totalTests}\n`;
    md += `- **Success Rate**: ${report.summary.successRate}% (${report.summary.successful}/${report.summary.totalTests})\n`;
    md += `- **Valid Syntax Rate**: ${report.summary.validSyntaxRate}%\n`;
    md += `- **Proper Confidence Flow Rate**: ${report.summary.properConfidenceFlowRate}%\n`;
    md += `- **Average Complexity**: ${report.summary.averageComplexity.toFixed(2)}\n\n`;
    
    // Category Breakdown
    md += '## Results by Category\n\n';
    md += '| Category | Total | Success | Failed | Success Rate |\n';
    md += '|----------|-------|---------|--------|-------------|\n';
    Object.entries(report.byCategory).forEach(([category, stats]: [string, any]) => {
      md += `| ${category} | ${stats.total} | ${stats.successful} | ${stats.failed} | ${stats.successRate}% |\n`;
    });
    md += '\n';
    
    // Common Issues
    md += '## Common Issues\n\n';
    report.commonIssues.slice(0, 10).forEach((issue: any, i: number) => {
      md += `${i + 1}. **${issue.issue}** (${issue.count} occurrences)\n`;
    });
    md += '\n';
    
    // Successful Patterns
    md += '## Successful Patterns\n\n';
    report.successfulPatterns.forEach((p: any) => {
      md += `- **${p.name}** (${p.id})\n`;
      md += `  - Category: ${p.category}\n`;
      md += `  - Complexity: ${p.complexity}\n`;
      md += `  - Primitives: ${p.primitives.join(', ')}\n\n`;
    });
    
    // Failed Patterns
    md += '## Failed Patterns\n\n';
    report.failedPatterns.forEach((p: any) => {
      md += `- **${p.name}** (${p.id})\n`;
      md += `  - Category: ${p.category}\n`;
      md += `  - Error: ${p.error || 'No error message'}\n`;
      md += `  - Issues: ${p.issues.join('; ')}\n\n`;
    });
    
    // Recommendations
    md += '## Recommendations\n\n';
    report.recommendations.forEach((rec: string, i: number) => {
      md += `${i + 1}. ${rec}\n`;
    });
    
    return md;
  }
  
  private getCategories(): string[] {
    return [...new Set(TEST_CASES.map(tc => tc.category))];
  }
  
  private calculateAverageComplexity(): number {
    const complexities = this.results.map(r => r.analysis.complexity).filter(c => c > 0);
    return complexities.reduce((a, b) => a + b, 0) / complexities.length || 0;
  }
  
  private calculateValidSyntaxRate(): number {
    const validSyntax = this.results.filter(r => r.analysis.hasValidSyntax).length;
    return Math.round((validSyntax / this.results.length) * 100);
  }
  
  private calculateProperConfidenceFlowRate(): number {
    const properFlow = this.results.filter(r => r.analysis.hasProperConfidenceFlow).length;
    return Math.round((properFlow / this.results.length) * 100);
  }
}

// Run the battle test
if (require.main === module) {
  const runner = new BattleTestRunner();
  runner.runAllTests().catch(console.error);
}

export { BattleTestRunner, TEST_CASES, TestCase, TestResult };
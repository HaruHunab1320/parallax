/**
 * Code Review Agent
 * 
 * Analyzes code for:
 * - Security vulnerabilities
 * - Code quality issues
 * - Best practices
 * - Performance concerns
 */

import { ParallaxAgent, serveAgent } from '@parallax/sdk-typescript';

interface CodeReviewRequest {
  code: string;
  language: string;
  context?: string;
}

interface CodeReviewResult {
  issues: Array<{
    type: 'security' | 'quality' | 'performance' | 'style';
    severity: 'critical' | 'high' | 'medium' | 'low';
    line?: number;
    message: string;
    suggestion?: string;
  }>;
  summary: {
    security_score: number;
    quality_score: number;
    performance_score: number;
  };
  recommendations: string[];
}

class CodeReviewAgent extends ParallaxAgent {
  private securityPatterns = {
    sql_injection: /(\$\{.*?\}|['"]?\s*\+\s*\w+\s*\+\s*['"]?).*?(SELECT|INSERT|UPDATE|DELETE|DROP)/gi,
    xss: /<script.*?>.*?<\/script>|innerHTML\s*=|document\.write/gi,
    hardcoded_secrets: /(api[_-]?key|password|secret|token)\s*[:=]\s*["'][^"']+["']/gi,
    unsafe_eval: /eval\s*\(|Function\s*\(|setTimeout\s*\([^,]+,/g,
    path_traversal: /\.\.[\/\\]|\$\{.*?\}.*?[\/\\]/g,
  };
  
  constructor() {
    super(
      'code-review-1',
      'Code Review Agent',
      ['security', 'code-analysis', 'quality', 'review'],
      {
        expertise: 0.88,
        capabilityScores: {
          security: 0.9,
          quality: 0.85,
          performance: 0.8,
          style: 0.75
        }
      }
    );
  }
  
  async analyze(task: string, data?: any): Promise<[CodeReviewResult, number]> {
    if (!data?.code) {
      return [{
        issues: [{
          type: 'quality',
          severity: 'critical',
          message: 'No code provided for review'
        }],
        summary: { security_score: 0, quality_score: 0, performance_score: 0 },
        recommendations: ['Please provide code to review']
      }, 0.1];
    }
    
    const request = data as CodeReviewRequest;
    const issues: CodeReviewResult['issues'] = [];
    let confidence = 0.9;
    
    // Security analysis
    const securityIssues = this.analyzeSecurityIssues(request.code, request.language);
    issues.push(...securityIssues);
    
    // Code quality analysis
    const qualityIssues = this.analyzeCodeQuality(request.code, request.language);
    issues.push(...qualityIssues);
    
    // Performance analysis
    const performanceIssues = this.analyzePerformance(request.code, request.language);
    issues.push(...performanceIssues);
    
    // Calculate scores
    const criticalSecurity = securityIssues.filter(i => i.severity === 'critical').length;
    const highSecurity = securityIssues.filter(i => i.severity === 'high').length;
    const securityScore = Math.max(0, 100 - criticalSecurity * 30 - highSecurity * 15);
    
    const qualityScore = Math.max(0, 100 - qualityIssues.length * 5);
    const performanceScore = Math.max(0, 100 - performanceIssues.length * 10);
    
    // Adjust confidence based on language familiarity
    const supportedLanguages = ['javascript', 'typescript', 'python', 'java'];
    if (!supportedLanguages.includes(request.language.toLowerCase())) {
      confidence *= 0.7;
    }
    
    // Generate recommendations
    const recommendations = this.generateRecommendations(issues, request);
    
    return [{
      issues,
      summary: {
        security_score: securityScore,
        quality_score: qualityScore,
        performance_score: performanceScore
      },
      recommendations
    }, confidence];
  }
  
  private analyzeSecurityIssues(code: string, language: string): CodeReviewResult['issues'] {
    const issues: CodeReviewResult['issues'] = [];
    const lines = code.split('\n');
    
    // Check for security patterns
    for (const [vulnType, pattern] of Object.entries(this.securityPatterns)) {
      const matches = code.matchAll(pattern);
      for (const match of matches) {
        const lineNumber = this.getLineNumber(code, match.index || 0);
        issues.push({
          type: 'security',
          severity: vulnType === 'hardcoded_secrets' || vulnType === 'sql_injection' ? 'critical' : 'high',
          line: lineNumber,
          message: `Potential ${vulnType.replace(/_/g, ' ')} vulnerability detected`,
          suggestion: this.getSecuritySuggestion(vulnType)
        });
      }
    }
    
    // Language-specific checks
    if (language === 'javascript' || language === 'typescript') {
      // Check for missing input validation
      if (code.includes('req.body') && !code.includes('validate')) {
        issues.push({
          type: 'security',
          severity: 'high',
          message: 'Missing input validation for request body',
          suggestion: 'Add input validation using a library like joi or express-validator'
        });
      }
    }
    
    return issues;
  }
  
  private analyzeCodeQuality(code: string, language: string): CodeReviewResult['issues'] {
    const issues: CodeReviewResult['issues'] = [];
    const lines = code.split('\n');
    
    // Check for long functions
    const functionPattern = /function\s+\w+\s*\([^)]*\)\s*{|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*{/g;
    let functionStart = -1;
    
    lines.forEach((line, index) => {
      // Long lines
      if (line.length > 120) {
        issues.push({
          type: 'style',
          severity: 'low',
          line: index + 1,
          message: 'Line exceeds 120 characters',
          suggestion: 'Consider breaking this line for better readability'
        });
      }
      
      // Deep nesting
      const indentLevel = (line.match(/^\s*/)?.[0].length || 0) / 2;
      if (indentLevel > 4) {
        issues.push({
          type: 'quality',
          severity: 'medium',
          line: index + 1,
          message: 'Deep nesting detected (>4 levels)',
          suggestion: 'Refactor to reduce nesting complexity'
        });
      }
      
      // TODO comments
      if (line.includes('TODO') || line.includes('FIXME')) {
        issues.push({
          type: 'quality',
          severity: 'low',
          line: index + 1,
          message: 'Unresolved TODO/FIXME comment',
          suggestion: 'Address or create a ticket for this item'
        });
      }
    });
    
    return issues;
  }
  
  private analyzePerformance(code: string, language: string): CodeReviewResult['issues'] {
    const issues: CodeReviewResult['issues'] = [];
    
    // Check for performance anti-patterns
    if (code.includes('.forEach') && code.includes('await')) {
      issues.push({
        type: 'performance',
        severity: 'high',
        message: 'Potential async operation in forEach loop',
        suggestion: 'Use for...of loop or Promise.all() for async operations'
      });
    }
    
    // Nested loops
    const loopPattern = /(for|while)\s*\([^)]*\)\s*{[^}]*?(for|while)\s*\(/g;
    if (loopPattern.test(code)) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: 'Nested loops detected - potential O(n²) complexity',
        suggestion: 'Consider optimizing with better data structures or algorithms'
      });
    }
    
    // Large data operations without pagination
    if (code.includes('findAll') || code.includes('SELECT *')) {
      issues.push({
        type: 'performance',
        severity: 'medium',
        message: 'Unbounded data query detected',
        suggestion: 'Add pagination or limits to prevent memory issues'
      });
    }
    
    return issues;
  }
  
  private getLineNumber(code: string, index: number): number {
    return code.substring(0, index).split('\n').length;
  }
  
  private getSecuritySuggestion(vulnType: string): string {
    const suggestions: Record<string, string> = {
      sql_injection: 'Use parameterized queries or prepared statements',
      xss: 'Sanitize user input and use safe DOM methods',
      hardcoded_secrets: 'Use environment variables or a secrets management service',
      unsafe_eval: 'Avoid eval() and use safer alternatives',
      path_traversal: 'Validate and sanitize file paths'
    };
    return suggestions[vulnType] || 'Review and fix this security issue';
  }
  
  private generateRecommendations(
    issues: CodeReviewResult['issues'],
    request: CodeReviewRequest
  ): string[] {
    const recommendations: string[] = [];
    
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    if (criticalCount > 0) {
      recommendations.push(`Address ${criticalCount} critical security issues immediately`);
    }
    
    const securityIssues = issues.filter(i => i.type === 'security').length;
    if (securityIssues > 3) {
      recommendations.push('Consider a security-focused code review or penetration testing');
    }
    
    const qualityIssues = issues.filter(i => i.type === 'quality').length;
    if (qualityIssues > 5) {
      recommendations.push('Refactor code to improve maintainability and readability');
    }
    
    if (issues.length === 0) {
      recommendations.push('Code looks good! Consider adding more tests for edge cases');
    }
    
    return recommendations;
  }
}

// Start the agent
async function main() {
  const agent = new CodeReviewAgent();
  const port = await serveAgent(agent, parseInt(process.env.PORT || '50054'));
  
  console.log(`
===========================================
Code Review Agent Started
===========================================
Port: ${port}
Capabilities: Security, Quality, Performance Analysis

Example usage:
{
  "code": "const password = 'admin123';\\neval(userInput);",
  "language": "javascript"
}
===========================================
  `);
}

if (require.main === module) {
  main().catch(console.error);
}

export { CodeReviewAgent };